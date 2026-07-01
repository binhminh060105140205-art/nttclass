-- schema-postgres.sql
-- Bản chuyển đổi TỪ schema.sql GỐC (SQL Server) SANG PostgreSQL (Aiven).
-- Đã giữ nguyên toàn bộ dữ liệu mẫu (3 tài khoản, 3 học sinh, 11 buổi học...)
-- từ file schema.sql gốc của bạn, chỉ đổi cú pháp cho đúng chuẩn PostgreSQL:
--   - Bỏ CREATE DATABASE / USE (Aiven đã tạo sẵn database "defaultdb" cho bạn)
--   - Bỏ các dòng "GO" (không tồn tại trong PostgreSQL)
--   - NVARCHAR(n) -> VARCHAR(n),  NVARCHAR(MAX) -> TEXT
--   - BIT -> SMALLINT (0/1, giữ đúng như code server.js đang dùng)
--   - N'...' -> '...' (PostgreSQL không cần tiền tố N)
--   - IF OBJECT_ID(...) DROP TABLE ...  ->  DROP TABLE IF EXISTS ...
--
-- CÁCH CHẠY: mở PG Studio (hoặc Query editor) trên Aiven, dán TOÀN BỘ nội
-- dung file này vào, chọn hết (Ctrl+A) rồi Run. Chạy 1 lần duy nhất.

-- 1. XÓA BẢNG NẾU ĐÃ TỒN TẠI (để tái khởi tạo kịch bản sạch)
DROP TABLE IF EXISTS SessionDetails CASCADE;
DROP TABLE IF EXISTS Sessions CASCADE;
DROP TABLE IF EXISTS Students CASCADE;
DROP TABLE IF EXISTS Users CASCADE;

-- 2. TẠO BẢNG HỌC SINH (Students)
CREATE TABLE Students (
    Id VARCHAR(50) PRIMARY KEY,
    Name VARCHAR(100) NOT NULL,
    Class VARCHAR(50) NOT NULL,
    GradeLevel INT NULL, -- khối lớp (6-12), dùng để lọc học sinh theo khối
    Subject VARCHAR(50) NOT NULL,
    BasePrice INT NOT NULL DEFAULT 250000,
    TeacherId VARCHAR(50) NOT NULL -- FK thêm ở bước 6 sau khi có bảng Users
);

-- 3. TẠO BẢNG BUỔI HỌC/LỊCH DẠY (Sessions)
CREATE TABLE Sessions (
    Id VARCHAR(50) PRIMARY KEY,
    SessionDate DATE NOT NULL,
    StartTime VARCHAR(10) NOT NULL,
    EndTime VARCHAR(10) NOT NULL,
    SessionType VARCHAR(20) NOT NULL, -- 'riêng' hoặc 'chung'
    Price INT NOT NULL DEFAULT 250000,
    Duration DECIMAL(4,2) NOT NULL DEFAULT 2.0,
    Content TEXT NULL,
    GeneralComment TEXT NULL,
    Completed SMALLINT NOT NULL DEFAULT 1, -- 1: Đã dạy, 0: Chưa dạy/Lên lịch
    TeacherId VARCHAR(50) NOT NULL -- FK thêm ở bước 6
);

-- 4. TẠO BẢNG CHI TIẾT BUỔI HỌC CỦA TỪNG HỌC SINH (SessionDetails)
CREATE TABLE SessionDetails (
    SessionId VARCHAR(50) NOT NULL,
    StudentId VARCHAR(50) NOT NULL,
    Homework VARCHAR(50) NOT NULL DEFAULT 'Chưa làm',
    Attitude VARCHAR(150) NOT NULL DEFAULT 'Tốt',
    IndividualComment TEXT NULL,
    Note VARCHAR(200) NULL,
    CONSTRAINT PK_SessionDetails PRIMARY KEY (SessionId, StudentId),
    CONSTRAINT FK_SessionDetails_Sessions FOREIGN KEY (SessionId) REFERENCES Sessions(Id) ON DELETE CASCADE,
    CONSTRAINT FK_SessionDetails_Students FOREIGN KEY (StudentId) REFERENCES Students(Id) ON DELETE CASCADE
);

-- 5. TẠO BẢNG NGƯỜI DÙNG / QUYỀN TRUY CẬP (Users)
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

-- 6. Bổ sung khóa ngoại Students/Sessions -> Users sau khi bảng Users tồn tại
ALTER TABLE Students ADD CONSTRAINT FK_Students_Teacher FOREIGN KEY (TeacherId) REFERENCES Users(Id);
ALTER TABLE Sessions ADD CONSTRAINT FK_Sessions_Teacher FOREIGN KEY (TeacherId) REFERENCES Users(Id);

-- 7. CHÈN DỮ LIỆU MẪU (giống hệt file schema.sql gốc của bạn)

