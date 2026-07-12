// ================================================================
// SECURITY-SETTINGS.JS — Quản lý cài đặt bảo mật và khôi phục mật khẩu
// ================================================================
Object.assign(PinkyClassApp.prototype, {
    // --- CÀI ĐẶT BẢO MẬT TÀI KHOẢN (KHI ĐÃ ĐĂNG NHẬP) ---
    
    async openSettingsModal() {
        if (!this.currentUser) {
            this.showToast('Vui lòng đăng nhập để sử dụng tính năng này.', 'error');
            return;
        }

        // Reset các trường nhập mật khẩu
        document.getElementById('settingsNewPassword').value = '';
        document.getElementById('settingsConfirmPassword').value = '';
        
        // Ẩn các khu vực nhập OTP nếu đang mở từ trước
        document.getElementById('emailOtpSection').style.display = 'none';
        document.getElementById('phoneOtpSection').style.display = 'none';
        document.getElementById('emailOtpInput').value = '';
        document.getElementById('phoneOtpInput').value = '';

        // Tải thông tin bảo mật hiện tại từ Server
        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/account/security`);
            if (!res.ok) throw new Error('Không thể tải thông tin bảo mật.');
            const data = await res.json();

            // Điền thông tin vào form
            document.getElementById('settingsEmail').value = data.email || '';
            document.getElementById('settingsPhone').value = data.phone || '';

            // Cập nhật trạng thái xác minh Email
            const emailStatusEl = document.getElementById('settingsEmailStatus');
            const btnVerifyEmail = document.getElementById('btnVerifyEmail');
            if (data.email) {
                if (data.emailVerified) {
                    emailStatusEl.innerHTML = '<span class="verification-badge verified">✓ Đã xác minh</span>';
                    btnVerifyEmail.style.display = 'none';
                } else {
                    emailStatusEl.innerHTML = '<span class="verification-badge unverified">✗ Chưa xác minh</span>';
                    btnVerifyEmail.style.display = 'inline-flex';
                }
            } else {
                emailStatusEl.innerHTML = '<span style="color: var(--text-muted); font-size: 12px;">Chưa cung cấp</span>';
                btnVerifyEmail.style.display = 'none';
            }

            // Cập nhật trạng thái xác minh SĐT
            const phoneStatusEl = document.getElementById('settingsPhoneStatus');
            const btnVerifyPhone = document.getElementById('btnVerifyPhone');
            if (data.phone) {
                if (data.phoneVerified) {
                    phoneStatusEl.innerHTML = '<span class="verification-badge verified">✓ Đã xác minh</span>';
                    btnVerifyPhone.style.display = 'none';
                } else {
                    phoneStatusEl.innerHTML = '<span class="verification-badge unverified">✗ Chưa xác minh</span>';
                    btnVerifyPhone.style.display = 'inline-flex';
                }
            } else {
                phoneStatusEl.innerHTML = '<span style="color: var(--text-muted); font-size: 12px;">Chưa cung cấp</span>';
                btnVerifyPhone.style.display = 'none';
            }

            this.openModal('accountSettingsModal');
        } catch (err) {
            this.showToast(err.message || 'Lỗi khi kết nối máy chủ.', 'error');
        }
    },

    async saveContactInfo() {
        const email = document.getElementById('settingsEmail').value.trim();
        const phone = document.getElementById('settingsPhone').value.trim();

        // Validate cơ bản
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            this.showToast('Email không đúng định dạng.', 'error');
            return;
        }
        if (phone && !/^[0-9+()\-\s]{8,20}$/.test(phone)) {
            this.showToast('Số điện thoại không hợp lệ.', 'error');
            return;
        }

        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/account/security/contact`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, phone })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Lưu thông tin liên hệ thất bại.');
            }

            this.showToast('Đã lưu thông tin liên hệ thành công. Trạng thái xác minh đã được reset.', 'success');
            await this.openSettingsModal(); // Load lại giao diện cài đặt bảo mật
        } catch (err) {
            this.showToast(err.message || 'Lỗi khi lưu thông tin.', 'error');
        }
    },

    async requestVerificationCode(channel) {
        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/account/security/request-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Yêu cầu gửi mã xác minh thất bại.');
            }

            const data = await res.json();
            this.showToast(data.message || 'Đã gửi mã xác minh.', 'success');

            // Hiển thị phần nhập mã OTP
            if (channel === 'email') {
                document.getElementById('emailOtpSection').style.display = 'block';
                if (data.devCode) {
                    document.getElementById('emailOtpInput').value = data.devCode;
                    this.showToast(`[Môi trường Dev] OTP của bạn là: ${data.devCode}`, 'info');
                }
            } else {
                document.getElementById('phoneOtpSection').style.display = 'block';
                if (data.devCode) {
                    document.getElementById('phoneOtpInput').value = data.devCode;
                    this.showToast(`[Môi trường Dev] OTP của bạn là: ${data.devCode}`, 'info');
                }
            }
        } catch (err) {
            this.showToast(err.message || 'Lỗi khi yêu cầu gửi mã.', 'error');
        }
    },

    async confirmVerificationCode(channel) {
        const otpInputId = channel === 'email' ? 'emailOtpInput' : 'phoneOtpInput';
        const code = document.getElementById(otpInputId).value.trim();

        if (!code) {
            this.showToast('Vui lòng nhập mã xác minh.', 'error');
            return;
        }

        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/account/security/confirm-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channel, code })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Xác minh mã OTP thất bại.');
            }

            this.showToast('Xác minh thành công!', 'success');
            await this.openSettingsModal(); // Tải lại giao diện bảo mật
        } catch (err) {
            this.showToast(err.message || 'Mã xác minh không chính xác.', 'error');
        }
    },

    async changePassword() {
        const newPassword = document.getElementById('settingsNewPassword').value;
        const confirmPassword = document.getElementById('settingsConfirmPassword').value;

        if (!newPassword) {
            this.showToast('Vui lòng nhập mật khẩu mới.', 'error');
            return;
        }
        if (newPassword.length < 4) {
            this.showToast('Mật khẩu cần tối thiểu 4 ký tự.', 'error');
            return;
        }
        if (newPassword !== confirmPassword) {
            this.showToast('Mật khẩu nhập lại không khớp.', 'error');
            return;
        }

        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/account/security/password`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: newPassword })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Thay đổi mật khẩu thất bại.');
            }

            this.showToast('Thay đổi mật khẩu thành công!', 'success');
            document.getElementById('settingsNewPassword').value = '';
            document.getElementById('settingsConfirmPassword').value = '';
            this.closeModal('accountSettingsModal');
        } catch (err) {
            this.showToast(err.message || 'Lỗi khi cập nhật mật khẩu.', 'error');
        }
    },

    // --- LUỒNG QUÊN MẬT KHẨU (KHI CHƯA ĐĂNG NHẬP) ---

    openForgotPasswordModal() {
        // Reset form khôi phục mật khẩu
        document.getElementById('forgotUsername').value = '';
        document.getElementById('forgotOtp').value = '';
        document.getElementById('forgotNewPassword').value = '';
        document.getElementById('forgotConfirmPassword').value = '';

        // Hiển thị Bước 1, ẩn Bước 2 & 3
        document.getElementById('forgotStep1').style.display = 'block';
        document.getElementById('forgotStep2').style.display = 'none';
        document.getElementById('forgotStep3').style.display = 'none';

        this.openModal('forgotPasswordModal');
    },

    async handleForgotRequest() {
        const username = document.getElementById('forgotUsername').value.trim();
        if (!username) {
            this.showToast('Vui lòng nhập tên đăng nhập.', 'error');
            return;
        }

        const requestBtn = document.getElementById('btnForgotRequest');
        requestBtn.disabled = true;
        requestBtn.innerText = 'Đang kiểm tra...';

        try {
            const res = await fetch(`${API_BASE_URL}/api/forgot-password/request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Xác minh tên đăng nhập thất bại.');
            }

            const data = await res.json();
            
            // Lưu username tạm thời
            this._forgotUsername = username;
            
            // Xây dựng danh sách các kênh khôi phục
            const container = document.getElementById('forgotChannelsContainer');
            container.innerHTML = '';

            let hasChannel = false;

            if (data.emailVerified && data.email) {
                hasChannel = true;
                const div = document.createElement('div');
                div.className = 'channel-option-card';
                div.innerHTML = `
                    <div class="channel-info">
                        <strong>Gửi qua Email</strong>
                        <span>Địa chỉ: ${data.email}</span>
                    </div>
                    <button type="button" class="btn btn-primary btn-sm" onclick="app.handleForgotSendCode('email')">Chọn</button>
                `;
                container.appendChild(div);
            }

            if (data.phoneVerified && data.phone) {
                hasChannel = true;
                const div = document.createElement('div');
                div.className = 'channel-option-card';
                div.innerHTML = `
                    <div class="channel-info">
                        <strong>Gửi qua Số điện thoại</strong>
                        <span>Số: ${data.phone}</span>
                    </div>
                    <button type="button" class="btn btn-primary btn-sm" onclick="app.handleForgotSendCode('phone')">Chọn</button>
                `;
                container.appendChild(div);
            }

            if (!hasChannel) {
                // Đề phòng trường hợp lỗi nghiệp vụ (nhưng ở API đã bắt lỗi này rồi)
                throw new Error('Tài khoản của bạn chưa cấu hình/xác minh email hoặc số điện thoại khôi phục.');
            }

            // Chuyển sang Bước 2
            document.getElementById('forgotStep1').style.display = 'none';
            document.getElementById('forgotStep2').style.display = 'block';
        } catch (err) {
            this.showToast(err.message || 'Lỗi khi xác minh tài khoản.', 'error');
        } finally {
            requestBtn.disabled = false;
            requestBtn.innerText = 'Tiếp tục';
        }
    },

    async handleForgotSendCode(channel) {
        const username = this._forgotUsername;
        if (!username) return;

        try {
            const res = await fetch(`${API_BASE_URL}/api/forgot-password/send-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, channel })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Yêu cầu gửi mã OTP thất bại.');
            }

            const data = await res.json();
            this.showToast(data.message || 'Mã OTP đã được gửi thành công.', 'success');
            
            // Lưu thông tin kênh khôi phục
            this._forgotChannel = channel;

            // Điền sẵn devCode để test nếu có
            if (data.devCode) {
                document.getElementById('forgotOtp').value = data.devCode;
                this.showToast(`[Môi trường Dev] OTP của bạn là: ${data.devCode}`, 'info');
            }

            // Chuyển sang Bước 3
            document.getElementById('forgotStep2').style.display = 'none';
            document.getElementById('forgotStep3').style.display = 'block';
        } catch (err) {
            this.showToast(err.message || 'Lỗi khi gửi OTP.', 'error');
        }
    },

    async handleForgotReset() {
        const username = this._forgotUsername;
        const code = document.getElementById('forgotOtp').value.trim();
        const newPassword = document.getElementById('forgotNewPassword').value;
        const confirmPassword = document.getElementById('forgotConfirmPassword').value;

        if (!code) {
            this.showToast('Vui lòng nhập mã OTP.', 'error');
            return;
        }
        if (!newPassword) {
            this.showToast('Vui lòng nhập mật khẩu mới.', 'error');
            return;
        }
        if (newPassword.length < 4) {
            this.showToast('Mật khẩu cần tối thiểu 4 ký tự.', 'error');
            return;
        }
        if (newPassword !== confirmPassword) {
            this.showToast('Mật khẩu nhập lại không khớp.', 'error');
            return;
        }

        const resetBtn = document.getElementById('btnForgotReset');
        resetBtn.disabled = true;
        resetBtn.innerText = 'Đang đặt lại mật khẩu...';

        try {
            const res = await fetch(`${API_BASE_URL}/api/forgot-password/reset`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, code, newPassword })
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Đặt lại mật khẩu thất bại.');
            }

            this.showToast('Đặt lại mật khẩu thành công! Hãy dùng mật khẩu mới để đăng nhập.', 'success');
            this.closeModal('forgotPasswordModal');
            
            // Xóa thông tin tạm
            delete this._forgotUsername;
            delete this._forgotChannel;
        } catch (err) {
            this.showToast(err.message || 'Lỗi khi đặt lại mật khẩu.', 'error');
        } finally {
            resetBtn.disabled = false;
            resetBtn.innerText = 'Đặt lại mật khẩu';
        }
    }
});
