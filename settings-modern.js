Object.assign(PinkyClassApp.prototype, {
    buildModernSettingsLayout() {
        const body = document.getElementById('accountSettingsBody');
        if (!body || body.dataset.modernized === 'true') return;

        const themeModeSection = document.getElementById('settingsThemeModeSection');
        const personalThemeSection = document.getElementById('accountAppThemeSection');
        const adminThemeSection = document.getElementById('adminAppThemeSection');
        const invoiceSection = document.getElementById('invoiceSetupSection');
        const contactSection = document.getElementById('settingsContactSection');
        const passwordSection = document.getElementById('settingsPasswordSection');
        const logoutSection = document.getElementById('settingsLogoutSection');

        const shell = document.createElement('div');
        shell.className = 'settings-layout';
        shell.innerHTML = `
            <aside class="settings-nav" aria-label="Danh mục cài đặt">
                <div class="settings-nav-profile">
                    <div class="settings-nav-avatar" id="settingsNavAvatar">?</div>
                    <div><strong id="settingsNavName">Tài khoản</strong><span id="settingsNavRole">NttClass</span></div>
                </div>
                <button type="button" class="settings-nav-item active" data-settings-tab="account" onclick="app.switchSettingsTab('account')"><span>◉</span>Tài khoản</button>
                <button type="button" class="settings-nav-item" data-settings-tab="security" onclick="app.switchSettingsTab('security')"><span>◆</span>Bảo mật</button>
                <button type="button" class="settings-nav-item" data-settings-tab="devices" onclick="app.switchSettingsTab('devices')"><span>▣</span>Thiết bị</button>
                <button type="button" class="settings-nav-item" data-settings-tab="appearance" onclick="app.switchSettingsTab('appearance')"><span>✦</span>Giao diện</button>
                <button type="button" class="settings-nav-item" id="settingsInvoiceTabButton" data-settings-tab="invoice" onclick="app.switchSettingsTab('invoice')"><span>▤</span>Phiếu học phí</button>
            </aside>
            <div class="settings-content">
                <section class="settings-panel active" data-settings-panel="account">
                    <div class="settings-panel-heading"><div><span>TÀI KHOẢN</span><h4>Thông tin cá nhân</h4><p>Ảnh đại diện, tên hiển thị và thông tin liên hệ của tài khoản.</p></div></div>
                    <div class="settings-card settings-profile-card" id="settingsProfileCard">
                        <div class="settings-avatar-editor">
                            <div class="settings-avatar-preview" id="settingsAvatarPreview"><span id="settingsAvatarInitial">?</span><img id="settingsAvatarImage" alt="Ảnh đại diện" hidden></div>
                            <div class="settings-avatar-actions"><label class="btn btn-secondary btn-sm" for="settingsAvatarInput">Chọn ảnh</label><input type="file" id="settingsAvatarInput" accept="image/png,image/jpeg,image/webp" hidden><button type="button" class="btn btn-secondary btn-sm" onclick="app.removeSettingsAvatar()">Bỏ ảnh</button><small>PNG, JPG hoặc WebP. Hệ thống tự thu nhỏ ảnh.</small></div>
                        </div>
                        <div class="settings-profile-fields"><label for="settingsDisplayName">Họ tên hiển thị</label><input type="text" id="settingsDisplayName" class="form-control" maxlength="160" autocomplete="name"><small>Tên này chỉ dùng để hiển thị, không sửa dữ liệu hồ sơ học sinh.</small><button type="button" class="btn btn-primary btn-sm" id="btnSaveAccountProfile" onclick="app.saveAccountProfile()">Lưu hồ sơ</button></div>
                    </div>
                    <div class="settings-card settings-data-card" id="settingsDataCard">
                        <div class="settings-card-heading"><div><h4>Dữ liệu và tài khoản</h4><p>Tải dữ liệu cá nhân hoặc gửi yêu cầu xóa tài khoản.</p></div></div>
                        <div class="settings-action-row"><div><strong>Tải dữ liệu cá nhân</strong><span>Tệp JSON không chứa mật khẩu, khóa OTP hoặc cookie đăng nhập.</span></div><button type="button" class="btn btn-secondary btn-sm" onclick="app.downloadPersonalData()">Tải dữ liệu</button></div>
                        <div class="settings-danger-zone"><div><strong>Yêu cầu xóa tài khoản</strong><span id="settingsDeletionStatus">Chưa có yêu cầu đang chờ xử lý.</span></div><div class="settings-danger-controls"><input type="password" id="settingsDeletionPassword" class="form-control" maxlength="200" autocomplete="current-password" placeholder="Nhập mật khẩu để xác nhận"><button type="button" class="btn btn-danger btn-sm" id="btnRequestAccountDeletion" onclick="app.requestAccountDeletion()">Gửi yêu cầu xóa</button><button type="button" class="btn btn-secondary btn-sm" id="btnCancelAccountDeletion" onclick="app.cancelAccountDeletion()" hidden>Hủy yêu cầu</button></div></div>
                    </div>
                </section>
                <section class="settings-panel" data-settings-panel="security">
                    <div class="settings-panel-heading"><div><span>BẢO MẬT</span><h4>Bảo vệ tài khoản</h4><p>Mật khẩu, OTP, cảnh báo đăng nhập và tự động đăng xuất.</p></div></div>
                    <div class="settings-card" id="settingsTwoFactorCard">
                        <div class="settings-card-heading"><div><h4>Xác thực 2 bước</h4><p>Dùng ứng dụng Google Authenticator, Microsoft Authenticator hoặc ứng dụng OTP tương thích.</p></div><span class="settings-status-badge" id="settingsTwoFactorStatus">Đang tải</span></div>
                        <div id="settingsTwoFactorDisabledActions" class="settings-inline-form"><input type="password" id="settingsTwoFactorSetupPassword" class="form-control" maxlength="200" autocomplete="current-password" placeholder="Mật khẩu hiện tại"><button type="button" class="btn btn-primary btn-sm" onclick="app.startTwoFactorSetup()">Thiết lập OTP</button></div>
                        <div id="settingsTwoFactorSetupPanel" class="settings-two-factor-setup" hidden><img id="settingsTwoFactorQr" alt="Mã QR thiết lập OTP"><div class="settings-two-factor-manual"><span>Không quét được? Nhập khóa thủ công:</span><code id="settingsTwoFactorSecret"></code><button type="button" class="btn btn-secondary btn-sm" onclick="app.copyTwoFactorSecret()">Sao chép khóa</button><div class="settings-inline-form"><input type="text" id="settingsTwoFactorConfirmCode" class="form-control" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="Mã OTP 6 số"><button type="button" class="btn btn-primary btn-sm" onclick="app.confirmTwoFactorSetup()">Xác nhận bật</button><button type="button" class="btn btn-secondary btn-sm" onclick="app.cancelTwoFactorSetup()">Hủy</button></div></div></div>
                        <div id="settingsTwoFactorEnabledActions" hidden><p class="settings-helper-text">Mã khôi phục còn lại: <strong id="settingsRecoveryRemaining">0</strong></p><div class="settings-two-factor-manage"><input type="password" id="settingsTwoFactorManagePassword" class="form-control" maxlength="200" autocomplete="current-password" placeholder="Mật khẩu hiện tại"><input type="text" id="settingsTwoFactorManageCode" class="form-control" maxlength="12" autocomplete="one-time-code" placeholder="Mã OTP hoặc mã khôi phục"><button type="button" class="btn btn-secondary btn-sm" onclick="app.regenerateRecoveryCodes()">Tạo lại mã khôi phục</button><button type="button" class="btn btn-danger btn-sm" onclick="app.disableTwoFactor()">Tắt OTP</button></div></div>
                        <div class="settings-recovery-panel" id="settingsRecoveryCodesPanel" hidden><strong>Lưu các mã này ở nơi an toàn</strong><p>Mỗi mã chỉ dùng được một lần. Danh sách chỉ hiện trong lần này.</p><div class="settings-recovery-grid" id="settingsRecoveryCodes"></div><div class="settings-recovery-actions"><button type="button" class="btn btn-secondary btn-sm" onclick="app.copyRecoveryCodes()">Sao chép</button><button type="button" class="btn btn-secondary btn-sm" onclick="app.downloadRecoveryCodes()">Tải tệp</button><button type="button" class="btn btn-primary btn-sm" onclick="app.hideRecoveryCodes()">Tôi đã lưu</button></div></div>
                    </div>
                    <div class="settings-card settings-preferences-card">
                        <div class="settings-card-heading"><div><h4>Cảnh báo và thời gian phiên</h4><p>Email cảnh báo chỉ gửi tới địa chỉ đã xác minh.</p></div></div>
                        <label class="settings-toggle-row"><span><strong>Cảnh báo email khi đăng nhập mới</strong><small>Gửi thông tin thiết bị, trình duyệt và IP tương đối.</small></span><input type="checkbox" id="settingsLoginAlertEnabled"><i></i></label>
                        <label class="settings-select-row" for="settingsIdleTimeout"><span><strong>Tự động đăng xuất khi không hoạt động</strong><small>Áp dụng cho tất cả thiết bị của tài khoản.</small></span><select id="settingsIdleTimeout" class="form-control"><option value="20160">2 tuần</option></select></label>
                        <button type="button" class="btn btn-primary btn-sm" onclick="app.saveSecurityPreferences()">Lưu cài đặt bảo mật</button>
                    </div>
                </section>
                <section class="settings-panel" data-settings-panel="devices">
                    <div class="settings-panel-heading"><div><span>THIẾT BỊ</span><h4>Phiên đang đăng nhập</h4><p>Kiểm tra và đăng xuất thiết bị lạ từ xa.</p></div><button type="button" class="btn btn-danger btn-sm" onclick="app.logoutAllDevices()">Đăng xuất tất cả</button></div>
                    <div id="settingsSessionsList" class="settings-session-list"><div class="settings-loading">Đang tải thiết bị...</div></div>
                </section>
                <section class="settings-panel" data-settings-panel="appearance"><div class="settings-panel-heading"><div><span>GIAO DIỆN</span><h4>Cá nhân hóa hiển thị</h4><p>Chỉ thay đổi màu sắc và chế độ sáng tối, không ảnh hưởng dữ liệu.</p></div></div></section>
                <section class="settings-panel" data-settings-panel="invoice"><div class="settings-panel-heading"><div><span>PHIẾU HỌC PHÍ</span><h4>Thông tin xuất phiếu</h4><p>Lưu tên giáo viên, ngân hàng và mã QR dùng lại cho các tháng sau.</p></div></div></section>
            </div>`;

        const accountPanel = shell.querySelector('[data-settings-panel="account"]');
        const securityPanel = shell.querySelector('[data-settings-panel="security"]');
        const appearancePanel = shell.querySelector('[data-settings-panel="appearance"]');
        const invoicePanel = shell.querySelector('[data-settings-panel="invoice"]');
        const dataCard = shell.querySelector('#settingsDataCard');
        if (contactSection) accountPanel.insertBefore(contactSection, dataCard);
        if (logoutSection) dataCard?.appendChild(logoutSection);
        if (passwordSection) securityPanel.appendChild(passwordSection);
        [themeModeSection, personalThemeSection, adminThemeSection].forEach(section => {
            if (section) appearancePanel.appendChild(section);
        });
        if (invoiceSection) invoicePanel.appendChild(invoiceSection);
        body.replaceChildren(shell);
        body.dataset.modernized = 'true';

        document.getElementById('settingsAvatarInput')?.addEventListener('change', event => {
            const file = event.target.files?.[0];
            if (file) void this.prepareSettingsAvatar(file);
            event.target.value = '';
        });
    },

    switchSettingsTab(tabName) {
        const available = ['account', 'security', 'devices', 'appearance', 'invoice'];
        const tab = available.includes(tabName) ? tabName : 'account';
        document.querySelectorAll('#accountSettingsModal [data-settings-tab]').forEach(button => {
            button.classList.toggle('active', button.dataset.settingsTab === tab);
        });
        document.querySelectorAll('#accountSettingsModal [data-settings-panel]').forEach(panel => {
            panel.classList.toggle('active', panel.dataset.settingsPanel === tab);
        });
        document.querySelector('.account-settings-body')?.scrollTo({ top: 0, behavior: 'auto' });
        if (tab === 'devices') void this.loadSecuritySessions();
        if (tab === 'invoice' && ['teacher', 'assistant'].includes(this.currentRole)) {
            void this.loadInvoiceSetup?.().catch(error => {
                this.showToast(error.message || 'Không thể tải Setup phiếu học phí.', 'error');
            });
        }
    }
});

