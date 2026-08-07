require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
    console.error('Thiếu DATABASE_URL trong file .env.');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? undefined : { rejectUnauthorized: false }
});

async function run() {
    const sqlPath = path.join(__dirname, 'schema-postgres.sql');
    if (!fs.existsSync(sqlPath)) throw new Error('Không tìm thấy schema-postgres.sql.');
    const sqlText = fs.readFileSync(sqlPath, 'utf8');
    if (/\b(?:DROP\s+TABLE|TRUNCATE\s+TABLE)\b/i.test(sqlText)) {
        throw new Error('Schema chứa lệnh phá hủy dữ liệu và đã bị chặn.');
    }

    const adminUsername = String(process.env.BOOTSTRAP_ADMIN_USERNAME || '').trim();
    const adminPassword = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '');
    const adminName = String(process.env.BOOTSTRAP_ADMIN_NAME || 'Quản trị viên').trim();
    if ((adminUsername || adminPassword) && (!adminUsername || adminPassword.length < 12)) {
        throw new Error('BOOTSTRAP_ADMIN_USERNAME và mật khẩu tối thiểu 12 ký tự phải được cấu hình cùng nhau.');
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(sqlText);
        if (adminUsername && adminPassword) {
            const adminId = 'u_bootstrap_' + crypto.createHash('sha256').update(adminUsername).digest('hex').slice(0, 20);
            const passwordHash = await bcrypt.hash(adminPassword, 12);
            await client.query(`INSERT INTO Users (Id, Username, Password, Name, Role, Active, AssignedTeacherId)
                VALUES ($1, $2, $3, $4, 'admin', 1, NULL)
                ON CONFLICT (Username) DO NOTHING`, [adminId, adminUsername, passwordHash, adminName || 'Quản trị viên']);
        }
        await client.query('COMMIT');
        console.log(adminUsername
            ? 'Đã kiểm tra schema an toàn và tạo tài khoản quản trị nếu chưa tồn tại.'
            : 'Đã kiểm tra schema an toàn. Không có tài khoản mẫu nào được tạo.');
    } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
    } finally {
        client.release();
    }
}

run()
    .catch(error => {
        console.error('Không thể chạy schema:', error.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
