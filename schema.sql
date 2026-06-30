-- 1. TẠO LẠI DATABASE MỚI HOÀN TOÀN
-- Chạy lệnh này để tạo lại PinkyClassDB từ đầu.
IF DB_ID('PinkyClassDB') IS NOT NULL
BEGIN
    ALTER DATABASE PinkyClassDB SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE PinkyClassDB;
END
GO

CREATE DATABASE PinkyClassDB;
GO

USE PinkyClassDB;
GO

-- 2. XÓA BẢNG NẾU ĐÃ TỒN TẠI (Để tái khởi tạo kịch bản sạch)
IF OBJECT_ID('dbo.SessionDetails', 'U') IS NOT NULL DROP TABLE dbo.SessionDetails;
IF OBJECT_ID('dbo.Sessions', 'U') IS NOT NULL DROP TABLE dbo.Sessions;
IF OBJECT_ID('dbo.Users', 'U') IS NOT NULL DROP TABLE dbo.Users;
IF OBJECT_ID('dbo.Students', 'U') IS NOT NULL DROP TABLE dbo.Students;
GO

-- 3. TẠO BẢNG HỌC SINH (Students)
CREATE TABLE dbo.Students (
    Id VARCHAR(50) PRIMARY KEY,
    Name NVARCHAR(100) NOT NULL,
    Class NVARCHAR(50) NOT NULL,
    Subject NVARCHAR(50) NOT NULL,
    BasePrice INT NOT NULL DEFAULT 250000,
    TeacherId VARCHAR(50) NOT NULL -- Học sinh thuộc về giáo viên nào (FK thêm ở bước 6 sau khi có bảng Users)
);
GO

-- 4. TẠO BẢNG BUỔI HỌC/LỊCH DẠY (Sessions)
CREATE TABLE dbo.Sessions (
    Id VARCHAR(50) PRIMARY KEY,
    SessionDate DATE NOT NULL,
    StartTime VARCHAR(10) NOT NULL,
    EndTime VARCHAR(10) NOT NULL,
    SessionType NVARCHAR(20) NOT NULL, -- N'riêng' hoặc N'chung'
    Price INT NOT NULL DEFAULT 250000,
    Duration DECIMAL(4,2) NOT NULL DEFAULT 2.0,
    Content NVARCHAR(MAX) NULL,
    GeneralComment NVARCHAR(MAX) NULL,
    Completed BIT NOT NULL DEFAULT 1, -- 1: Đã dạy, 0: Chưa dạy/Lên lịch
    TeacherId VARCHAR(50) NOT NULL -- Buổi học thuộc về giáo viên nào (FK thêm ở bước 6)
);
GO

-- 5. TẠO BẢNG CHI TIẾT BUỔI HỌC CỦA TỪNG HỌC SINH (SessionDetails)
CREATE TABLE dbo.SessionDetails (
    SessionId VARCHAR(50) NOT NULL,
    StudentId VARCHAR(50) NOT NULL,
    Homework NVARCHAR(50) NOT NULL DEFAULT N'Chưa làm', -- N'Hoàn thành', N'Chưa hoàn thành', N'Chưa làm'
    Attitude NVARCHAR(150) NOT NULL DEFAULT N'Tốt',
    IndividualComment NVARCHAR(MAX) NULL,
    Note NVARCHAR(200) NULL,
    CONSTRAINT PK_SessionDetails PRIMARY KEY (SessionId, StudentId),
    CONSTRAINT FK_SessionDetails_Sessions FOREIGN KEY (SessionId) REFERENCES dbo.Sessions(Id) ON DELETE CASCADE,
    CONSTRAINT FK_SessionDetails_Students FOREIGN KEY (StudentId) REFERENCES dbo.Students(Id) ON DELETE CASCADE
);
GO

-- 6. TẠO BẢNG NGƯỜI DÙNG / QUYỀN TRUY CẬP (Users)
CREATE TABLE dbo.Users (
    Id VARCHAR(50) PRIMARY KEY,
    Username NVARCHAR(50) NOT NULL,
    Password NVARCHAR(200) NOT NULL,
    Name NVARCHAR(100) NOT NULL,
    Role NVARCHAR(20) NOT NULL, -- 'admin' | 'teacher' | 'assistant'
    Active BIT NOT NULL DEFAULT 1,
    AssignedTeacherId VARCHAR(50) NULL, -- chỉ dùng khi Role = 'assistant': trợ giảng này thuộc giáo viên nào
    CONSTRAINT UQ_Users_Username UNIQUE (Username),
    CONSTRAINT FK_Users_AssignedTeacher FOREIGN KEY (AssignedTeacherId) REFERENCES dbo.Users(Id)
);
GO

-- Bổ sung khóa ngoại Students/Sessions -> Users sau khi bảng Users tồn tại
ALTER TABLE dbo.Students ADD CONSTRAINT FK_Students_Teacher FOREIGN KEY (TeacherId) REFERENCES dbo.Users(Id);
GO
ALTER TABLE dbo.Sessions ADD CONSTRAINT FK_Sessions_Teacher FOREIGN KEY (TeacherId) REFERENCES dbo.Users(Id);
GO

