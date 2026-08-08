-- schema-postgres.sql
-- Khởi tạo cấu trúc PostgreSQL theo cách an toàn và có thể chạy lại.
-- File không xóa bảng, không xóa dữ liệu và không tạo tài khoản hoặc dữ liệu mẫu.
-- 2. BẢNG NGƯỜI DÙNG / QUYỀN TRUY CẬP (Users)
CREATE TABLE IF NOT EXISTS Users (
    Id VARCHAR(50) PRIMARY KEY,
    Username VARCHAR(50) NOT NULL,
    Password TEXT NOT NULL,
    Name TEXT NOT NULL,
    Role VARCHAR(20) NOT NULL, -- 'admin' | 'teacher' | 'assistant'
    Active SMALLINT NOT NULL DEFAULT 1,
    AssignedTeacherId VARCHAR(50) NULL, -- chỉ dùng khi Role = 'assistant'
    CONSTRAINT UQ_Users_Username UNIQUE (Username),
    CONSTRAINT FK_Users_AssignedTeacher FOREIGN KEY (AssignedTeacherId) REFERENCES Users(Id)
);

CREATE TABLE IF NOT EXISTS AuthSessions (
    SessionHash CHAR(64) PRIMARY KEY,
    SessionId VARCHAR(50) UNIQUE,
    UserId VARCHAR(120) NOT NULL,
    AccountType VARCHAR(20) NOT NULL,
    Role VARCHAR(20) NOT NULL,
    AssignedTeacherId VARCHAR(120) NULL,
    ActorUserId VARCHAR(120) NULL,
    DeviceHash CHAR(64) NULL,
    DeviceType VARCHAR(60) NULL,
    Browser VARCHAR(100) NULL,
    Platform VARCHAR(100) NULL,
    IpPrefix VARCHAR(80) NULL,
    UserAgent VARCHAR(500) NULL,
    IdleTimeoutMinutes INTEGER NOT NULL DEFAULT 20160,
    CreatedAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    LastSeenAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ExpiresAt TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_authsessions_user ON AuthSessions (AccountType, UserId);
CREATE INDEX IF NOT EXISTS idx_authsessions_actor ON AuthSessions (ActorUserId);
CREATE INDEX IF NOT EXISTS idx_authsessions_expiry ON AuthSessions (ExpiresAt);

CREATE TABLE IF NOT EXISTS AccountSecurity (
    AccountType VARCHAR(20) NOT NULL,
    UserId VARCHAR(120) NOT NULL,
    DisplayName VARCHAR(160) NULL,
    AvatarDataUrl TEXT NULL,
    TotpSecretEncrypted TEXT NULL,
    TotpEnabled BOOLEAN NOT NULL DEFAULT FALSE,
    PendingTotpSecretEncrypted TEXT NULL,
    PendingTotpExpiresAt TIMESTAMPTZ NULL,
    RecoveryCodeHashes JSONB NOT NULL DEFAULT '[]'::jsonb,
    RecoveryCodeSalt VARCHAR(80) NULL,
    LoginAlertEnabled BOOLEAN NOT NULL DEFAULT TRUE,
    IdleTimeoutMinutes INTEGER NOT NULL DEFAULT 20160,
    DeleteRequestedAt TIMESTAMPTZ NULL,
    DeleteRequestStatus VARCHAR(30) NULL,
    CreatedAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (AccountType, UserId)
);

CREATE TABLE IF NOT EXISTS TrustedDevices (
    AccountType VARCHAR(20) NOT NULL,
    UserId VARCHAR(120) NOT NULL,
    DeviceHash CHAR(64) NOT NULL,
    DeviceType VARCHAR(60) NULL,
    Browser VARCHAR(100) NULL,
    Platform VARCHAR(100) NULL,
    IpPrefix VARCHAR(80) NULL,
    FirstSeenAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    LastSeenAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (AccountType, UserId, DeviceHash)
);

CREATE TABLE IF NOT EXISTS SecurityEvents (
    Id BIGSERIAL PRIMARY KEY,
    AccountType VARCHAR(20) NOT NULL,
    UserId VARCHAR(120) NOT NULL,
    EventType VARCHAR(60) NOT NULL,
    Status VARCHAR(20) NOT NULL DEFAULT 'success',
    Detail TEXT NULL,
    IpPrefix VARCHAR(80) NULL,
    DeviceLabel VARCHAR(220) NULL,
    CreatedAt TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_securityevents_account_created
    ON SecurityEvents (AccountType, UserId, CreatedAt DESC);

-- 3. BẢNG HỌC SINH (Students)
CREATE TABLE IF NOT EXISTS Students (
    Id VARCHAR(50) PRIMARY KEY,
    Name TEXT NOT NULL,
    Class TEXT NOT NULL,
    GradeLevel INT NULL,
    Subject TEXT NOT NULL,
    BasePrice INT NOT NULL DEFAULT 250000,
    TeacherId VARCHAR(50) NOT NULL,
    CONSTRAINT FK_Students_Teacher FOREIGN KEY (TeacherId) REFERENCES Users(Id)
);

-- 4. BẢNG BUỔI HỌC/LỊCH DẠY (Sessions)
CREATE TABLE IF NOT EXISTS Sessions (
    Id VARCHAR(50) PRIMARY KEY,
    SessionDate DATE NOT NULL,
    StartTime VARCHAR(10) NOT NULL,
    EndTime VARCHAR(10) NOT NULL,
    SessionType VARCHAR(20) NOT NULL, -- 'riêng' hoặc 'chung'
    SessionName TEXT NULL, -- Tên ca học / tên buổi học (tùy chọn, VD: "Ca sáng", "Ôn thi giữa kỳ")
    Price INT NOT NULL DEFAULT 250000,
    Duration DECIMAL(4,2) NOT NULL DEFAULT 2.0,
    Content TEXT NULL,
    HomeworkContent TEXT NULL,
    GeneralComment TEXT NULL,
    Completed SMALLINT NOT NULL DEFAULT 1, -- 1: Đã dạy, 0: Chưa dạy/Lên lịch
    RecurrenceGroupId VARCHAR(80) NULL,
    RecurrenceSequence INT NULL,
    TeacherId VARCHAR(50) NOT NULL,
    CONSTRAINT FK_Sessions_Teacher FOREIGN KEY (TeacherId) REFERENCES Users(Id)
);

-- 5. BẢNG CHI TIẾT BUỔI HỌC CỦA TỪNG HỌC SINH (SessionDetails)
--    Cột Paid ở đây là học phí riêng theo TỪNG học sinh trong buổi học
--    (kể cả buổi "chung" nhiều học sinh vẫn tính độc lập từng em).
CREATE TABLE IF NOT EXISTS SessionDetails (
    SessionId VARCHAR(50) NOT NULL,
    StudentId VARCHAR(50) NOT NULL,
    Homework TEXT NOT NULL DEFAULT '',
    Attitude TEXT NOT NULL DEFAULT '',
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

-- 5A. ĐIỂM SỐ; mỗi học sinh có tối đa một điểm trong một buổi học.
-- TestName/MaxScore được lặp lại theo từng học sinh để giữ bảng đơn giản.
-- Luồng lưu buổi học thay toàn bộ các dòng cùng SessionId trong một transaction;
-- unique (SessionId, StudentId) ngăn một học sinh bị ghi hai lần trong cùng bài.
CREATE TABLE IF NOT EXISTS Scores (
    Id VARCHAR(50) PRIMARY KEY,
    StudentId VARCHAR(50) NOT NULL,
    TeacherId VARCHAR(50) NOT NULL,
    SessionId VARCHAR(50) NULL,
    TestGroupId VARCHAR(100) NOT NULL,
    ScoreType VARCHAR(100) NOT NULL,
    TestName TEXT NOT NULL DEFAULT '',
    ScoreValue DECIMAL(8,2) NOT NULL,
    MaxScore DECIMAL(6,2) NOT NULL DEFAULT 10 CHECK (MaxScore > 0),
    ScoreDate DATE NOT NULL,
    Note TEXT NULL,
    CONSTRAINT FK_Scores_Student FOREIGN KEY (StudentId) REFERENCES Students(Id) ON DELETE CASCADE,
    CONSTRAINT FK_Scores_Teacher FOREIGN KEY (TeacherId) REFERENCES Users(Id),
    CONSTRAINT FK_Scores_Session FOREIGN KEY (SessionId) REFERENCES Sessions(Id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_scores_student ON Scores (StudentId);
CREATE INDEX IF NOT EXISTS idx_scores_teacher ON Scores (TeacherId);
CREATE INDEX IF NOT EXISTS idx_scores_teacher_test_group ON Scores (TeacherId, TestGroupId);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_session_student ON Scores (SessionId, StudentId, TestGroupId) WHERE SessionId IS NOT NULL;

-- 5B. LỊCH SỬ THU HỌC PHÍ THEO THÁNG
-- Mỗi lần xác nhận đã thu tạo một dòng đối soát độc lập: ngày thu, số tiền,
-- phương thức và ghi chú. Không dùng bảng này để tính lại số tiền buổi học.
CREATE TABLE IF NOT EXISTS TuitionPayments (
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

-- 6. YÊU CẦU / CÔNG VIỆC CÁ NHÂN
CREATE TABLE IF NOT EXISTS TaskRequests (
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
);
CREATE INDEX IF NOT EXISTS idx_taskrequests_owner_status
    ON TaskRequests (OwnerId, OwnerRole, Completed, CreatedAt DESC);
CREATE INDEX IF NOT EXISTS idx_taskrequests_owner_priority
    ON TaskRequests (OwnerId, OwnerRole, Priority, CreatedAt DESC);

-- 6B. MẪU NỘI DUNG PHIẾU HỌC PHÍ THEO TỪNG HỌC SINH
CREATE TABLE IF NOT EXISTS InvoiceTemplates (
    OwnerId VARCHAR(50) NOT NULL,
    OwnerRole VARCHAR(20) NOT NULL,
    StudentId VARCHAR(50) NOT NULL,
    TemplateData JSONB NOT NULL DEFAULT '{}'::jsonb,
    UpdatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (OwnerId, OwnerRole, StudentId)
);
CREATE INDEX IF NOT EXISTS idx_invoicetemplates_student ON InvoiceTemplates (StudentId);

-- 6C. SETUP PHIẾU HỌC PHÍ DÙNG CHUNG CHO MỖI TÀI KHOẢN
CREATE TABLE IF NOT EXISTS InvoiceAccountSettings (
    OwnerId VARCHAR(50) NOT NULL,
    OwnerRole VARCHAR(20) NOT NULL,
    TeacherName TEXT NOT NULL DEFAULT '',
    TeacherPhone VARCHAR(30) NOT NULL DEFAULT '',
    BankAccountNumber VARCHAR(60) NOT NULL DEFAULT '',
    BankAccountHolder TEXT NOT NULL DEFAULT '',
    QrDataUrl TEXT NOT NULL DEFAULT '',
    UpdatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (OwnerId, OwnerRole)
);

-- 7. TÀI KHOẢN KHỞI TẠO
-- Tài khoản quản trị đầu tiên được tạo qua run-schema.js bằng biến môi trường BOOTSTRAP_ADMIN_*.

SELECT '=== DA KIEM TRA KHOI TAO DATABASE NTTCLASS AN TOAN ===' AS status;
