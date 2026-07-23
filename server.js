/**
 * server.js — NttClass Backend (FIXED v5 — PostgreSQL/Aiven)
 * =========================================
 * Đã chuyển từ Microsoft SQL Server (mssql) sang PostgreSQL (Aiven, gói Free)
 * để deploy online được (Render không hỗ trợ kết nối tới SQL Server chạy
 * local trên máy bạn — MSI\MINH). Toàn bộ các câu query bên dưới GIỮ NGUYÊN
 * cú pháp "@tenBien" và ".input(...)" như cũ; một shim nhỏ ở phần
 * DATABASE CONNECTION sẽ tự động dịch sang PostgreSQL, nên bạn không cần
 * sửa tay từng route.
 * =========================================
 * Phân quyền (đã chuẩn hóa lại theo yêu cầu):
 *  - admin     : CHỈ quản lý tài khoản người dùng (api/users — tạo/sửa/xóa/
 *                khóa-mở khóa/đặt lại mật khẩu/gán vai trò). Admin KHÔNG được
 *                truy cập học sinh / lịch dạy / buổi học / báo cáo dưới bất kỳ
 *                hình thức nào (route-level: không nằm trong requireRole của
 *                bất kỳ endpoint dạy học nào bên dưới).
 *  - teacher   : Toàn quyền với học sinh, lịch dạy, buổi học, học phí — nhưng
 *                chỉ trong phạm vi dữ liệu thuộc về chính họ (TeacherId).
 *  - assistant : Trợ giảng (Teaching Assistant — TA). Mỗi TA được Admin gán
 *                cho ĐÚNG MỘT giáo viên (Users.AssignedTeacherId). TA chỉ có
 *                thể xem/thao tác trên học sinh & buổi học của giáo viên được
 *                gán (được thực thi qua effectiveTeacherId() + requireTeacherContext
 *                bên dưới) — KHÔNG được xóa học sinh/buổi học, không thu học
 *                phí, không quản lý tài khoản, không truy cập dữ liệu của giáo
 *                viên khác.
 *
 * Mật khẩu mới được băm bằng bcrypt. Mật khẩu Users cũ dạng thường sẽ được
 * tự động nâng cấp sang bcrypt sau lần đăng nhập hợp lệ đầu tiên.
 */

// Đọc file .env khi chạy ở máy local (trên Render, biến môi trường được Render
// cấu hình sẵn trong dashboard nên dòng này không ảnh hưởng gì).
require('dotenv').config();

const express = require('express');
const { Pool, types } = require('pg');
const cors    = require('cors');
const path    = require('path');
const bcrypt  = require('bcryptjs'); // Hash mật khẩu tài khoản học sinh (pure-JS, không cần build native — an toàn khi deploy Render)
const crypto  = require('crypto');

// ==========================================
// FIX LỖI LỆCH NGÀY (QUAN TRỌNG)
// ==========================================
// Mặc định, driver "pg" tự động chuyển cột kiểu DATE trong PostgreSQL thành
// đối tượng JS Date, dựng từ chuỗi "yyyy-mm-dd" theo giờ UTC. Sau đó nếu code
// đọc lại ngày/tháng/năm bằng getFullYear()/getMonth()/getDate() (giờ LOCAL
// của máy chủ Node đang chạy), kết quả sẽ ĐÚNG hay SAI hoàn toàn phụ thuộc
// vào múi giờ hệ thống của server lưu trữ (Render, VPS...) — nếu server đó
// đặt múi giờ ở SAU UTC (ví dụ chạy mặc định UTC hoặc múi giờ Mỹ), nửa đêm
// UTC của ngày X sẽ bị đọc thành NGÀY HÔM TRƯỚC theo giờ local của server,
// gây ra đúng lỗi "đặt thứ 7 lại hiện thứ 6" mà không hề liên quan gì đến
// máy/tŕnh duyệt của người dùng.
//
// CÁCH SỬA TRIỆT ĐỂ: tắt hẳn việc "pg" tự parse cột DATE (OID 1082) thành
// đối tượng Date — giữ nguyên chuỗi "yyyy-mm-dd" thô mà PostgreSQL trả về.
// Không còn đối tượng Date nào được tạo ra => không còn phụ thuộc múi giờ
// của server ở bất kỳ đâu nữa, luôn đúng 100% với ngày đã lưu trong DB.
types.setTypeParser(1082, (value) => value); // 1082 = OID của kiểu DATE

const app  = express();
const PORT = process.env.PORT || 3000;
// Tài khoản giáo viên sở hữu hệ thống: không một tài khoản admin nào được
// phép sửa, khoá hay xoá qua API. Bảo vệ ở server để không thể vượt qua UI.
const PROTECTED_OWNER_USER_ID = 'u_teacher';
const MAX_USERNAME_LENGTH = 50;
const MAX_PASSWORD_LENGTH = 200;
const MIN_PASSWORD_LENGTH = 8;

function createOtpCode() {
    return String(crypto.randomInt(100000, 1000000));
}

function hashOtp(code) {
    return crypto.createHash('sha256').update(String(code)).digest('hex');
}

