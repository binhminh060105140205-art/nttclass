const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('HTML không giữ version tài nguyên thủ công', () => {
    assert.doesNotMatch(read('index.html'), /\?v=/);
    assert.match(read('server.js'), /function renderIndexHtml\(\)/);
    assert.match(read('server.js'), /hasCurrentAssetVersion/);
});

test('phiên đăng nhập dùng thời hạn 14 ngày', () => {
    const server = read('server.js');
    assert.ok(server.includes('SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000'));
    assert.ok(server.includes('DEFAULT_IDLE_TIMEOUT_MINUTES = 14 * 24 * 60'));
});

test('schema không có lệnh xóa bảng hoặc mật khẩu mẫu', () => {
    const schema = read('schema-postgres.sql');
    assert.doesNotMatch(schema, /DROP\s+TABLE|TRUNCATE\s+TABLE/i);
    assert.doesNotMatch(schema, /admin123|teacher123|trogiang123/i);
});

test('modal ẩn khỏi focus và accessibility tree', () => {
    assert.match(read('core.js'), /modal\.inert = !open/);
    assert.match(read('core.js'), /aria-hidden/);
    assert.match(read('style.css'), /\.modal-backdrop[\s\S]*?visibility: hidden/);
});

test('xóa tài khoản và học sinh dùng transaction dọn quan hệ', () => {
    const server = read('server.js');
    assert.match(server, /async function deleteUserDataGraph/);
    assert.match(server, /async function deleteStudentDataGraph/);
    assert.match(server, /deleteStudentDataGraph[\s\S]*?DELETE FROM InvoiceAccountSettings WHERE OwnerId = \$1/);
    assert.match(server, /DELETE FROM TuitionPayments/);
    assert.match(server, /DELETE FROM InvoiceTemplates/);
});

test('toolbar xuất nhật ký có bố cục mobile hai nút', () => {
    assert.match(read('index.html'), /log-export-actions/);
    assert.match(read('style.css'), /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
});
