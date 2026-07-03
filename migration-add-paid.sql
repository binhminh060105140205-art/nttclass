-- migration-add-paid.sql
-- Migration KHÔNG PHÁ HỦY dữ liệu: chỉ thêm cột Paid vào bảng Sessions.
-- Dùng file này thay vì chạy lại schema-postgres.sql (file đó sẽ XÓA SẠCH
-- toàn bộ dữ liệu hiện có vì có DROP TABLE ... CASCADE).
--
-- Lý do cần cột này: trước đây cột Completed bị dùng lẫn lộn cho 2 mục đích
-- khác nhau -- vừa là "đã dạy/chưa dạy" (chấm công), vừa là "đã thanh toán
-- học phí/chưa" -- dẫn tới lỗi: buổi học vừa lên lịch xong đã tự động bị coi
-- là "đã đóng học phí". Cột Paid mới tách hẳn 2 khái niệm này ra:
--   Completed = trạng thái ĐÃ DẠY hay chưa (chấm công)
--   Paid      = trạng thái ĐÃ THU TIỀN học phí hay chưa (mặc định 0 = chưa thu)
--
-- CÁCH CHẠY: node run-migration.js

ALTER TABLE Sessions ADD COLUMN IF NOT EXISTS Paid SMALLINT NOT NULL DEFAULT 0;

SELECT '=== ĐÃ THÊM CỘT Paid VÀO BẢNG Sessions THÀNH CÔNG (dữ liệu cũ được giữ nguyên) ===' AS status;
