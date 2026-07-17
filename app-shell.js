// ================================================================
// APP-SHELL.JS — "Khung" chạy chung của app: gắn sự kiện, đăng nhập/
// đăng xuất/chuyển vai trò, chuyển trang & phân quyền.
// Gộp từ 3 phần: registerEvents, đăng nhập, điều hướng.
// ================================================================
// ================================================================
// EVENTS.JS — registerEvents(): gắn toàn bộ sự kiện click/change/submit
// cho các nút, form trên giao diện khi app khởi động.
// ================================================================
Object.assign(PinkyClassApp.prototype, {
    registerEvents() {
        this.initSidebarCollapse();
        // Bộ chọn màu giao diện (3 chấm màu ở cuối sidebar)
        this.bindThemeSwitcher();

        // Nút Cài đặt bảo mật tài khoản
        const settingsBtn = document.getElementById('sidebarSettingsBtn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.openSettingsModal());
        }

        // Lọc học sinh theo lớp (Lớp 6 -> Lớp 12)
        const gradeFilterEl = document.getElementById('studentGradeFilter');
        if (gradeFilterEl) {
            gradeFilterEl.addEventListener('change', () => this.renderStudentList());
        }

        // Lọc toàn hệ thống theo kỳ (Tổng quan / Nhật ký / Lịch dạy / Học phí).
        // Giá trị dropdown dạng "yyyy-m" (VD "2026-7") hoặc "" = tất cả.
        const monthFilterEl = document.getElementById('globalMonthFilter');
        if (monthFilterEl) {
            monthFilterEl.addEventListener('change', (e) => {
                this.currentMonthFilter = e.target.value;
                this.updateAllViews();
            });
        }

        // Sidebar navigation
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const target = item.getAttribute('data-target');
                this.switchView(target);
                
                // Highlight active menu
                document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
                item.classList.add('active');
            });
        });

        // Login form submit
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLoginSubmit();
        });

        // Nút hiện/ẩn mật khẩu ở trang đăng nhập (icon con mắt)
        const togglePassBtn = document.getElementById('loginTogglePass');
        if (togglePassBtn) {
            togglePassBtn.addEventListener('click', () => {
                const passInput = document.getElementById('loginPassword');
                const showing = passInput.type === 'text';
                passInput.type = showing ? 'password' : 'text';
                togglePassBtn.innerText = showing ? '👁️' : '🙈';
            });
        }

        // Link "Quên mật khẩu?" — khôi phục mật khẩu qua mã OTP
        const forgotLink = document.getElementById('loginForgotLink');
        if (forgotLink) {
            forgotLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.openForgotPasswordModal();
            });
        }

        // Logout button
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.handleLogout();
        });

        // Global Student Picker Change
        document.getElementById('globalStudentPicker').addEventListener('change', (e) => {
            this.currentStudentId = e.target.value;
            this.updateAllViews();
            const subtitle = document.getElementById('view-subtitle');
            if (subtitle && document.getElementById('view-logs').classList.contains('active-view')) {
                subtitle.innerText = `Theo dõi chi tiết tiến trình bài tập, ý thức học tập và nhận xét qua từng buổi học của ${this.getStudentName(this.currentStudentId)}.`;
            }
            this.showToast("Đã chuyển sang học sinh: " + this.getStudentName(this.currentStudentId), "success");
        });

        // Student Picker riêng của trang Điểm số — đồng bộ 2 chiều với picker
        // toàn cục ở trang Nhật ký học tập (cùng dùng chung this.currentStudentId).
        const scoresPickerEl = document.getElementById('scoresStudentPicker');
        if (scoresPickerEl) {
            scoresPickerEl.addEventListener('change', (e) => {
                this.currentStudentId = e.target.value;
                document.getElementById('globalStudentPicker').value = this.currentStudentId;
                this.updateAllViews();
                const subtitle = document.getElementById('view-subtitle');
                if (subtitle) subtitle.innerText = `Điểm BTVN, kiểm tra thường xuyên, kiểm tra cuối chương và biểu đồ tiến bộ của ${this.getStudentName(this.currentStudentId)}.`;
                this.showToast("Đã chuyển sang học sinh: " + this.getStudentName(this.currentStudentId), "success");
            });
        }

        const batchScoreForm = document.getElementById('batchScoreForm');
        if (batchScoreForm) {
            batchScoreForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveBatchScores();
            });
            batchScoreForm.addEventListener('input', (e) => {
                if (e.target.classList.contains('batch-score-value')) this.updateBatchScoreCount();
            });
        }
        const batchScoreGrade = document.getElementById('batchScoreGrade');
        if (batchScoreGrade) {
            batchScoreGrade.addEventListener('change', () => this.filterBatchScoreRows());
        }

        // Form thêm/sửa điểm
        const scoreFormEl = document.getElementById('scoreForm');
        if (scoreFormEl) {
            scoreFormEl.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveScore();
            });
        }

        // Lịch dạy & Chấm công: 3 nút điều hướng dùng chung cho cả 3 kiểu xem
        // (Ngày/Tuần/Tháng) — mỗi lần bấm sẽ lùi/tiến đúng theo đơn vị của
        // kiểu xem đang chọn (xem this.calendarViewMode).
        document.getElementById('prevWeekBtn').addEventListener('click', () => {
            if (this.calendarViewMode === 'day') {
                const d = new Date(this.currentDayDate);
                d.setDate(d.getDate() - 1);
                this.currentDayDate = d;
            } else if (this.calendarViewMode === 'month') {
                const d = new Date(this.currentMonthViewDate);
                d.setMonth(d.getMonth() - 1);
                this.currentMonthViewDate = d;
            } else {
                const d = new Date(this.currentWeekStart);
                d.setDate(d.getDate() - 7);
                this.currentWeekStart = d;
            }
            this.renderCalendarView();
        });
        document.getElementById('nextWeekBtn').addEventListener('click', () => {
            if (this.calendarViewMode === 'day') {
                const d = new Date(this.currentDayDate);
                d.setDate(d.getDate() + 1);
                this.currentDayDate = d;
            } else if (this.calendarViewMode === 'month') {
                const d = new Date(this.currentMonthViewDate);
                d.setMonth(d.getMonth() + 1);
                this.currentMonthViewDate = d;
            } else {
                const d = new Date(this.currentWeekStart);
                d.setDate(d.getDate() + 7);
                this.currentWeekStart = d;
            }
            this.renderCalendarView();
        });
        document.getElementById('todayWeekBtn').addEventListener('click', () => {
            if (this.calendarViewMode === 'day') {
                this.currentDayDate = new Date();
            } else if (this.calendarViewMode === 'month') {
                this.currentMonthViewDate = new Date();
            } else {
                this.currentWeekStart = this.getMonday(new Date());
            }
            this.renderCalendarView();
        });

        // Bộ chuyển đổi kiểu xem lịch: Ngày / Tuần / Tháng
        document.querySelectorAll('.cal-view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.view;
                if (mode === this.calendarViewMode) return;
                this.calendarViewMode = mode;
                document.querySelectorAll('.cal-view-btn').forEach(b => b.classList.toggle('active', b === btn));
                this.renderCalendarView();
            });
        });

        // Quick entry modal (nhập nhanh nội dung buổi học từ lịch tuần)
        document.getElementById('quickSessionEntryForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveQuickSessionEntry();
        });
        document.getElementById('quickEntryEditFullBtn').addEventListener('click', () => {
            const sessionId = document.getElementById('quickEntrySessionId').value;
            this.closeModal('quickSessionEntryModal');
            this.openEditSessionModal(sessionId);
        });
        document.getElementById('quickEntryDeleteBtn').addEventListener('click', () => {
            const sessionId = document.getElementById('quickEntrySessionId').value;
            this.closeModal('quickSessionEntryModal');
            this.deleteSession(sessionId);
        });

        // Auto calculate hours based on times
        const timeChangeHandler = () => {
            const start = document.getElementById('sessionStartTime').value;
            const end = document.getElementById('sessionEndTime').value;
            if (start && end) {
                const [startH, startM] = start.split(':').map(Number);
                const [endH, endM] = end.split(':').map(Number);
                
                let diffMin = (endH * 60 + endM) - (startH * 60 + startM);
                if (diffMin < 0) diffMin += 24 * 60; // Over midnight
                
                const hours = (diffMin / 60).toFixed(1);
                document.getElementById('sessionHours').value = hours;
            }
        };
        document.getElementById('sessionStartTime').addEventListener('change', timeChangeHandler);
        document.getElementById('sessionEndTime').addEventListener('change', timeChangeHandler);

        const editTimeChangeHandler = () => {
            const start = document.getElementById('editSessionStartTime').value;
            const end = document.getElementById('editSessionEndTime').value;
            if (start && end) {
                const [startH, startM] = start.split(':').map(Number);
                const [endH, endM] = end.split(':').map(Number);
                
                let diffMin = (endH * 60 + endM) - (startH * 60 + startM);
                if (diffMin < 0) diffMin += 24 * 60;
                
                const hours = (diffMin / 60).toFixed(1);
                document.getElementById('editSessionHours').value = hours;
            }
        };
        document.getElementById('editSessionStartTime').addEventListener('change', editTimeChangeHandler);
        document.getElementById('editSessionEndTime').addEventListener('change', editTimeChangeHandler);

        // Form Submit: Log a Session
        document.getElementById('sessionLoggerForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogSession();
        });

        // Form Reset Button
        document.getElementById('resetLoggerFormBtn').addEventListener('click', () => {
            this.resetSessionLoggerForm();
        });

        // Nút "+ Ghi buổi học mới" — mở modal tạo buổi học ở trạng thái sạch
        // (không cần kéo-chọn trên lịch tuần).
        const btnOpenCreateSession = document.getElementById('btnOpenCreateSession');
        if (btnOpenCreateSession) {
            btnOpenCreateSession.addEventListener('click', () => {
                this.openCreateSessionModal();
            });
        }

        // Export Log Action
        document.getElementById('btnExportLog').addEventListener('click', () => {
            this.exportStudentLogToCSV();
        });
        document.getElementById('btnExportLogImage').addEventListener('click', () => {
            this.exportStudentLogToImage();
        });

        // Form Submit: Add Student
        document.getElementById('addStudentForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAddStudent();
        });

        // Form Submit: Update individual log
        document.getElementById('updateLogForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleUpdateLog();
        });

        // Form Submit: Edit Session
        document.getElementById('editSessionForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleEditSession();
        });

        // Form Submit: Xuất phiếu học phí
        document.getElementById('invoiceForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.exportInvoice();
        });

        // Tự tăng chiều cao các ô nhập theo lượng nội dung để không phải cuộn
        // bên trong textarea và luôn nhìn thấy đầy đủ phần đang soạn.
        document.querySelectorAll('#invoiceForm textarea').forEach(textarea => {
            const autoGrow = () => {
                textarea.style.height = 'auto';
                textarea.style.height = `${Math.max(textarea.scrollHeight, 72)}px`;
            };
            textarea.addEventListener('input', autoGrow);
            autoGrow();
        });

        document.getElementById('monthlyPaymentForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitMonthlyPayment();
        });

        // Form Submit: Trợ lý AI — gửi câu hỏi
        document.getElementById('aiChatForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendAiChatMessage();
        });

        // Nút xoá hội thoại Trợ lý AI
        document.getElementById('btnClearAiChat').addEventListener('click', () => {
            this.clearAiChat();
        });

        this.initRequestsFeature();

        // Tải ảnh QR thanh toán lên phiếu học phí (tuỳ chọn) — đọc file thành
        // base64 để nhúng thẳng vào ảnh xuất ra (không cần lưu file lên server).
        document.getElementById('invoiceQrInput').addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            if (!file.type.startsWith('image/')) {
                this.showToast('Vui lòng chọn 1 file ảnh (PNG/JPG) cho mã QR!', 'error');
                e.target.value = '';
                return;
            }
            if (file.size > 5 * 1024 * 1024) {
                this.showToast('Ảnh QR quá lớn (tối đa 5MB)!', 'error');
                e.target.value = '';
                return;
            }
            const reader = new FileReader();
            reader.onload = () => this.setInvoiceQrImage(reader.result);
            reader.onerror = () => this.showToast('Không đọc được ảnh QR, vui lòng thử lại.', 'error');
            reader.readAsDataURL(file);
        });

        // Xoá ảnh QR đang chọn (quay lại trạng thái chưa có QR)
        document.getElementById('btnRemoveQr').addEventListener('click', () => {
            this.setInvoiceQrImage(null);
        });

        // Khi giáo viên tự sửa "Từ ngày/Đến ngày" trong modal xuất phiếu, tính
        // lại NGAY số buổi/học phí/giờ học tương ứng — trước đây 2 ô này chỉ
        // để hiển thị, sửa xong không ảnh hưởng gì tới số liệu thực tế.
        document.getElementById('invoiceFromDate').addEventListener('change', () => this.recomputeInvoiceTotals());
        document.getElementById('invoiceToDate').addEventListener('change', () => this.recomputeInvoiceTotals());

        // Student Manager Add Student Button
        document.getElementById('addNewStudentBtn').addEventListener('click', () => {
            this.openAddStudentModal();
        });

        // Session Type selection (riêng/chung) thay đổi cách chọn học sinh + cách tính giá
        document.getElementById('sessionType').addEventListener('change', () => {
            this.applySessionTypeRules('session');
        });
        document.getElementById('editSessionType').addEventListener('change', () => {
            this.applySessionTypeRules('editSession');
        });
        document.getElementById('sessionPrice').addEventListener('change', (e) => {
            e.target.dataset.userEdited = 'true';
            this.updateSessionPricing('session');
        });
        document.getElementById('editSessionPrice').addEventListener('change', (e) => {
            e.target.dataset.userEdited = 'true';
            this.updateSessionPricing('editSession');
        });

        // Ô tìm kiếm/lọc học sinh trong lưới chọn học sinh tham gia (gõ tên
        // hoặc lớp, VD "Lớp 6", "6", "Khánh Hà"... đều lọc ra đúng học sinh).
        document.getElementById('studentsCheckboxSearch').addEventListener('input', (e) => {
            this.filterStudentCheckboxGrid('studentsCheckboxGrid', e.target.value);
        });
        document.getElementById('editStudentsCheckboxSearch').addEventListener('input', (e) => {
            this.filterStudentCheckboxGrid('editStudentsCheckboxGrid', e.target.value);
        });

        // User Management (Admin only)
        document.getElementById('addNewUserBtn').addEventListener('click', () => {
            this.openAddUserModal();
        });
        document.getElementById('addUserForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSaveUser();
        });

        // Khởi tạo đúng nhãn/giá theo loại buổi học mặc định khi tải trang
        this.applySessionTypeRules('session');
        this.applySessionTypeRules('editSession');

        // Kéo-thả 1 buổi học trên Lịch tuần sang ngày/giờ khác (xem chi tiết
        // cách hoạt động trong initCalendarDragToReschedule bên dưới).
        this.initCalendarDragToReschedule();

        // Kéo-CHỌN 1 khung giờ TRỐNG trên Lịch tuần để mở nhanh form tạo ca
        // học mới, giờ được điền sẵn đúng theo khung đã kéo (xem chi tiết
        // trong initCalendarDragToCreate bên dưới).
        this.initCalendarDragToCreate();

        // ----- Lặp lại buổi học theo ngày / tuần / tháng / ngày tùy chỉnh -----
        const repeatToggle = document.getElementById('sessionRepeatToggle');
        const repeatPanel = document.getElementById('repeatDatesPanel');
        if (repeatToggle && repeatPanel) {
            repeatToggle.addEventListener('change', () => {
                repeatPanel.style.display = repeatToggle.checked ? '' : 'none';
                if (repeatToggle.checked) this.updateRepeatScheduleUI();
                if (!repeatToggle.checked) {
                    this.repeatExtraDates = [];
                    this.renderRepeatDatesChips();
                }
            });
        }
        const addRepeatDateBtn = document.getElementById('addRepeatDateBtn');
        if (addRepeatDateBtn) {
            addRepeatDateBtn.addEventListener('click', () => this.handleAddRepeatDate());
        }
        const repeatFrequency = document.getElementById('repeatFrequency');
        const repeatUntilDate = document.getElementById('repeatUntilDate');
        if (repeatFrequency) repeatFrequency.addEventListener('change', () => this.updateRepeatScheduleUI());
        if (repeatUntilDate) repeatUntilDate.addEventListener('change', () => this.generateRepeatDates());
        const sessionDate = document.getElementById('sessionDate');
        if (sessionDate) sessionDate.addEventListener('change', () => this.generateRepeatDates());
    }

});

