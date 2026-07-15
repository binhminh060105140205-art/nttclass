-- schema-postgres.sql
-- BẢN GỘP DUY NHẤT — thay thế toàn bộ các file schema cũ + migration cũ.
-- Chạy 1 LẦN DUY NHẤT trên Aiven (PostgreSQL). File này sẽ XÓA SẠCH các bảng
-- cũ (nếu có) rồi tạo lại từ đầu — vì vậy TOÀN BỘ dữ liệu cũ (kể cả các buổi
-- học/lịch dạy trước đây) sẽ MẤT. Chỉ chạy khi bạn chắc chắn muốn làm lại từ đầu.
--
-- Đã bao gồm sẵn:
--   - Cột SessionDetails.Paid (học phí tính riêng theo từng học sinh, không
--     còn dùng chung theo buổi học nữa) -> KHÔNG cần chạy thêm file migration
--     nào khác.
--   - Danh sách học sinh đúng như trong ảnh Hồ sơ học sinh hiện tại.
--
-- CÁCH CHẠY: mở Aiven Console -> chọn service database -> tab "Query editor"
-- (hoặc dùng PG Studio / pgAdmin kết nối qua Connection String), dán TOÀN BỘ
-- nội dung file này vào, chọn hết (Ctrl+A) rồi Run.

-- 1. XÓA BẢNG CŨ NẾU ĐÃ TỒN TẠI
DROP TABLE IF EXISTS SessionDetails CASCADE;
DROP TABLE IF EXISTS Sessions CASCADE;
DROP TABLE IF EXISTS Students CASCADE;
DROP TABLE IF EXISTS Users CASCADE;

-- 2. BẢNG NGƯỜI DÙNG / QUYỀN TRUY CẬP (Users)
CREATE TABLE Users (
    Id VARCHAR(50) PRIMARY KEY,
    Username VARCHAR(50) NOT NULL,
    Password VARCHAR(200) NOT NULL,
    Name VARCHAR(100) NOT NULL,
    Role VARCHAR(20) NOT NULL, -- 'admin' | 'teacher' | 'assistant'
    Active SMALLINT NOT NULL DEFAULT 1,
    AssignedTeacherId VARCHAR(50) NULL, -- chỉ dùng khi Role = 'assistant'
    CONSTRAINT UQ_Users_Username UNIQUE (Username),
    CONSTRAINT FK_Users_AssignedTeacher FOREIGN KEY (AssignedTeacherId) REFERENCES Users(Id)
);

-- 3. BẢNG HỌC SINH (Students)
CREATE TABLE Students (
    Id VARCHAR(50) PRIMARY KEY,
    Name VARCHAR(100) NOT NULL,
    Class VARCHAR(50) NOT NULL,
    GradeLevel INT NULL,
    Subject VARCHAR(50) NOT NULL,
    BasePrice INT NOT NULL DEFAULT 250000,
    TeacherId VARCHAR(50) NOT NULL,
    CONSTRAINT FK_Students_Teacher FOREIGN KEY (TeacherId) REFERENCES Users(Id)
);

-- 4. BẢNG BUỔI HỌC/LỊCH DẠY (Sessions)
CREATE TABLE Sessions (
    Id VARCHAR(50) PRIMARY KEY,
    SessionDate DATE NOT NULL,
    StartTime VARCHAR(10) NOT NULL,
    EndTime VARCHAR(10) NOT NULL,
    SessionType VARCHAR(20) NOT NULL, -- 'riêng' hoặc 'chung'
    SessionName VARCHAR(100) NULL, -- Tên ca học / tên buổi học (tùy chọn, VD: "Ca sáng", "Ôn thi giữa kỳ")
    Price INT NOT NULL DEFAULT 250000,
    Duration DECIMAL(4,2) NOT NULL DEFAULT 2.0,
    Content TEXT NULL,
    GeneralComment TEXT NULL,
    Completed SMALLINT NOT NULL DEFAULT 1, -- 1: Đã dạy, 0: Chưa dạy/Lên lịch
    TeacherId VARCHAR(50) NOT NULL,
    CONSTRAINT FK_Sessions_Teacher FOREIGN KEY (TeacherId) REFERENCES Users(Id)
);

