const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(input) {
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
    let bits = '';
    for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
    let output = '';
    for (let index = 0; index < bits.length; index += 5) {
        const chunk = bits.slice(index, index + 5).padEnd(5, '0');
        output += BASE32_ALPHABET[Number.parseInt(chunk, 2)];
    }
    return output;
}

function base32Decode(value) {
    const normalized = String(value || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
    let bits = '';
    for (const character of normalized) {
        const position = BASE32_ALPHABET.indexOf(character);
        if (position < 0) throw new Error('Mã bí mật OTP không hợp lệ.');
        bits += position.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let index = 0; index + 8 <= bits.length; index += 8) {
        bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
    }
    return Buffer.from(bytes);
}

function generateTotpSecret(size = 20) {
    return base32Encode(crypto.randomBytes(size));
}

function generateTotpCode(secret, timestamp = Date.now(), digits = 6, stepSeconds = 30) {
    const counter = Math.floor(timestamp / 1000 / stepSeconds);
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));
    const digest = crypto.createHmac('sha1', base32Decode(secret)).update(counterBuffer).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary = ((digest[offset] & 0x7f) << 24)
        | ((digest[offset + 1] & 0xff) << 16)
        | ((digest[offset + 2] & 0xff) << 8)
        | (digest[offset + 3] & 0xff);
    return String(binary % (10 ** digits)).padStart(digits, '0');
}

function verifyTotp(secret, suppliedCode, options = {}) {
    const code = String(suppliedCode || '').trim();
    const digits = options.digits || 6;
    if (!new RegExp(`^\\d{${digits}}$`).test(code)) return false;
    const timestamp = options.timestamp || Date.now();
    const stepSeconds = options.stepSeconds || 30;
    const allowedWindow = Number.isInteger(options.window) ? options.window : 1;
    const supplied = Buffer.from(code);
    for (let offset = -allowedWindow; offset <= allowedWindow; offset += 1) {
        const expected = Buffer.from(generateTotpCode(
            secret,
            timestamp + offset * stepSeconds * 1000,
            digits,
            stepSeconds
        ));
        if (expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied)) return true;
    }
    return false;
}

function deriveEncryptionKey(keyMaterial) {
    return crypto.createHash('sha256').update(String(keyMaterial || '')).digest();
}

function encryptText(plainText, keyMaterial) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', deriveEncryptionKey(keyMaterial), iv);
    const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `v1:${iv.toString('base64url')}:${authTag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

function decryptText(payload, keyMaterial) {
    const [version, ivText, tagText, encryptedText] = String(payload || '').split(':');
    if (version !== 'v1' || !ivText || !tagText || !encryptedText) throw new Error('Dữ liệu mã hóa không hợp lệ.');
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        deriveEncryptionKey(keyMaterial),
        Buffer.from(ivText, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([
        decipher.update(Buffer.from(encryptedText, 'base64url')),
        decipher.final()
    ]).toString('utf8');
}

function normalizeRecoveryCode(code) {
    return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function generateRecoveryCodes(count = 10) {
    return Array.from({ length: count }, () => {
        const raw = base32Encode(crypto.randomBytes(5)).slice(0, 8);
        return `${raw.slice(0, 4)}-${raw.slice(4)}`;
    });
}

function hashRecoveryCode(code, salt) {
    return crypto.createHash('sha256')
        .update(`${String(salt || '')}:${normalizeRecoveryCode(code)}`)
        .digest('hex');
}

function maskIp(rawIp) {
    let value = String(rawIp || '').trim();
    if (!value) return 'Không xác định';
    if (value.includes(',')) value = value.split(',')[0].trim();
    if (value.startsWith('::ffff:')) value = value.slice(7);
    if (value === '127.0.0.1' || value === '::1' || value.toLowerCase() === 'localhost') return 'Cục bộ';
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
        const parts = value.split('.');
        return `${parts[0]}.${parts[1]}.x.x`;
    }
    if (value.includes(':')) {
        const parts = value.split(':').filter(Boolean);
        return `${parts.slice(0, 3).join(':')}::/48`;
    }
    return 'Không xác định';
}

function parseUserAgent(userAgent) {
    const ua = String(userAgent || '');
    let browser = 'Trình duyệt khác';
    if (/Edg\//i.test(ua)) browser = 'Microsoft Edge';
    else if (/OPR\//i.test(ua)) browser = 'Opera';
    else if (/Firefox\//i.test(ua)) browser = 'Firefox';
    else if (/CriOS\//i.test(ua)) browser = 'Google Chrome';
    else if (/Chrome\//i.test(ua)) browser = 'Google Chrome';
    else if (/Safari\//i.test(ua)) browser = 'Safari';

    let platform = 'Hệ điều hành khác';
    let deviceType = 'Máy tính';
    if (/iPad/i.test(ua)) {
        platform = 'iPadOS';
        deviceType = 'Máy tính bảng';
    } else if (/iPhone|iPod/i.test(ua)) {
        platform = 'iOS';
        deviceType = 'Điện thoại';
    } else if (/Android/i.test(ua)) {
        platform = 'Android';
        deviceType = /Mobile/i.test(ua) ? 'Điện thoại' : 'Máy tính bảng';
    } else if (/Windows NT/i.test(ua)) platform = 'Windows';
    else if (/Mac OS X|Macintosh/i.test(ua)) platform = 'macOS';
    else if (/Linux/i.test(ua)) platform = 'Linux';

    return { browser, platform, deviceType };
}

function getClientSecurityContext(req) {
    const userAgent = String(req?.get?.('user-agent') || req?.headers?.['user-agent'] || '').slice(0, 500);
    const language = String(req?.get?.('accept-language') || req?.headers?.['accept-language'] || '').slice(0, 120);
    const parsed = parseUserAgent(userAgent);
    const ipPrefix = maskIp(req?.ip || req?.socket?.remoteAddress || '');
    const deviceHash = crypto.createHash('sha256')
        .update(`${userAgent}\n${language}`)
        .digest('hex');
    return { ...parsed, ipPrefix, userAgent, language, deviceHash };
}

module.exports = {
    base32Encode,
    base32Decode,
    generateTotpSecret,
    generateTotpCode,
    verifyTotp,
    encryptText,
    decryptText,
    normalizeRecoveryCode,
    generateRecoveryCodes,
    hashRecoveryCode,
    maskIp,
    parseUserAgent,
    getClientSecurityContext
};