-- Tài khoản người dùng mẫu (PHẢI chèn trước Students/Sessions vì TeacherId
-- tham chiếu tới Users.Id qua khóa ngoại)
-- Mật khẩu lưu dạng văn bản thuần (plain text) — đồ án sinh viên quy mô nhỏ.
INSERT INTO Users (Id, Username, Password, Name, Role, Active, AssignedTeacherId) VALUES
('u_admin', 'admin', 'admin123', 'Quản trị viên', 'admin', 1, NULL),
('u_teacher', 'teacher', 'teacher123', 'Cô giáo chính', 'teacher', 1, NULL),
('u_ta1', 'tro_giang', 'ta123', 'Trợ giảng A', 'assistant', 1, 'u_teacher');

-- Học sinh mẫu (tất cả thuộc giáo viên u_teacher)
INSERT INTO Students (Id, Name, Class, GradeLevel, Subject, BasePrice, TeacherId) VALUES
('hs_1', 'Quỳnh Anh', 'Lớp 8', 8, 'Toán', 250000, 'u_teacher'),
('hs_2', 'Minh Anh', 'Lớp 7', 7, 'Toán', 250000, 'u_teacher'),
('hs_3', 'Trà My', 'Lớp 9', 9, 'Toán', 200000, 'u_teacher');