-- 5. BẢNG CHI TIẾT BUỔI HỌC CỦA TỪNG HỌC SINH (SessionDetails)
--    Cột Paid ở đây là học phí riêng theo TỪNG học sinh trong buổi học
--    (kể cả buổi "chung" nhiều học sinh vẫn tính độc lập từng em).
CREATE TABLE SessionDetails (
    SessionId VARCHAR(50) NOT NULL,
    StudentId VARCHAR(50) NOT NULL,
    Homework VARCHAR(50) NOT NULL DEFAULT 'Chưa làm',
    Attitude TEXT NOT NULL DEFAULT 'Tốt',
    IndividualComment TEXT NULL,
    Note TEXT NULL,
    -- Số tiền phải thu của RIÊNG học sinh này trong buổi học, được chốt ngay
    -- khi tạo buổi để việc đổi học phí cơ bản sau này không sửa nợ lịch sử.
    FeeAmount INTEGER NOT NULL DEFAULT 0,
    Paid SMALLINT NOT NULL DEFAULT 0,
    CONSTRAINT PK_SessionDetails PRIMARY KEY (SessionId, StudentId),
    CONSTRAINT FK_SessionDetails_Sessions FOREIGN KEY (SessionId) REFERENCES Sessions(Id) ON DELETE CASCADE,
    CONSTRAINT FK_SessionDetails_Students FOREIGN KEY (StudentId) REFERENCES Students(Id) ON DELETE CASCADE
);

-- 5B. LỊCH SỬ THU HỌC PHÍ THEO THÁNG
-- Mỗi lần xác nhận đã thu tạo một dòng đối soát độc lập: ngày thu, số tiền,
-- phương thức và ghi chú. Không dùng bảng này để tính lại số tiền buổi học.
CREATE TABLE TuitionPayments (
    Id VARCHAR(60) PRIMARY KEY,
    TeacherId VARCHAR(50) NOT NULL,
    StudentId VARCHAR(50) NOT NULL,
    PeriodMonth CHAR(7) NOT NULL,
    Amount INTEGER NOT NULL CHECK (Amount >= 0),
    PaymentDate DATE NOT NULL,
    PaymentMethod VARCHAR(30) NOT NULL DEFAULT 'Tiền mặt',
    Note TEXT NULL,
    CreatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT FK_TuitionPayments_Teacher FOREIGN KEY (TeacherId) REFERENCES Users(Id),
    CONSTRAINT FK_TuitionPayments_Student FOREIGN KEY (StudentId) REFERENCES Students(Id)
);

-- 6. TÀI KHOẢN NGƯỜI DÙNG
-- Mật khẩu lưu dạng văn bản thuần (plain text) — đồ án sinh viên quy mô nhỏ.
-- ĐỔI username/password bên dưới thành tài khoản thật của bạn trước khi chạy.
INSERT INTO Users (Id, Username, Password, Name, Role, Active, AssignedTeacherId) VALUES
('u_admin', 'admin', 'admin123', 'Nguyễn Bình Minh', 'admin', 1, NULL),
('u_teacher', 'teacher', 'teacher123', 'Nguyễn Thanh Thúy', 'teacher', 1, NULL),
('u_assistant', 'trogiang', 'trogiang123', 'Trần Gia Bảo', 'assistant', 1, 'u_teacher');

-- 7. DANH SÁCH HỌC SINH (đúng theo ảnh Hồ sơ học sinh hiện tại)
INSERT INTO Students (Id, Name, Class, GradeLevel, Subject, BasePrice, TeacherId) VALUES
('hs_1', 'Khánh Hà',    'Lớp 8',  8,  'Toán', 200000, 'u_teacher'),
('hs_2', 'Quỳnh Anh',   'Lớp 8',  8,  'Toán', 250000, 'u_teacher'),
('hs_3', 'Duy Anh',     'Lớp 9',  9,  'Toán', 120000, 'u_teacher'),
('hs_4', 'Tiến Thanh',  'Lớp 9',  9,  'Toán', 120000, 'u_teacher'),
('hs_5', 'Trà My',      'Lớp 9',  9,  'Toán', 120000, 'u_teacher'),
('hs_6', 'Minh Anh',    'Lớp 10', 10, 'Toán', 180000, 'u_teacher'),
('hs_7', 'Nam Phong',   'Lớp 10', 10, 'Toán', 180000, 'u_teacher');

-- Chưa chèn dữ liệu Sessions / SessionDetails mẫu — bảng "Lịch dạy & Chấm công"
-- sẽ trống, bạn nhập buổi học thật trực tiếp trên ứng dụng.

SELECT '=== KHOI TAO DATABASE NTTCLASS (POSTGRESQL) THANH CONG! ===' AS status;