-- 7. CHÈN DỮ LIỆU MẪU ĐỂ CHẠY THỬ NGHIỆM

-- Tài khoản người dùng mẫu (PHẢI chèn trước Students/Sessions vì TeacherId
-- tham chiếu tới Users.Id thông qua khóa ngoại FK_Students_Teacher / FK_Sessions_Teacher)
-- LƯU Ý: Mật khẩu lưu dạng văn bản thuần (plain text) vì đây là đồ án sinh viên
-- quy mô nhỏ, ưu tiên đơn giản dễ hiểu hơn bảo mật doanh nghiệp.
-- Vai trò (Role) hợp lệ: 'admin' (chỉ quản lý tài khoản), 'teacher' (toàn quyền
-- dạy học), 'assistant' (trợ giảng, hỗ trợ dạy học).
INSERT INTO dbo.Users (Id, Username, Password, Name, Role, Active, AssignedTeacherId) VALUES
('u_admin', N'admin', N'admin123', N'Quản trị viên', N'admin', 1, NULL),
('u_teacher', N'teacher', N'teacher123', N'Cô giáo chính', N'teacher', 1, NULL),
('u_ta1', N'tro_giang', N'ta123', N'Trợ giảng A', N'assistant', 1, 'u_teacher');
GO

-- Học sinh mẫu (tất cả thuộc giáo viên u_teacher)
INSERT INTO dbo.Students (Id, Name, Class, Subject, BasePrice, TeacherId) VALUES
('hs_1', N'Quỳnh Anh', N'Lớp 8', N'Toán', 250000, 'u_teacher'),
('hs_2', N'Minh Anh', N'Lớp 7', N'Toán', 250000, 'u_teacher'),
('hs_3', N'Trà My', N'Lớp 9', N'Toán', 200000, 'u_teacher');
GO