Object.assign(PinkyClassApp.prototype, {
    async loadSecuritySessions() {
        const container = document.getElementById('settingsSessionsList');
        if (!container || !this.currentUser) return;
        container.innerHTML = '<div class="settings-loading">Đang tải thiết bị...</div>';
        try {
            const response = await this.authFetch(`${API_BASE_URL}/api/account/security/sessions`);
            const sessions = await this.requireApiSuccess(response, 'Không thể tải danh sách thiết bị.');
            if (!Array.isArray(sessions) || !sessions.length) {
                container.innerHTML = '<div class="settings-empty-state">Không có phiên đăng nhập nào.</div>';
                return;
            }
            container.innerHTML = sessions.map(session => `
                <article class="settings-session-item ${session.current ? 'is-current' : ''}">
                    <div class="settings-session-icon">${session.deviceType === 'Điện thoại' ? '▯' : session.deviceType === 'Máy tính bảng' ? '▭' : '▣'}</div>
                    <div class="settings-session-main"><div class="settings-session-title"><strong>${this.escapeHtml(session.deviceType)}</strong>${session.current ? '<span>Thiết bị này</span>' : ''}</div><p>${this.escapeHtml(session.browser)} · ${this.escapeHtml(session.platform)}</p><div class="settings-session-meta"><span>IP: ${this.escapeHtml(session.ipPrefix)}</span><span>Đăng nhập: ${this.formatSettingsDateTime(session.createdAt)}</span><span>Hoạt động cuối: ${this.formatSettingsDateTime(session.lastSeenAt)}</span></div></div>
                    <button type="button" class="btn ${session.current ? 'btn-danger' : 'btn-secondary'} btn-sm" data-security-session-id="${this.escapeHtmlAttr(session.id)}" data-security-session-current="${session.current ? '1' : '0'}">${session.current ? 'Đăng xuất thiết bị này' : 'Đăng xuất'}</button>
                </article>`).join('');
            container.querySelectorAll('[data-security-session-id]').forEach(button => {
                button.addEventListener('click', () => this.logoutSecuritySession(
                    button.dataset.securitySessionId,
                    button.dataset.securitySessionCurrent === '1'
                ));
            });
        } catch (error) {
            container.innerHTML = `<div class="settings-empty-state is-error">${this.escapeHtml(error.message)}</div>`;
        }
    },

    async logoutSecuritySession(sessionId, isCurrent) {
        if (!window.confirm(isCurrent ? 'Đăng xuất thiết bị hiện tại?' : 'Đăng xuất thiết bị này từ xa?')) return;
        try {
            const response = await this.authFetch(`${API_BASE_URL}/api/account/security/sessions/${encodeURIComponent(sessionId)}`, {
                method: 'DELETE'
            });
            const result = await this.requireApiSuccess(response, 'Không thể đăng xuất thiết bị.');
            if (result.current) {
                this.finishSecurityLogout('Đã đăng xuất thiết bị hiện tại.');
                return;
            }
            this.showToast(result.message, 'success');
            void this.loadSecuritySessions();
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    async logoutAllDevices() {
        if (!window.confirm('Đăng xuất tài khoản khỏi tất cả thiết bị, bao gồm thiết bị hiện tại?')) return;
        try {
            const response = await this.authFetch(`${API_BASE_URL}/api/account/security/sessions`, { method: 'DELETE' });
            const result = await this.requireApiSuccess(response, 'Không thể đăng xuất khỏi tất cả thiết bị.');
            this.finishSecurityLogout(result.message);
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    finishSecurityLogout(message) {
        this.closeModal('accountSettingsModal');
        this.stopIdleLogoutMonitor();
        localStorage.removeItem('pinky_current_user');
        localStorage.removeItem('pinky_students');
        localStorage.removeItem('pinky_sessions');
        localStorage.removeItem('nttclass_remembered_username');
        localStorage.removeItem('nttclass_invoice_qr');
        this.clearSensitiveClientState();
        this.clearRequestImage();
        this.showLandingPage();
        this.showToast(message || 'Bạn đã đăng xuất.', 'success');
    },

    startIdleLogoutMonitor(timeoutMinutes) {
        const minutes = Number(timeoutMinutes) || (14 * 24 * 60);
        this._idleTimeoutMs = minutes * 60 * 1000;
        this._idleLastActivityAt = Date.now();
        if (!this._idleActivityHandler) {
            this._idleActivityHandler = () => { this._idleLastActivityAt = Date.now(); };
            ['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach(eventName => {
                document.addEventListener(eventName, this._idleActivityHandler, { passive: true });
            });
        }
        clearInterval(this._idleLogoutTimer);
        this._idleLogoutTimer = setInterval(() => {
            if (!this.currentUser || !this._idleTimeoutMs) return;
            if (Date.now() - this._idleLastActivityAt >= this._idleTimeoutMs) {
                clearInterval(this._idleLogoutTimer);
                this._idleLogoutTimer = null;
                void this.handleLogout('Phiên đã tự động đăng xuất do không hoạt động.');
            }
        }, 30000);
    },

    stopIdleLogoutMonitor() {
        clearInterval(this._idleLogoutTimer);
        this._idleLogoutTimer = null;
        this._idleTimeoutMs = 0;
    }
});

Object.assign(PinkyClassApp.prototype, {
    formatSettingsDateTime(value) {
        if (!value) return '-';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '-';
        return new Intl.DateTimeFormat('vi-VN', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }).format(date);
    },

    updateSidebarAccountAvatar(user = this.currentUser) {
        const avatar = document.getElementById('sidebarUserAvatar');
        if (!avatar) return;
        const dataUrl = user?.avatarDataUrl || '';
        avatar.textContent = dataUrl ? '' : String(user?.name || '?').trim().charAt(0).toUpperCase();
        avatar.style.backgroundImage = dataUrl ? `url("${dataUrl}")` : '';
        avatar.classList.toggle('has-image', !!dataUrl);
    },

    async saveSecurityPreferences() {
        const loginAlertEnabled = !!document.getElementById('settingsLoginAlertEnabled')?.checked;
        const idleTimeoutMinutes = Number(document.getElementById('settingsIdleTimeout')?.value || (14 * 24 * 60));
        try {
            const response = await this.authFetch(`${API_BASE_URL}/api/account/security/preferences`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ loginAlertEnabled, idleTimeoutMinutes })
            });
            const result = await this.requireApiSuccess(response, 'Không thể lưu cài đặt bảo mật.');
            if (this.currentUser) this.currentUser.idleTimeoutMinutes = result.idleTimeoutMinutes;
            this.startIdleLogoutMonitor(result.idleTimeoutMinutes);
            this.showToast(result.message, 'success');
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    async startTwoFactorSetup() {
        const currentPassword = document.getElementById('settingsTwoFactorSetupPassword')?.value || '';
        if (!currentPassword) return this.showToast('Nhập mật khẩu hiện tại để thiết lập OTP.', 'error');
        try {
            const response = await this.authFetch(`${API_BASE_URL}/api/account/security/2fa/setup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword })
            });
            const result = await this.requireApiSuccess(response, 'Không thể tạo mã QR OTP.');
            document.getElementById('settingsTwoFactorSetupPassword').value = '';
            this._pendingTwoFactorSecret = result.secret;
            document.getElementById('settingsTwoFactorQr').src = result.qrDataUrl;
            document.getElementById('settingsTwoFactorSecret').textContent = result.secret;
            document.getElementById('settingsTwoFactorDisabledActions').hidden = true;
            document.getElementById('settingsTwoFactorSetupPanel').hidden = false;
            document.getElementById('settingsTwoFactorConfirmCode').value = '';
            document.getElementById('settingsTwoFactorConfirmCode').focus();
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    async confirmTwoFactorSetup() {
        const code = document.getElementById('settingsTwoFactorConfirmCode')?.value.trim() || '';
        try {
            const response = await this.authFetch(`${API_BASE_URL}/api/account/security/2fa/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            });
            const result = await this.requireApiSuccess(response, 'Không thể bật xác thực 2 bước.');
            document.getElementById('settingsTwoFactorSetupPanel').hidden = true;
            document.getElementById('settingsTwoFactorEnabledActions').hidden = false;
            const status = document.getElementById('settingsTwoFactorStatus');
            status.textContent = 'Đã bật';
            status.classList.add('is-enabled');
            this.renderRecoveryCodes(result.recoveryCodes);
            this.showToast(result.message, 'success');
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    async cancelTwoFactorSetup() {
        try {
            await this.authFetch(`${API_BASE_URL}/api/account/security/2fa/setup`, { method: 'DELETE' });
        } catch (error) {
            console.warn('[2FA cancel]', error.message);
        }
        this._pendingTwoFactorSecret = null;
        document.getElementById('settingsTwoFactorSetupPanel').hidden = true;
        document.getElementById('settingsTwoFactorDisabledActions').hidden = false;
    },

    async disableTwoFactor() {
        const currentPassword = document.getElementById('settingsTwoFactorManagePassword')?.value || '';
        const code = document.getElementById('settingsTwoFactorManageCode')?.value.trim() || '';
        if (!currentPassword || !code) return this.showToast('Nhập mật khẩu và mã OTP để tắt xác thực 2 bước.', 'error');
        if (!window.confirm('Tắt xác thực 2 bước cho tài khoản này?')) return;
        try {
            const response = await this.authFetch(`${API_BASE_URL}/api/account/security/2fa/disable`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, code })
            });
            const result = await this.requireApiSuccess(response, 'Không thể tắt xác thực 2 bước.');
            document.getElementById('settingsTwoFactorEnabledActions').hidden = true;
            document.getElementById('settingsTwoFactorDisabledActions').hidden = false;
            const status = document.getElementById('settingsTwoFactorStatus');
            status.textContent = 'Chưa bật';
            status.classList.remove('is-enabled');
            this.hideRecoveryCodes();
            this.showToast(result.message, 'success');
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    async regenerateRecoveryCodes() {
        const currentPassword = document.getElementById('settingsTwoFactorManagePassword')?.value || '';
        const code = document.getElementById('settingsTwoFactorManageCode')?.value.trim() || '';
        if (!currentPassword || !code) return this.showToast('Nhập mật khẩu và mã OTP để tạo lại mã khôi phục.', 'error');
        try {
            const response = await this.authFetch(`${API_BASE_URL}/api/account/security/2fa/recovery-codes`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, code })
            });
            const result = await this.requireApiSuccess(response, 'Không thể tạo lại mã khôi phục.');
            this.renderRecoveryCodes(result.recoveryCodes);
            document.getElementById('settingsRecoveryRemaining').textContent = String(result.recoveryCodes?.length || 0);
            this.showToast(result.message, 'success');
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    copyTwoFactorSecret() {
        const secret = document.getElementById('settingsTwoFactorSecret')?.textContent || '';
        void this.copySettingsText(secret, 'Đã sao chép khóa OTP.');
    },

    renderRecoveryCodes(codes) {
        this._latestRecoveryCodes = Array.isArray(codes) ? codes.slice() : [];
        const panel = document.getElementById('settingsRecoveryCodesPanel');
        const grid = document.getElementById('settingsRecoveryCodes');
        if (grid) grid.innerHTML = this._latestRecoveryCodes.map(code => `<code>${this.escapeHtml(code)}</code>`).join('');
        if (panel) panel.hidden = this._latestRecoveryCodes.length === 0;
        const remaining = document.getElementById('settingsRecoveryRemaining');
        if (remaining) remaining.textContent = String(this._latestRecoveryCodes.length);
    },

    hideRecoveryCodes() {
        this._latestRecoveryCodes = [];
        const panel = document.getElementById('settingsRecoveryCodesPanel');
        if (panel) panel.hidden = true;
        const grid = document.getElementById('settingsRecoveryCodes');
        if (grid) grid.replaceChildren();
    },

    copyRecoveryCodes() {
        void this.copySettingsText((this._latestRecoveryCodes || []).join('\n'), 'Đã sao chép mã khôi phục.');
    },

    async copySettingsText(text, successMessage) {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            this.showToast(successMessage, 'success');
        } catch (error) {
            this.showToast('Không thể sao chép tự động trên trình duyệt này.', 'error');
        }
    },

    downloadRecoveryCodes() {
        const codes = this._latestRecoveryCodes || [];
        if (!codes.length) return;
        const content = `MÃ KHÔI PHỤC NTTCLASS\nMỗi mã chỉ dùng được một lần.\n\n${codes.join('\n')}\n`;
        const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'nttclass-ma-khoi-phuc.txt';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
});

