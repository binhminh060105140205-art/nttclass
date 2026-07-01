/**
 * run-schema.js — Chạy file schema SQL trực tiếp lên database Aiven.
 * Dùng cách này để né việc PG Studio (giao diện web) khóa ghi trên các
 * service được đánh dấu "production" — kết nối thẳng bằng quyền admin
 * (avnadmin) từ DATABASE_URL trong file .env thì KHÔNG bị khóa.
 *
 * CÁCH DÙNG:
 *   1. Đảm bảo file .env đã có DATABASE_URL đúng (xem hướng dẫn trước đó).
 *   2. Đảm bảo đã "npm install" (có sẵn gói pg, dotenv).
 *   3. Chạy trong terminal VS Code:  node run-schema.js
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
    const sqlPath = path.join(__dirname, 'schema-postgres.sql');
    if (!fs.existsSync(sqlPath)) {
        console.error('❌ Không tìm thấy file schema-postgres.sql cùng thư mục với run-schema.js');
        process.exit(1);
    }
    const sqlText = fs.readFileSync(sqlPath, 'utf8');

    try {
        console.log('⏳ Đang chạy schema-postgres.sql lên database Aiven...');
        await pool.query(sqlText); // pg cho phép chạy nhiều câu lệnh cùng lúc trong 1 chuỗi
        console.log('✅ Chạy schema thành công! Đã tạo bảng + dữ liệu mẫu.');
    } catch (err) {
        console.error('❌ Lỗi khi chạy schema:', err.message);
    } finally {
        await pool.end();
    }
}

run();