-- Lịch sử buổi học mẫu
INSERT INTO Sessions (Id, SessionDate, StartTime, EndTime, SessionType, Price, Duration, Content, GeneralComment, Completed, TeacherId) VALUES
-- Buổi 1 (Quỳnh Anh)
('sess_1', '2026-05-23', '18:00', '20:00', 'riêng', 250000, 2.0,
 'ÔN TẬP ĐA THỨC MỘT BIẾN
+ Cộng trừ đa thức
+ Nhân chia đa thức
BTVN: Phiếu 7.3, 7.4, 7.5',
 'ĐẠI SỐ (nền tảng - 20%):
+ Không nắm chắc lý thuyết, không biết nhân chia cộng trừ luỹ thừa, bị nhầm phép cộng - nhân, trừ - chia.
+ Không tính toán được số nguyên âm.
+ Tư duy chậm, phản xạ chậm.', 1, 'u_teacher'),

-- Buổi 2 (Quỳnh Anh)
('sess_2', '2026-06-14', '08:40', '10:10', 'riêng', 250000, 1.5,
 'CHIA ĐA THỨC MỘT BIẾN
BTVN: Phiếu 7.5',
 'Làm bài tập đối phó, vẫn chưa nắm được phép chia đa thức, không ôn lại bài, chép đáp án.', 1, 'u_teacher'),

-- Buổi 3 (Quỳnh Anh)
('sess_3', '2026-06-17', '17:00', '19:30', 'riêng', 250000, 2.5,
 'GÓC KỀ BÙ, ĐỐI ĐỈNH, TIA PHÂN GIÁC
+ Góc kề bù, bù nhau
+ Góc đối đỉnh
+ Tia phân giác, tia nằm giữa hai tia
+ Phân loại góc nhọn, tù, bẹt, vuông
BTVN: Phiếu 4',
 'MẤT GỐC HÌNH
- Không xác định được góc, coi như dạy lại từ đầu
- Không phân biệt được góc, đường, tia,... các khái niệm hình học cơ bản
- Trình bày chưa logic, không biết vẽ hình', 1, 'u_teacher'),

-- Buổi 4 (Quỳnh Anh)
('sess_4', '2026-06-18', '17:10', '19:30', 'riêng', 250000, 2.3,
 'CHỮA BÀI TẬP PHIẾU 4
PHÉP CHIA ĐA THỨC
BTVN:
+ Chép phạt góc kề bù, tia phân giác
+ Phiếu 4
+ Phiếu 7.5',
 'Làm 2/3 bài tập.
+ Bước đầu xác định được vị trí các góc, biết tính toán số đo cơ bản.
+ Chưa nhớ lý thuyết (chép phạt).
+ Chưa có năng lực giao tiếp toán học, chưa trình bày được logic bài toán.
+ Có tiến bộ hơn trong đại số, nắm được cơ bản cách tính số âm nhưng chưa thuần thục.', 1, 'u_teacher'),

-- Buổi 5 (Quỳnh Anh)
('sess_5', '2026-06-24', '17:15', '19:20', 'riêng', 250000, 2.1,
 'HAI ĐƯỜNG THẲNG SONG SONG, TIÊN ĐỀ EUCLID
- Hai đường thẳng song song
- Phương pháp chứng minh hai đường thẳng //
+ Dấu hiệu nhận biết
+ Mối quan hệ vuông góc và //
BTVN: Phiếu 5',
 '- Xác định tốt được các góc so le trong, đồng vị.
- Vận dụng được mối quan hệ các góc đối đỉnh, kề bù.', 1, 'u_teacher'),

-- Buổi 6 (Chung Quỳnh Anh & Minh Anh)
('sess_6', '2026-06-25', '16:00', '18:30', 'chung', 250000, 2.5,
 'ĐƠN THỨC, ĐA THỨC MỘT BIẾN
- Đơn thức, đa thức đơn thức
- Đa thức, thu gọn đa thức
- Tính giá trị của đơn thức, đa thức tại x, y cho trước
BTVN: Phiếu 8.1',
 'ĐÁNH GIÁ CHUNG NHÓM:
- Học sinh đã tiếp thu tốt khái niệm đa thức đơn biến và cách thu gọn.
- Cần lưu ý luyện tập kỹ thuật đổi dấu và nhân chia số nguyên.', 1, 'u_teacher'),

-- Buổi 7 (Quỳnh Anh - Chưa hoàn thành buổi học)
('sess_7', '2026-06-28', '17:00', '19:00', 'riêng', 250000, 2.0,
 'CÁC YẾU TỐ TRONG TAM GIÁC
+ Tổng ba góc trong tam giác
+ Góc ngoài tam giác
+ Đường vuông góc và đường xiên
+ Bất đẳng thức tam giác
ÔN TẬP SONG SONG
BTVN: Phiếu 6',
 '- Cơ bản xác định được các góc nhưng chưa thuần thục, còn nhầm góc kề bù, đối đỉnh, so le trong, đồng vị.
- Kĩ năng vẽ hình kém.', 0, 'u_teacher'),

-- Các ca Minh Anh tuần 1 & 2 (Hình 4)
('sess_8', '2026-06-06', '16:00', '20:00', 'riêng', 250000, 4.0, 'Dạy kèm nâng cao hình học cho Minh Anh', 'Học rất tập trung, tiến bộ vượt bậc.', 1, 'u_teacher'),
('sess_9', '2026-06-07', '16:00', '20:00', 'riêng', 250000, 4.0, 'Luyện đề thi học sinh giỏi Minh Anh', 'Chăm chỉ giải bài.', 1, 'u_teacher'),
('sess_10', '2026-06-13', '16:00', '19:00', 'riêng', 250000, 3.0, 'Chữa đề khảo sát Minh Anh', 'Làm bài tốt.', 1, 'u_teacher'),

-- Ca Trà My
('sess_11', '2026-06-17', '16:00', '18:00', 'riêng', 200000, 2.0, 'Hình học 9 - Đường tròn hệ thức lượng', 'Nắm vững lý thuyết.', 1, 'u_teacher');

-- Chi tiết buổi học mẫu của từng học sinh
INSERT INTO SessionDetails (SessionId, StudentId, Homework, Attitude, IndividualComment, Note) VALUES
('sess_1', 'hs_1', 'Chưa làm', 'Chưa tập trung, chưa hợp tác', '', 'Toán 7'),
('sess_2', 'hs_1', 'Chưa hoàn thành', 'Chưa có ý thức làm bài tập về nhà', '', 'Toán 7'),
('sess_3', 'hs_1', 'Chưa làm', 'Tập trung', '', 'Toán 7'),
('sess_4', 'hs_1', 'Hoàn thành', 'Tập trung hơn, hợp tác hơn', '', 'Toán 7'),
('sess_5', 'hs_1', 'Hoàn thành', 'Tốt', '', 'Toán 7'),

-- Buổi học chung sess_6 có nhận xét riêng và nhận xét chung tự động đồng bộ
('sess_6', 'hs_1', 'Chưa làm', 'Tốt', 'Quỳnh Anh:
- Cơ bản nắm được 70% nền kiến thức.
- Còn nhầm lẫn cộng trừ dấu âm.
- Nhầm lẫn thu gọn đơn thức và thu gọn đa thức.', 'Toán 8'),
('sess_6', 'hs_2', 'Hoàn thành', 'Tập trung, hăng hái phát biểu', 'Minh Anh:
- Làm bài tập đầy đủ, nắm vững phương pháp cộng trừ đa thức nhanh nhạy.', 'Toán 7'),

('sess_7', 'hs_1', 'Chưa hoàn thành', 'Tốt', '', 'Toán 7'),

('sess_8', 'hs_2', 'Hoàn thành', 'Tốt', '', 'Minh Anh NTT'),
('sess_9', 'hs_2', 'Hoàn thành', 'Tốt', '', 'Minh Anh NTT'),
('sess_10', 'hs_2', 'Hoàn thành', 'Tốt', '', 'Minh Anh NTT'),
('sess_11', 'hs_3', 'Hoàn thành', 'Tập trung', '', 'Trà My 9');

SELECT '=== KHOI TAO DATABASE PINKYCLASSDB (POSTGRESQL) THANH CONG! ===' AS status;
