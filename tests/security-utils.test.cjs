const test = require('node:test');
const assert = require('node:assert/strict');
const { getClientSecurityContext, maskIp } = require('../account-security-utils');

function request(deviceId) {
    const headers = {
        'user-agent': 'Mozilla/5.0 TestBrowser/1.0',
        'accept-language': 'vi-VN,vi;q=0.9'
    };
    return {
        nttDeviceId: deviceId,
        headers,
        ip: '203.0.113.42',
        get(name) { return headers[String(name).toLowerCase()] || ''; }
    };
}

test('device hash ổn định trên cùng thiết bị', () => {
    const first = getClientSecurityContext(request('device_A_12345678901234567890123456789012'));
    const second = getClientSecurityContext(request('device_A_12345678901234567890123456789012'));
    assert.equal(first.deviceHash, second.deviceHash);
});

test('hai thiết bị cùng trình duyệt không bị gộp', () => {
    const first = getClientSecurityContext(request('device_A_12345678901234567890123456789012'));
    const second = getClientSecurityContext(request('device_B_12345678901234567890123456789012'));
    assert.notEqual(first.deviceHash, second.deviceHash);
});

test('địa chỉ IP chỉ được lưu ở dạng tương đối', () => {
    assert.equal(maskIp('203.0.113.42'), '203.0.x.x');
});
