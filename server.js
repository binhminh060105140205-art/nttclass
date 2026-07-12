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
 * Mật khẩu được lưu dưới dạng văn bản thuần (plain text) vì đây là đồ án
 * sinh viên quy mô nhỏ — ưu tiên đơn giản, dễ hiểu hơn là bảo mật doanh nghiệp.
 */

// Đọc file .env khi chạy ở máy local (trên Render, biến môi trường được Render
// cấu hình sẵn trong dashboard nên dòng này không ảnh hưởng gì).
require('dotenv').config();

const express = require('express');
const { Pool, types } = require('pg');
const cors    = require('cors');
const path    = require('path');
const bcrypt  = require('bcryptjs'); // Hash mật khẩu tài khoản học sinh (pure-JS, không cần build native — an toàn khi deploy Render)

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

app.use(express.json());
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
    assignedteachername: 'AssignedTeacherName', teacherid: 'TeacherId',
    class: 'Class', gradelevel: 'GradeLevel', subject: 'Subject', baseprice: 'BasePrice',
    dateofbirth: 'DateOfBirth',
    sessiondate: 'SessionDate', starttime: 'StartTime', endtime: 'EndTime',
    sessiontype: 'SessionType', price: 'Price', duration: 'Duration',
    sessionname: 'SessionName',
    content: 'Content', generalcomment: 'GeneralComment', completed: 'Completed',
    paid: 'Paid',
    sessionid: 'SessionId', studentid: 'StudentId', homework: 'Homework',
    attitude: 'Attitude', individualcomment: 'IndividualComment', note: 'Note',
    passwordhash: 'PasswordHash', accountactive: 'AccountActive',
    scoretype: 'ScoreType', scorevalue: 'ScoreValue', scoredate: 'ScoreDate'
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
            return { recordset: restoreColumnCase(result.rows) };
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

        // Self-healing migration (Phase 3): bảng Điểm số (Scores) — BTVN /
        // Kiểm tra / Thái độ, nhập độc lập theo từng mốc thời gian, KHÔNG gắn
        // cứng vào 1 buổi học cụ thể (SessionId) để giáo viên có thể nhập điểm
        // kiểm tra/BTVN ngay cả khi không có buổi học tương ứng trong lịch.
        // An toàn để chạy lại nhiều lần (IF NOT EXISTS).
        try {
            await pgPool.query(`CREATE TABLE IF NOT EXISTS Scores (
                Id VARCHAR(50) PRIMARY KEY,
                StudentId VARCHAR(50) NOT NULL,
                TeacherId VARCHAR(50) NOT NULL,
                ScoreType VARCHAR(20) NOT NULL,
                ScoreValue DECIMAL(4,2) NOT NULL,
                ScoreDate DATE NOT NULL,
                Note VARCHAR(300),
                CONSTRAINT FK_Scores_Student FOREIGN KEY (StudentId) REFERENCES Students(Id) ON DELETE CASCADE,
                CONSTRAINT FK_Scores_Teacher FOREIGN KEY (TeacherId) REFERENCES Users(Id)
            )`);
            await pgPool.query('CREATE INDEX IF NOT EXISTS idx_scores_student ON Scores (StudentId)');
            await pgPool.query('CREATE INDEX IF NOT EXISTS idx_scores_teacher ON Scores (TeacherId)');
            console.log('Đã kiểm tra/đảm bảo bảng Scores (điểm số) tồn tại.');
        } catch (migErr) {
            console.error('Lỗi khi tự động tạo bảng Scores:', migErr.message);
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
            if (user.Password !== password) {
                return res.status(401).json({
                    error: 'Tên đăng nhập hoặc mật khẩu không đúng.'
                });
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
    if (!['admin', 'teacher', 'assistant'].includes(role)) {
        return res.status(400).json({ error: 'Vai trò không hợp lệ. Chọn: admin, teacher, assistant.' });
    }
    if (role === 'assistant' && !assignedTeacherId) {
        return res.status(400).json({ error: 'Trợ giảng (assistant) bắt buộc phải được gán cho một giáo viên (assignedTeacherId).' });
    }

    try {
        const pool = await poolPromise;

        // Kiểm tra username đã tồn tại chưa
        const existing = await pool.request()
            .input('username', sql.NVarChar, username.trim())
            .query('SELECT Id FROM Users WHERE Username = @username');
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

        await pool.request()
            .input('id',       sql.VarChar,  newId)
            .input('username', sql.NVarChar, username.trim())
            .input('password', sql.NVarChar, password)
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

    if (role && !['admin', 'teacher', 'assistant'].includes(role)) {
        return res.status(400).json({ error: 'Vai trò không hợp lệ.' });
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
            sets.push('Password = @password');
            request.input('password', sql.NVarChar, password);
        }

        if (sets.length === 0) return res.status(400).json({ error: 'Không có trường nào để cập nhật.' });

        await request.query(`UPDATE Users SET ${sets.join(', ')} WHERE Id = @id`);
        res.json({ message: 'Cập nhật tài khoản thành công.' });
    } catch (err) {
        console.error('[PUT /api/users/:id]', err);
        res.status(500).json({ error: err.message });
    }
});