Object.assign(PinkyClassApp.prototype, {
    applyModernSecurityData(data) {
        this._accountSecurityData = data || {};
        this._settingsAvatarDataUrl = data.avatarDataUrl || '';
        const displayName = data.displayName || data.accountName || this.currentUser?.name || '';
        const roleLabel = this.currentRole === 'admin' ? 'Quản trị viên'
            : this.currentRole === 'teacher' ? 'Giáo viên'
                : this.currentRole === 'assistant' ? 'Trợ giảng' : 'Học sinh';
        const nameInput = document.getElementById('settingsDisplayName');
        if (nameInput) nameInput.value = displayName;
        const navName = document.getElementById('settingsNavName');
        const navRole = document.getElementById('settingsNavRole');
        if (navName) navName.textContent = displayName || 'Tài khoản';
        if (navRole) navRole.textContent = roleLabel;
        this.setSettingsAvatarPreview(this._settingsAvatarDataUrl, displayName);

        const invoiceTab = document.getElementById('settingsInvoiceTabButton');
        if (invoiceTab) invoiceTab.hidden = !['teacher', 'assistant'].includes(this.currentRole);
        const enabled = !!data.twoFactorEnabled;
        const status = document.getElementById('settingsTwoFactorStatus');
        if (status) {
            status.textContent = enabled ? 'Đã bật' : 'Chưa bật';
            status.classList.toggle('is-enabled', enabled);
        }
        const disabledActions = document.getElementById('settingsTwoFactorDisabledActions');
        const enabledActions = document.getElementById('settingsTwoFactorEnabledActions');
        if (disabledActions) disabledActions.hidden = enabled;
        if (enabledActions) enabledActions.hidden = !enabled;
        const recoveryRemaining = document.getElementById('settingsRecoveryRemaining');
        if (recoveryRemaining) recoveryRemaining.textContent = String(data.recoveryCodesRemaining || 0);
        const loginAlert = document.getElementById('settingsLoginAlertEnabled');
        if (loginAlert) loginAlert.checked = data.loginAlertEnabled !== false;
        const idleTimeout = document.getElementById('settingsIdleTimeout');
        if (idleTimeout) idleTimeout.value = String(data.idleTimeoutMinutes || (14 * 24 * 60));
        this.renderDeletionStatus(data.deleteRequestedAt, data.deleteRequestStatus);
    },

    setSettingsAvatarPreview(dataUrl, displayName = '') {
        const image = document.getElementById('settingsAvatarImage');
        const initial = document.getElementById('settingsAvatarInitial');
        const navAvatar = document.getElementById('settingsNavAvatar');
        const letter = String(displayName || this.currentUser?.name || '?').trim().charAt(0).toUpperCase() || '?';
        if (image) {
            image.hidden = !dataUrl;
            image.src = dataUrl || '';
        }
        if (initial) {
            initial.hidden = !!dataUrl;
            initial.textContent = letter;
        }
        if (navAvatar) {
            navAvatar.textContent = dataUrl ? '' : letter;
            navAvatar.style.backgroundImage = dataUrl ? `url("${dataUrl}")` : '';
        }
    },

    async prepareSettingsAvatar(file) {
        if (!file.type.match(/^image\/(png|jpeg|webp)$/)) {
            this.showToast('Chỉ hỗ trợ ảnh PNG, JPG hoặc WebP.', 'error');
            return;
        }
        if (file.size > 8 * 1024 * 1024) {
            this.showToast('Ảnh gốc quá lớn. Vui lòng chọn ảnh dưới 8 MB.', 'error');
            return;
        }
        try {
            const sourceUrl = URL.createObjectURL(file);
            const image = new Image();
            await new Promise((resolve, reject) => {
                image.onload = resolve;
                image.onerror = reject;
                image.src = sourceUrl;
            });
            const side = Math.min(image.naturalWidth, image.naturalHeight);
            const sourceX = Math.max(0, (image.naturalWidth - side) / 2);
            const sourceY = Math.max(0, (image.naturalHeight - side) / 2);
            const canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 256;
            const context = canvas.getContext('2d');
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, 256, 256);
            context.drawImage(image, sourceX, sourceY, side, side, 0, 0, 256, 256);
            URL.revokeObjectURL(sourceUrl);
            this._settingsAvatarDataUrl = canvas.toDataURL('image/jpeg', 0.86);
            this.setSettingsAvatarPreview(this._settingsAvatarDataUrl, document.getElementById('settingsDisplayName')?.value);
        } catch (error) {
            this.showToast('Không thể đọc ảnh đại diện này.', 'error');
        }
    },

    removeSettingsAvatar() {
        this._settingsAvatarDataUrl = '';
        this.setSettingsAvatarPreview('', document.getElementById('settingsDisplayName')?.value);
    },

    async saveAccountProfile() {
        const displayName = document.getElementById('settingsDisplayName')?.value.trim() || '';
        const button = document.getElementById('btnSaveAccountProfile');
        if (displayName.length < 2) {
            this.showToast('Vui lòng nhập họ tên hiển thị.', 'error');
            return;
        }
        if (button) button.disabled = true;
        try {
            const response = await this.authFetch(`${API_BASE_URL}/api/account/profile`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ displayName, avatarDataUrl: this._settingsAvatarDataUrl || '' })
            });
            const result = await this.requireApiSuccess(response, 'Không thể lưu hồ sơ tài khoản.');
            if (result.user) {
                this.currentUser = { ...this.currentUser, ...result.user };
                document.getElementById('sidebarUserName').textContent = result.user.name;
                this.updateSidebarAccountAvatar?.(result.user);
            }
            document.getElementById('settingsNavName').textContent = displayName;
            this.showToast(result.message || 'Đã cập nhật hồ sơ tài khoản.', 'success');
        } catch (error) {
            this.showToast(error.message, 'error');
        } finally {
            if (button) button.disabled = false;
        }
    },

    async downloadPersonalData() {
        try {
            const response = await this.authFetch(`${API_BASE_URL}/api/account/data-export`);
            if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || 'Không thể tải dữ liệu.');
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `nttclass-du-lieu-${this.currentUser?.username || 'tai-khoan'}.json`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    renderDeletionStatus(requestedAt, status) {
        const statusElement = document.getElementById('settingsDeletionStatus');
        const requestButton = document.getElementById('btnRequestAccountDeletion');
        const cancelButton = document.getElementById('btnCancelAccountDeletion');
        const pending = status === 'pending' && requestedAt;
        if (statusElement) statusElement.textContent = pending
            ? `Đang chờ xử lý từ ${this.formatSettingsDateTime(requestedAt)}. Dữ liệu chưa bị xóa.`
            : 'Chưa có yêu cầu đang chờ xử lý.';
        if (requestButton) requestButton.hidden = !!pending;
        if (cancelButton) cancelButton.hidden = !pending;
    },

    async requestAccountDeletion() {
        const currentPassword = document.getElementById('settingsDeletionPassword')?.value || '';
        if (!currentPassword) return this.showToast('Nhập mật khẩu để xác nhận yêu cầu.', 'error');
        if (!window.confirm('Gửi yêu cầu xóa tài khoản? Dữ liệu chưa bị xóa ngay và vẫn có thể hủy yêu cầu.')) return;
        try {
            const response = await this.authFetch(`${API_BASE_URL}/api/account/deletion-request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword })
            });
            const result = await this.requireApiSuccess(response, 'Không thể gửi yêu cầu xóa tài khoản.');
            document.getElementById('settingsDeletionPassword').value = '';
            this.renderDeletionStatus(result.deleteRequestedAt, result.deleteRequestStatus);
            this.showToast(result.message, 'success');
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    async cancelAccountDeletion() {
        try {
            const response = await this.authFetch(`${API_BASE_URL}/api/account/deletion-request`, { method: 'DELETE' });
            const result = await this.requireApiSuccess(response, 'Không thể hủy yêu cầu xóa tài khoản.');
            this.renderDeletionStatus(null, null);
            this.showToast(result.message, 'success');
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    }
});