async function sendOtpEmail(to, code, purpose) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!apiKey || !from) {
        if (process.env.ALLOW_DEV_OTP === 'true' && process.env.NODE_ENV !== 'production') return false;
        throw new Error('Dịch vụ gửi email chưa được cấu hình.');
    }
    const title = purpose === 'reset' ? 'Khôi phục mật khẩu NttClass' : 'Xác minh email NttClass';
    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            from,
            to: [to],
            subject: title,
            html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172033"><h2>${title}</h2><p>Mã xác nhận của bạn là:</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;padding:18px;background:#eff6ff;border-radius:12px;text-align:center">${code}</div><p>Mã có hiệu lực trong 10 phút. Không cung cấp mã này cho bất kỳ ai.</p><p>Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email.</p></div>`
        })
    });
    if (!response.ok) {
        const detail = await response.text();
        console.error('[EMAIL]', response.status, detail.slice(0, 500));
        throw new Error('Không thể gửi email xác nhận lúc này.');
    }
    return true;
}

function canIssueOtp(existing) {
    return !existing?.sentAt || Date.now() - existing.sentAt >= 60 * 1000;
}

async function passwordMatches(password, stored) {
    if (!stored) return false;
    if (stored.startsWith('$2')) return bcrypt.compare(password, stored);
    const supplied = Buffer.from(String(password));
    const expected = Buffer.from(String(stored));
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}

// ==========================================
// MIDDLEWARE
// ==========================================

// CORS: cho phép mọi origin (cấu hình restrict thêm nếu production)
app.use(cors({
    origin: true,          // reflect request origin — thay bằng domain cụ thể khi deploy
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

// Ảnh đính kèm của trang Yêu cầu được gửi dưới dạng data URL. Body đủ rộng
// cho nhiều ảnh; API bên dưới vẫn giới hạn từng ảnh và tổng dung lượng.
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname)));

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ==========================================
// DATABASE CONNECTION (PostgreSQL — Aiven, credentials từ .env)
// ==========================================
// DATABASE_URL có dạng: postgres://user:password@host:port/db?sslmode=require
if (!process.env.DATABASE_URL) {
    console.error('❌ Thiếu biến môi trường DATABASE_URL. Hãy tạo file .env (chạy local) hoặc khai báo trong Render (khi deploy).');
    process.exit(1);
}

const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // bắt buộc với Aiven (dùng sslmode=require)
});

// Bảng ánh xạ tên cột (PostgreSQL trả về chữ thường) -> đúng chữ hoa/thường
// như code bên dưới đang dùng (Id, TeacherId, SessionDate...), để KHÔNG phải
// sửa lại hàng trăm chỗ đang truy cập row.TeacherId, user.Password, v.v.
const COLUMN_CASE_MAP = {
    id: 'Id', username: 'Username', password: 'Password', name: 'Name',
    role: 'Role', active: 'Active', assignedteacherid: 'AssignedTeacherId',
    assignedteachername: 'AssignedTeacherName', teacherid: 'TeacherId', sessionid: 'SessionId',
    class: 'Class', gradelevel: 'GradeLevel', subject: 'Subject', baseprice: 'BasePrice',
    dateofbirth: 'DateOfBirth',
    sessiondate: 'SessionDate', starttime: 'StartTime', endtime: 'EndTime',
    sessiontype: 'SessionType', price: 'Price', duration: 'Duration',
    sessionname: 'SessionName',
    content: 'Content', generalcomment: 'GeneralComment', completed: 'Completed',
    paid: 'Paid', feeamount: 'FeeAmount',
    sessionid: 'SessionId', studentid: 'StudentId', homework: 'Homework',
    attitude: 'Attitude', individualcomment: 'IndividualComment', note: 'Note',
    passwordhash: 'PasswordHash', accountactive: 'AccountActive',
    scoretype: 'ScoreType', testgroupid: 'TestGroupId', testname: 'TestName', scorevalue: 'ScoreValue', maxscore: 'MaxScore', scoredate: 'ScoreDate'
};

function restoreColumnCase(rows) {
    return rows.map(row => {
        const fixed = {};
        for (const key in row) {
            fixed[COLUMN_CASE_MAP[key] || key] = row[key];
        }
        return fixed;
    });
}

// Shim nhỏ: mô phỏng lại đúng API .input(name, type, value).query('... @name ...')
// của thư viện "mssql" cũ, nhưng chạy trên PostgreSQL thật sự bên dưới.
// => Toàn bộ các route ở dưới file KHÔNG cần sửa lại cú pháp query.
const sql = {
    // Các "type" chỉ là nhãn giữ chỗ, PostgreSQL không cần khai báo kiểu ở đây.
    VarChar: 'VarChar', NVarChar: 'NVarChar', Int: 'Int', Bit: 'Bit', Date: 'Date',
    Decimal: () => 'Decimal',

    Request: class {
        constructor(clientLike) {
            // clientLike có thể là: pgPool (query thường) hoặc PgTransaction (đang trong transaction)
            this.client = (clientLike && clientLike.client) ? clientLike.client : pgPool;
            this.params = {};
        }
        input(name, typeOrValue, maybeValue) {
            this.params[name] = (maybeValue !== undefined) ? maybeValue : typeOrValue;
            return this;
        }
        async query(text) {
            const values = [];
            const seen = {};
            let converted = text.replace(/@(\w+)/g, (match, name) => {
                if (seen[name] !== undefined) return `$${seen[name]}`;
                values.push(this.params[name]);
                seen[name] = values.length;
                return `$${values.length}`;
            });
            const result = await this.client.query(converted, values);
            const rowCount = Number(result.rowCount || 0);
            return {
                recordset: restoreColumnCase(result.rows),
                rowCount,
                // Giữ thêm dạng tương thích với thư viện mssql cũ để các route
                // có thể xác minh UPDATE/DELETE thật sự đã tác động dữ liệu.
                rowsAffected: [rowCount]
            };
        }
    },

    Transaction: class {
        constructor() { this.client = null; }
        async begin() {
            this.client = await pgPool.connect();
            await this.client.query('BEGIN');
        }
        async commit() {
            await this.client.query('COMMIT');
            this.client.release();
        }
        async rollback() {
            try { await this.client.query('ROLLBACK'); } finally { this.client.release(); }
        }
    }
};

let poolPromise = pgPool.query('SELECT 1')
    .then(async () => {
        console.log('Đã kết nối thành công với PostgreSQL (Aiven)!');

        // Self-healing migration (Ngày sinh học sinh): thêm cột DateOfBirth vào
        // bảng Students nếu database cũ chưa có cột này, để không cần chạy lại
        // schema-postgres.sql (sẽ xóa hết dữ liệu học sinh/buổi học hiện có).
        // Học sinh cũ chưa có ngày sinh sẽ có giá trị NULL — không lỗi.
        try {
            await pgPool.query('ALTER TABLE Students ADD COLUMN IF NOT EXISTS DateOfBirth DATE');
            console.log('Đã kiểm tra/đảm bảo cột Students.DateOfBirth tồn tại.');
        } catch (migErr) {
            console.error('Lỗi khi tự động thêm cột DateOfBirth:', migErr.message);
        }

        // Self-healing migration: thêm cột SessionName vào bảng Sessions nếu
        // database cũ (tạo trước khi có tính năng "Tên ca học") chưa có cột
        // này, để không cần chạy lại schema-postgres.sql (sẽ xóa hết dữ liệu).
        try {
            await pgPool.query('ALTER TABLE Sessions ADD COLUMN IF NOT EXISTS SessionName VARCHAR(100)');
            await pgPool.query('ALTER TABLE Sessions ALTER COLUMN SessionName TYPE TEXT');
            console.log('Đã kiểm tra/đảm bảo cột Sessions.SessionName tồn tại.');
        } catch (migErr) {
            console.error('Lỗi khi tự động thêm cột SessionName:', migErr.message);
        }

        // PHƯƠNG ÁN A (tối ưu tốc độ trang Lịch dạy & Chấm công): tự động đảm
        // bảo các index tăng tốc truy vấn luôn tồn tại — chỉ tăng tốc, không
        // đổi dữ liệu, an toàn để chạy lại nhiều lần (IF NOT EXISTS).
        try {
            await pgPool.query('CREATE INDEX IF NOT EXISTS idx_sessions_date ON Sessions (SessionDate)');
            await pgPool.query('CREATE INDEX IF NOT EXISTS idx_sessions_teacher ON Sessions (TeacherId)');
            await pgPool.query('CREATE INDEX IF NOT EXISTS idx_sessions_teacher_date ON Sessions (TeacherId, SessionDate)');
            await pgPool.query('CREATE INDEX IF NOT EXISTS idx_sessiondetails_session ON SessionDetails (SessionId)');
            await pgPool.query('CREATE INDEX IF NOT EXISTS idx_sessiondetails_student ON SessionDetails (StudentId)');
            await pgPool.query('CREATE INDEX IF NOT EXISTS idx_students_teacher ON Students (TeacherId)');
            console.log('Đã kiểm tra/đảm bảo các index tối ưu tốc độ tồn tại.');
        } catch (migErr) {
            console.error('Lỗi khi tự động tạo index:', migErr.message);
        }

        // Self-healing migration: thêm 3 cột phục vụ TÀI KHOẢN ĐĂNG NHẬP RIÊNG
        // cho từng học sinh (Username/PasswordHash/AccountActive), không ảnh
        // hưởng dữ liệu học sinh hiện có, an toàn để chạy lại nhiều lần.
        // Mật khẩu học sinh lưu dạng HASH (bcrypt) — khác với Users (plaintext,
        // giữ nguyên như thiết kế cũ) vì học sinh là nhóm tài khoản đông hơn,
        // ít tin cậy hơn, nên ưu tiên an toàn hơn một chút ở đây.
        try {
            await pgPool.query('ALTER TABLE Students ADD COLUMN IF NOT EXISTS Username VARCHAR(50)');
            await pgPool.query('ALTER TABLE Students ADD COLUMN IF NOT EXISTS PasswordHash VARCHAR(100)');
            await pgPool.query('ALTER TABLE Students ADD COLUMN IF NOT EXISTS AccountActive BOOLEAN DEFAULT TRUE');
            // Unique index CHỈ áp dụng cho các dòng đã có Username (học sinh
            // chưa có tài khoản thì Username = NULL, không đụng độ với nhau).
            await pgPool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_students_username ON Students (Username) WHERE Username IS NOT NULL');
            console.log('Đã kiểm tra/đảm bảo các cột tài khoản đăng nhập học sinh tồn tại.');
        } catch (migErr) {
            console.error('Lỗi khi tự động thêm cột tài khoản học sinh:', migErr.message);
        }

        // Self-healing migration: bảng Điểm số (Scores) — BTVN /
        // kiểm tra thường xuyên / kiểm tra cuối chương. Điểm có thể nhập độc lập hoặc gắn
        // cứng vào 1 buổi học cụ thể (SessionId) để giáo viên có thể nhập điểm
        // kiểm tra/BTVN ngay cả khi không có buổi học tương ứng trong lịch.
        // An toàn để chạy lại nhiều lần (IF NOT EXISTS).
        try {
            await pgPool.query(`CREATE TABLE IF NOT EXISTS Scores (
                Id VARCHAR(50) PRIMARY KEY,
                StudentId VARCHAR(50) NOT NULL,
                TeacherId VARCHAR(50) NOT NULL,
                SessionId VARCHAR(50),
                TestGroupId VARCHAR(100) NOT NULL,
                ScoreType VARCHAR(20) NOT NULL,
                TestName TEXT NOT NULL DEFAULT '',
                ScoreValue DECIMAL(8,2) NOT NULL,
                MaxScore DECIMAL(6,2) NOT NULL DEFAULT 10,
                ScoreDate DATE NOT NULL,
                Note TEXT,
                CONSTRAINT FK_Scores_Student FOREIGN KEY (StudentId) REFERENCES Students(Id) ON DELETE CASCADE,
                CONSTRAINT FK_Scores_Teacher FOREIGN KEY (TeacherId) REFERENCES Users(Id),
                CONSTRAINT FK_Scores_Session FOREIGN KEY (SessionId) REFERENCES Sessions(Id) ON DELETE CASCADE
            )`);
            await pgPool.query('CREATE INDEX IF NOT EXISTS idx_scores_student ON Scores (StudentId)');
            await pgPool.query('CREATE INDEX IF NOT EXISTS idx_scores_teacher ON Scores (TeacherId)');
            await pgPool.query('ALTER TABLE Scores ALTER COLUMN Note TYPE TEXT');
            await pgPool.query('ALTER TABLE Scores ALTER COLUMN ScoreValue TYPE DECIMAL(8,2)');
            await pgPool.query('ALTER TABLE Scores ADD COLUMN IF NOT EXISTS SessionId VARCHAR(50)');
            await pgPool.query('ALTER TABLE Scores ADD COLUMN IF NOT EXISTS TestGroupId VARCHAR(100)');
            await pgPool.query("ALTER TABLE Scores ADD COLUMN IF NOT EXISTS TestName TEXT NOT NULL DEFAULT ''");
            await pgPool.query('ALTER TABLE Scores ADD COLUMN IF NOT EXISTS MaxScore DECIMAL(6,2) NOT NULL DEFAULT 10');
            await pgPool.query(`UPDATE Scores
                                SET TestGroupId = CASE
                                    WHEN SessionId IS NOT NULL THEN 'session:' || SessionId
                                    ELSE 'score:' || Id
                                END
                                WHERE TestGroupId IS NULL OR TestGroupId = ''`);
            await pgPool.query('ALTER TABLE Scores ALTER COLUMN TestGroupId SET NOT NULL');
            await pgPool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_session_student ON Scores (SessionId, StudentId)');
            await pgPool.query('CREATE INDEX IF NOT EXISTS idx_scores_teacher_test_group ON Scores (TeacherId, TestGroupId)');
            console.log('Đã kiểm tra/đảm bảo bảng Scores (điểm số) tồn tại.');
        } catch (migErr) {
            console.error('Lỗi khi tự động tạo bảng Scores:', migErr.message);
        }

        // Thông tin khôi phục tài khoản: email/số điện thoại và trạng thái xác minh.
        try {
            await pgPool.query('ALTER TABLE Users ADD COLUMN IF NOT EXISTS Email VARCHAR(150)');
            await pgPool.query('ALTER TABLE Users ADD COLUMN IF NOT EXISTS Phone VARCHAR(30)');
            await pgPool.query('ALTER TABLE Users ADD COLUMN IF NOT EXISTS EmailVerified BOOLEAN DEFAULT FALSE');
            await pgPool.query('ALTER TABLE Users ADD COLUMN IF NOT EXISTS PhoneVerified BOOLEAN DEFAULT FALSE');
            await pgPool.query('ALTER TABLE Students ADD COLUMN IF NOT EXISTS Email VARCHAR(150)');
            await pgPool.query('ALTER TABLE Students ADD COLUMN IF NOT EXISTS Phone VARCHAR(30)');
            await pgPool.query('ALTER TABLE Students ADD COLUMN IF NOT EXISTS EmailVerified BOOLEAN DEFAULT FALSE');
            await pgPool.query('ALTER TABLE Students ADD COLUMN IF NOT EXISTS PhoneVerified BOOLEAN DEFAULT FALSE');
            // Các trường văn bản tự do không nên làm hỏng toàn bộ thao tác lưu
            // chỉ vì client cũ chưa có maxlength. Username/Role/Phone vẫn giữ
            // giới hạn nghiệp vụ và được validate riêng ở API.
            await pgPool.query('ALTER TABLE Users ALTER COLUMN Password TYPE TEXT');
            await pgPool.query('ALTER TABLE Users ALTER COLUMN Name TYPE TEXT');
            await pgPool.query('ALTER TABLE Users ALTER COLUMN Email TYPE TEXT');
            await pgPool.query('ALTER TABLE Students ALTER COLUMN Name TYPE TEXT');
            await pgPool.query('ALTER TABLE Students ALTER COLUMN Class TYPE TEXT');
            await pgPool.query('ALTER TABLE Students ALTER COLUMN Subject TYPE TEXT');
            await pgPool.query('ALTER TABLE Students ALTER COLUMN Email TYPE TEXT');
        } catch (migErr) {
            console.error('Lỗi khi thêm trường bảo mật tài khoản:', migErr.message);
        }
        // Snapshot học phí từng học sinh/buổi và lịch sử thu theo tháng.
        // Các buổi cũ chỉ được backfill một lần, sau đó không còn phụ thuộc BasePrice.
        try {
            await pgPool.query('ALTER TABLE SessionDetails ADD COLUMN IF NOT EXISTS FeeAmount INTEGER');
            // Nội dung nhật ký là văn bản tự do. Giới hạn VARCHAR cũ khiến chỉ
            // một ô Ghi chú/Ý thức dài cũng rollback toàn bộ lần lưu nhận xét.
            await pgPool.query('ALTER TABLE SessionDetails ALTER COLUMN Attitude TYPE TEXT');
            await pgPool.query('ALTER TABLE SessionDetails ALTER COLUMN Homework TYPE TEXT');
            await pgPool.query('ALTER TABLE SessionDetails ALTER COLUMN IndividualComment TYPE TEXT');
            await pgPool.query('ALTER TABLE SessionDetails ALTER COLUMN Note TYPE TEXT');
            await pgPool.query("ALTER TABLE SessionDetails ALTER COLUMN Attitude SET DEFAULT ''");
            await pgPool.query("ALTER TABLE SessionDetails ALTER COLUMN Homework SET DEFAULT ''");
            await pgPool.query(`UPDATE SessionDetails sd
                SET FeeAmount = CASE
                    WHEN st.BasePrice <= 0 THEN 0
                    WHEN s.SessionType = 'chung' THEN s.Price / NULLIF((
                        SELECT COUNT(*) FROM SessionDetails sd2
                        JOIN Students st2 ON st2.Id = sd2.StudentId
                        WHERE sd2.SessionId = sd.SessionId AND st2.BasePrice > 0
                    ), 0)
                    ELSE s.Price
                END
                FROM Sessions s, Students st
                WHERE sd.SessionId = s.Id
                  AND st.Id = sd.StudentId
                  AND sd.FeeAmount IS NULL`);
            await pgPool.query('UPDATE SessionDetails SET FeeAmount = 0 WHERE FeeAmount IS NULL');
            await pgPool.query('ALTER TABLE SessionDetails ALTER COLUMN FeeAmount SET DEFAULT 0');
            await pgPool.query('ALTER TABLE SessionDetails ALTER COLUMN FeeAmount SET NOT NULL');
            await pgPool.query(`CREATE TABLE IF NOT EXISTS TuitionPayments (
                Id VARCHAR(60) PRIMARY KEY,
                TeacherId VARCHAR(50) NOT NULL REFERENCES Users(Id),
                StudentId VARCHAR(50) NOT NULL REFERENCES Students(Id),
                PeriodMonth CHAR(7) NOT NULL,
                Amount INTEGER NOT NULL CHECK (Amount >= 0),
                PaymentDate DATE NOT NULL,
                PaymentMethod VARCHAR(30) NOT NULL DEFAULT 'Tiền mặt',
                Note TEXT NULL,
                CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`);
            await pgPool.query('CREATE INDEX IF NOT EXISTS idx_tuitionpayments_student_month ON TuitionPayments (StudentId, PeriodMonth)');
        } catch (migErr) {
            console.error('Tuition migration error:', migErr.message);
        }

        // Bảng yêu cầu/công việc cá nhân. Không gắn foreign key vì OwnerId có thể
        // thuộc Users hoặc Students; OwnerRole giúp phân tách an toàn hai không gian tài khoản.
        try {
            await pgPool.query(`CREATE TABLE IF NOT EXISTS TaskRequests (
                Id VARCHAR(60) PRIMARY KEY,
                OwnerId VARCHAR(50) NOT NULL,
                OwnerRole VARCHAR(20) NOT NULL,
                TextContent TEXT NOT NULL DEFAULT '',
                ImageData TEXT NULL,
                ImageName VARCHAR(255) NULL,
                ImagesData TEXT NULL,
                Completed BOOLEAN NOT NULL DEFAULT FALSE,
                Priority BOOLEAN NOT NULL DEFAULT FALSE,
                CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UpdatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CompletedAt TIMESTAMP NULL
            )`);
            await pgPool.query('ALTER TABLE TaskRequests ADD COLUMN IF NOT EXISTS Priority BOOLEAN NOT NULL DEFAULT FALSE');
            await pgPool.query('ALTER TABLE TaskRequests ADD COLUMN IF NOT EXISTS ImagesData TEXT NULL');
            await pgPool.query('CREATE INDEX IF NOT EXISTS idx_taskrequests_owner_status ON TaskRequests (OwnerId, OwnerRole, Completed, CreatedAt DESC)');
            await pgPool.query('CREATE INDEX IF NOT EXISTS idx_taskrequests_owner_priority ON TaskRequests (OwnerId, OwnerRole, Priority, CreatedAt DESC)');
        } catch (migErr) {
            console.error('TaskRequests migration error:', migErr.message);
        }
        return { request: () => new sql.Request(pgPool) };
    })
    .catch(err => {
        console.error('Lỗi kết nối PostgreSQL:', err.message);
        console.log('Kiểm tra biến DATABASE_URL trong file .env (hoặc trên Render)');
        process.exit(1); // Dừng server nếu không kết nối được DB
    });

// ==========================================
// AUTH MIDDLEWARE
// ==========================================

/**
 * Xác thực đơn giản qua header:  Authorization: Bearer <base64(userId:role:assignedTeacherId)>
 * assignedTeacherId chỉ có giá trị khi role = 'assistant'; rỗng với các role khác.
 * Frontend sẽ gửi token này sau khi login thành công.
 */
function parseToken(req) {
    const header = req.headers['authorization'] || '';
    if (!header.startsWith('Bearer ')) return null;
    try {
        const decoded = Buffer.from(header.slice(7), 'base64').toString('utf8');
        const [userId, role, assignedTeacherId] = decoded.split(':');
        if (!userId || !role) return null;
        return { userId, role, assignedTeacherId: assignedTeacherId || null };
    } catch {
        return null;
    }
}

function requireAuth(req, res, next) {
    const token = parseToken(req);
    if (!token) return res.status(401).json({ error: 'Chưa đăng nhập hoặc phiên làm việc hết hạn.' });
    req.authUser = token;
    next();
}

function requireRole(...roles) {
    return (req, res, next) => {
        const token = parseToken(req);
        if (!token) return res.status(401).json({ error: 'Chưa đăng nhập.' });
        if (!roles.includes(token.role)) {
            return res.status(403).json({ error: `Bạn không có quyền thực hiện hành động này. Yêu cầu vai trò: ${roles.join(' hoặc ')}.` });
        }
        req.authUser = token;
        next();
    };
}

/**
 * "Giáo viên hiệu lực" của request hiện tại:
 *  - role = 'teacher'   -> chính họ (userId)
 *  - role = 'assistant' -> giáo viên mà họ được gán (assignedTeacherId)
 *  - role = 'admin'     -> không áp dụng (admin không truy cập dữ liệu dạy học)
 */
function effectiveTeacherId(req) {
    if (req.authUser.role === 'teacher') return req.authUser.userId;
    if (req.authUser.role === 'assistant') return req.authUser.assignedTeacherId;
    // Học sinh: token mã hóa TeacherId (giáo viên sở hữu em học sinh này) vào
    // đúng vị trí assignedTeacherId — tái dùng nguyên cơ chế của assistant,
    // không cần đổi định dạng token hay parseToken().
    if (req.authUser.role === 'student') return req.authUser.assignedTeacherId;
    return null;
}

// Đảm bảo trợ giảng (assistant) đã được Admin gán cho một giáo viên cụ thể
// trước khi cho phép truy cập dữ liệu học sinh/buổi học.
function requireTeacherContext(req, res, next) {
    const teacherId = effectiveTeacherId(req);
    if (!teacherId) {
        return res.status(403).json({ error: 'Tài khoản trợ giảng của bạn chưa được Admin gán cho giáo viên nào. Vui lòng liên hệ Admin.' });
    }
    req.effectiveTeacherId = teacherId;
    next();
}

// ==========================================
// AUTH API
// ==========================================

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
        return res.status(400).json({ error: 'Username và password là bắt buộc.' });
    }

    try {
        const pool   = await poolPromise;
        const result = await pool.request()
            .input('username', sql.NVarChar, username.trim())
            .query(`SELECT u.Id, u.Username, u.Password, u.Name, u.Role, u.Active, u.AssignedTeacherId,
                           t.Name AS AssignedTeacherName
                    FROM Users u
                    LEFT JOIN Users t ON t.Id = u.AssignedTeacherId
                    WHERE u.Username = @username`);

        if (result.recordset.length > 0) {
            const user = result.recordset[0];
            if (!user.Active) {
                return res.status(403).json({ error: 'Tài khoản đã bị vô hiệu hóa.' });
            }
            if (!(await passwordMatches(password, user.Password))) {
                return res.status(401).json({
                    error: 'Tên đăng nhập hoặc mật khẩu không đúng.'
                });
            }

            // Nâng cấp trong suốt mật khẩu cũ dạng thường sang bcrypt sau lần đăng nhập đúng.
            if (!String(user.Password).startsWith('$2')) {
                const upgradedHash = await bcrypt.hash(password, 12);
                await pgPool.query('UPDATE Users SET Password = $1 WHERE Id = $2', [upgradedHash, user.Id]);
            }

            if (user.Role === 'assistant' && !user.AssignedTeacherId) {
                return res.status(403).json({ error: 'Tài khoản trợ giảng của bạn chưa được Admin gán cho giáo viên nào. Vui lòng liên hệ Admin.' });
            }

            // Tạo token đơn giản: base64(userId:role:assignedTeacherId)
            const token = Buffer.from(`${user.Id}:${user.Role}:${user.AssignedTeacherId || ''}`).toString('base64');

            delete user.Password;
            return res.json({
                id:                user.Id,
                username:          user.Username,
                name:              user.Name,
                role:              user.Role,
                active:            user.Active,
                assignedTeacherId: user.AssignedTeacherId || null,
                assignedTeacherName: user.AssignedTeacherName || null,
                token
            });
        }

        // Không khớp trong Users (admin/teacher/assistant) -> thử tài khoản
        // đăng nhập riêng của học sinh (Students.Username/PasswordHash).
        const stuResult = await pool.request()
            .input('username', sql.NVarChar, username.trim())
            .query(`SELECT st.Id, st.Name, st.Username, st.PasswordHash, st.AccountActive, st.TeacherId,
                           t.Name AS TeacherName
                    FROM Students st
                    LEFT JOIN Users t ON t.Id = st.TeacherId
                    WHERE st.Username = @username`);

        if (stuResult.recordset.length === 0 || !stuResult.recordset[0].PasswordHash) {
            return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
        }

        const student = stuResult.recordset[0];
        if (student.AccountActive === false) {
            return res.status(403).json({ error: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ giáo viên.' });
        }

        const passwordOk = await bcrypt.compare(password, student.PasswordHash);
        if (!passwordOk) {
            return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
        }

        // Token học sinh: base64(studentId:student:teacherId) — TeacherId đặt
        // đúng vào vị trí "assignedTeacherId" để tái dùng effectiveTeacherId()/
        // requireTeacherContext() sẵn có, không cần thêm cơ chế mới.
        const studentToken = Buffer.from(`${student.Id}:student:${student.TeacherId}`).toString('base64');

        res.json({
            id:                  student.Id,
            username:            student.Username,
            name:                student.Name,
            role:                'student',
            active:              true,
            assignedTeacherId:   student.TeacherId,
            assignedTeacherName: student.TeacherName || null,
            token:               studentToken
        });
    } catch (err) {
        console.error('[POST /api/login]', err);
        res.status(500).json({ error: 'Lỗi máy chủ nội bộ.' });
    }
});

// ==========================================
// USERS API (ADMIN ONLY)
// ==========================================

// Mã xác minh ngắn hạn, chỉ dùng để chứng minh quyền sở hữu email/số điện thoại.
// Khi có nhà cung cấp SMS/email, hàm gửi bên dưới có thể thay bằng provider tương ứng.
const verificationCodes = new Map();

function accountTableFor(role) {
    return role === 'student' ? 'Students' : 'Users';
}

app.get('/api/account/security', requireAuth, async (req, res) => {
    try {
        const table = accountTableFor(req.authUser.role);
        const result = await pgPool.query(`SELECT Email, Phone, EmailVerified, PhoneVerified FROM ${table} WHERE Id = $1`, [req.authUser.userId]);
        const account = result.rows[0] || {};
        res.json({
            email: account.email || '', phone: account.phone || '',
            emailVerified: !!account.emailverified, phoneVerified: !!account.phoneverified
        });
    } catch (err) {
        res.status(500).json({ error: 'Không thể tải cài đặt bảo mật.' });
    }
});

app.put('/api/account/security/contact', requireAuth, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const phone = String(req.body?.phone || '').trim();
    if (email.length > 254) return res.status(400).json({ error: 'Email không được vượt quá 254 ký tự.' });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email không hợp lệ.' });
    if (phone && !/^[0-9+()\-\s]{8,20}$/.test(phone)) return res.status(400).json({ error: 'Số điện thoại không hợp lệ.' });
    try {
        const table = accountTableFor(req.authUser.role);
        if (email) {
            const duplicate = await pgPool.query(
                `SELECT 1 FROM Users WHERE LOWER(Email) = LOWER($1) AND Id <> $2 UNION ALL SELECT 1 FROM Students WHERE LOWER(Email) = LOWER($1) AND Id <> $2 LIMIT 1`,
                [email, req.authUser.userId]
            );
            if (duplicate.rowCount) return res.status(409).json({ error: 'Email này đã được dùng cho một tài khoản khác.' });
        }
        const current = await pgPool.query(`SELECT Email, Phone, EmailVerified, PhoneVerified FROM ${table} WHERE Id = $1`, [req.authUser.userId]);
        if (!current.rowCount) return res.status(404).json({ error: 'Không tìm thấy tài khoản cần cập nhật.' });
        const old = current.rows[0];
        const keepEmailVerified = !!old.emailverified && String(old.email || '').toLowerCase() === email;
        const keepPhoneVerified = !!old.phoneverified && String(old.phone || '') === phone;
        const result = await pgPool.query(`UPDATE ${table} SET Email = $1, Phone = $2, EmailVerified = $3, PhoneVerified = $4 WHERE Id = $5`, [email || null, phone || null, keepEmailVerified, keepPhoneVerified, req.authUser.userId]);
        if (result.rowCount !== 1) return res.status(404).json({ error: 'Không tìm thấy tài khoản cần cập nhật.' });
        res.json({ message: 'Đã lưu thông tin liên hệ. Hãy xác minh để dùng khôi phục mật khẩu.' });
    } catch (err) {
        res.status(500).json({ error: 'Không thể lưu thông tin liên hệ.' });
    }
});

app.post('/api/account/security/request-code', requireAuth, async (req, res) => {
    const channel = req.body?.channel === 'phone' ? 'phone' : 'email';
    try {
        const table = accountTableFor(req.authUser.role);
        const result = await pgPool.query(`SELECT ${channel === 'email' ? 'Email' : 'Phone'} AS contact FROM ${table} WHERE Id = $1`, [req.authUser.userId]);
        const contact = result.rows[0]?.contact;
        if (!contact) return res.status(400).json({ error: `Hãy lưu ${channel === 'email' ? 'email' : 'số điện thoại'} trước.` });
        if (channel !== 'email') return res.status(501).json({ error: 'Xác minh số điện thoại chưa được cấu hình. Hãy dùng email.' });
        const key = `${req.authUser.userId}:${channel}`;
        const existing = verificationCodes.get(key);
        if (!canIssueOtp(existing)) return res.status(429).json({ error: 'Vui lòng đợi 60 giây trước khi gửi lại mã.' });
        const code = createOtpCode();
        await sendOtpEmail(contact, code, 'verify');
        verificationCodes.set(key, { codeHash: hashOtp(code), contact: String(contact).toLowerCase(), expiresAt: Date.now() + 10 * 60 * 1000, sentAt: Date.now(), attempts: 0 });
        const devCode = process.env.ALLOW_DEV_OTP === 'true' && process.env.NODE_ENV !== 'production' ? code : undefined;
        res.json({ message: 'Mã xác minh đã được gửi tới email của bạn.', devCode });
    } catch (err) {
        console.error('[POST /api/account/security/request-code]', err.message);
        res.status(500).json({ error: err.message || 'Không thể gửi mã xác minh.' });
    }
});

app.post('/api/account/security/confirm-code', requireAuth, async (req, res) => {
    const channel = req.body?.channel === 'phone' ? 'phone' : 'email';
    const code = String(req.body?.code || '').trim();
    const key = `${req.authUser.userId}:${channel}`;
    const record = verificationCodes.get(key);
    if (!record || record.expiresAt < Date.now()) return res.status(400).json({ error: 'Mã xác minh không đúng hoặc đã hết hạn.' });
    if (record.attempts >= 5) {
        verificationCodes.delete(key);
        return res.status(429).json({ error: 'Bạn đã nhập sai quá nhiều lần. Hãy yêu cầu mã mới.' });
    }
    record.attempts++;
    if (record.codeHash !== hashOtp(code)) return res.status(400).json({ error: 'Mã xác minh không đúng hoặc đã hết hạn.' });
    try {
        const table = accountTableFor(req.authUser.role);
        const contactResult = await pgPool.query(`SELECT Email FROM ${table} WHERE Id = $1`, [req.authUser.userId]);
        if (String(contactResult.rows[0]?.email || '').toLowerCase() !== record.contact) {
            verificationCodes.delete(key);
            return res.status(400).json({ error: 'Email đã thay đổi. Hãy yêu cầu mã xác minh mới.' });
        }
        const field = channel === 'email' ? 'EmailVerified' : 'PhoneVerified';
        await pgPool.query(`UPDATE ${table} SET ${field} = TRUE WHERE Id = $1`, [req.authUser.userId]);
        verificationCodes.delete(key);
        res.json({ message: 'Xác minh thành công.' });
    } catch (err) {
        res.status(500).json({ error: 'Không thể xác minh tài khoản.' });
    }
});

app.put('/api/account/security/password', requireAuth, async (req, res) => {
    const { currentPassword, password } = req.body || {};
    if (!currentPassword) return res.status(400).json({ error: 'Hãy nhập mật khẩu hiện tại.' });
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `Mật khẩu mới cần tối thiểu ${MIN_PASSWORD_LENGTH} ký tự.` });
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `Mật khẩu không được vượt quá ${MAX_PASSWORD_LENGTH} ký tự.` });
    }
    try {
        const userId = req.authUser.userId;
        const role = req.authUser.role;
        if (role === 'student') {
            const account = await pgPool.query('SELECT PasswordHash FROM Students WHERE Id = $1', [userId]);
            if (!account.rowCount || !(await bcrypt.compare(currentPassword, account.rows[0].passwordhash || ''))) {
                return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng.' });
            }
            const hash = await bcrypt.hash(password, 10);
            const result = await pgPool.query('UPDATE Students SET PasswordHash = $1 WHERE Id = $2', [hash, userId]);
            if (result.rowCount !== 1) return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
        } else {
            const account = await pgPool.query('SELECT Password FROM Users WHERE Id = $1', [userId]);
            if (!account.rowCount || !(await passwordMatches(currentPassword, account.rows[0].password))) {
                return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng.' });
            }
            const hash = await bcrypt.hash(password, 12);
            const result = await pgPool.query('UPDATE Users SET Password = $1 WHERE Id = $2', [hash, userId]);
            if (result.rowCount !== 1) return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
        }
        res.json({ message: 'Đổi mật khẩu thành công.' });
    } catch (err) {
        console.error('[PUT /api/account/security/password]', err);
        res.status(500).json({ error: 'Không thể cập nhật mật khẩu.' });
    }
});

const forgotPasswordCodes = new Map();

app.post('/api/forgot-password/request', async (req, res) => {
    const { username } = req.body || {};
    if (!username) return res.status(400).json({ error: 'Tên đăng nhập là bắt buộc.' });
    try {
        let result = await pgPool.query('SELECT Id, Username, Email, Phone, EmailVerified, PhoneVerified FROM Users WHERE Username = $1 OR LOWER(Email) = LOWER($1)', [username.trim()]);
        let user = result.rows[0];
        
        if (!user) {
            result = await pgPool.query('SELECT Id, Username, Email, Phone, EmailVerified, PhoneVerified FROM Students WHERE Username = $1 OR LOWER(Email) = LOWER($1)', [username.trim()]);
            user = result.rows[0];
        }
        
        if (!user) {
            return res.status(404).json({ error: 'Tên đăng nhập không tồn tại trên hệ thống.' });
        }

        const emailVerified = !!user.emailverified;
        const phoneVerified = !!user.phoneverified;

        if (!emailVerified && !phoneVerified) {
            return res.status(400).json({ error: 'Tài khoản của bạn chưa xác minh Email hoặc Số điện thoại để khôi phục mật khẩu. Vui lòng liên hệ giáo viên/quản trị viên.' });
        }

        let maskedEmail = '';
        if (user.email) {
            const parts = user.email.split('@');
            if (parts.length === 2) {
                const name = parts[0];
                const domain = parts[1];
                maskedEmail = (name.length > 1 ? name.charAt(0) + '***' : '***') + '@' + domain;
            }
        }

        let maskedPhone = '';
        if (user.phone) {
            const phoneStr = String(user.phone);
            maskedPhone = '******' + phoneStr.slice(-4);
        }

        res.json({
            email: maskedEmail,
            phone: maskedPhone,
            emailVerified,
            phoneVerified
        });
    } catch (err) {
        console.error('[POST /api/forgot-password/request]', err);
        res.status(500).json({ error: 'Lỗi hệ thống khi xử lý yêu cầu.' });
    }
});

app.post('/api/forgot-password/send-code', async (req, res) => {
    const { username, channel } = req.body || {};
    if (!username || !channel) return res.status(400).json({ error: 'Thiếu thông tin bắt buộc.' });
    
    try {
        let accountType = 'user';
        let result = await pgPool.query('SELECT Id, Username, Email, Phone, EmailVerified, PhoneVerified FROM Users WHERE Username = $1 OR LOWER(Email) = LOWER($1)', [username.trim()]);
        let user = result.rows[0];
        
        if (!user) {
            accountType = 'student';
            result = await pgPool.query('SELECT Id, Username, Email, Phone, EmailVerified, PhoneVerified FROM Students WHERE Username = $1 OR LOWER(Email) = LOWER($1)', [username.trim()]);
            user = result.rows[0];
        }

        if (!user) return res.status(404).json({ error: 'Tài khoản không tồn tại.' });

        const contact = channel === 'email' ? user.email : user.phone;
        const verified = channel === 'email' ? user.emailverified : user.phoneverified;

        if (!contact || !verified) {
            return res.status(400).json({ error: `Kênh khôi phục ${channel === 'email' ? 'Email' : 'Số điện thoại'} chưa được xác minh.` });
        }
        if (channel !== 'email') return res.status(501).json({ error: 'Khôi phục qua số điện thoại chưa được cấu hình. Hãy dùng email.' });

        const key = username.trim().toLowerCase();
        const existing = forgotPasswordCodes.get(key);
        if (!canIssueOtp(existing)) return res.status(429).json({ error: 'Vui lòng đợi 60 giây trước khi gửi lại mã.' });
        const code = createOtpCode();
        await sendOtpEmail(contact, code, 'reset');
        forgotPasswordCodes.set(key, {
            codeHash: hashOtp(code),
            channel,
            accountType,
            accountId: user.id,
            expiresAt: Date.now() + 10 * 60 * 1000,
            sentAt: Date.now(),
            attempts: 0
        });

        const devCode = process.env.ALLOW_DEV_OTP === 'true' && process.env.NODE_ENV !== 'production' ? code : undefined;
        res.json({ message: 'Mã OTP đã được gửi tới email khôi phục.', devCode });
    } catch (err) {
        console.error('[POST /api/forgot-password/send-code]', err);
        res.status(500).json({ error: err.message || 'Lỗi hệ thống khi gửi mã.' });
    }
});

app.post('/api/forgot-password/reset', async (req, res) => {
    const { username, code, newPassword } = req.body || {};
    if (!username || !code || !newPassword) return res.status(400).json({ error: 'Thiếu thông tin bắt buộc.' });
    if (newPassword.length < MIN_PASSWORD_LENGTH) return res.status(400).json({ error: `Mật khẩu phải từ ${MIN_PASSWORD_LENGTH} ký tự trở lên.` });
    if (newPassword.length > MAX_PASSWORD_LENGTH) return res.status(400).json({ error: `Mật khẩu không được vượt quá ${MAX_PASSWORD_LENGTH} ký tự.` });

    const key = username.trim().toLowerCase();
    const record = forgotPasswordCodes.get(key);

    if (!record || record.expiresAt < Date.now()) {
        return res.status(400).json({ error: 'Mã OTP không đúng hoặc đã hết hạn.' });
    }
    if (record.attempts >= 5) {
        forgotPasswordCodes.delete(key);
        return res.status(429).json({ error: 'Bạn đã nhập sai quá nhiều lần. Hãy yêu cầu mã mới.' });
    }
    record.attempts++;
    if (record.codeHash !== hashOtp(code)) return res.status(400).json({ error: 'Mã OTP không đúng hoặc đã hết hạn.' });

    try {
        if (record.accountType === 'user') {
            const hash = await bcrypt.hash(newPassword, 12);
            await pgPool.query('UPDATE Users SET Password = $1 WHERE Id = $2', [hash, record.accountId]);
            forgotPasswordCodes.delete(key);
            return res.json({ message: 'Đặt lại mật khẩu thành công.' });
        }
        if (record.accountType === 'student') {
            const hash = await bcrypt.hash(newPassword, 10);
            await pgPool.query('UPDATE Students SET PasswordHash = $1 WHERE Id = $2', [hash, record.accountId]);
            forgotPasswordCodes.delete(key);
            return res.json({ message: 'Đặt lại mật khẩu thành công.' });
        }

        res.status(404).json({ error: 'Tài khoản không tồn tại.' });
    } catch (err) {
        console.error('[POST /api/forgot-password/reset]', err);
        res.status(500).json({ error: 'Lỗi hệ thống khi khôi phục mật khẩu.' });
    }
});

// GET tất cả users
app.get('/api/users', requireRole('admin'), async (req, res) => {
    try {
        const pool   = await poolPromise;
        const result = await pool.request()
            .query('SELECT Id, Username, Name, Role, Active, AssignedTeacherId FROM Users ORDER BY Name');
        res.json(result.recordset);
    } catch (err) {
        console.error('[GET /api/users]', err);
        res.status(500).json({ error: err.message });
    }
});

// POST tạo user mới
app.post('/api/users', requireRole('admin'), async (req, res) => {
    const { username, password, name, role, assignedTeacherId } = req.body || {};
    if (!username || !password || !name || !role) {
        return res.status(400).json({ error: 'Thiếu thông tin bắt buộc: username, password, name, role.' });
    }
    if (username.trim().length > MAX_USERNAME_LENGTH) {
        return res.status(400).json({ error: `Tên đăng nhập không được vượt quá ${MAX_USERNAME_LENGTH} ký tự.` });
    }
    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `Mật khẩu phải từ ${MIN_PASSWORD_LENGTH} đến ${MAX_PASSWORD_LENGTH} ký tự.` });
    }
    if (!['admin', 'teacher', 'assistant'].includes(role)) {
        return res.status(400).json({ error: 'Vai trò không hợp lệ. Chọn: admin, teacher, assistant.' });
    }
    if (role === 'assistant' && !assignedTeacherId) {
        return res.status(400).json({ error: 'Trợ giảng (assistant) bắt buộc phải được gán cho một giáo viên (assignedTeacherId).' });
    }

    try {
        const pool = await poolPromise;

        // Username dùng chung một không gian đăng nhập cho Users và Students.
        // Nếu chỉ kiểm tra Users, tài khoản admin mới có thể "đè" username của
        // học sinh khiến học sinh đó không đăng nhập được dù dữ liệu vẫn còn.
        const existing = await pool.request()
            .input('username', sql.NVarChar, username.trim())
            .query(`SELECT Id FROM Users WHERE Username = @username
                    UNION ALL
                    SELECT Id FROM Students WHERE Username = @username`);
        if (existing.recordset.length > 0) {
            return res.status(409).json({ error: 'Tên đăng nhập đã tồn tại.' });
        }

        // Nếu là assistant, xác minh assignedTeacherId trỏ đến một tài khoản role='teacher' đang hoạt động
        if (role === 'assistant') {
            const teacherCheck = await pool.request()
                .input('tid', sql.VarChar, assignedTeacherId)
                .query(`SELECT Id FROM Users WHERE Id = @tid AND Role = 'teacher'`);
            if (teacherCheck.recordset.length === 0) {
                return res.status(400).json({ error: 'assignedTeacherId không hợp lệ — phải là tài khoản có vai trò giáo viên (teacher).' });
            }
        }

        const newId = 'u_' + Date.now();
        const passwordHash = await bcrypt.hash(password, 12);

        await pool.request()
            .input('id',       sql.VarChar,  newId)
            .input('username', sql.NVarChar, username.trim())
            .input('password', sql.NVarChar, passwordHash)
            .input('name',     sql.NVarChar, name.trim())
            .input('role',     sql.NVarChar, role)
            .input('assignedTeacherId', sql.VarChar, role === 'assistant' ? assignedTeacherId : null)
            .query(`INSERT INTO Users (Id, Username, Password, Name, Role, Active, AssignedTeacherId)
                    VALUES (@id, @username, @password, @name, @role, 1, @assignedTeacherId)`);

        res.status(201).json({ message: 'Tạo tài khoản thành công.', id: newId });
    } catch (err) {
        console.error('[POST /api/users]', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT cập nhật user (role/name/password, không đổi username)
app.put('/api/users/:id', requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    const { name, role, password, active, assignedTeacherId } = req.body || {};

    if (id === PROTECTED_OWNER_USER_ID) {
        return res.status(403).json({ error: 'Tài khoản Nguyễn Thanh Thúy được bảo vệ và không thể chỉnh sửa hoặc khóa.' });
    }

    if (role && !['admin', 'teacher', 'assistant'].includes(role)) {
        return res.status(400).json({ error: 'Vai trò không hợp lệ.' });
    }
    if (name !== undefined && !String(name).trim()) {
        return res.status(400).json({ error: 'Tên tài khoản không được để trống.' });
    }
    if (password && (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH)) {
        return res.status(400).json({ error: `Mật khẩu phải từ ${MIN_PASSWORD_LENGTH} đến ${MAX_PASSWORD_LENGTH} ký tự.` });
    }
    if (role === 'assistant' && assignedTeacherId === undefined) {
        return res.status(400).json({ error: 'Trợ giảng (assistant) bắt buộc phải được gán cho một giáo viên (assignedTeacherId).' });
    }

    try {
        const pool = await poolPromise;

        if (role === 'assistant' && assignedTeacherId) {
            const teacherCheck = await pool.request()
                .input('tid', sql.VarChar, assignedTeacherId)
                .query(`SELECT Id FROM Users WHERE Id = @tid AND Role = 'teacher'`);
            if (teacherCheck.recordset.length === 0) {
                return res.status(400).json({ error: 'assignedTeacherId không hợp lệ — phải là tài khoản có vai trò giáo viên (teacher).' });
            }
        }

        // Xây dựng SET clause động
        const sets   = [];
        const request = pool.request().input('id', sql.VarChar, id);

        if (name !== undefined)     { sets.push('Name = @name');     request.input('name',     sql.NVarChar, name.trim()); }
        if (role !== undefined)     {
            sets.push('Role = @role');
            request.input('role', sql.NVarChar, role);
            // Khi đổi vai trò sang không phải assistant, xóa luôn AssignedTeacherId cũ
            sets.push('AssignedTeacherId = @assignedTeacherId');
            request.input('assignedTeacherId', sql.VarChar, role === 'assistant' ? (assignedTeacherId || null) : null);
        }
        if (active !== undefined)   { sets.push('Active = @active'); request.input('active',   sql.Bit,      active ? 1 : 0); }
        if (password)               {
            const passwordHash = await bcrypt.hash(password, 12);
            sets.push('Password = @password');
            request.input('password', sql.NVarChar, passwordHash);
        }

        if (sets.length === 0) return res.status(400).json({ error: 'Không có trường nào để cập nhật.' });

        const updateResult = await request.query(`UPDATE Users SET ${sets.join(', ')} WHERE Id = @id`);
        if (updateResult.rowCount !== 1) return res.status(404).json({ error: 'Không tìm thấy tài khoản cần cập nhật.' });
        res.json({ message: 'Cập nhật tài khoản thành công.' });
    } catch (err) {
        console.error('[PUT /api/users/:id]', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE user
app.delete('/api/users/:id', requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    if (req.authUser.userId === id) {
        return res.status(400).json({ error: 'Bạn không thể tự xóa tài khoản đang đăng nhập.' });
    }
    if (id === PROTECTED_OWNER_USER_ID) {
        return res.status(403).json({ error: 'Tài khoản Nguyễn Thanh Thúy được bảo vệ và không thể xóa.' });
    }
    try {
        const pool = await poolPromise;
        const deleteResult = await pool.request()
            .input('id', sql.VarChar, id)
            .query('DELETE FROM Users WHERE Id = @id');
        if (deleteResult.rowCount !== 1) return res.status(404).json({ error: 'Không tìm thấy tài khoản cần xóa.' });
        res.json({ message: 'Đã xóa tài khoản.' });
    } catch (err) {
        console.error('[DELETE /api/users/:id]', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// STUDENTS API (TEACHER + ADMIN, no ASSISTANT delete)
// ==========================================

app.get('/api/students', requireRole('teacher', 'assistant'), requireTeacherContext, async (req, res) => {
    try {
        const { grade } = req.query; // ví dụ ?grade=8 -> lọc theo khối lớp 8
        console.log('[GET /api/students] teacherId =', req.effectiveTeacherId, 'grade =', grade || '(tất cả)');

        const pool    = await poolPromise;
        const request = pool.request().input('teacherId', sql.VarChar, req.effectiveTeacherId);

        // Liệt kê cột tường minh (thay vì SELECT *) để KHÔNG bao giờ trả
        // PasswordHash về cho trình duyệt, dù là của giáo viên sở hữu.
        let query = `SELECT Id, Name, Class, GradeLevel, Subject, BasePrice, TeacherId,
                            Username, AccountActive, DateOfBirth
                     FROM Students WHERE TeacherId = @teacherId`;
        if (grade) {
            // Ưu tiên lọc theo cột GradeLevel (số nguyên, chính xác tuyệt đối).
            // Với các dòng dữ liệu cũ chưa có GradeLevel, fallback về so khớp chuỗi Class.
            request.input('grade', sql.Int, parseInt(grade));
            request.input('gradeLike', sql.NVarChar, `%Lớp ${grade}%`);
            query += " AND (GradeLevel = @grade OR (GradeLevel IS NULL AND Class LIKE @gradeLike))";
        }
        query += ' ORDER BY GradeLevel NULLS LAST, Name';

        const result = await request.query(query);
        console.log('[GET /api/students] trả về', result.recordset.length, 'học sinh');
        res.json(result.recordset);
    } catch (err) {
        console.error('[GET /api/students]', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/students', requireRole('teacher', 'assistant'), requireTeacherContext, async (req, res) => {
    let { id, name, class: sClass, subject, basePrice, gradeLevel, dateOfBirth } = req.body || {};
    console.log('[POST /api/students] body nhận được:', req.body);

    // Trim chuỗi để tránh lưu khoảng trắng thừa đầu/cuối (dễ gây ra 2 học
    // sinh trông "trùng tên" nhưng thực chất khác nhau ở khoảng trắng).
    name = (name || '').trim();
    sClass = (sClass || '').trim();
    subject = (subject || '').trim();

    if (!id || !name || !sClass || !subject) {
        return res.status(400).json({ error: 'Thiếu thông tin bắt buộc.' });
    }

    // Ngày sinh là trường TÙY CHỌN — cho phép để trống (NULL). Nếu có nhập,
    // phải đúng định dạng "yyyy-mm-dd" (giống hệt giá trị <input type="date">
    // trả về) để không lưu nhầm chuỗi rác vào cột DATE.
    dateOfBirth = (dateOfBirth || '').trim() || null;
    if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
        return res.status(400).json({ error: 'Ngày sinh không hợp lệ.' });
    }

    // Học phí/buổi bắt buộc phải là số nguyên KHÔNG ÂM (>= 0, cho phép 0) —
    // validate lại ở backend để chặn cả khi gọi thẳng API (không đi qua form
    // ở frontend). Chỉ chặn giá trị âm hoặc không hợp lệ.
    const parsedBasePrice = parseInt(basePrice);
    if (isNaN(parsedBasePrice) || parsedBasePrice < 0) {
        return res.status(400).json({ error: 'Học phí/buổi không được là số âm.' });
    }

    try {
        const pool = await poolPromise;
        await pool.request()
            .input('id',          sql.VarChar,  id)
            .input('name',        sql.NVarChar, name)
            .input('class',       sql.NVarChar, sClass)
            .input('gradeLevel',  sql.Int,      gradeLevel ? parseInt(gradeLevel) : null)
            .input('subject',     sql.NVarChar, subject)
            .input('basePrice',   sql.Int,      parsedBasePrice)
            .input('teacherId',   sql.VarChar,  req.effectiveTeacherId)
            .input('dateOfBirth', sql.Date,     dateOfBirth)
            .query('INSERT INTO Students (Id, Name, Class, GradeLevel, Subject, BasePrice, TeacherId, DateOfBirth) VALUES (@id, @name, @class, @gradeLevel, @subject, @basePrice, @teacherId, @dateOfBirth)');

        res.status(201).json({ message: 'Đã thêm học sinh mới thành công.' });
    } catch (err) {
        console.error('[POST /api/students]', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT cập nhật học sinh — FIX: thay vì delete+post hack ở frontend
app.put('/api/students/:id', requireRole('teacher', 'assistant'), requireTeacherContext, async (req, res) => {
    const { id } = req.params;
    let { name, class: sClass, subject, basePrice, gradeLevel, dateOfBirth } = req.body || {};

    name = (name || '').trim();
    sClass = (sClass || '').trim();
    subject = (subject || '').trim();

    if (!name || !sClass || !subject) {
        return res.status(400).json({ error: 'Thiếu thông tin bắt buộc.' });
    }

    // Ngày sinh là trường TÙY CHỌN — cho phép để trống/xóa (NULL). Nếu có
    // nhập, phải đúng định dạng "yyyy-mm-dd".
    dateOfBirth = (dateOfBirth || '').trim() || null;
    if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
        return res.status(400).json({ error: 'Ngày sinh không hợp lệ.' });
    }

    const parsedBasePrice = parseInt(basePrice);
    if (isNaN(parsedBasePrice) || parsedBasePrice < 0) {
        return res.status(400).json({ error: 'Học phí/buổi không được là số âm.' });
    }

    try {
        const pool = await poolPromise;

        // Đảm bảo học sinh thuộc đúng giáo viên hiệu lực của người gọi (chặn truy cập chéo)
        const owner = await pool.request()
            .input('id', sql.VarChar, id)
            .query('SELECT TeacherId FROM Students WHERE Id = @id');
        if (owner.recordset.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy học sinh.' });
        }
        if (owner.recordset[0].TeacherId !== req.effectiveTeacherId) {
            return res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa học sinh của giáo viên khác.' });
        }

        await pool.request()
            .input('id',          sql.VarChar,  id)
            .input('name',        sql.NVarChar, name)
            .input('class',       sql.NVarChar, sClass)
            .input('gradeLevel',  sql.Int,      gradeLevel ? parseInt(gradeLevel) : null)
            .input('subject',     sql.NVarChar, subject)
            .input('basePrice',   sql.Int,      parsedBasePrice)
            .input('dateOfBirth', sql.Date,     dateOfBirth)
            .query(`UPDATE Students
                    SET Name = @name, Class = @class, GradeLevel = @gradeLevel, Subject = @subject, BasePrice = @basePrice, DateOfBirth = @dateOfBirth
                    WHERE Id = @id`);

        res.json({ message: 'Đã cập nhật thông tin học sinh.' });
    } catch (err) {
        console.error('[PUT /api/students/:id]', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/students/:id', requireRole('teacher'), requireTeacherContext, async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await poolPromise;
        const owner = await pool.request()
            .input('id', sql.VarChar, id)
            .query('SELECT TeacherId FROM Students WHERE Id = @id');
        if (owner.recordset.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy học sinh.' });
        }
        if (owner.recordset[0].TeacherId !== req.effectiveTeacherId) {
            return res.status(403).json({ error: 'Bạn không có quyền xóa học sinh của giáo viên khác.' });
        }
        await pool.request()
            .input('id', sql.VarChar, id)
            .query('DELETE FROM Students WHERE Id = @id');
        res.json({ message: 'Đã xóa học sinh thành công.' });
    } catch (err) {
        console.error('[DELETE /api/students/:id]', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// STUDENT ACCOUNT MANAGEMENT API (giáo viên tạo/reset mật khẩu đăng nhập
// cho học sinh của chính mình — admin KHÔNG tham gia, giữ đúng nguyên tắc
// phân quyền hiện có: admin chỉ quản lý Users, không đụng vào Students)
// ==========================================

// Tạo tài khoản đăng nhập cho 1 học sinh (hoặc đổi username nếu đã có)
app.post('/api/students/:id/account', requireRole('teacher', 'assistant'), requireTeacherContext, async (req, res) => {
    const { id } = req.params;
    let { username, password } = req.body || {};
    username = (username || '').trim();

    if (!username || !password || password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `Cần nhập tên đăng nhập và mật khẩu (tối thiểu ${MIN_PASSWORD_LENGTH} ký tự).` });
    }
    if (username.length > MAX_USERNAME_LENGTH) {
        return res.status(400).json({ error: `Tên đăng nhập không được vượt quá ${MAX_USERNAME_LENGTH} ký tự.` });
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `Mật khẩu không được vượt quá ${MAX_PASSWORD_LENGTH} ký tự.` });
    }

    try {
        const pool = await poolPromise;

        const owner = await pool.request().input('id', sql.VarChar, id)
            .query('SELECT TeacherId FROM Students WHERE Id = @id');
        if (owner.recordset.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy học sinh.' });
        }
        if (owner.recordset[0].TeacherId !== req.effectiveTeacherId) {
            return res.status(403).json({ error: 'Bạn không có quyền với học sinh của giáo viên khác.' });
        }

        // Chặn trùng username với BẤT KỲ tài khoản nào khác (Users hoặc
        // Students khác) — trừ chính học sinh đang thao tác (đổi username cũ -> cũ).
        const dup = await pool.request().input('username', sql.NVarChar, username)
            .query(`SELECT Id FROM Users WHERE Username = @username
                    UNION ALL
                    SELECT Id FROM Students WHERE Username = @username`);
        const conflict = dup.recordset.some(r => r.Id !== id);
        if (conflict) {
            return res.status(409).json({ error: 'Tên đăng nhập đã được sử dụng, vui lòng chọn tên khác.' });
        }

        const hash = await bcrypt.hash(password, 10);
        await pool.request()
            .input('id', sql.VarChar, id)
            .input('username', sql.NVarChar, username)
            .input('hash', sql.VarChar, hash)
            .query('UPDATE Students SET Username = @username, PasswordHash = @hash, AccountActive = TRUE WHERE Id = @id');

        res.json({ message: 'Đã tạo tài khoản đăng nhập cho học sinh.', username });
    } catch (err) {
        console.error('[POST /api/students/:id/account]', err);
        res.status(500).json({ error: err.message });
    }
});

// Đặt lại mật khẩu (giữ nguyên username hiện có)
app.put('/api/students/:id/account/reset-password', requireRole('teacher', 'assistant'), requireTeacherContext, async (req, res) => {
    const { id } = req.params;
    const { password } = req.body || {};
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `Mật khẩu mới cần tối thiểu ${MIN_PASSWORD_LENGTH} ký tự.` });
    }
    if (password.length > MAX_PASSWORD_LENGTH) {
        return res.status(400).json({ error: `Mật khẩu không được vượt quá ${MAX_PASSWORD_LENGTH} ký tự.` });
    }

    try {
        const pool = await poolPromise;
        const owner = await pool.request().input('id', sql.VarChar, id)
            .query('SELECT TeacherId, Username FROM Students WHERE Id = @id');
        if (owner.recordset.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy học sinh.' });
        }
        if (owner.recordset[0].TeacherId !== req.effectiveTeacherId) {
            return res.status(403).json({ error: 'Bạn không có quyền với học sinh của giáo viên khác.' });
        }
        if (!owner.recordset[0].Username) {
            return res.status(400).json({ error: 'Học sinh này chưa có tài khoản đăng nhập — hãy tạo tài khoản trước.' });
        }

        const hash = await bcrypt.hash(password, 10);
        await pool.request().input('id', sql.VarChar, id).input('hash', sql.VarChar, hash)
            .query('UPDATE Students SET PasswordHash = @hash WHERE Id = @id');
        res.json({ message: 'Đã đặt lại mật khẩu cho học sinh.' });
    } catch (err) {
        console.error('[PUT /api/students/:id/account/reset-password]', err);
        res.status(500).json({ error: err.message });
    }
});

// Khóa / mở khóa tài khoản (không xóa username/mật khẩu, chỉ chặn đăng nhập)
app.put('/api/students/:id/account/toggle', requireRole('teacher'), requireTeacherContext, async (req, res) => {
    const { id } = req.params;
    const { active } = req.body || {};
    try {
        const pool = await poolPromise;
        const owner = await pool.request().input('id', sql.VarChar, id)
            .query('SELECT TeacherId FROM Students WHERE Id = @id');
        if (owner.recordset.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy học sinh.' });
        }
        if (owner.recordset[0].TeacherId !== req.effectiveTeacherId) {
            return res.status(403).json({ error: 'Bạn không có quyền với học sinh của giáo viên khác.' });
        }
        await pool.request().input('id', sql.VarChar, id).input('active', sql.Bit, active ? 1 : 0)
            .query('UPDATE Students SET AccountActive = @active WHERE Id = @id');
        res.json({ message: active ? 'Đã mở khóa tài khoản.' : 'Đã khóa tài khoản.' });
    } catch (err) {
        console.error('[PUT /api/students/:id/account/toggle]', err);
        res.status(500).json({ error: err.message });
    }
});

// Xóa hẳn tài khoản đăng nhập (học sinh vẫn còn trong hệ thống, chỉ mất quyền tự đăng nhập)
app.delete('/api/students/:id/account', requireRole('teacher'), requireTeacherContext, async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await poolPromise;
        const owner = await pool.request().input('id', sql.VarChar, id)
            .query('SELECT TeacherId FROM Students WHERE Id = @id');
        if (owner.recordset.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy học sinh.' });
        }
        if (owner.recordset[0].TeacherId !== req.effectiveTeacherId) {
            return res.status(403).json({ error: 'Bạn không có quyền với học sinh của giáo viên khác.' });
        }
        await pool.request().input('id', sql.VarChar, id)
            .query('UPDATE Students SET Username = NULL, PasswordHash = NULL, AccountActive = TRUE WHERE Id = @id');
        res.json({ message: 'Đã xóa tài khoản đăng nhập của học sinh.' });
    } catch (err) {
        console.error('[DELETE /api/students/:id/account]', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// SESSIONS API
// ==========================================

app.get('/api/sessions', requireRole('teacher', 'assistant'), requireTeacherContext, async (req, res) => {
    try {
        const pool   = await poolPromise;
        const result = await pool.request()
            .input('teacherId', sql.VarChar, req.effectiveTeacherId)
            .query(`
            SELECT
                s.Id, s.SessionDate, s.StartTime, s.EndTime, s.SessionType, s.SessionName,
                s.Price, s.Duration, s.Content, s.GeneralComment, s.Completed,
                sd.StudentId, sd.Homework, sd.Attitude, sd.IndividualComment, sd.Note, sd.FeeAmount, sd.Paid
            FROM Sessions s
            LEFT JOIN SessionDetails sd ON s.Id = sd.SessionId
            WHERE s.TeacherId = @teacherId
            ORDER BY s.SessionDate DESC
        `);

        const sessionsMap = {};
        result.recordset.forEach(row => {
            if (!sessionsMap[row.Id]) {
                // Từ khi tắt auto-parse cột DATE ở phần kết nối DB (xem comment
                // "FIX LỖI LỆCH NGÀY" phía trên file), row.SessionDate LUÔN LÀ
                // chuỗi "yyyy-mm-dd" thô do PostgreSQL trả về — dùng thẳng,
                // không cần (và không được) tạo đối tượng Date rồi đọc lại,
                // vì bước đó chính là nguyên nhân gây lệch ngày theo múi giờ
                // của máy chủ trước đây.
                const dateStr = row.SessionDate ? String(row.SessionDate).slice(0, 10) : '';
                sessionsMap[row.Id] = {
                    id:             row.Id,
                    date:           dateStr,
                    startTime:      row.StartTime,
                    endTime:        row.EndTime,
                    type:           row.SessionType,
                    sessionName:    row.SessionName || '',
                    studentIds:     [],
                    duration:       parseFloat(row.Duration),
                    price:          parseInt(row.Price),
                    content:        row.Content        || '',
                    generalComment: row.GeneralComment || '',
                    completed:      row.Completed === true || row.Completed === 1,
                    // "paid" cấp buổi học không còn là nguồn dữ liệu chính (dễ gây
                    // lỗi với buổi học chung nhiều học sinh). Trường này sẽ được
                    // client tự tính lại = true khi TẤT CẢ học sinh trong buổi đã
                    // đóng tiền (studentDetails[...].paid), chỉ dùng để hiển thị
                    // tổng quan (lịch tuần...), KHÔNG dùng để tính học phí.
                    studentDetails: {}
                };
            }

            if (row.StudentId) {
                if (!sessionsMap[row.Id].studentIds.includes(row.StudentId)) {
                    sessionsMap[row.Id].studentIds.push(row.StudentId);
                }
                sessionsMap[row.Id].studentDetails[row.StudentId] = {
                    homework:          row.Homework,
                    attitude:          row.Attitude,
                    individualComment: row.IndividualComment || '',
                    note:              row.Note              || '',
                    feeAmount:         row.FeeAmount === null || row.FeeAmount === undefined ? null : Number(row.FeeAmount),
                    // Trạng thái đóng học phí RIÊNG của từng học sinh trong buổi
                    // học này (cột SessionDetails.Paid) — độc lập hoàn toàn với
                    // các học sinh khác cùng học chung buổi.
                    paid:              row.Paid === true || row.Paid === 1
                };
            }
        });

        res.json(Object.values(sessionsMap));
    } catch (err) {
        console.error('[GET /api/sessions]', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/sessions', requireRole('teacher', 'assistant'), requireTeacherContext, async (req, res) => {
    const { id, date, startTime, endTime, type, sessionName, studentIds, duration, price, content, generalComment, completed, paid, studentDetails } = req.body || {};
    console.log('[POST /api/sessions] body nhận được:', JSON.stringify(req.body));

    if (!id || !date || !startTime || !endTime || !type || !Array.isArray(studentIds) || studentIds.length === 0) {
        return res.status(400).json({ error: 'Thiếu thông tin bắt buộc.' });
    }

    // Giờ kết thúc phải sau giờ bắt đầu — validate lại ở backend để chặn cả
    // khi gọi thẳng API (không đi qua form ở frontend).
    if (endTime <= startTime) {
        return res.status(400).json({ error: 'Giờ kết thúc phải sau giờ bắt đầu.' });
    }

    // Học phí buổi học được phép = 0 (buổi học miễn phí / học sinh 0đ),
    // chỉ chặn số âm hoặc giá trị không hợp lệ.
    const parsedPrice = parseInt(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ error: 'Học phí buổi học không được là số âm.' });
    }

    let transaction;
    try {
        const pool  = await poolPromise;

        // Chặn việc ghi buổi học cho học sinh không thuộc giáo viên hiệu lực của người gọi
        const ownershipCheck = await pool.request()
            .input('teacherId', sql.VarChar, req.effectiveTeacherId)
            .query('SELECT Id, BasePrice FROM Students WHERE TeacherId = @teacherId');
        const ownedIds = new Set(ownershipCheck.recordset.map(r => r.Id));
        if (studentIds.some(sid => !ownedIds.has(sid))) {
            return res.status(403).json({ error: 'Một hoặc nhiều học sinh không thuộc quyền quản lý của bạn.' });
        }

        // Client cũ hoặc tab chưa Ctrl+F5 có thể chưa gửi studentDetails.feeAmount.
        // Không được mặc định 0đ vì sẽ làm tổng ca và tổng nợ lệch nhau. Server
        // tự chốt snapshot dự phòng từ tổng tiền của ca, đồng thời học sinh có
        // BasePrice = 0 vẫn luôn được miễn phí.
        const basePriceByStudent = Object.fromEntries(
            ownershipCheck.recordset.map(row => [row.Id, Number(row.BasePrice || 0)])
        );
        const payingStudentIds = studentIds.filter(studentId => basePriceByStudent[studentId] > 0);
        const fallbackFee = type === 'chung'
            ? (payingStudentIds.length > 0 ? Math.round(parsedPrice / payingStudentIds.length) : 0)
            : parsedPrice;
        const preparedDetails = {};
        for (const studentId of studentIds) {
            const detail = (studentDetails && studentDetails[studentId]) || {};
            const hasExplicitFee = detail.feeAmount !== undefined && detail.feeAmount !== null
                && Number.isFinite(Number(detail.feeAmount)) && Number(detail.feeAmount) >= 0;
            preparedDetails[studentId] = {
                ...detail,
                feeAmount: basePriceByStudent[studentId] > 0
                    ? (hasExplicitFee ? Math.round(Number(detail.feeAmount)) : fallbackFee)
                    : 0
            };
        }
        const snapshottedSessionPrice = Object.values(preparedDetails)
            .reduce((sum, detail) => sum + Number(detail.feeAmount || 0), 0);

        transaction = new sql.Transaction(pool);
        await transaction.begin();

        await new sql.Request(transaction)
            .input('id',             sql.VarChar,       id)
            .input('teacherId',      sql.VarChar,       req.effectiveTeacherId)
            .input('date',           sql.Date,          date)
            .input('startTime',      sql.VarChar,       startTime)
            .input('endTime',        sql.VarChar,       endTime)
            .input('type',           sql.VarChar,       type)
            .input('sessionName',    sql.NVarChar,      sessionName    || '')
            .input('price',          sql.Int,           snapshottedSessionPrice)
            .input('duration',       sql.Decimal(4, 2), parseFloat(duration) || 2.0)
            .input('content',        sql.NVarChar,      content        || '')
            .input('generalComment', sql.NVarChar,      generalComment || '')
            .input('completed',      sql.Bit,           completed ? 1 : 0)
            .query(`INSERT INTO Sessions (Id, SessionDate, StartTime, EndTime, SessionType, SessionName, Price, Duration, Content, GeneralComment, Completed, TeacherId)
                    VALUES (@id, @date, @startTime, @endTime, @type, @sessionName, @price, @duration, @content, @generalComment, @completed, @teacherId)`);

        for (const stId of studentIds) {
            const detail = preparedDetails[stId];
            const feeAmount = detail.feeAmount;
            await new sql.Request(transaction)
                .input('sessionId',        sql.VarChar,  id)
                .input('studentId',        sql.VarChar,  stId)
                .input('homework',         sql.NVarChar, detail.homework         || '')
                .input('attitude',         sql.NVarChar, String(detail.attitude ?? '').trim())
                .input('individualComment',sql.NVarChar, detail.individualComment|| '')
                .input('note',             sql.NVarChar, detail.note             || '')
                .input('feeAmount',         sql.Int,      feeAmount)
                // Học phí LUÔN mặc định "chưa thanh toán" khi tạo buổi học mới,
                // và được lưu RIÊNG cho từng học sinh (không còn dùng chung cấp
                // buổi học nữa) — đây chính là điểm sửa lỗi "chọn 1 học sinh đã
                // thanh toán thì cả buổi/cả lớp đều bị đổi theo".
                .input('paid',              sql.Bit,      detail.paid ? 1 : 0)
                .query(`INSERT INTO SessionDetails (SessionId, StudentId, Homework, Attitude, IndividualComment, Note, FeeAmount, Paid)
                        VALUES (@sessionId, @studentId, @homework, @attitude, @individualComment, @note, @feeAmount, @paid)`);
        }

        await transaction.commit();
        console.log('[POST /api/sessions] INSERT thành công, sessionId =', id, '| số học sinh:', studentIds.length);
        res.status(201).json({ message: 'Ghi buổi học mới thành công!' });
    } catch (err) {
        if (transaction) { try { await transaction.rollback(); } catch (_) {} }
        console.error('[POST /api/sessions]', err);
        res.status(500).json({ error: err.message });
    }
});

// Cập nhật nhanh nội dung/nhật ký của một buổi học. Route này chỉ UPDATE đúng
// các trường giáo viên nhập trong popup, không xóa và tạo lại SessionDetails;
// nhờ vậy học phí, trạng thái thanh toán và các giá trị nhật ký không bị reset.
app.put('/api/sessions/:id/quick-entry', requireRole('teacher', 'assistant'), requireTeacherContext, async (req, res) => {
    const { id } = req.params;
    const { content, sessionName, generalComment, studentDetails } = req.body || {};
    if (!studentDetails || typeof studentDetails !== 'object' || Array.isArray(studentDetails)) {
        return res.status(400).json({ error: 'Thiếu dữ liệu nhật ký của học sinh.' });
    }

    let transaction;
    try {
        const pool = await poolPromise;
        transaction = new sql.Transaction(pool);
        await transaction.begin();

        const owner = await new sql.Request(transaction)
            .input('sessionId', sql.VarChar, id)
            .query('SELECT TeacherId, SessionDate FROM Sessions WHERE Id = @sessionId');
        if (owner.recordset.length === 0) {
            await transaction.rollback();
            transaction = null;
            return res.status(404).json({ error: 'Không tìm thấy buổi học.' });
        }
        if (owner.recordset[0].TeacherId !== req.effectiveTeacherId) {
            await transaction.rollback();
            transaction = null;
            return res.status(403).json({ error: 'Bạn không có quyền cập nhật buổi học này.' });
        }

        const participants = await new sql.Request(transaction)
            .input('sessionId', sql.VarChar, id)
            .query('SELECT StudentId FROM SessionDetails WHERE SessionId = @sessionId');
        const participantIds = new Set((participants.recordset || []).map(row => row.StudentId));
        const detailEntries = Object.entries(studentDetails);
        if (detailEntries.length !== participantIds.size || detailEntries.some(([studentId]) => !participantIds.has(studentId))) {
            await transaction.rollback();
            transaction = null;
            return res.status(400).json({ error: 'Danh sách học sinh không khớp với buổi học.' });
        }

        const scoreEntries = new Map();
        for (const [studentId, rawDetail] of detailEntries) {
            const detail = rawDetail && typeof rawDetail === 'object' ? rawDetail : {};
            const scoreType = String(detail.scoreType || '').trim();
            const rawScoreValue = detail.scoreValue;
            const hasScoreValue = rawScoreValue !== null && rawScoreValue !== undefined && String(rawScoreValue).trim() !== '';
            if (!hasScoreValue) {
                if (!scoreType) {
                    scoreEntries.set(studentId, null);
                    continue;
                }
                if (!SCORE_TYPES.includes(scoreType)) {
                    await transaction.rollback();
                    transaction = null;
                    return res.status(400).json({ error: 'Loại điểm không hợp lệ.' });
                }
                scoreEntries.set(studentId, { remove: true });
                continue;
            }
            if (!SCORE_TYPES.includes(scoreType)) {
                await transaction.rollback();
                transaction = null;
                return res.status(400).json({ error: 'Loại điểm không hợp lệ.' });
            }
            const scoreValue = Number(String(rawScoreValue).replace(',', '.'));
            if (!Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > 10) {
                await transaction.rollback();
                transaction = null;
                return res.status(400).json({ error: 'Điểm số phải nằm trong khoảng từ 0 đến 10.' });
            }
            scoreEntries.set(studentId, {
                scoreType,
                scoreValue,
                note: String(detail.scoreNote ?? '')
            });
        }

        await new sql.Request(transaction)
            .input('sessionId', sql.VarChar, id)
            .input('content', sql.NVarChar, String(content ?? ''))
            .input('sessionName', sql.NVarChar, String(sessionName ?? ''))
            .input('generalComment', sql.NVarChar, String(generalComment ?? ''))
            .query(`UPDATE Sessions
                    SET Content = @content, SessionName = @sessionName, GeneralComment = @generalComment
                    WHERE Id = @sessionId`);

        for (const [studentId, rawDetail] of detailEntries) {
            const detail = rawDetail && typeof rawDetail === 'object' ? rawDetail : {};
            await new sql.Request(transaction)
                .input('sessionId', sql.VarChar, id)
                .input('studentId', sql.VarChar, studentId)
                .input('homework', sql.NVarChar, String(detail.homework ?? ''))
                .input('attitude', sql.NVarChar, String(detail.attitude ?? '').trim())
                .input('individualComment', sql.NVarChar, String(detail.individualComment ?? ''))
                .input('note', sql.NVarChar, String(detail.note ?? ''))
                .query(`UPDATE SessionDetails
                        SET Homework = @homework, Attitude = @attitude,
                            IndividualComment = @individualComment, Note = @note
                        WHERE SessionId = @sessionId AND StudentId = @studentId`);
            const scoreEntry = scoreEntries.get(studentId);
            if (scoreEntry?.remove) {
                await new sql.Request(transaction)
                    .input('sessionId', sql.VarChar, id)
                    .input('studentId', sql.VarChar, studentId)
                    .input('teacherId', sql.VarChar, req.effectiveTeacherId)
                    .query('DELETE FROM Scores WHERE SessionId = @sessionId AND StudentId = @studentId AND TeacherId = @teacherId');
            } else if (scoreEntry) {
                await new sql.Request(transaction)
                    .input('id', sql.VarChar, 'sc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8))
                    .input('studentId', sql.VarChar, studentId)
                    .input('teacherId', sql.VarChar, req.effectiveTeacherId)
                    .input('sessionId', sql.VarChar, id)
                    .input('testGroupId', sql.VarChar, `session:${id}`)
                    .input('scoreType', sql.VarChar, scoreEntry.scoreType)
                    .input('testName', sql.NVarChar, '')
                    .input('scoreValue', sql.Decimal(), scoreEntry.scoreValue)
                    .input('maxScore', sql.Decimal(), 10)
                    .input('scoreDate', sql.Date, String(owner.recordset[0].SessionDate).slice(0, 10))
                    .input('note', sql.NVarChar, scoreEntry.note)
                    .query('INSERT INTO Scores (Id, StudentId, TeacherId, SessionId, TestGroupId, ScoreType, TestName, ScoreValue, MaxScore, ScoreDate, Note) VALUES (@id, @studentId, @teacherId, @sessionId, @testGroupId, @scoreType, @testName, @scoreValue, @maxScore, @scoreDate, @note) ON CONFLICT (SessionId, StudentId) DO UPDATE SET TeacherId = EXCLUDED.TeacherId, TestGroupId = EXCLUDED.TestGroupId, ScoreType = EXCLUDED.ScoreType, TestName = EXCLUDED.TestName, ScoreValue = EXCLUDED.ScoreValue, MaxScore = EXCLUDED.MaxScore, ScoreDate = EXCLUDED.ScoreDate, Note = EXCLUDED.Note');
            }

        }

        await transaction.commit();
        transaction = null;
        res.json({ message: 'Đã lưu nội dung và nhật ký buổi học.' });
    } catch (err) {
        if (transaction) { try { await transaction.rollback(); } catch (_) {} }
        console.error('[PUT /api/sessions/:id/quick-entry]', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/sessions/:id', requireRole('teacher', 'assistant'), requireTeacherContext, async (req, res) => {
    const { id } = req.params;
    const { date, startTime, endTime, type, sessionName, studentIds, duration, price, content, generalComment, completed, paid, studentDetails, pricingChanged, repriceExistingFees } = req.body || {};

    if (!date || !startTime || !endTime || !type || !Array.isArray(studentIds) || studentIds.length === 0) {
        return res.status(400).json({ error: 'Thiếu thông tin bắt buộc.' });
    }

    if (endTime <= startTime) {
        return res.status(400).json({ error: 'Giờ kết thúc phải sau giờ bắt đầu.' });
    }

    // Học phí buổi học được phép = 0 (buổi học miễn phí / học sinh 0đ),
    // chỉ chặn số âm hoặc giá trị không hợp lệ.
    const parsedPrice = parseInt(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ error: 'Học phí buổi học không được là số âm.' });
    }

    let transaction;
    try {
        const pool  = await poolPromise;

        const owner = await pool.request()
            .input('id', sql.VarChar, id)
            .query('SELECT TeacherId, Price FROM Sessions WHERE Id = @id');
        if (owner.recordset.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy buổi học.' });
        }
        if (owner.recordset[0].TeacherId !== req.effectiveTeacherId) {
            return res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa buổi học của giáo viên khác.' });
        }
        const effectivePrice = pricingChanged ? parsedPrice : Number(owner.recordset[0].Price || 0);

        transaction = new sql.Transaction(pool);
        await transaction.begin();

        await new sql.Request(transaction)
            .input('id',             sql.VarChar,       id)
            .input('date',           sql.Date,          date)
            .input('startTime',      sql.VarChar,       startTime)
            .input('endTime',        sql.VarChar,       endTime)
            .input('type',           sql.VarChar,       type)
            .input('sessionName',    sql.NVarChar,      sessionName    || '')
            .input('price',          sql.Int,           effectivePrice)
            .input('duration',       sql.Decimal(4, 2), parseFloat(duration) || 2.0)
            .input('content',        sql.NVarChar,      content        || '')
            .input('generalComment', sql.NVarChar,      generalComment || '')
            .input('completed',      sql.Bit,           completed ? 1 : 0)
            .query(`UPDATE Sessions
                    SET SessionDate = @date, StartTime = @startTime, EndTime = @endTime,
                        SessionType = @type, SessionName = @sessionName, Price = @price, Duration = @duration,
                        Content = @content, GeneralComment = @generalComment, Completed = @completed
                    WHERE Id = @id`);

        // Trước khi xóa/ghi lại SessionDetails, LƯU TẠM trạng thái Paid hiện có
        // của từng học sinh trong buổi này lại — vì client không phải lúc nào
        // cũng gửi kèm "paid" trong studentDetails (form sửa buổi học không có
        // ô này), nếu không giữ lại thì mỗi lần sửa buổi học sẽ vô tình reset
        // hết trạng thái đã đóng học phí của mọi học sinh về "chưa đóng".
        const existingPaid = await new sql.Request(transaction)
            .input('sessionId', sql.VarChar, id)
            .query('SELECT StudentId, Paid, FeeAmount FROM SessionDetails WHERE SessionId = @sessionId');
        const existingPaidMap = {};
        const existingFeeMap = {};
        (existingPaid.recordset || []).forEach(r => {
            existingPaidMap[r.StudentId] = r.Paid === true || r.Paid === 1;
            existingFeeMap[r.StudentId] = Number(r.FeeAmount || 0);
        });

        await new sql.Request(transaction)
            .input('sessionId', sql.VarChar, id)
            .query('DELETE FROM SessionDetails WHERE SessionId = @sessionId');

        for (const stId of studentIds) {
            const detail = (studentDetails && studentDetails[stId]) || { homework: null, attitude: '', individualComment: '', note: '' };
            const keepPaid = (detail.paid !== undefined) ? !!detail.paid : !!existingPaidMap[stId];
            const hasExistingFee = Object.prototype.hasOwnProperty.call(existingFeeMap, stId);
            const hasIncomingFee = detail.feeAmount !== undefined && detail.feeAmount !== null
                && Number.isFinite(Number(detail.feeAmount)) && Number(detail.feeAmount) >= 0;
            const feeAmount = hasExistingFee && (keepPaid || !repriceExistingFees || !hasIncomingFee)
                ? existingFeeMap[stId]
                : (hasIncomingFee ? Math.round(Number(detail.feeAmount)) : 0);
            await new sql.Request(transaction)
                .input('sessionId',        sql.VarChar,  id)
                .input('studentId',        sql.VarChar,  stId)
                .input('homework',         sql.NVarChar, detail.homework          || '')
                .input('attitude',         sql.NVarChar, String(detail.attitude ?? '').trim())
                .input('individualComment',sql.NVarChar, detail.individualComment || '')
                .input('note',             sql.NVarChar, detail.note              || '')
                .input('feeAmount',         sql.Int,      feeAmount)
                .input('paid',             sql.Bit,      keepPaid ? 1 : 0)
                .query(`INSERT INTO SessionDetails (SessionId, StudentId, Homework, Attitude, IndividualComment, Note, FeeAmount, Paid)
                        VALUES (@sessionId, @studentId, @homework, @attitude, @individualComment, @note, @feeAmount, @paid)`);
        }

        await transaction.commit();
        res.json({ message: 'Cập nhật lịch học thành công!' });
    } catch (err) {
        if (transaction) { try { await transaction.rollback(); } catch (_) {} }
        console.error('[PUT /api/sessions/:id]', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/sessions/:id', requireRole('teacher'), requireTeacherContext, async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await poolPromise;
        const owner = await pool.request()
            .input('id', sql.VarChar, id)
            .query('SELECT TeacherId FROM Sessions WHERE Id = @id');
        if (owner.recordset.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy buổi học.' });
        }
        if (owner.recordset[0].TeacherId !== req.effectiveTeacherId) {
            return res.status(403).json({ error: 'Bạn không có quyền xóa buổi học của giáo viên khác.' });
        }
        await pool.request()
            .input('id', sql.VarChar, id)
            .query('DELETE FROM Sessions WHERE Id = @id');
        res.json({ message: 'Đã xóa buổi học thành công!' });
    } catch (err) {
        console.error('[DELETE /api/sessions/:id]', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// SESSION DETAILS API
// ==========================================

app.put('/api/session-details/:sessionId/:studentId', requireRole('teacher', 'assistant'), requireTeacherContext, async (req, res) => {
    const { sessionId, studentId } = req.params;
    const { homework, attitude, individualComment, note, generalComment } = req.body || {};

    if (homework === undefined || attitude === undefined) {
        return res.status(400).json({ error: 'Thiếu trường homework hoặc attitude.' });
    }

    let transaction;
    try {
        const pool  = await poolPromise;

        const owner = await pool.request()
            .input('id', sql.VarChar, sessionId)
            .query('SELECT TeacherId FROM Sessions WHERE Id = @id');
        if (owner.recordset.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy buổi học.' });
        }
        if (owner.recordset[0].TeacherId !== req.effectiveTeacherId) {
            return res.status(403).json({ error: 'Bạn không có quyền cập nhật buổi học của giáo viên khác.' });
        }

        transaction = new sql.Transaction(pool);
        await transaction.begin();

        const detailUpdate = await new sql.Request(transaction)
            .input('sessionId',        sql.VarChar,  sessionId)
            .input('studentId',        sql.VarChar,  studentId)
            .input('homework',         sql.NVarChar, String(homework ?? ''))
            .input('attitude',         sql.NVarChar, String(attitude ?? ''))
            .input('individualComment',sql.NVarChar, String(individualComment ?? ''))
            .input('note',             sql.NVarChar, String(note ?? ''))
            .query(`UPDATE SessionDetails
                    SET Homework = @homework, Attitude = @attitude,
                        IndividualComment = @individualComment, Note = @note
                    WHERE SessionId = @sessionId AND StudentId = @studentId`);

        if (detailUpdate.rowCount !== 1) {
            await transaction.rollback();
            transaction = null;
            return res.status(404).json({ error: 'Không tìm thấy nhật ký của học sinh trong buổi học này. Hãy tải lại trang rồi thử lại.' });
        }

        if (generalComment !== undefined) {
            await new sql.Request(transaction)
                .input('sessionId',     sql.VarChar,  sessionId)
                .input('generalComment',sql.NVarChar, generalComment)
                .query(`UPDATE Sessions SET GeneralComment = @generalComment WHERE Id = @sessionId`);
        }

        await transaction.commit();
        res.json({ message: 'Cập nhật đánh giá thành công!' });
    } catch (err) {
        if (transaction) { try { await transaction.rollback(); } catch (_) {} }
        console.error('[PUT /api/session-details]', err);
        res.status(500).json({ error: err.message });
    }
});

// Thu học phí hàng loạt (chỉ admin + teacher)
// Chuyển trạng thái học phí (Đã thanh toán <-> Chưa thanh toán) cho TẤT CẢ các
// buổi học của một học sinh. Cột Paid hoàn toàn tách biệt với Completed (trạng
// thái "đã dạy/chưa dạy"), để tránh lỗi tự động coi buổi học mới lên lịch là
// đã đóng tiền.
app.post('/api/students/:studentId/monthly-payments', requireRole('teacher'), requireTeacherContext, async (req, res) => {
    const { studentId } = req.params;
    const { month, paymentDate, amount, method, note } = req.body || {};
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ''))) {
        return res.status(400).json({ error: 'Tháng thanh toán phải có dạng YYYY-MM.' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(paymentDate || ''))) {
        return res.status(400).json({ error: 'Ngày thanh toán không hợp lệ.' });
    }
    const [year, monthNumber] = month.split('-').map(Number);
    const nextYear = monthNumber === 12 ? year + 1 : year;
    const nextMonthNumber = monthNumber === 12 ? 1 : monthNumber + 1;
    const fromDate = `${month}-01`;
    const toDate = `${nextYear}-${String(nextMonthNumber).padStart(2, '0')}-01`;
    const paymentMethod = ['Tiền mặt', 'Chuyển khoản', 'Ví điện tử', 'Khác'].includes(method) ? method : 'Tiền mặt';
    let transaction;
    try {
        const pool = await poolPromise;
        const owner = await pool.request()
            .input('id', sql.VarChar, studentId)
            .query('SELECT TeacherId FROM Students WHERE Id = @id');
        if (owner.recordset.length === 0) return res.status(404).json({ error: 'Không tìm thấy học sinh.' });
        if (owner.recordset[0].TeacherId !== req.effectiveTeacherId) return res.status(403).json({ error: 'Bạn không có quyền với học sinh này.' });

        transaction = new sql.Transaction(pool);
        await transaction.begin();
        const dueRows = await new sql.Request(transaction)
            .input('studentId', sql.VarChar, studentId)
            .input('teacherId', sql.VarChar, req.effectiveTeacherId)
            .input('fromDate', sql.Date, fromDate)
            .input('toDate', sql.Date, toDate)
            .query(`SELECT sd.SessionId, sd.FeeAmount
                FROM SessionDetails sd
                JOIN Sessions s ON s.Id = sd.SessionId
                WHERE sd.StudentId = @studentId AND s.TeacherId = @teacherId
                  AND s.SessionDate >= @fromDate AND s.SessionDate < @toDate
                  AND sd.Paid = 0 AND sd.FeeAmount > 0
                  AND (s.SessionDate < (NOW() AT TIME ZONE 'Asia/Bangkok')::date
                       OR (s.SessionDate = (NOW() AT TIME ZONE 'Asia/Bangkok')::date
                       AND s.EndTime <= TO_CHAR(NOW() AT TIME ZONE 'Asia/Bangkok', 'HH24:MI')))`);
        const due = dueRows.recordset || [];
        const dueAmount = due.reduce((sum, row) => sum + Number(row.FeeAmount || 0), 0);
        if (due.length === 0) {
            await transaction.rollback();
            return res.status(400).json({ error: 'Tháng này không còn buổi học chưa thanh toán.' });
        }
        if (Number(amount) !== dueAmount) {
            await transaction.rollback();
            return res.status(409).json({ error: 'Số tiền đã thay đổi. Vui lòng tải lại báo cáo trước khi thu.' });
        }
        const paymentId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await new sql.Request(transaction)
            .input('id', sql.VarChar, paymentId)
            .input('teacherId', sql.VarChar, req.effectiveTeacherId)
            .input('studentId', sql.VarChar, studentId)
            .input('periodMonth', sql.VarChar, month)
            .input('amount', sql.Int, dueAmount)
            .input('paymentDate', sql.Date, paymentDate)
            .input('method', sql.NVarChar, paymentMethod)
            .input('note', sql.NVarChar, String(note || '').trim().slice(0, 1000))
            .query(`INSERT INTO TuitionPayments (Id, TeacherId, StudentId, PeriodMonth, Amount, PaymentDate, PaymentMethod, Note)
                    VALUES (@id, @teacherId, @studentId, @periodMonth, @amount, @paymentDate, @method, @note)`);
        for (const row of due) {
            await new sql.Request(transaction)
                .input('sessionId', sql.VarChar, row.SessionId)
                .input('studentId', sql.VarChar, studentId)
                .query('UPDATE SessionDetails SET Paid = 1 WHERE SessionId = @sessionId AND StudentId = @studentId');
        }
        await transaction.commit();
        res.status(201).json({ message: 'Đã ghi nhận thanh toán theo tháng.', amount: dueAmount, sessionCount: due.length, paymentId });
    } catch (err) {
        if (transaction) { try { await transaction.rollback(); } catch (_) {} }
        console.error('[POST /api/students/:studentId/monthly-payments]', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/students/:studentId/set-paid', requireRole('teacher'), requireTeacherContext, async (req, res) => {
    const { studentId } = req.params;
    const { paid } = req.body || {};
    return res.status(410).json({ error: 'Thao tác thanh toán tất cả các tháng đã bị tắt. Hãy dùng thanh toán theo từng tháng.' });
    try {
        const pool = await poolPromise;
        const owner = await pool.request()
            .input('id', sql.VarChar, studentId)
            .query('SELECT TeacherId FROM Students WHERE Id = @id');
        if (owner.recordset.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy học sinh.' });
        }
        if (owner.recordset[0].TeacherId !== req.effectiveTeacherId) {
            return res.status(403).json({ error: 'Bạn không có quyền với học sinh của giáo viên khác.' });
        }
        // FIX LỖI: trước đây UPDATE thẳng vào bảng Sessions (cấp cả buổi học),
        // nên với buổi học CHUNG (nhiều học sinh cùng 1 buổi), đánh dấu 1 em đã
        // đóng tiền sẽ khiến TẤT CẢ học sinh khác học chung buổi đó cũng tự động
        // bị đổi thành "đã thanh toán" theo, dù các em đó chưa hề đóng.
        // Sửa: cập nhật đúng cột Paid trong bảng SessionDetails, lọc theo
        // StudentId — chỉ ảnh hưởng ĐÚNG 1 học sinh này, độc lập hoàn toàn với
        // các bạn học chung buổi.
        await pool.request()
            .input('studentId', sql.VarChar, studentId)
            .input('paid',      sql.Bit,     paid ? 1 : 0)
            .query(`UPDATE SessionDetails
                    SET Paid = @paid
                    WHERE StudentId = @studentId`);
        res.json({ message: paid ? 'Đã đánh dấu đã thanh toán!' : 'Đã đánh dấu chưa thanh toán!' });
    } catch (err) {
        console.error('[PUT /api/students/:studentId/set-paid]', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// SCORES API — Điểm số: BTVN / Kiểm tra thường xuyên / Kiểm tra cuối chương.
// Chỉ giáo viên/trợ giảng được tạo/sửa/xóa; học sinh chỉ xem qua
// /api/me/scores (route riêng ở phần STUDENT SELF-SERVICE bên dưới).
// ==========================================

const SCORE_TYPES = ['BTVN', 'KTTX', 'CuoiChuong', 'KiemTra', 'ThaiDo'];
const MAX_SCORE_SCALE = 1000;

// GET danh sách điểm — có thể lọc theo ?studentId=... (dùng cho trang Điểm số
// của 1 học sinh cụ thể) hoặc bỏ trống để lấy TẤT CẢ điểm của giáo viên hiện
// tại (dùng để tính toán/biểu đồ tổng hợp phía frontend mà không cần gọi lại
// API nhiều lần khi đổi học sinh đang chọn).
app.get('/api/scores', requireRole('teacher', 'assistant'), requireTeacherContext, async (req, res) => {
    const { studentId } = req.query;
    try {
        const pool = await poolPromise;
        const request = pool.request().input('teacherId', sql.VarChar, req.effectiveTeacherId);
        let query = `SELECT Id, StudentId, SessionId, TestGroupId, ScoreType, TestName, ScoreValue, MaxScore, ScoreDate, Note
                     FROM Scores WHERE TeacherId = @teacherId`;
        if (studentId) {
            request.input('studentId', sql.VarChar, studentId);
            query += ' AND StudentId = @studentId';
        }
        query += ' ORDER BY ScoreDate DESC';

        const result = await request.query(query);
        res.json(result.recordset.map(r => ({
            id:         r.Id,
            studentId:  r.StudentId,
            sessionId:  r.SessionId || null,
            testGroupId:r.TestGroupId || (r.SessionId ? `session:${r.SessionId}` : `score:${r.Id}`),
            scoreType:  r.ScoreType,
            testName:   r.TestName || '',
            scoreValue: parseFloat(r.ScoreValue),
            maxScore:   Number(r.MaxScore) > 0 ? parseFloat(r.MaxScore) : 10,
            date:       r.ScoreDate ? String(r.ScoreDate).slice(0, 10) : '',
            note:       r.Note || ''
        })));
    } catch (err) {
        console.error('[GET /api/scores]', err);
        res.status(500).json({ error: err.message });
    }
});

// Nhập điểm hàng loạt cho nhiều học sinh trong cùng một bài kiểm tra. Toàn bộ
// danh sách được lưu trong một transaction: hoặc lưu đủ tất cả, hoặc không lưu
// dòng nào, tránh tình trạng nửa lớp có điểm còn nửa lớp bị mất khi mạng lỗi.
app.post('/api/scores/batch', requireRole('teacher', 'assistant'), requireTeacherContext, async (req, res) => {
    const { scoreType, testName, maxScore: rawMaxScore, date, note, entries } = req.body || {};
    const normalizedTestName = String(testName || '').trim();
    const maxScore = rawMaxScore === undefined || rawMaxScore === null || rawMaxScore === '' ? 10 : Number(rawMaxScore);
    if (!SCORE_TYPES.includes(scoreType)) {
        return res.status(400).json({ error: 'Loại điểm không hợp lệ.' });
    }
    if (!normalizedTestName || normalizedTestName.length > 150) {
        return res.status(400).json({ error: 'Tên bài kiểm tra là bắt buộc và không vượt quá 150 ký tự.' });
    }
    if (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > MAX_SCORE_SCALE) {
        return res.status(400).json({ error: `Thang điểm phải lớn hơn 0 và không vượt quá ${MAX_SCORE_SCALE}.` });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
        return res.status(400).json({ error: 'Ngày chấm điểm không hợp lệ.' });
    }
    if (!Array.isArray(entries) || entries.length === 0 || entries.length > 200) {
        return res.status(400).json({ error: 'Danh sách điểm phải có từ 1 đến 200 học sinh.' });
    }

    const normalized = entries.map(entry => ({
        studentId: String(entry && entry.studentId || '').trim(),
        scoreValue: Number(entry && entry.scoreValue),
        note: String((entry && entry.note) ?? note ?? '').trim()
    }));
    const ids = normalized.map(entry => entry.studentId);
    if (ids.some(id => !id) || new Set(ids).size !== ids.length) {
        return res.status(400).json({ error: 'Danh sách có học sinh trống hoặc bị trùng.' });
    }
    if (normalized.some(entry => !Number.isFinite(entry.scoreValue) || entry.scoreValue < 0 || entry.scoreValue > maxScore)) {
        return res.status(400).json({ error: `Mọi điểm số phải nằm trong khoảng từ 0 đến ${maxScore}.` });
    }
    if (normalized.some(entry => entry.note.length > 500)) {
        return res.status(400).json({ error: 'Ghi chú điểm không được vượt quá 500 ký tự.' });
    }

    let transaction;
    try {
        const pool = await poolPromise;
        transaction = new sql.Transaction(pool);
        await transaction.begin();

        const owned = await new sql.Request(transaction)
            .input('teacherId', sql.VarChar, req.effectiveTeacherId)
            .query('SELECT Id FROM Students WHERE TeacherId = @teacherId');
        const ownedIds = new Set((owned.recordset || []).map(row => row.Id));
        if (normalized.some(entry => !ownedIds.has(entry.studentId))) {
            await transaction.rollback();
            transaction = null;
            return res.status(403).json({ error: 'Danh sách có học sinh không thuộc giáo viên hiện tại.' });
        }

        const batchToken = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const testGroupId = `test:${crypto.randomUUID()}`;
        for (let index = 0; index < normalized.length; index++) {
            const entry = normalized[index];
            await new sql.Request(transaction)
                .input('id', sql.VarChar, `sc_${batchToken}_${index}`)
                .input('studentId', sql.VarChar, entry.studentId)
                .input('teacherId', sql.VarChar, req.effectiveTeacherId)
                .input('testGroupId', sql.VarChar, testGroupId)
                .input('scoreType', sql.VarChar, scoreType)
                .input('testName', sql.NVarChar, normalizedTestName)
                .input('scoreValue', sql.Decimal(), entry.scoreValue)
                .input('maxScore', sql.Decimal(), maxScore)
                .input('date', sql.Date, date)
                .input('note', sql.NVarChar, entry.note)
                .query(`INSERT INTO Scores (Id, StudentId, TeacherId, SessionId, TestGroupId, ScoreType, TestName, ScoreValue, MaxScore, ScoreDate, Note)
                        VALUES (@id, @studentId, @teacherId, NULL, @testGroupId, @scoreType, @testName, @scoreValue, @maxScore, @date, @note)`);
        }

        await transaction.commit();
        transaction = null;
        res.status(201).json({ message: 'Đã lưu bảng điểm.', count: normalized.length, testGroupId });
    } catch (err) {
        if (transaction) { try { await transaction.rollback(); } catch (_) {} }
        console.error('[POST /api/scores/batch]', err);
        res.status(500).json({ error: err.message });
    }
});

// POST thêm 1 điểm mới cho 1 học sinh
app.post('/api/scores', requireRole('teacher', 'assistant'), requireTeacherContext, async (req, res) => {
    const { id, studentId, sessionId, scoreType, testName, maxScore: rawMaxScore, scoreValue, date, note } = req.body || {};
    const normalizedTestName = String(testName || '').trim();
    const maxScore = rawMaxScore === undefined || rawMaxScore === null || rawMaxScore === '' ? 10 : Number(rawMaxScore);
    if (!id || !studentId || !scoreType || scoreValue === undefined || scoreValue === null || !date) {
        return res.status(400).json({ error: 'Thiếu thông tin bắt buộc: học sinh, loại điểm, điểm số, ngày.' });
    }
    if (sessionId) {
        return res.status(400).json({ error: 'Điểm gắn với buổi học phải được nhập trong form buổi học.' });
    }
    if (!SCORE_TYPES.includes(scoreType)) {
        return res.status(400).json({ error: 'Loại điểm không hợp lệ. Chọn: BTVN, KTTX hoặc CuoiChuong.' });
    }
    if (!normalizedTestName || normalizedTestName.length > 150) {
        return res.status(400).json({ error: 'Tên bài kiểm tra là bắt buộc và không vượt quá 150 ký tự.' });
    }
    if (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > MAX_SCORE_SCALE) {
        return res.status(400).json({ error: `Thang điểm phải lớn hơn 0 và không vượt quá ${MAX_SCORE_SCALE}.` });
    }
    const val = parseFloat(scoreValue);
    if (isNaN(val) || val < 0 || val > maxScore) {
        return res.status(400).json({ error: `Điểm số phải là số từ 0 đến ${maxScore}.` });
    }
    if (String(note || '').trim().length > 500) {
        return res.status(400).json({ error: 'Ghi chú điểm không được vượt quá 500 ký tự.' });
    }

    try {
        const pool = await poolPromise;

        // Chỉ được chấm điểm cho học sinh thuộc đúng giáo viên hiệu lực của mình
        const owner = await pool.request().input('id', sql.VarChar, studentId)
            .query('SELECT TeacherId FROM Students WHERE Id = @id');
        if (owner.recordset.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy học sinh.' });
        }
        if (owner.recordset[0].TeacherId !== req.effectiveTeacherId) {
            return res.status(403).json({ error: 'Bạn không có quyền chấm điểm học sinh của giáo viên khác.' });
        }

        await pool.request()
            .input('id',         sql.VarChar,  id)
            .input('studentId',  sql.VarChar,  studentId)
            .input('teacherId',  sql.VarChar,  req.effectiveTeacherId)
            .input('testGroupId',sql.VarChar,  `score:${id}`)
            .input('scoreType',  sql.VarChar,  scoreType)
            .input('testName',   sql.NVarChar, normalizedTestName)
            .input('scoreValue', sql.Decimal(), val)
            .input('maxScore',   sql.Decimal(),maxScore)
            .input('date',       sql.Date,     date)
            .input('note',       sql.NVarChar, note || '')
            .query(`INSERT INTO Scores (Id, StudentId, TeacherId, SessionId, TestGroupId, ScoreType, TestName, ScoreValue, MaxScore, ScoreDate, Note)
                    VALUES (@id, @studentId, @teacherId, NULL, @testGroupId, @scoreType, @testName, @scoreValue, @maxScore, @date, @note)`);

        res.status(201).json({ message: 'Đã thêm điểm mới.' });
    } catch (err) {
        console.error('[POST /api/scores]', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT sửa 1 điểm đã nhập
app.put('/api/scores/:id', requireRole('teacher', 'assistant'), requireTeacherContext, async (req, res) => {
    const { id } = req.params;
    const { scoreValue, note } = req.body || {};

    if (scoreValue === undefined || scoreValue === null || scoreValue === '') {
        return res.status(400).json({ error: 'Điểm số là bắt buộc.' });
    }
    const val = parseFloat(scoreValue);
    if (String(note || '').trim().length > 500) {
        return res.status(400).json({ error: 'Ghi chú điểm không được vượt quá 500 ký tự.' });
    }

    try {
        const pool = await poolPromise;
        const owner = await pool.request().input('id', sql.VarChar, id)
            .query('SELECT TeacherId, MaxScore FROM Scores WHERE Id = @id');
        if (owner.recordset.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy điểm cần sửa.' });
        }
        if (owner.recordset[0].TeacherId !== req.effectiveTeacherId) {
            return res.status(403).json({ error: 'Bạn không có quyền sửa điểm của giáo viên khác.' });
        }
        const maxScore = Number(owner.recordset[0].MaxScore) > 0 ? Number(owner.recordset[0].MaxScore) : 10;
        if (isNaN(val) || val < 0 || val > maxScore) {
            return res.status(400).json({ error: `Điểm số phải là số từ 0 đến ${maxScore}.` });
        }

        await pool.request()
            .input('id',         sql.VarChar,  id)
            .input('scoreValue', sql.Decimal(), val)
            .input('note',       sql.NVarChar, note || '')
            .query(`UPDATE Scores
                    SET ScoreValue = @scoreValue, Note = @note
                    WHERE Id = @id`);

        res.json({ message: 'Đã cập nhật điểm.' });
    } catch (err) {
        console.error('[PUT /api/scores/:id]', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE xóa 1 điểm đã nhập
app.delete('/api/scores/:id', requireRole('teacher', 'assistant'), requireTeacherContext, async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await poolPromise;
        const owner = await pool.request().input('id', sql.VarChar, id)
            .query('SELECT TeacherId FROM Scores WHERE Id = @id');
        if (owner.recordset.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy điểm cần xóa.' });
        }
        if (owner.recordset[0].TeacherId !== req.effectiveTeacherId) {
            return res.status(403).json({ error: 'Bạn không có quyền xóa điểm của giáo viên khác.' });
        }
        await pool.request().input('id', sql.VarChar, id).query('DELETE FROM Scores WHERE Id = @id');
        res.json({ message: 'Đã xóa điểm.' });
    } catch (err) {
        console.error('[DELETE /api/scores/:id]', err);
        res.status(500).json({ error: err.message });
    }
});

// Xóa toàn bộ các dòng điểm thuộc cùng một bài kiểm tra, không xóa buổi học.
app.delete('/api/score-tests/:testGroupId', requireRole('teacher', 'assistant'), requireTeacherContext, async (req, res) => {
    const testGroupId = String(req.params.testGroupId || '').trim();
    if (!testGroupId || testGroupId.length > 100) {
        return res.status(400).json({ error: 'Mã bài kiểm tra không hợp lệ.' });
    }
    try {
        const pool = await poolPromise;
        const existing = await pool.request()
            .input('teacherId', sql.VarChar, req.effectiveTeacherId)
            .input('testGroupId', sql.VarChar, testGroupId)
            .query('SELECT Id FROM Scores WHERE TeacherId = @teacherId AND TestGroupId = @testGroupId');
        if (!existing.recordset.length) {
            return res.status(404).json({ error: 'Không tìm thấy bài kiểm tra cần xóa.' });
        }
        await pool.request()
            .input('teacherId', sql.VarChar, req.effectiveTeacherId)
            .input('testGroupId', sql.VarChar, testGroupId)
            .query('DELETE FROM Scores WHERE TeacherId = @teacherId AND TestGroupId = @testGroupId');
        res.json({ message: 'Đã xóa bài kiểm tra.', count: existing.recordset.length });
    } catch (err) {
        console.error('[DELETE /api/score-tests/:testGroupId]', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// STUDENT SELF-SERVICE API (chỉ dành cho tài khoản học sinh, chỉ đọc,
// chỉ được xem đúng dữ liệu của chính mình — KHÔNG có route sửa/xóa nào ở đây)
// ==========================================

app.get('/api/me', requireRole('student'), requireTeacherContext, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('id', sql.VarChar, req.authUser.userId)
            .input('teacherId', sql.VarChar, req.effectiveTeacherId)
            .query(`SELECT st.Id, st.Name, st.Class, st.GradeLevel, st.Subject, t.Name AS TeacherName
                    FROM Students st
                    LEFT JOIN Users t ON t.Id = st.TeacherId
                    WHERE st.Id = @id AND st.TeacherId = @teacherId`);
        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy hồ sơ học sinh.' });
        }
        res.json(result.recordset[0]);
    } catch (err) {
        console.error('[GET /api/me]', err);
        res.status(500).json({ error: err.message });
    }
});

// Lịch học + bài tập/nhận xét của CHÍNH học sinh đang đăng nhập (chỉ đọc).
// Đây cũng là nguồn dữ liệu "điểm/nhận xét" tạm thời cho tới khi module Điểm
// số (Phase 2 — BTVN/Kiểm tra/Thái độ riêng biệt) được xây dựng.
app.get('/api/me/schedule', requireRole('student'), requireTeacherContext, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('studentId', sql.VarChar, req.authUser.userId)
            .query(`
            SELECT s.Id, s.SessionDate, s.StartTime, s.EndTime, s.SessionType, s.SessionName,
                   s.Content, s.GeneralComment, s.Completed,
                   sd.Homework, sd.Attitude, sd.IndividualComment, sd.Note, sd.Paid
            FROM SessionDetails sd
            JOIN Sessions s ON s.Id = sd.SessionId
            WHERE sd.StudentId = @studentId
            ORDER BY s.SessionDate DESC, s.StartTime DESC
        `);

        const rows = result.recordset.map(row => ({
            id:                row.Id,
            date:              row.SessionDate ? String(row.SessionDate).slice(0, 10) : '',
            startTime:         row.StartTime,
            endTime:           row.EndTime,
            type:              row.SessionType,
            sessionName:       row.SessionName || '',
            content:           row.Content || '',
            generalComment:    row.GeneralComment || '',
            completed:         row.Completed === true || row.Completed === 1,
            homework:          row.Homework,
            attitude:          row.Attitude,
            individualComment: row.IndividualComment || '',
            note:              row.Note || '',
            paid:              row.Paid === true || row.Paid === 1
        }));

        res.json(rows);
    } catch (err) {
        console.error('[GET /api/me/schedule]', err);
        res.status(500).json({ error: err.message });
    }
});

// Điểm số (BTVN/Kiểm tra/Thái độ) của CHÍNH học sinh đang đăng nhập (chỉ đọc).
app.get('/api/me/scores', requireRole('student'), requireTeacherContext, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('studentId', sql.VarChar, req.authUser.userId)
            .query(`SELECT Id, StudentId, SessionId, TestGroupId, ScoreType, TestName, ScoreValue, MaxScore, ScoreDate, Note
                    FROM Scores WHERE StudentId = @studentId ORDER BY ScoreDate DESC`);

        res.json(result.recordset.map(r => ({
            id:         r.Id,
            studentId:  r.StudentId,
            sessionId:  r.SessionId || null,
            testGroupId:r.TestGroupId || (r.SessionId ? `session:${r.SessionId}` : `score:${r.Id}`),
            scoreType:  r.ScoreType,
            testName:   r.TestName || '',
            scoreValue: parseFloat(r.ScoreValue),
            maxScore:   Number(r.MaxScore) > 0 ? parseFloat(r.MaxScore) : 10,
            date:       r.ScoreDate ? String(r.ScoreDate).slice(0, 10) : '',
            note:       r.Note || ''
        })));
    } catch (err) {
        console.error('[GET /api/me/scores]', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// AI CHAT — trợ lý AI đọc dữ liệu thật của tài khoản đang đăng nhập
// ==========================================
// Khoá API của OpenAI được lưu trên server (biến môi trường OPENAI_API_KEY),
// KHÔNG bao giờ gửi xuống trình duyệt — khác với cách làm cũ ở dự án
// DiabetesMedicalRecord (lưu key ở localStorage phía client), vì dữ liệu ở
// đây (lịch dạy, điểm số học sinh) nhạy cảm hơn và app đã có sẵn hệ thống
// xác thực theo Bearer token nên tận dụng luôn để giới hạn đúng phạm vi dữ
// liệu mà mỗi vai trò được phép đọc.
const OPENAI_API_KEY   = process.env.OPENAI_API_KEY;
const OPENAI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';

// Gom dữ liệu dạy học (học sinh / lịch dạy / điểm số) của ĐÚNG giáo viên
// hiệu lực của người gọi, dùng lại effectiveTeacherId() ở trên để không tạo
// đường vòng nào cho phép đọc dữ liệu ngoài phạm vi tài khoản.
async function buildAiContext(req) {
    const role = req.authUser.role;

    // Admin không sở hữu dữ liệu dạy học nào — trả về context rỗng, trợ lý
    // sẽ tự nói rõ là không có dữ liệu thay vì suy đoán.
    if (role === 'admin') return '(Tài khoản Admin không có dữ liệu lớp học/lịch dạy/điểm số.)';

    const teacherId = effectiveTeacherId(req);
    if (!teacherId) return '(Tài khoản chưa được gán giáo viên nên chưa có dữ liệu để tra cứu.)';

    const pool = await poolPromise;

    const studentsResult = await pool.request()
        .input('teacherId', sql.VarChar, teacherId)
        .query(`SELECT Id, Name, Class, GradeLevel, Subject, BasePrice FROM Students WHERE TeacherId = @teacherId ORDER BY GradeLevel NULLS LAST, Name`);
    let students = studentsResult.recordset;

    // Học sinh chỉ được đọc dữ liệu của chính mình.
    const onlyStudentId = role === 'student' ? req.authUser.userId : null;
    if (onlyStudentId) students = students.filter(s => s.Id === onlyStudentId);
    const studentNameMap = {};
    students.forEach(s => { studentNameMap[s.Id] = s.Name; });

    // Giới hạn lịch dạy trong khoảng 45 ngày trước -> 14 ngày sau để prompt
    // không phình quá to (giáo viên dạy lâu năm có thể có hàng nghìn buổi).
    const sessionsResult = await pool.request()
        .input('teacherId', sql.VarChar, teacherId)
        .query(`
            SELECT s.Id, s.SessionDate, s.StartTime, s.EndTime, s.SessionType, s.SessionName, s.Completed,
                   sd.StudentId, sd.Homework, sd.Attitude, sd.Paid
            FROM Sessions s
            LEFT JOIN SessionDetails sd ON s.Id = sd.SessionId
            WHERE s.TeacherId = @teacherId
              AND s.SessionDate >= (NOW() AT TIME ZONE 'Asia/Bangkok')::date - INTERVAL '45 days'
              AND s.SessionDate <= (NOW() AT TIME ZONE 'Asia/Bangkok')::date + INTERVAL '14 days'
            ORDER BY s.SessionDate DESC
        `);

    const scoresResult = await pool.request()
        .input('teacherId', sql.VarChar, teacherId)
        .query(`SELECT StudentId, ScoreType, ScoreValue, ScoreDate, Note FROM Scores WHERE TeacherId = @teacherId ORDER BY ScoreDate DESC`);

    const sessionsMap = {};
    sessionsResult.recordset.forEach(row => {
        if (onlyStudentId && row.StudentId && row.StudentId !== onlyStudentId) return;
        if (!sessionsMap[row.Id]) {
            sessionsMap[row.Id] = {
                date:      row.SessionDate ? String(row.SessionDate).slice(0, 10) : '',
                time:      `${row.StartTime}-${row.EndTime}`,
                type:      row.SessionType,
                name:      row.SessionName || '',
                completed: row.Completed === true || row.Completed === 1,
                students:  []
            };
        }
        if (row.StudentId && (!onlyStudentId || row.StudentId === onlyStudentId)) {
            const sName = studentNameMap[row.StudentId] || row.StudentId;
            sessionsMap[row.Id].students.push(`${sName} (BTVN: ${row.Homework || '-'}, Ý thức: ${row.Attitude || '-'}, ${row.Paid ? 'đã đóng phí' : 'chưa đóng phí'})`);
        }
    });

    const sessionLines = Object.values(sessionsMap)
        .filter(s => onlyStudentId ? s.students.length > 0 : true)
        .slice(0, 80)
        .map(s => `- ${s.date} ${s.time} [${s.type}${s.name ? ' - ' + s.name : ''}]${s.completed ? '' : ' (chưa diễn ra)'}: ${s.students.join('; ') || 'chưa có học sinh'}`)
        .join('\n');

    const scoreLines = scoresResult.recordset
        .filter(r => !onlyStudentId || r.StudentId === onlyStudentId)
        .slice(0, 150)
        .map(r => `- ${studentNameMap[r.StudentId] || r.StudentId}: ${r.ScoreType} = ${r.ScoreValue} (${r.ScoreDate ? String(r.ScoreDate).slice(0, 10) : ''})${r.Note ? ' - ' + r.Note : ''}`)
        .join('\n');

    const studentLines = students
        .map(s => `- ${s.Name} | ${s.Class || '(chưa có lớp)'} | Khối ${s.GradeLevel || '?'} | Môn: ${s.Subject || '-'} | Học phí/buổi: ${s.BasePrice != null ? s.BasePrice + 'đ' : '-'}`)
        .join('\n');

    return [
        'DANH SÁCH HỌC SINH:',
        studentLines || '(không có học sinh nào)',
        '',
        'LỊCH DẠY (45 ngày qua và 14 ngày sắp tới):',
        sessionLines || '(không có buổi học nào trong khoảng thời gian này)',
        '',
        'ĐIỂM SỐ:',
        scoreLines || '(chưa có điểm nào được ghi nhận)'
    ].join('\n');
}

// ==========================================
// TASK REQUESTS API — yêu cầu cá nhân có ảnh đính kèm
// ==========================================
const REQUEST_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const REQUEST_IMAGES_MAX_COUNT = 10;
const REQUEST_IMAGES_MAX_TOTAL_BYTES = 12 * 1024 * 1024;
const REQUEST_IMAGE_HEADER_PATTERN = /^data:image\/(png|jpeg|webp|gif);base64,/;

function validateRequestImage(imageData) {
    if (!imageData) return { value: null };
    if (typeof imageData !== 'string') return { error: 'Ảnh đính kèm không hợp lệ.' };
    const header = imageData.slice(0, 40).match(REQUEST_IMAGE_HEADER_PATTERN);
    if (!header) return { error: 'Chỉ hỗ trợ ảnh PNG, JPG, WEBP hoặc GIF.' };
    const base64 = imageData.slice(header[0].length);
    // Chặn payload quá lớn trước khi chạy regex trên toàn chuỗi.
    if (base64.length > Math.ceil(REQUEST_IMAGE_MAX_BYTES * 4 / 3) + 4) {
        return { error: 'Ảnh đính kèm không được vượt quá 3 MB.' };
    }
    if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
        return { error: 'Dữ liệu ảnh không hợp lệ.' };
    }
    const padding = (base64.match(/=*$/) || [''])[0].length;
    const byteSize = Math.floor(base64.length * 3 / 4) - padding;
    if (byteSize > REQUEST_IMAGE_MAX_BYTES) return { error: 'Ảnh đính kèm không được vượt quá 3 MB.' };
    return { value: imageData, bytes: byteSize };
}

function validateRequestImages(rawImages) {
    if (rawImages === undefined || rawImages === null) return { value: [] };
    if (!Array.isArray(rawImages)) return { error: 'Danh sách ảnh đính kèm không hợp lệ.' };
    if (rawImages.length > REQUEST_IMAGES_MAX_COUNT) {
        return { error: `Mỗi yêu cầu chỉ được đính kèm tối đa ${REQUEST_IMAGES_MAX_COUNT} ảnh.` };
    }

    const images = [];
    let totalBytes = 0;
    for (let index = 0; index < rawImages.length; index++) {
        const raw = rawImages[index];
        const dataUrl = typeof raw === 'string' ? raw : raw?.dataUrl;
        const name = typeof raw === 'object' && raw
            ? String(raw.name || '').trim().slice(0, 255)
            : '';
        if (!dataUrl) return { error: `Ảnh ${index + 1}: Dữ liệu ảnh không hợp lệ.` };
        const image = validateRequestImage(dataUrl);
        if (image.error) return { error: `Ảnh ${index + 1}: ${image.error}` };
        totalBytes += image.bytes || 0;
        if (totalBytes > REQUEST_IMAGES_MAX_TOTAL_BYTES) {
            return { error: 'Tổng dung lượng ảnh đính kèm không được vượt quá 12 MB.' };
        }
        images.push({ dataUrl: image.value, name: name || `anh-dinh-kem-${index + 1}` });
    }
    return { value: images };
}

function normalizeRequestRow(row) {
    let images = [];
    if (row?.imagesData) {
        try {
            const parsed = JSON.parse(row.imagesData);
            if (Array.isArray(parsed)) {
                images = parsed.filter(image => image && typeof image.dataUrl === 'string');
            }
        } catch (_) {}
    }
    if (!images.length && row?.imageData) {
        images = [{ dataUrl: row.imageData, name: row.imageName || 'Ảnh yêu cầu' }];
    }
    return {
        ...row,
        images,
        imageData: row?.imageData || images[0]?.dataUrl || null,
        imageName: row?.imageName || images[0]?.name || null,
        imagesData: undefined
    };
}

app.get('/api/requests', requireAuth, async (req, res) => {
    try {
        const result = await pgPool.query(`
            SELECT Id AS "id", TextContent AS "text", ImageData AS "imageData",
                   ImageName AS "imageName", ImagesData AS "imagesData", Completed AS "completed", Priority AS "priority",
                   CreatedAt AS "createdAt", UpdatedAt AS "updatedAt", CompletedAt AS "completedAt"
            FROM TaskRequests
            WHERE OwnerId = $1 AND OwnerRole = $2
            ORDER BY Priority DESC, Completed ASC, CreatedAt DESC`,
        [req.authUser.userId, req.authUser.role]);
        res.json(result.rows.map(normalizeRequestRow));
    } catch (err) {
        console.error('[GET /api/requests]', err);
        res.status(500).json({ error: 'Không thể tải danh sách yêu cầu.' });
    }
});

app.post('/api/requests', requireAuth, async (req, res) => {
    const text = String(req.body?.text || '').trim();
    const imageName = String(req.body?.imageName || '').trim().slice(0, 255);
    const priority = req.body?.priority ?? false;
    const rawImages = Array.isArray(req.body?.images)
        ? req.body.images
        : (req.body?.imageData ? [{ dataUrl: req.body.imageData, name: imageName }] : []);
    const imageList = validateRequestImages(rawImages);
    if (imageList.error) return res.status(400).json({ error: imageList.error });
    if (typeof priority !== 'boolean') return res.status(400).json({ error: 'Trạng thái ưu tiên không hợp lệ.' });
    if (!text && imageList.value.length === 0) return res.status(400).json({ error: 'Hãy nhập nội dung hoặc chọn một ảnh.' });
    if (text.length > 5000) return res.status(400).json({ error: 'Nội dung yêu cầu không được vượt quá 5.000 ký tự.' });

    const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const firstImage = imageList.value[0] || { dataUrl: null, name: imageName || null };
    try {
        const result = await pgPool.query(`
            INSERT INTO TaskRequests (Id, OwnerId, OwnerRole, TextContent, ImageData, ImageName, ImagesData, Completed, Priority)
            VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8)
            RETURNING Id AS "id", TextContent AS "text", ImageData AS "imageData",
                      ImageName AS "imageName", ImagesData AS "imagesData", Completed AS "completed", Priority AS "priority",
                      CreatedAt AS "createdAt", UpdatedAt AS "updatedAt", CompletedAt AS "completedAt"`,
        [id, req.authUser.userId, req.authUser.role, text, firstImage.dataUrl, firstImage.name || null, JSON.stringify(imageList.value), priority]);
        res.status(201).json(normalizeRequestRow(result.rows[0]));
    } catch (err) {
        console.error('[POST /api/requests]', err);
        res.status(500).json({ error: 'Không thể lưu yêu cầu.' });
    }
});

app.put('/api/requests/:id/status', requireAuth, async (req, res) => {
    const { completed } = req.body || {};
    if (typeof completed !== 'boolean') {
        return res.status(400).json({ error: 'Trạng thái hoàn thành không hợp lệ.' });
    }
    try {
        const result = await pgPool.query(`
            UPDATE TaskRequests
            SET Completed = $1, UpdatedAt = CURRENT_TIMESTAMP,
                CompletedAt = CASE WHEN $1 THEN CURRENT_TIMESTAMP ELSE NULL END
            WHERE Id = $2 AND OwnerId = $3 AND OwnerRole = $4
            RETURNING Id AS "id", TextContent AS "text", ImageData AS "imageData",
                      ImageName AS "imageName", ImagesData AS "imagesData", Completed AS "completed", Priority AS "priority",
                      CreatedAt AS "createdAt", UpdatedAt AS "updatedAt", CompletedAt AS "completedAt"`,
        [completed, req.params.id, req.authUser.userId, req.authUser.role]);
        if (result.rowCount !== 1) return res.status(404).json({ error: 'Không tìm thấy yêu cầu.' });
        res.json(normalizeRequestRow(result.rows[0]));
    } catch (err) {
        console.error('[PUT /api/requests/:id/status]', err);
        res.status(500).json({ error: 'Không thể cập nhật yêu cầu.' });
    }
});

app.put('/api/requests/:id/priority', requireAuth, async (req, res) => {
    const { priority } = req.body || {};
    if (typeof priority !== 'boolean') {
        return res.status(400).json({ error: 'Trạng thái ưu tiên không hợp lệ.' });
    }
    try {
        const result = await pgPool.query(`
            UPDATE TaskRequests
            SET Priority = $1, UpdatedAt = CURRENT_TIMESTAMP
            WHERE Id = $2 AND OwnerId = $3 AND OwnerRole = $4
            RETURNING Id AS "id", TextContent AS "text", ImageData AS "imageData",
                      ImageName AS "imageName", ImagesData AS "imagesData", Completed AS "completed", Priority AS "priority",
                      CreatedAt AS "createdAt", UpdatedAt AS "updatedAt", CompletedAt AS "completedAt"`,
        [priority, req.params.id, req.authUser.userId, req.authUser.role]);
        if (result.rowCount !== 1) return res.status(404).json({ error: 'Không tìm thấy yêu cầu.' });
        res.json(normalizeRequestRow(result.rows[0]));
    } catch (err) {
        console.error('[PUT /api/requests/:id/priority]', err);
        res.status(500).json({ error: 'Không thể cập nhật mức độ ưu tiên.' });
    }
});

app.post('/api/ai-chat', requireAuth, async (req, res) => {
    const { message, history } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'Vui lòng nhập câu hỏi.' });
    }
    if (!OPENAI_API_KEY) {
        return res.status(500).json({ error: 'Trợ lý AI chưa được cấu hình trên máy chủ (thiếu biến môi trường OPENAI_API_KEY).' });
    }

    try {
        const role = req.authUser.role;
        const roleLabel = role === 'admin' ? 'quản trị viên' : role === 'teacher' ? 'giáo viên' : role === 'assistant' ? 'trợ giảng' : 'học sinh';
        const contextText = await buildAiContext(req);

        const systemPrompt = `Bạn là trợ lý AI của ứng dụng quản lý dạy học NttClass, đang hỗ trợ một tài khoản vai trò "${roleLabel}".
