/**
 * run-migration.js — Chạy migration-add-paid.sql lên database Aiven mà
 * KHÔNG xóa dữ liệu hiện có (khác với run-schema.js, vốn xóa sạch mọi bảng
 * trước khi tạo lại).
 *
 * CÁCH DÙNG:
 *   1. Đảm bảo file .env đã có DATABASE_URL đúng.
 *   2. Đảm bảo đã "npm install" (có sẵn gói pg, dotenv).
 *   3. Chạy trong terminal:  node run-migration.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
    console.error('❌ Thiếu DATABASE_URL trong file .env');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    const sqlPath = path.join(__dirname, 'migration-add-paid.sql');
    if (!fs.existsSync(sqlPath)) {
        console.error('❌ Không tìm thấy file migration-add-paid.sql cùng thư mục.');
        process.exit(1);
    }
    const sqlText = fs.readFileSync(sqlPath, 'utf8');

    try {
        console.log('⏳ Đang chạy migration-add-paid.sql lên database Aiven (không xóa dữ liệu)...');
        await pool.query(sqlText);
        console.log('✅ Migration thành công! Đã thêm cột Paid, dữ liệu cũ vẫn còn nguyên.');
    } catch (err) {
        console.error('❌ Lỗi khi chạy migration:', err.message);
    } finally {
        await pool.end();
    }
}

run();