-- Lịch sử buổi học mẫu
INSERT INTO dbo.Sessions (Id, SessionDate, StartTime, EndTime, SessionType, Price, Duration, Content, GeneralComment, Completed, TeacherId) VALUES
-- Buổi 1 (Quỳnh Anh)
('sess_1', '2026-05-23', '18:00', '20:00', N'riêng', 250000, 2.0, 
 N'ÔN TẬP ĐA THỨC MỘT BIẾN
+ Cộng trừ đa thức
+ Nhân chia đa thức
BTVN: Phiếu 7.3, 7.4, 7.5', 
 N'ĐẠI SỐ (nền tảng - 20%):
+ Không nắm chắc lý thuyết, không biết nhân chia cộng trừ luỹ thừa, bị nhầm phép cộng - nhân, trừ - chia.
+ Không tính toán được số nguyên âm.
+ Tư duy chậm, phản xạ chậm.', 1, 'u_teacher'),

-- Buổi 2 (Quỳnh Anh)
('sess_2', '2026-06-14', '08:40', '10:10', N'riêng', 250000, 1.5, 
 N'CHIA ĐA THỨC MỘT BIẾN
BTVN: Phiếu 7.5', 
 N'Làm bài tập đối phó, vẫn chưa nắm được phép chia đa thức, không ôn lại bài, chép đáp án.', 1, 'u_teacher'),

-- Buổi 3 (Quỳnh Anh)
('sess_3', '2026-06-17', '17:00', '19:30', N'riêng', 250000, 2.5, 
 N'GÓC KỀ BÙ, ĐỐI ĐỈNH, TIA PHÂN GIÁC
+ Góc kề bù, bù nhau
+ Góc đối đỉnh
+ Tia phân giác, tia nằm giữa hai tia
+ Phân loại góc nhọn, tù, bẹt, vuông
BTVN: Phiếu 4', 
 N'MẤT GỐC HÌNH
- Không xác định được góc, coi như dạy lại từ đầu
- Không phân biệt được góc, đường, tia,... các khái niệm hình học cơ bản
- Trình bày chưa logic, không biết vẽ hình', 1, 'u_teacher'),

-- Buổi 4 (Quỳnh Anh)
('sess_4', '2026-06-18', '17:10', '19:30', N'riêng', 250000, 2.3, 
 N'CHỮA BÀI TẬP PHIẾU 4
PHÉP CHIA ĐA THỨC
BTVN:
+ Chép phạt góc kề bù, tia phân giác
+ Phiếu 4
+ Phiếu 7.5', 
 N'Làm 2/3 bài tập.
+ Bước đầu xác định được vị trí các góc, biết tính toán số đo cơ bản.
+ Chưa nhớ lý thuyết (chép phạt).
+ Chưa có năng lực giao tiếp toán học, chưa trình bày được logic bài toán.
+ Có tiến bộ hơn trong đại số, nắm được cơ bản cách tính số âm nhưng chưa thuần thục.', 1, 'u_teacher'),

-- Buổi 5 (Quỳnh Anh)
('sess_5', '2026-06-24', '17:15', '19:20', N'riêng', 250000, 2.1, 
 N'HAI ĐƯỜNG THẲNG SONG SONG, TIÊN ĐỀ EUCLID
- Hai đường thẳng song song
- Phương pháp chứng minh hai đường thẳng //
+ Dấu hiệu nhận biết
+ Mối quan hệ vuông góc và //
BTVN: Phiếu 5', 
 N'- Xác định tốt được các góc so le trong, đồng vị.
- Vận dụng được mối quan hệ các góc đối đỉnh, kề bù.', 1, 'u_teacher'),

-- Buổi 6 (Chung Quỳnh Anh & Minh Anh)
('sess_6', '2026-06-25', '16:00', '18:30', N'chung', 250000, 2.5, 
 N'ĐƠN THỨC, ĐA THỨC MỘT BIẾN
- Đơn thức, đa thức đơn thức
- Đa thức, thu gọn đa thức
- Tính giá trị của đơn thức, đa thức tại x, y cho trước
BTVN: Phiếu 8.1', 
 N'ĐÁNH GIÁ CHUNG NHÓM:
- Học sinh đã tiếp thu tốt khái niệm đa thức đơn biến và cách thu gọn.
- Cần lưu ý luyện tập kỹ thuật đổi dấu và nhân chia số nguyên.', 1, 'u_teacher'),

-- Buổi 7 (Quỳnh Anh - Chưa hoàn thành buổi học)
('sess_7', '2026-06-28', '17:00', '19:00', N'riêng', 250000, 2.0, 
 N'CÁC YẾU TỐ TRONG TAM GIÁC
+ Tổng ba góc trong tam giác
+ Góc ngoài tam giác
+ Đường vuông góc và đường xiên
+ Bất đẳng thức tam giác
ÔN TẬP SONG SONG
BTVN: Phiếu 6', 
 N'- Cơ bản xác định được các góc nhưng chưa thuần thục, còn nhầm góc kề bù, đối đỉnh, so le trong, đồng vị.
- Kĩ năng vẽ hình kém.', 0, 'u_teacher'),

-- Các ca Minh Anh tuần 1 & 2 (Hình 4)
('sess_8', '2026-06-06', '16:00', '20:00', N'riêng', 250000, 4.0, N'Dạy kèm nâng cao hình học cho Minh Anh', N'Học rất tập trung, tiến bộ vượt bậc.', 1, 'u_teacher'),
('sess_9', '2026-06-07', '16:00', '20:00', N'riêng', 250000, 4.0, N'Luyện đề thi học sinh giỏi Minh Anh', N'Chăm chỉ giải bài.', 1, 'u_teacher'),
('sess_10', '2026-06-13', '16:00', '19:00', N'riêng', 250000, 3.0, N'Chữa đề khảo sát Minh Anh', N'Làm bài tốt.', 1, 'u_teacher'),

-- Ca Trà My
('sess_11', '2026-06-17', '16:00', '18:00', N'riêng', 200000, 2.0, N'Hình học 9 - Đường tròn hệ thức lượng', N'Nắm vững lý thuyết.', 1, 'u_teacher');
GO

-- Chi tiết buổi học mẫu của từng học sinh
INSERT INTO dbo.SessionDetails (SessionId, StudentId, Homework, Attitude, IndividualComment, Note) VALUES
('sess_1', 'hs_1', N'Chưa làm', N'Chưa tập trung, chưa hợp tác', N'', N'Toán 7'),
('sess_2', 'hs_1', N'Chưa hoàn thành', N'Chưa có ý thức làm bài tập về nhà', N'', N'Toán 7'),
('sess_3', 'hs_1', N'Chưa làm', N'Tập trung', N'', N'Toán 7'),
('sess_4', 'hs_1', N'Hoàn thành', N'Tập trung hơn, hợp tác hơn', N'', N'Toán 7'),
('sess_5', 'hs_1', N'Hoàn thành', N'Tốt', N'', N'Toán 7'),

-- Buổi học chung sess_6 có nhận xét riêng và nhận xét chung tự động đồng bộ
('sess_6', 'hs_1', N'Chưa làm', N'Tốt', N'Quỳnh Anh:
- Cơ bản nắm được 70% nền kiến thức.
- Còn nhầm lẫn cộng trừ dấu âm.
- Nhầm lẫn thu gọn đơn thức và thu gọn đa thức.', N'Toán 8'),
('sess_6', 'hs_2', N'Hoàn thành', N'Tập trung, hăng hái phát biểu', N'Minh Anh:
- Làm bài tập đầy đủ, nắm vững phương pháp cộng trừ đa thức nhanh nhạy.', N'Toán 7'),

('sess_7', 'hs_1', N'Chưa hoàn thành', N'Tốt', N'', N'Toán 7'),

('sess_8', 'hs_2', N'Hoàn thành', N'Tốt', N'', N'Minh Anh NTT'),
('sess_9', 'hs_2', N'Hoàn thành', N'Tốt', N'', N'Minh Anh NTT'),
('sess_10', 'hs_2', N'Hoàn thành', N'Tốt', N'', N'Minh Anh NTT'),
('sess_11', 'hs_3', N'Hoàn thành', N'Tập trung', N'', N'Trà My 9');
GO

PRINT '=== KHOI TAO DATABASE PINKYCLASSDB THANH CONG! ===';
GO