// ================================================================
// AUTH.JS — Đăng nhập / Đăng xuất / Chuyển vai trò
// Tách từ app.js (PinkyClassApp). File này gắn thêm các method vào
// prototype của PinkyClassApp nên PHẢI được load SAU core.js.
// ================================================================
Object.assign(PinkyClassApp.prototype, {
    showLoginPage() {
        document.getElementById('loginPage').classList.remove('hidden');
        document.querySelector('.sidebar').classList.add('hidden');
        document.querySelector('.main-content').classList.add('hidden');
        document.getElementById('logoutBtn').style.display = 'none';
        this.currentUser = null;
        this.currentRole = null;
        document.getElementById('sidebarUserName').innerText = 'Chưa đăng nhập';
        document.getElementById('sidebarUserRole').innerText = 'Vui lòng đăng nhập';
    },

    showAppPage() {
        document.getElementById('loginPage').classList.add('hidden');
        document.querySelector('.sidebar').classList.remove('hidden');
        document.querySelector('.main-content').classList.remove('hidden');
        document.getElementById('logoutBtn').style.display = 'inline-flex';
    },

    async onLoginSuccess(user, save = true) {
        this.currentUser = user;
        this.currentRole = user.role;
        this.requests = [];
        this.requestsLoaded = false;
        this.requestFilter = 'pending';
        if (save) {
            localStorage.setItem('pinky_current_user', JSON.stringify(user));
            // Refresh data now that we have a valid auth token
            await this.loadData();
        }
        // Học sinh chỉ được xem đúng hồ sơ của chính mình — khóa cứng
        // currentStudentId về id của chính họ, không cho đổi sang bạn khác.
        if (user.role === 'student') {
            this.currentStudentId = user.id;
        } else {
            this.currentStudentId = this.currentStudentId || (this.students[0] ? this.students[0].id : null);
        }
        const roleLabel = user.role === 'admin' ? 'Quản trị viên' : user.role === 'teacher' ? 'Giáo viên' : user.role === 'assistant' ? 'Trợ giảng' : 'Học sinh';
        document.getElementById('sidebarUserName').innerText = user.name;
        document.getElementById('sidebarUserRole').innerText = user.role === 'assistant' && user.assignedTeacherName
            ? `${roleLabel} (của ${user.assignedTeacherName})`
            : roleLabel;
        const avatarEl = document.getElementById('sidebarUserAvatar');
        if (avatarEl) avatarEl.innerText = (user.name || '?').trim().charAt(0).toUpperCase();
        this.showAppPage();
        this.switchRole(user.role);
        this.switchView(user.role === 'admin' ? 'view-users' : user.role === 'student' ? 'view-logs' : 'view-dashboard');
        this.showToast(`Đăng nhập thành công với vai trò: ${roleLabel}`, 'success');
    },

    async handleLoginSubmit() {
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value.trim();
        if (!username || !password) {
            this.showToast('Vui lòng nhập tên đăng nhập và mật khẩu.', 'error');
            return;
        }

        const submitBtn = document.getElementById('loginSubmitBtn');
        const submitText = document.getElementById('loginSubmitText');
        const loginCard = document.getElementById('loginCard');

        submitBtn.disabled = true;
        submitBtn.classList.add('login-loading');
        submitText.innerText = 'Đang đăng nhập...';

        try {
            const res = await fetch(`${API_BASE_URL}/api/login`, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            if (!res.ok) {
                let payload;
                try {
                    payload = await res.json();
                } catch (parseErr) {
                    const text = await res.text();
                    payload = { error: text || `Lỗi không xác định (${res.status})` };
                }
                throw new Error(payload.error || `Đăng nhập thất bại (${res.status})`);
            }

            const user = await res.json();
            const rememberCheckbox = document.getElementById('loginRemember');
            if (rememberCheckbox && rememberCheckbox.checked) {
                localStorage.setItem('nttclass_remembered_username', username);
            } else {
                localStorage.removeItem('nttclass_remembered_username');
            }
            await this.onLoginSuccess(user);
        } catch (err) {
            this.showToast(err.message || 'Đăng nhập thất bại.', 'error');
            // Hiệu ứng rung nhẹ thẻ đăng nhập khi sai thông tin — phản hồi thị
            // giác tức thì, không chỉ dựa vào toast (dễ bị bỏ qua trên mobile).
            if (loginCard) {
                loginCard.classList.remove('login-shake');
                // Buộc reflow để animation chạy lại được nếu bấm sai liên tiếp
                void loginCard.offsetWidth;
                loginCard.classList.add('login-shake');
                setTimeout(() => loginCard.classList.remove('login-shake'), 400);
            }
        } finally {
            submitBtn.disabled = false;
            submitBtn.classList.remove('login-loading');
            submitText.innerText = 'Đăng nhập';
        }
    },

    handleLogout() {
        localStorage.removeItem('pinky_current_user');
        this.requests = [];
        this.requestsLoaded = false;
        this.clearRequestImage();
        this.showLoginPage();
        this.showToast('Bạn đã đăng xuất.', 'success');
    },

    switchRole(role) {
        this.currentRole = role;

        // Update top badge
        const badge = document.getElementById('roleBadge');
        badge.className = 'role-badge';
        if (role === 'admin') {
            badge.innerText = 'Quản trị viên';
            badge.classList.add('role-badge-admin');
        } else if (role === 'teacher') {
            badge.innerText = 'Giáo viên';
            badge.classList.add('role-badge-teacher');
        } else if (role === 'assistant') {
            badge.innerText = 'Trợ giảng';
            badge.classList.add('role-badge-assistant');
        } else {
            badge.innerText = 'Học sinh';
            badge.classList.add('role-badge-student');
        }

        // Show/hide navigation tabs
        const navDashboard = document.getElementById('nav-dashboard');
        const navLogs = document.getElementById('nav-logs');
        const navScores = document.getElementById('nav-scores');
        const navTuition = document.getElementById('nav-tuition');
        const navScheduler = document.getElementById('nav-scheduler');
        const navStudents = document.getElementById('nav-students');
        const navUsers = document.getElementById('nav-users');
        const navAiChat = document.getElementById('nav-ai-chat');
        const navRequests = document.getElementById('nav-requests');

        if (role === 'admin') {
            // Admin: chỉ được quản lý tài khoản người dùng, không truy cập
            // các chức năng dạy học khác. Admin cũng không có dữ liệu lịch
            // dạy/điểm số nên không cần Trợ lý AI.
            navDashboard.style.display = 'none';
            navLogs.style.display = 'none';
            navScores.style.display = 'none';
            navTuition.style.display = 'none';
            navScheduler.style.display = 'none';
            navStudents.style.display = 'none';
            navUsers.style.display = 'flex';
            navAiChat.style.display = 'none';
            navRequests.style.display = 'none';
        } else if (role === 'assistant') {
            navDashboard.style.display = 'flex';
            navLogs.style.display = 'flex';
            navScores.style.display = 'flex';
            navTuition.style.display = 'flex';
            navScheduler.style.display = 'flex';
            navStudents.style.display = 'flex'; // TA can view classes/students of their assigned teacher
            navUsers.style.display = 'none';
            navAiChat.style.display = 'flex';
            navRequests.style.display = 'flex';
        } else if (role === 'student') {
            // Học sinh: xem "Nhật ký học tập" + "Điểm số" của chính mình —
            // không thấy học phí, không thấy học sinh khác, không thấy lịch
            // dạy tổng, không có quyền quản lý tài khoản. Vẫn được dùng Trợ
            // lý AI nhưng chỉ đọc được đúng dữ liệu của chính mình (giới hạn
            // ở phía server, xem /api/ai-chat).
            navDashboard.style.display = 'none';
            navLogs.style.display = 'flex';
            navScores.style.display = 'flex';
            navTuition.style.display = 'none';
            navScheduler.style.display = 'none';
            navStudents.style.display = 'none';
            navUsers.style.display = 'none';
            navAiChat.style.display = 'flex';
            navRequests.style.display = 'flex';
        } else {
            // teacher: toàn quyền với các chức năng dạy học
            navDashboard.style.display = 'flex';
            navLogs.style.display = 'flex';
            navScores.style.display = 'flex';
            navTuition.style.display = 'flex';
            navScheduler.style.display = 'flex';
            navStudents.style.display = 'flex';
            navUsers.style.display = 'none';
            navAiChat.style.display = 'flex';
            navRequests.style.display = 'flex';
        }

        // Trigger UI updates
        this.updateAllViews();
        const roleLabel = role === 'admin' ? 'Quản trị viên' : role === 'teacher' ? 'Giáo viên' : role === 'assistant' ? 'Trợ giảng' : 'Học sinh';
        this.showToast(`Đã chuyển sang vai trò: ${roleLabel}`, "success");
    }

});

// ================================================================
// NAVIGATION.JS — Chuyển trang (switchView), cập nhật toàn bộ view,
// phân quyền theo vai trò, và vài hàm getter nhỏ dùng chung.
// ================================================================
Object.assign(PinkyClassApp.prototype, {
    switchView(viewId) {
        // Toggle view classes
        document.querySelectorAll('.view-section').forEach(sec => {
            sec.classList.remove('active-view');
        });
        
        const targetView = document.getElementById(viewId);
        if (targetView) {
            targetView.classList.add('active-view');
        }

        // Adjust title bar
        const titleEl = document.getElementById('view-title');
        const subtitleEl = document.getElementById('view-subtitle');

        if (viewId === 'view-dashboard') {
            titleEl.innerText = "Tổng quan hệ thống";
            subtitleEl.innerText = "Bảng điều khiển học tập và lịch dạy cá nhân.";
        } else if (viewId === 'view-logs') {
            titleEl.innerText = "NHẬT KÝ HỌC TẬP";
            subtitleEl.innerText = `Theo dõi chi tiết tiến trình bài tập, ý thức học tập và nhận xét qua từng buổi học của ${this.getStudentName(this.currentStudentId)}.`;
        } else if (viewId === 'view-scores') {
            titleEl.innerText = "Điểm số";
            subtitleEl.innerText = `Điểm BTVN, kiểm tra thường xuyên, kiểm tra cuối chương và biểu đồ tiến bộ của ${this.getStudentName(this.currentStudentId)}.`;
        } else if (viewId === 'view-ai-chat') {
            titleEl.innerText = "Trợ lý AI";
            subtitleEl.innerText = "Hỏi đáp dựa trên dữ liệu lịch dạy và điểm số thật trong tài khoản của bạn.";
        } else if (viewId === 'view-requests') {
            titleEl.innerText = "Yêu cầu";
            subtitleEl.innerText = "Ghi lại yêu cầu cần thực hiện và theo dõi trạng thái hoàn thành.";
            this.loadRequests();
        } else if (viewId === 'view-scheduler') {
            titleEl.innerText = "Lịch dạy & Chấm công";
            subtitleEl.innerText = "Sắp xếp lịch dạy học và tính công dạy hàng tuần.";
        } else if (viewId === 'view-tuition') {
            titleEl.innerText = "Báo cáo Học phí";
            subtitleEl.innerText = "Xem thông tin đóng học phí của tất cả học sinh.";
        } else if (viewId === 'view-students') {
            titleEl.innerText = "Hồ sơ Học sinh";
            subtitleEl.innerText = "Quản lý thông tin liên hệ và học phí cơ bản.";
        } else if (viewId === 'view-users') {
            titleEl.innerText = "Quản lý Tài khoản";
            subtitleEl.innerText = "Tạo, chỉnh sửa, kích hoạt/vô hiệu hóa tài khoản Giáo viên và Trợ giảng.";
        }

        // Sync active menu link
        document.querySelectorAll('.menu-item').forEach(m => {
            if (m.getAttribute('data-target') === viewId) {
                m.classList.add('active');
            } else {
                m.classList.remove('active');
            }
        });

        this.updateAllViews();
    },

    updateAllViews() {
        this.renderDashboard();
        this.renderStudentLogs();
        this.renderScores();
        this.renderCalendarView();
        this.renderTuitionOverview();
        this.renderStudentList();
        if (this.currentRole === 'admin') {
            this.renderUsersTable();
        }
        
        // Hide role-restricted elements
        this.applyPermissions();
    },

    applyPermissions() {
        // Elements restricted by role
        document.querySelectorAll('.role-restricted').forEach(el => {
            el.style.display = 'none'; // Default hide
        });

        if (this.currentRole === 'teacher') {
            // Teacher: show all teaching & pricing controls
            document.querySelectorAll('.admin-tutor, .admin-only').forEach(el => {
                if (el.tagName === 'TH' || el.tagName === 'TD') {
                    el.style.display = '';
                } else {
                    el.style.display = 'flex';
                }
            });
            // Show price fields
            const priceCard = document.getElementById('admin-summary-money-card');
            if (priceCard) priceCard.style.display = 'block';
            
            // Show add/edit forms
            const formCard = document.getElementById('btnOpenCreateSession');
            if (formCard) formCard.style.display = '';
        } else if (this.currentRole === 'assistant') {
            // Assistant: show teaching controls but hide pricing/admin-only fields
            document.querySelectorAll('.admin-tutor').forEach(el => {
                if (el.tagName === 'TH' || el.tagName === 'TD') {
                    el.style.display = '';
                } else {
                    el.style.display = 'flex';
                }
            });
            // Hide admin specific elements (pricing calculations, deletions)
            document.querySelectorAll('.admin-only').forEach(el => {
                el.style.display = 'none';
            });
            const priceCard = document.getElementById('admin-summary-money-card');
            if (priceCard) priceCard.style.display = 'none';
            
            // Show logger form but hide pricing inputs inside form
            const formCard = document.getElementById('btnOpenCreateSession');
            if (formCard) formCard.style.display = '';
            
            const priceFormGroup = document.getElementById('sessionPrice').parentElement;
            if (priceFormGroup) priceFormGroup.style.display = 'none';
        } else if (this.currentRole === 'student') {
            // Student role: hide forms and administrative tools completely
            document.querySelectorAll('.admin-tutor, .admin-only').forEach(el => {
                el.style.display = 'none';
            });
            const formCard = document.getElementById('btnOpenCreateSession');
            if (formCard) formCard.style.display = 'none';
        }
    },

    getStudentName(id) {
        const s = this.students.find(x => x.id === id);
        return s ? s.name : "Học sinh";
    },

    getStudentSubject(id) {
        const s = this.students.find(x => x.id === id);
        return s ? s.subject : "Toán";
    },

    getStudentClass(id) {
        const s = this.students.find(x => x.id === id);
        return s ? s.class : "Lớp";
    },

    formatVND(amount) {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    },

    // Trả về danh sách studentId trong 1 buổi học CÓ đóng học phí (loại trừ
    // học sinh có học phí cơ bản = 0đ — VD học miễn phí/học thử). Dùng để
    // chia đều "Tổng thu buổi học" và tính "học phí chưa đóng" cho đúng,
    // tránh việc học sinh 0đ vừa bị tính vào tổng thu vừa bị tính là "nợ học phí".
    getPayingStudentIds(sess) {
        return (sess.studentIds || []).filter(sid => {
            const student = this.students.find(s => s.id === sid);
            return student && Number(student.basePrice) > 0;
        });
    },

    // Số tiền này được chốt tại lúc tạo buổi học. Dữ liệu cũ chưa có snapshot
    // vẫn dùng công thức cũ để tương thích cho tới khi server hoàn tất backfill.
    getStudentSessionFee(sess, studentId) {
        const detail = sess.studentDetails && sess.studentDetails[studentId];
        if (detail && detail.feeAmount !== undefined && detail.feeAmount !== null) {
            const amount = Number(detail.feeAmount);
            return Number.isFinite(amount) && amount >= 0 ? amount : 0;
        }
        const payingIds = this.getPayingStudentIds(sess);
        return payingIds.includes(studentId) ? Number(sess.price || 0) / (payingIds.length || 1) : 0;
    }

    // --- VIEW 1: DASHBOARD ---
});
