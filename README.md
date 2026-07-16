# nttclass
# Gửi email xác minh và khôi phục mật khẩu

Ứng dụng gửi OTP qua Resend. Khi chạy production, cấu hình các biến môi trường sau trên Render:

```env
NODE_ENV=production
RESEND_API_KEY=re_xxxxxxxxx
EMAIL_FROM=NttClass <no-reply@ten-mien-da-xac-minh.com>
```

`EMAIL_FROM` phải thuộc domain đã xác minh trong Resend. Chỉ khi chạy local với `ALLOW_DEV_OTP=true` và không phải production, OTP mới được trả về giao diện để kiểm thử; production tuyệt đối không trả OTP trong API.