Bạn có thể trả lời mọi câu hỏi, kể cả kiến thức chung không liên quan đến ứng dụng.
Riêng với các câu hỏi về lịch dạy, điểm số, học sinh, học phí... của tài khoản này, hãy CHỈ dựa vào DỮ LIỆU thật dưới đây (dữ liệu riêng của đúng tài khoản đang hỏi) — nếu thông tin đó không có trong dữ liệu, hãy nói rõ là chưa có/không tìm thấy, KHÔNG được bịa đặt số liệu.
Trả lời ngắn gọn, rõ ràng, đúng trọng tâm, bằng tiếng Việt.

DỮ LIỆU:
${contextText}`;

        const trimmedHistory = Array.isArray(history)
            ? history
                .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
                .slice(-10)
                .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }))
            : [];

        const messages = [
            { role: 'system', content: systemPrompt },
            ...trimmedHistory,
            { role: 'user', content: message.trim().slice(0, 2000) }
        ];

        const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model:       OPENAI_CHAT_MODEL,
                messages,
                temperature: 0.3,
                max_tokens:  700
            })
        });

        if (!aiResponse.ok) {
            const errText = await aiResponse.text().catch(() => '');
            console.error('[POST /api/ai-chat] Lỗi từ OpenAI:', aiResponse.status, errText);
            return res.status(502).json({ error: 'Trợ lý AI hiện không phản hồi được. Vui lòng thử lại sau.' });
        }

        const aiData = await aiResponse.json();
        const reply = aiData?.choices?.[0]?.message?.content?.trim() || 'Xin lỗi, tôi chưa có câu trả lời phù hợp cho câu hỏi này.';
        res.json({ reply });
    } catch (err) {
        console.error('[POST /api/ai-chat]', err);
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 404 HANDLER
// ==========================================
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: `API endpoint không tồn tại: ${req.method} ${req.path}` });
    }
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ==========================================
// KHỞI CHẠY SERVER
// ==========================================
app.listen(PORT, () => {
    console.log(`🚀 Server chạy tại: http://localhost:${PORT}`);
    console.log(`📝 Roles: admin (chỉ quản lý tài khoản) | teacher (toàn quyền dạy học) | assistant=TA (gán theo 1 giáo viên, dùng AssignedTeacherId) | student (chỉ xem dữ liệu của chính mình, tài khoản do giáo viên tạo trong Students.Username/PasswordHash)`);
});