// DELETE user
app.delete('/api/users/:id', requireRole('admin'), async (req, res) => {
    const { id } = req.params;
    try {
        const pool = await poolPromise;
        await pool.request()
            .input('id', sql.VarChar, id)
            .query('DELETE FROM Users WHERE Id = @id');
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

    if (!username || !password || password.length < 4) {
        return res.status(400).json({ error: 'Cần nhập tên đăng nhập và mật khẩu (tối thiểu 4 ký tự).' });
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
    if (!password || password.length < 4) {
        return res.status(400).json({ error: 'Mật khẩu mới cần tối thiểu 4 ký tự.' });
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
                sd.StudentId, sd.Homework, sd.Attitude, sd.IndividualComment, sd.Note, sd.Paid
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
            .query('SELECT Id FROM Students WHERE TeacherId = @teacherId');
        const ownedIds = new Set(ownershipCheck.recordset.map(r => r.Id));
        if (studentIds.some(sid => !ownedIds.has(sid))) {
            return res.status(403).json({ error: 'Một hoặc nhiều học sinh không thuộc quyền quản lý của bạn.' });
        }

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
            .input('price',          sql.Int,           parsedPrice)
            .input('duration',       sql.Decimal(4, 2), parseFloat(duration) || 2.0)
            .input('content',        sql.NVarChar,      content        || '')
            .input('generalComment', sql.NVarChar,      generalComment || '')
            .input('completed',      sql.Bit,           completed ? 1 : 0)
            .query(`INSERT INTO Sessions (Id, SessionDate, StartTime, EndTime, SessionType, SessionName, Price, Duration, Content, GeneralComment, Completed, TeacherId)
                    VALUES (@id, @date, @startTime, @endTime, @type, @sessionName, @price, @duration, @content, @generalComment, @completed, @teacherId)`);

        for (const stId of studentIds) {
            const detail = (studentDetails && studentDetails[stId]) || { homework: 'Chưa làm', attitude: 'Tốt', individualComment: '', note: '' };
            await new sql.Request(transaction)
                .input('sessionId',        sql.VarChar,  id)
                .input('studentId',        sql.VarChar,  stId)
                .input('homework',         sql.NVarChar, detail.homework         || 'Chưa làm')
                .input('attitude',         sql.NVarChar, detail.attitude         || 'Tốt')
                .input('individualComment',sql.NVarChar, detail.individualComment|| '')
                .input('note',             sql.NVarChar, detail.note             || '')
                // Học phí LUÔN mặc định "chưa thanh toán" khi tạo buổi học mới,
                // và được lưu RIÊNG cho từng học sinh (không còn dùng chung cấp
                // buổi học nữa) — đây chính là điểm sửa lỗi "chọn 1 học sinh đã
                // thanh toán thì cả buổi/cả lớp đều bị đổi theo".
                .input('paid',              sql.Bit,      detail.paid ? 1 : 0)
                .query(`INSERT INTO SessionDetails (SessionId, StudentId, Homework, Attitude, IndividualComment, Note, Paid)
                        VALUES (@sessionId, @studentId, @homework, @attitude, @individualComment, @note, @paid)`);
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

app.put('/api/sessions/:id', requireRole('teacher', 'assistant'), requireTeacherContext, async (req, res) => {
    const { id } = req.params;
    const { date, startTime, endTime, type, sessionName, studentIds, duration, price, content, generalComment, completed, paid, studentDetails } = req.body || {};

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
            .query('SELECT TeacherId FROM Sessions WHERE Id = @id');
        if (owner.recordset.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy buổi học.' });
        }
        if (owner.recordset[0].TeacherId !== req.effectiveTeacherId) {
            return res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa buổi học của giáo viên khác.' });
        }

        transaction = new sql.Transaction(pool);
        await transaction.begin();

        await new sql.Request(transaction)
            .input('id',             sql.VarChar,       id)
            .input('date',           sql.Date,          date)
            .input('startTime',      sql.VarChar,       startTime)
            .input('endTime',        sql.VarChar,       endTime)
            .input('type',           sql.VarChar,       type)
            .input('sessionName',    sql.NVarChar,      sessionName    || '')
            .input('price',          sql.Int,           parsedPrice)
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
            .query('SELECT StudentId, Paid FROM SessionDetails WHERE SessionId = @sessionId');
        const existingPaidMap = {};
        (existingPaid.recordset || []).forEach(r => { existingPaidMap[r.StudentId] = r.Paid === true || r.Paid === 1; });

        await new sql.Request(transaction)
            .input('sessionId', sql.VarChar, id)
            .query('DELETE FROM SessionDetails WHERE SessionId = @sessionId');

        for (const stId of studentIds) {
            const detail = (studentDetails && studentDetails[stId]) || { homework: 'Chưa làm', attitude: 'Tốt', individualComment: '', note: '' };
            const keepPaid = (detail.paid !== undefined) ? !!detail.paid : !!existingPaidMap[stId];
            await new sql.Request(transaction)
                .input('sessionId',        sql.VarChar,  id)
                .input('studentId',        sql.VarChar,  stId)
                .input('homework',         sql.NVarChar, detail.homework          || 'Chưa làm')
                .input('attitude',         sql.NVarChar, detail.attitude          || 'Tốt')
                .input('individualComment',sql.NVarChar, detail.individualComment || '')
                .input('note',             sql.NVarChar, detail.note              || '')
                .input('paid',             sql.Bit,      keepPaid ? 1 : 0)
                .query(`INSERT INTO SessionDetails (SessionId, StudentId, Homework, Attitude, IndividualComment, Note, Paid)
                        VALUES (@sessionId, @studentId, @homework, @attitude, @individualComment, @note, @paid)`);
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

        await new sql.Request(transaction)
            .input('sessionId',        sql.VarChar,  sessionId)
            .input('studentId',        sql.VarChar,  studentId)
            .input('homework',         sql.NVarChar, homework         || 'Chưa làm')
            .input('attitude',         sql.NVarChar, attitude         || 'Tốt')
            .input('individualComment',sql.NVarChar, individualComment|| '')
            .input('note',             sql.NVarChar, note             || '')
            .query(`UPDATE SessionDetails
                    SET Homework = @homework, Attitude = @attitude,
                        IndividualComment = @individualComment, Note = @note
                    WHERE SessionId = @sessionId AND StudentId = @studentId`);

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
app.put('/api/students/:studentId/set-paid', requireRole('teacher'), requireTeacherContext, async (req, res) => {
    const { studentId } = req.params;
    const { paid } = req.body || {};
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
// SCORES API (Phase 3 — Điểm số: BTVN / Kiểm tra / Thái độ)
// Chỉ giáo viên/trợ giảng được tạo/sửa/xóa; học sinh chỉ xem qua
// /api/me/scores (route riêng ở phần STUDENT SELF-SERVICE bên dưới).
// ==========================================

const SCORE_TYPES = ['BTVN', 'KiemTra', 'ThaiDo'];

// GET danh sách điểm — có thể lọc theo ?studentId=... (dùng cho trang Điểm số
// của 1 học sinh cụ thể) hoặc bỏ trống để lấy TẤT CẢ điểm của giáo viên hiện
// tại (dùng để tính toán/biểu đồ tổng hợp phía frontend mà không cần gọi lại
// API nhiều lần khi đổi học sinh đang chọn).
app.get('/api/scores', requireRole('teacher', 'assistant'), requireTeacherContext, async (req, res) => {
    const { studentId } = req.query;
    try {
        const pool = await poolPromise;
        const request = pool.request().input('teacherId', sql.VarChar, req.effectiveTeacherId);
        let query = `SELECT Id, StudentId, ScoreType, ScoreValue, ScoreDate, Note
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
            scoreType:  r.ScoreType,
            scoreValue: parseFloat(r.ScoreValue),
            date:       r.ScoreDate ? String(r.ScoreDate).slice(0, 10) : '',
            note:       r.Note || ''
        })));
    } catch (err) {
        console.error('[GET /api/scores]', err);
        res.status(500).json({ error: err.message });
    }
});

// POST thêm 1 điểm mới cho 1 học sinh
app.post('/api/scores', requireRole('teacher', 'assistant'), requireTeacherContext, async (req, res) => {
    const { id, studentId, scoreType, scoreValue, date, note } = req.body || {};

    if (!id || !studentId || !scoreType || scoreValue === undefined || scoreValue === null || !date) {
        return res.status(400).json({ error: 'Thiếu thông tin bắt buộc: học sinh, loại điểm, điểm số, ngày.' });
    }
    if (!SCORE_TYPES.includes(scoreType)) {
        return res.status(400).json({ error: 'Loại điểm không hợp lệ. Chọn: BTVN, KiemTra, ThaiDo.' });
    }
    const val = parseFloat(scoreValue);
    if (isNaN(val) || val < 0 || val > 10) {
        return res.status(400).json({ error: 'Điểm số phải là số từ 0 đến 10.' });
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
            .input('scoreType',  sql.VarChar,  scoreType)
            .input('scoreValue', sql.Decimal(), val)
            .input('date',       sql.Date,     date)
            .input('note',       sql.NVarChar, note || '')
            .query(`INSERT INTO Scores (Id, StudentId, TeacherId, ScoreType, ScoreValue, ScoreDate, Note)
                    VALUES (@id, @studentId, @teacherId, @scoreType, @scoreValue, @date, @note)`);

        res.status(201).json({ message: 'Đã thêm điểm mới.' });
    } catch (err) {
        console.error('[POST /api/scores]', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT sửa 1 điểm đã nhập
app.put('/api/scores/:id', requireRole('teacher', 'assistant'), requireTeacherContext, async (req, res) => {
    const { id } = req.params;
    const { scoreType, scoreValue, date, note } = req.body || {};

    if (!scoreType || scoreValue === undefined || scoreValue === null || !date) {
        return res.status(400).json({ error: 'Thiếu thông tin bắt buộc: loại điểm, điểm số, ngày.' });
    }
    if (!SCORE_TYPES.includes(scoreType)) {
        return res.status(400).json({ error: 'Loại điểm không hợp lệ. Chọn: BTVN, KiemTra, ThaiDo.' });
    }
    const val = parseFloat(scoreValue);
    if (isNaN(val) || val < 0 || val > 10) {
        return res.status(400).json({ error: 'Điểm số phải là số từ 0 đến 10.' });
    }

    try {
        const pool = await poolPromise;
        const owner = await pool.request().input('id', sql.VarChar, id)
            .query('SELECT TeacherId FROM Scores WHERE Id = @id');
        if (owner.recordset.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy điểm cần sửa.' });
        }
        if (owner.recordset[0].TeacherId !== req.effectiveTeacherId) {
            return res.status(403).json({ error: 'Bạn không có quyền sửa điểm của giáo viên khác.' });
        }

        await pool.request()
            .input('id',         sql.VarChar,  id)
            .input('scoreType',  sql.VarChar,  scoreType)
            .input('scoreValue', sql.Decimal(), val)
            .input('date',       sql.Date,     date)
            .input('note',       sql.NVarChar, note || '')
            .query(`UPDATE Scores
                    SET ScoreType = @scoreType, ScoreValue = @scoreValue, ScoreDate = @date, Note = @note
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
            .query(`SELECT Id, StudentId, ScoreType, ScoreValue, ScoreDate, Note
                    FROM Scores WHERE StudentId = @studentId ORDER BY ScoreDate DESC`);

        res.json(result.recordset.map(r => ({
            id:         r.Id,
            studentId:  r.StudentId,
            scoreType:  r.ScoreType,
            scoreValue: parseFloat(r.ScoreValue),
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
              AND s.SessionDate >= CURRENT_DATE - INTERVAL '45 days'
              AND s.SessionDate <= CURRENT_DATE + INTERVAL '14 days'
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