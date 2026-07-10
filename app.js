// PinkyClass Student Management System
// JavaScript logic with localStorage and role-based views

// Địa chỉ gốc của Backend API. Để trống ('') vì file này được chính server.js
// (Express) phục vụ tĩnh (static) cùng một nguồn (same-origin) — cả lúc chạy
// local (http://localhost:3000) lẫn sau khi deploy lên Render (một Web
// Service duy nhất chứa cả frontend + backend). Nếu sau này bạn tách frontend
// ra deploy riêng (ví dụ Vercel), chỉ cần đổi dòng này thành domain Render,
// ví dụ: 'https://nttclass-backend.onrender.com'.
const API_BASE_URL = '';

const MOCK_STUDENTS = [];
const MOCK_SESSIONS = [];

class PinkyClassApp {
    constructor() {
        this.students = [];
        this.sessions = [];
        this.users = [];
        this.scores = []; // Điểm số (BTVN/Kiểm tra/Thái độ) — Phase 3
        this.charts = {}; // Instance các biểu đồ Chart.js đang hiển thị (Phase 4), để destroy() trước khi vẽ lại
        this.currentUser = null;
        this.currentRole = null; // admin or teacher
        this.currentStudentId = null; // Active student filter (chỉ dùng ở trang Nhật ký học tập)
        this.currentMonthFilter = ''; // '' = tất cả, hoặc dạng "yyyy-m" (VD "2026-7") ứng với 1 mục trong dropdown "Kỳ"
        this.currentWeekStart = this.getMonday(new Date()); // Thứ 2 đầu tuần đang xem ở Lịch dạy & Chấm công

        // Hằng số lưới giờ của Lịch tuần — dùng chung giữa renderWeeklyCalendar()
        // và tính năng kéo-thả đổi lịch (initCalendarDragToReschedule) để 2 bên
        // luôn quy đổi px <-> giờ:phút theo ĐÚNG 1 công thức, không thể lệch nhau.
        this.CAL_HOUR_START = 6;   // 06:00
        this.CAL_HOUR_END = 22;    // 22:00
        this.CAL_HOUR_HEIGHT = 52; // px, phải khớp với .week-hour-label height trong CSS
        this.calDrag = null; // Trạng thái đang kéo-thả 1 buổi học trên lịch tuần (null = không kéo)
        this.aiChatHistory = []; // Lịch sử hội thoại Trợ lý AI (chỉ lưu ở client, gửi kèm mỗi lần hỏi để AI nhớ ngữ cảnh)

        // Áp dụng lại màu giao diện đã lưu (nếu có) ngay từ đầu, trước khi vẽ
        // bất cứ gì, để tránh bị "chớp" màu mặc định rồi mới đổi màu.
        this.initTheme();

        this.init();
    }

    // Đọc màu giao diện đã lưu trong localStorage (mặc định "blue" nếu chưa
    // từng chọn) và gán vào thuộc tính data-theme của <html> — toàn bộ màu
    // sắc của trang được định nghĩa bằng CSS variable theo data-theme này
    // (xem khối "THEME PALETTES" trong style.css).
    initTheme() {
        let saved = localStorage.getItem('nttclass_theme') || 'blue';
        // Trước đây có bảng màu "emerald" (xanh lá), nay đã thay bằng "pink"
        // (hồng) — tự động chuyển những ai đã lỡ chọn xanh lá sang hồng để
        // không bị rơi về màu mặc định một cách khó hiểu.
        if (saved === 'emerald') {
            saved = 'pink';
            localStorage.setItem('nttclass_theme', saved);
        }
        document.documentElement.setAttribute('data-theme', saved);
    }

    // Gắn sự kiện click cho 3 chấm màu ở cuối sidebar: đổi data-theme + lưu
    // lại lựa chọn + tô sáng chấm đang được chọn.
    bindThemeSwitcher() {
        const switcher = document.getElementById('themeSwitcher');
        if (!switcher) return;
        const current = localStorage.getItem('nttclass_theme') || 'blue';
        const swatches = switcher.querySelectorAll('.theme-swatch');
        swatches.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.themeValue === current);
            btn.addEventListener('click', () => {
                const theme = btn.dataset.themeValue;
                document.documentElement.setAttribute('data-theme', theme);
                localStorage.setItem('nttclass_theme', theme);
                swatches.forEach(b => b.classList.toggle('active', b === btn));
                this.showToast('Đã đổi màu giao diện!', 'success');
            });
        });
    }

    async init() {
        const savedUserJson = localStorage.getItem('pinky_current_user');
        const savedUser = savedUserJson ? JSON.parse(savedUserJson) : null;
        if (savedUser && savedUser.role) {
            // Set the current user BEFORE loading data so the auth token is
            // available to authFetch() for the protected /api endpoints.
            this.currentUser = savedUser;
            this.currentRole = savedUser.role;
        }

        await this.loadData();
        this.registerEvents();

        if (savedUser && savedUser.role) {
            this.onLoginSuccess(savedUser, false);
        } else {
            this.showLoginPage();
            // Điền lại tên đăng nhập đã lưu (nếu người dùng từng tick "Ghi nhớ
            // đăng nhập") — không lưu mật khẩu vì lý do bảo mật.
            const rememberedUsername = localStorage.getItem('nttclass_remembered_username');
            const usernameInput = document.getElementById('loginUsername');
            const rememberCheckbox = document.getElementById('loginRemember');
            if (rememberedUsername && usernameInput) {
                usernameInput.value = rememberedUsername;
                if (rememberCheckbox) rememberCheckbox.checked = true;
                const passwordInput = document.getElementById('loginPassword');
                if (passwordInput) passwordInput.focus();
            }
        }

        // Default date on scheduler to today
        const today = this.toISODateOnly(new Date());
        document.getElementById('sessionDate').value = today;

        // Render initial view if already logged in
        if (this.currentUser) {
            this.switchView(this.currentRole === 'admin' ? 'view-users' : 'view-dashboard');
        }
    }

    // Build headers with Authorization token (if logged in) for protected API calls
    authHeaders(extra = {}) {
        const headers = { ...extra };
        if (this.currentUser && this.currentUser.token) {
            headers['Authorization'] = `Bearer ${this.currentUser.token}`;
        }
        return headers;
    }

    // Wrapper around fetch() that automatically attaches the auth token
    async authFetch(url, options = {}) {
        const opts = { ...options };
        opts.headers = this.authHeaders(options.headers || {});
        return fetch(url, opts);
    }

    // Server trả về tên cột SQL Server gốc (PascalCase: Id, Name, SessionDate...),
    // trong khi toàn bộ phần còn lại của app dùng camelCase (id, name, date,
    // studentIds, studentDetails...). Hai hàm dưới đây chuyển đổi dữ liệu thô
    // từ API thành đúng cấu trúc app cần — thiếu bước này là nguyên nhân khiến
    // giao diện hiển thị "undefined" ở khắp nơi dù DB đã có dữ liệu.
    normalizeStudent(s) {
        // GradeLevel là cột mới (số nguyên 6-12). Với dữ liệu cũ chưa có cột này,
        // suy ra tạm từ chuỗi Class (ví dụ "Lớp 8" -> 8) để không vỡ giao diện.
        let grade = s.GradeLevel;
        if (grade === undefined || grade === null || grade === '') {
            const m = String(s.Class || '').match(/\d+/);
            grade = m ? parseInt(m[0]) : null;
        } else {
            grade = parseInt(grade);
        }
        return {
            id: s.Id,
            name: s.Name,
            class: s.Class,
            gradeLevel: grade,
            subject: s.Subject,
            basePrice: s.BasePrice,
            teacherId: s.TeacherId,
            // Thông tin tài khoản đăng nhập riêng của học sinh (nếu có) — dùng
            // để hiển thị trạng thái "Đã có tài khoản / Chưa có" cho giáo viên.
            username: s.Username || null,
            accountActive: s.AccountActive !== false
        };
    }

    // Trả về danh sách buổi học đã áp dụng bộ lọc "Tháng" toàn cục (dùng chung
    // cho Tổng quan / Nhật ký / Lịch dạy / Học phí để đồng bộ số liệu).
    // Sinh danh sách các "Tháng/Năm" thực sự có buổi học (dựa trên dữ liệu
    // thật, không cố định cứng 12 tháng) để đưa vào 1 dropdown "Kỳ" duy nhất
    // — thay cho việc phải chọn 2 ô Tháng + Năm riêng biệt (rườm rà). Giá trị
    // mỗi lựa chọn dạng "yyyy-m" (VD "2026-7"), luôn có năm đi kèm nên không
    // còn gộp nhầm dữ liệu cùng tháng khác năm như trước đây.
    populateMonthFilterOptions() {
        const selectEl = document.getElementById('globalMonthFilter');
        if (!selectEl) return;

        const monthNames = ['', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

        const keysSet = new Set();
        (this.sessions || []).forEach(s => {
            const parts = String(s.date).split('-'); // yyyy-mm-dd
            if (parts.length >= 2) {
                const y = parseInt(parts[0]), m = parseInt(parts[1]);
                if (y && m) keysSet.add(`${y}-${m}`);
            }
        });
        // Luôn đảm bảo có tháng hiện tại trong danh sách, kể cả khi chưa có buổi học nào
        const now = new Date();
        keysSet.add(`${now.getFullYear()}-${now.getMonth() + 1}`);
        // Giữ lại lựa chọn đang chọn hiện tại (nếu có) để không bị mất khi danh sách sinh lại
        if (this.currentMonthFilter) keysSet.add(this.currentMonthFilter);

        const keys = Array.from(keysSet).sort((a, b) => {
            const [ay, am] = a.split('-').map(Number);
            const [by, bm] = b.split('-').map(Number);
            return by - ay || bm - am; // mới nhất lên đầu
        });

        selectEl.innerHTML = '<option value="">Tất cả</option>' + keys.map(k => {
            const [y, m] = k.split('-').map(Number);
            return `<option value="${k}">${monthNames[m]}/${y}</option>`;
        }).join('');
        selectEl.value = this.currentMonthFilter || '';
    }

    // Lọc buổi học theo đúng "Tháng/Năm" đang chọn ở bộ lọc "Kỳ" (dropdown gộp
    // chung, value dạng "yyyy-m"). Trước đây từng chỉ so khớp số tháng, KHÔNG
    // so năm — khiến buổi học tháng 5/2025 và tháng 5/2026 (hoặc bất kỳ năm
    // nào khác) bị gộp chung làm 1, gây sai tổng học phí/báo cáo/phiếu xuất
    // khi hệ thống dùng qua nhiều năm học. Nay bắt buộc so khớp CẢ tháng lẫn năm.
    filterByMonth(sessions) {
        if (!this.currentMonthFilter) return sessions;
        const [yearStr, monthStr] = this.currentMonthFilter.split('-');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);
        return (sessions || []).filter(s => {
            if (!s.date) return false;
            const parts = String(s.date).split('-'); // yyyy-mm-dd
            return parts.length >= 2 && parseInt(parts[1]) === month && parseInt(parts[0]) === year;
        });
    }

    // API /api/sessions trả về 1 dòng cho MỖI (buổi học, học sinh) do LEFT JOIN
    // với SessionDetails -> cần gộp lại theo SessionId thành 1 object buổi học
    // có mảng studentIds + object studentDetails.
    normalizeSessions(rows) {
        const map = new Map();
        (rows || []).forEach(row => {
            if (!map.has(row.Id)) {
                map.set(row.Id, {
                    id: row.Id,
                    date: row.SessionDate ? String(row.SessionDate).slice(0, 10) : row.SessionDate,
                    startTime: row.StartTime,
                    endTime: row.EndTime,
                    type: row.SessionType,
                    price: row.Price,
                    duration: row.Duration,
                    content: row.Content,
                    generalComment: row.GeneralComment,
                    completed: !!row.Completed,
                    paid: !!row.Paid,
                    studentIds: [],
                    studentDetails: {}
                });
            }
            const sessionObj = map.get(row.Id);
            if (row.StudentId && !sessionObj.studentIds.includes(row.StudentId)) {
                sessionObj.studentIds.push(row.StudentId);
                sessionObj.studentDetails[row.StudentId] = {
                    homework: row.Homework || 'Chưa làm',
                    attitude: row.Attitude || 'Tốt',
                    individualComment: row.IndividualComment || '',
                    note: row.Note || ''
                };
            }
        });
        return Array.from(map.values());
    }

    // Học sinh KHÔNG có quyền gọi /api/students hay /api/sessions (403 —
    // các route đó chỉ dành cho teacher/assistant), nên dùng riêng 2 API
    // chỉ-đọc /api/me + /api/me/schedule, rồi "giả lập" lại đúng hình dạng
    // dữ liệu (this.students / this.sessions) mà các hàm render() có sẵn
    // (renderStudentLogs, renderDashboard...) đang mong đợi — nhờ vậy không
    // cần viết lại các hàm hiển thị riêng cho vai trò học sinh.
    async loadStudentSelfData() {
        try {
            const resMe = await this.authFetch(`${API_BASE_URL}/api/me`);
            if (!resMe.ok) {
                const errBody = await resMe.json().catch(() => ({}));
                throw new Error(errBody.error || `GET /api/me -> ${resMe.status}`);
            }
            const me = await resMe.json();
            this.students = [this.normalizeStudent({
                Id: me.Id, Name: me.Name, Class: me.Class,
                GradeLevel: me.GradeLevel, Subject: me.Subject,
                BasePrice: 0, TeacherId: this.currentUser.assignedTeacherId
            })];
            this.currentStudentId = me.Id;

            const resSched = await this.authFetch(`${API_BASE_URL}/api/me/schedule`);
            const rawSched = resSched.ok ? await resSched.json() : [];
            this.sessions = rawSched.map(row => ({
                id: row.id,
                date: row.date,
                startTime: row.startTime,
                endTime: row.endTime,
                type: row.type,
                sessionName: row.sessionName,
                content: row.content,
                generalComment: row.generalComment,
                completed: row.completed,
                studentIds: [me.Id],
                studentDetails: {
                    [me.Id]: {
                        homework: row.homework,
                        attitude: row.attitude,
                        individualComment: row.individualComment,
                        note: row.note,
                        paid: !!row.paid
                    }
                }
            }));

            this.computeSessionPaidFlags();

            // Điểm số của chính học sinh (Phase 3) — chỉ đọc.
            try {
                const resScores = await this.authFetch(`${API_BASE_URL}/api/me/scores`);
                this.scores = resScores.ok ? await resScores.json() : [];
            } catch (scoreErr) {
                console.error('[loadStudentSelfData] Lỗi tải điểm số:', scoreErr.message);
                this.scores = [];
            }

            this.populateMonthFilterOptions();
            this.populateStudentPickers();
            if (this.currentUser) this.updateAllViews();
        } catch (err) {
            console.error('[loadStudentSelfData]', err.message);
            this.showToast('Không tải được dữ liệu cá nhân của bạn.', 'error');
        }
    }

    async loadData() {
        if (this.currentRole === 'student') {
            return this.loadStudentSelfData();
        }
        try {
            const resStud = await this.authFetch(`${API_BASE_URL}/api/students`);
            if (!resStud.ok) {
                const errBody = await resStud.json().catch(() => ({}));
                throw new Error(`GET /api/students -> ${resStud.status}: ${errBody.error || 'API error'}`);
            }
            const rawStudents = await resStud.json();
            console.log('[loadData] /api/students trả về', rawStudents.length, 'học sinh');
            this.students = rawStudents.map(s => this.normalizeStudent(s));

            const resSess = await this.authFetch(`${API_BASE_URL}/api/sessions`);
            if (!resSess.ok) {
                const errBody = await resSess.json().catch(() => ({}));
                throw new Error(`GET /api/sessions -> ${resSess.status}: ${errBody.error || 'API error'}`);
            }
            const rawSessions = await resSess.json();
            console.log('[loadData] /api/sessions trả về', rawSessions.length, 'buổi học');
            // QUAN TRỌNG: server (/api/sessions) ĐÃ gộp dữ liệu JOIN thành object
            // camelCase hoàn chỉnh (id, studentIds, studentDetails, ...) ngay phía
            // backend. Trước đây code ở đây gọi lại this.normalizeSessions(rawSessions),
            // hàm này được viết cho trường hợp server trả RAW rows PascalCase
            // (Id, StudentId, ...) - khác hoàn toàn với những gì backend thực sự trả
            // về. Hậu quả: mọi session bị "normalize" lần 2 thành rác (id: undefined,
            // studentIds: [], studentDetails: {}) dù dữ liệu trong SQL Server hoàn
            // toàn đúng và đã insert thành công. Đây là NGUYÊN NHÂN GỐC khiến UI luôn
            // hiển thị "Chưa có buổi học nào" và học phí luôn bằng 0đ. Fix: dùng
            // thẳng dữ liệu server trả về, không re-normalize.
            this.sessions = rawSessions;
            this.computeSessionPaidFlags();
            this.populateMonthFilterOptions();

            // Tải điểm số (Phase 3) — lấy TẤT CẢ điểm của giáo viên hiện tại 1 lần,
            // lọc theo học sinh ở phía frontend khi đổi "Đang chọn" để khỏi phải
            // gọi lại API mỗi lần đổi học sinh.
            try {
                const resScores = await this.authFetch(`${API_BASE_URL}/api/scores`);
                this.scores = resScores.ok ? await resScores.json() : [];
            } catch (scoreErr) {
                console.error('[loadData] Lỗi tải điểm số:', scoreErr.message);
                this.scores = [];
            }

            this.populateStudentPickers();
            // QUAN TRỌNG: trước đây loadData() chỉ cập nhật dữ liệu trong bộ nhớ
            // (this.students/this.sessions) mà KHÔNG vẽ lại giao diện. Vì các thao
            // tác thêm/sửa/xoá học sinh, buổi học... đều gọi loadData() sau khi API
            // thành công, hậu quả là dữ liệu mới đã có nhưng màn hình vẫn hiện dữ
            // liệu cũ cho tới khi người dùng F5 (F5 chạy lại toàn bộ init() bao gồm
            // cả bước vẽ giao diện). Fix: gọi luôn updateAllViews() ở đây để mọi nơi
            // dùng loadData() đều tự động cập nhật UI ngay lập tức. Chỉ gọi khi đã
            // đăng nhập (this.currentUser tồn tại) vì lúc mới mở trang (chưa đăng
            // nhập) chưa cần vẽ các bảng/biểu đồ của trang chính.
            if (this.currentUser) {
                this.updateAllViews();
            }
        } catch (err) {
            console.error("Lỗi khi kết nối API Server:", err.message);
            // Fallback to localStorage if server is offline
            if (!localStorage.getItem('pinky_students')) {
                localStorage.setItem('pinky_students', JSON.stringify(MOCK_STUDENTS));
                localStorage.setItem('pinky_sessions', JSON.stringify(MOCK_SESSIONS));
            }
            this.students = JSON.parse(localStorage.getItem('pinky_students')) || [];
            this.sessions = JSON.parse(localStorage.getItem('pinky_sessions')) || [];
            this.populateStudentPickers();
            if (this.currentUser) {
                this.updateAllViews();
            }
        }
    }

    async saveData() {
        this.computeSessionPaidFlags();
        localStorage.setItem('pinky_students', JSON.stringify(this.students));
        localStorage.setItem('pinky_sessions', JSON.stringify(this.sessions));
        this.updateAllViews();
    }

    // Từ trạng thái Paid RIÊNG của từng học sinh (sess.studentDetails[id].paid,
    // nguồn dữ liệu chính thức), tính thêm 1 cờ tổng hợp sess.paid = true CHỈ
    // KHI tất cả học sinh trong buổi đó đã đóng tiền. Cờ tổng hợp này chỉ dùng
    // để hiển thị nhanh (ví dụ: tô màu buổi học trên lịch tuần), KHÔNG được
    // dùng để tính toán học phí — mọi phép tính học phí phải đọc trực tiếp
    // sess.studentDetails[studentId].paid của từng em.
    computeSessionPaidFlags() {
        (this.sessions || []).forEach(sess => {
            const ids = sess.studentIds || [];
            sess.paid = ids.length > 0 && ids.every(sid => sess.studentDetails && sess.studentDetails[sid] && sess.studentDetails[sid].paid);
        });
    }

    registerEvents() {
        // Bộ chọn màu giao diện (3 chấm màu ở cuối sidebar)
        this.bindThemeSwitcher();

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

        // Link "Quên mật khẩu?" — app chưa có luồng tự khôi phục mật khẩu qua
        // email/SMS, nên chỉ hướng dẫn liên hệ giáo viên/quản trị viên (người
        // có quyền reset mật khẩu tài khoản) thay vì hiển thị form không hoạt động.
        const forgotLink = document.getElementById('loginForgotLink');
        if (forgotLink) {
            forgotLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.showToast('Vui lòng liên hệ giáo viên hoặc quản trị viên hệ thống để được cấp lại mật khẩu.', 'info');
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
                this.showToast("Đã chuyển sang học sinh: " + this.getStudentName(this.currentStudentId), "success");
            });
        }

        // Nút "Thêm điểm" ở trang Điểm số
        const addScoreBtnEl = document.getElementById('addScoreBtn');
        if (addScoreBtnEl) {
            addScoreBtnEl.addEventListener('click', () => this.openAddScoreModal());
        }

        // Form thêm/sửa điểm
        const scoreFormEl = document.getElementById('scoreForm');
        if (scoreFormEl) {
            scoreFormEl.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveScore();
            });
        }

        // Weekly calendar navigation (Lịch dạy & Chấm công)
        document.getElementById('prevWeekBtn').addEventListener('click', () => {
            const d = new Date(this.currentWeekStart);
            d.setDate(d.getDate() - 7);
            this.currentWeekStart = d;
            this.renderWeeklyCalendar();
        });
        document.getElementById('nextWeekBtn').addEventListener('click', () => {
            const d = new Date(this.currentWeekStart);
            d.setDate(d.getDate() + 7);
            this.currentWeekStart = d;
            this.renderWeeklyCalendar();
        });
        document.getElementById('todayWeekBtn').addEventListener('click', () => {
            this.currentWeekStart = this.getMonday(new Date());
            this.renderWeeklyCalendar();
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
            document.getElementById('sessionLoggerForm').reset();
            delete document.getElementById('sessionPrice').dataset.userEdited;
            const today = this.toISODateOnly(new Date());
            document.getElementById('sessionDate').value = today;
            this.renderStudentSelectionGrid('studentsCheckboxGrid');
        });

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

        // Form Submit: Trợ lý AI — gửi câu hỏi
        document.getElementById('aiChatForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendAiChatMessage();
        });

        // Nút xoá hội thoại Trợ lý AI
        document.getElementById('btnClearAiChat').addEventListener('click', () => {
            this.clearAiChat();
        });

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
    }

    showLoginPage() {
        document.getElementById('loginPage').classList.remove('hidden');
        document.querySelector('.sidebar').classList.add('hidden');
        document.querySelector('.main-content').classList.add('hidden');
        document.getElementById('logoutBtn').style.display = 'none';
        this.currentUser = null;
        this.currentRole = null;
        document.getElementById('sidebarUserName').innerText = 'Chưa đăng nhập';
        document.getElementById('sidebarUserRole').innerText = 'Vui lòng đăng nhập';
    }

    showAppPage() {
        document.getElementById('loginPage').classList.add('hidden');
        document.querySelector('.sidebar').classList.remove('hidden');
        document.querySelector('.main-content').classList.remove('hidden');
        document.getElementById('logoutBtn').style.display = 'inline-flex';
    }

    async onLoginSuccess(user, save = true) {
        this.currentUser = user;
        this.currentRole = user.role;
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
    }

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
    }

    handleLogout() {
        localStorage.removeItem('pinky_current_user');
        this.showLoginPage();
        this.showToast('Bạn đã đăng xuất.', 'success');
    }

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
        } else if (role === 'assistant') {
            navDashboard.style.display = 'flex';
            navLogs.style.display = 'flex';
            navScores.style.display = 'flex';
            navTuition.style.display = 'flex';
            navScheduler.style.display = 'flex';
            navStudents.style.display = 'flex'; // TA can view classes/students of their assigned teacher
            navUsers.style.display = 'none';
            navAiChat.style.display = 'flex';
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
        }

        // Trigger UI updates
        this.updateAllViews();
        const roleLabel = role === 'admin' ? 'Quản trị viên' : role === 'teacher' ? 'Giáo viên' : role === 'assistant' ? 'Trợ giảng' : 'Học sinh';
        this.showToast(`Đã chuyển sang vai trò: ${roleLabel}`, "success");
    }

    populateStudentPickers() {
        const globalPicker = document.getElementById('globalStudentPicker');
        const scoresPicker = document.getElementById('scoresStudentPicker');
        globalPicker.innerHTML = '';
        if (scoresPicker) scoresPicker.innerHTML = '';

        this.students.forEach(st => {
            const opt = document.createElement('option');
            opt.value = st.id;
            opt.innerText = `${st.name} (${st.class})`;
            globalPicker.appendChild(opt);

            if (scoresPicker) scoresPicker.appendChild(opt.cloneNode(true));
        });

        if (this.students.length > 0) {
            // Restore selection if exists
            if (this.students.find(s => s.id === this.currentStudentId)) {
                globalPicker.value = this.currentStudentId;
            } else {
                this.currentStudentId = this.students[0].id;
                globalPicker.value = this.currentStudentId;
            }
            if (scoresPicker) scoresPicker.value = this.currentStudentId;
        }

        // Also render checkboxes in scheduler logger form
        this.renderStudentSelectionGrid('studentsCheckboxGrid');
        this.renderStudentSelectionGrid('editStudentsCheckboxGrid');
    }

    // Bỏ dấu tiếng Việt để tìm kiếm không phân biệt có dấu/không dấu
    // (VD gõ "quynh" vẫn tìm ra "Quỳnh").
    removeVietnameseTones(str) {
        return (str || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd').replace(/Đ/g, 'D')
            .toLowerCase();
    }

    renderStudentSelectionGrid(containerId) {
        const prefix = containerId === 'studentsCheckboxGrid' ? 'session' : 'editSession';
        const typeSelectId = prefix === 'session' ? 'sessionType' : 'editSessionType';
        const grid = document.getElementById(containerId);
        grid.innerHTML = '';
        this.students.forEach(st => {
            const label = document.createElement('label');
            label.className = 'student-check-item';

            // Chuỗi dùng để tìm kiếm/lọc: tên + lớp đầy đủ ("Lớp 6") + số lớp
            // riêng ("6") — để gõ "6", "lớp 6" hay "Lớp 6" đều lọc ra đúng.
            const classNumberOnly = (st.class || '').replace(/lớp/i, '').trim();
            label.dataset.search = this.removeVietnameseTones(`${st.name} ${st.class} ${classNumberOnly}`);

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = st.id;
            checkbox.name = containerId === 'studentsCheckboxGrid' ? 'sessionStudents' : 'editSessionStudents';
            
            // Auto check if it's the current selected student
            if (st.id === this.currentStudentId && containerId === 'studentsCheckboxGrid') {
                checkbox.checked = true;
            }

            // Học riêng (private) => chỉ được chọn đúng 1 học sinh: hành xử như radio.
            // QUAN TRỌNG: đọc lại giá trị "riêng/chung" MỚI NHẤT ngay trong lúc bấm,
            // thay vì dùng biến isPrivate đã "chốt cứng" từ lúc vẽ checkbox lần đầu.
            // Trước đây dùng isPrivate (đọc 1 lần khi render) khiến việc đổi loại
            // buổi học từ "riêng" sang "chung" KHÔNG cập nhật hành vi checkbox,
            // nên vẫn bị ép chỉ chọn 1 học sinh dù đã chọn "Học chung".
            checkbox.addEventListener('change', () => {
                const isPrivateNow = document.getElementById(typeSelectId).value !== 'chung';
                if (isPrivateNow && checkbox.checked) {
                    grid.querySelectorAll('input[type="checkbox"]').forEach(other => {
                        if (other !== checkbox) other.checked = false;
                    });
                }
                // Học sinh vừa đổi -> cho phép gợi ý lại học phí cơ bản của
                // học sinh MỚI (xóa cờ "người dùng đã tự sửa" của lần chọn trước).
                const priceInputId = prefix === 'session' ? 'sessionPrice' : 'editSessionPrice';
                const priceEl = document.getElementById(priceInputId);
                if (priceEl) delete priceEl.dataset.userEdited;
                this.updateSessionPricing(prefix);
            });

            const span = document.createElement('span');
            span.innerText = `${st.name} - ${st.class}`;
            
            label.appendChild(checkbox);
            label.appendChild(span);
            grid.appendChild(label);
        });

        // Giữ nguyên từ khóa đang lọc (nếu có) khi lưới được vẽ lại — tránh
        // việc mở modal Sửa buổi học lại hiện ra danh sách đầy đủ chưa lọc.
        const searchInputId = containerId === 'studentsCheckboxGrid' ? 'studentsCheckboxSearch' : 'editStudentsCheckboxSearch';
        const searchInput = document.getElementById(searchInputId);
        if (searchInput) this.filterStudentCheckboxGrid(containerId, searchInput.value);

        this.updateSessionPricing(prefix);
    }

    // Ẩn/hiện các học sinh trong lưới checkbox theo từ khóa gõ vào ô tìm kiếm
    // (so khớp theo tên HOẶC theo lớp, không phân biệt dấu/không dấu/hoa thường).
    filterStudentCheckboxGrid(gridId, keyword) {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        const kw = this.removeVietnameseTones((keyword || '').trim());
        grid.querySelectorAll('.student-check-item').forEach(label => {
            const match = !kw || (label.dataset.search || '').includes(kw);
            label.style.display = match ? '' : 'none';
        });
    }

    // Áp dụng quy tắc "Học riêng chỉ 1 học sinh / Học chung nhiều học sinh" khi
    // đổi loại buổi học, và cập nhật lại nhãn + đơn giá tương ứng.
    applySessionTypeRules(prefix) {
        const typeSelectId = prefix === 'session' ? 'sessionType' : 'editSessionType';
        const gridId = prefix === 'session' ? 'studentsCheckboxGrid' : 'editStudentsCheckboxGrid';
        const priceLabelId = prefix === 'session' ? 'sessionPriceLabel' : 'editSessionPriceLabel';
        const isGroup = document.getElementById(typeSelectId).value === 'chung';

        const priceLabel = document.getElementById(priceLabelId);
        if (priceLabel) {
            priceLabel.innerText = isGroup ? 'Đơn giá buổi học (VNĐ/học sinh)' : 'Học phí buổi học (VNĐ)';
        }

        if (!isGroup) {
            // Chuyển sang "riêng": nếu đang chọn nhiều hơn 1 học sinh thì chỉ giữ lại học sinh đầu tiên.
            const checked = document.querySelectorAll(`#${gridId} input[type="checkbox"]:checked`);
            checked.forEach((cb, idx) => { if (idx > 0) cb.checked = false; });
        }

        // Đổi loại buổi học -> cho phép gợi ý lại học phí (xóa cờ "đã tự sửa").
        const priceInputId = prefix === 'session' ? 'sessionPrice' : 'editSessionPrice';
        const priceEl = document.getElementById(priceInputId);
        if (priceEl) delete priceEl.dataset.userEdited;

        this.updateSessionPricing(prefix);
    }

    // Tính "Tổng thu buổi học": học riêng = đơn giá nhập; học chung = đơn giá/học sinh
    // x SỐ HỌC SINH CÓ ĐÓNG HỌC PHÍ (loại trừ học sinh học phí 0đ ra khỏi phép nhân,
    // vì các em này không đóng tiền nên không được tính vào tổng thu buổi học).
    updateSessionPricing(prefix) {
        const typeSelectId = prefix === 'session' ? 'sessionType' : 'editSessionType';
        const gridName = prefix === 'session' ? 'sessionStudents' : 'editSessionStudents';
        const priceInputId = prefix === 'session' ? 'sessionPrice' : 'editSessionPrice';
        const totalDisplayId = prefix === 'session' ? 'sessionTotalPriceDisplay' : 'editSessionTotalPriceDisplay';

        const typeEl = document.getElementById(typeSelectId);
        const priceEl = document.getElementById(priceInputId);
        const totalEl = document.getElementById(totalDisplayId);
        if (!typeEl || !priceEl || !totalEl) return;

        const isGroup = typeEl.value === 'chung';
        const checkedBoxes = Array.from(document.querySelectorAll(`input[name="${gridName}"]:checked`));
        const checkedCount = checkedBoxes.length;
        // Số học sinh THỰC SỰ đóng học phí trong buổi (bỏ qua các em có học phí
        // cơ bản = 0đ — ví dụ học miễn phí/học thử) — dùng số này để nhân với
        // đơn giá/học sinh khi tính tổng thu của buổi học chung.
        const payingCount = checkedBoxes.filter(cb => {
            const student = this.students.find(s => s.id === cb.value);
            return student && Number(student.basePrice) > 0;
        }).length;
        const unitPrice = this.parsePriceValue(priceEl.value);

        // Học riêng, tự động gợi ý học phí cơ bản của học sinh khi chỉ chọn 1 em
        // — nhưng CHỈ khi giáo viên chưa tự tay đổi lựa chọn học phí (đánh dấu
        // bằng priceEl.dataset.userEdited, được set ở sự kiện 'change' của ô
        // học phí). Trước đây cờ này không bao giờ được set nên điều kiện luôn
        // đúng, khiến ô học phí bị ghi đè liên tục và không thể sửa được.
        if (!isGroup && checkedCount === 1 && !priceEl.dataset.userEdited) {
            const cb = document.querySelector(`input[name="${gridName}"]:checked`);
            const student = this.students.find(s => s.id === cb.value);
            if (student) {
                this.setPriceSelectValue(priceEl, student.basePrice);
            }
        }

        const total = isGroup ? unitPrice * Math.max(payingCount, 0) : (this.parsePriceValue(priceEl.value) || 0);
        totalEl.innerText = this.formatVND(total);
    }

    // Gán giá trị cho ô học phí (input số, có gợi ý mức giá 100k/120k/150k/
    // 180k/200k/250k qua danh sách datalist đi kèm). Ô này cho phép giáo viên
    // vừa gõ tay số tiền tuỳ ý, vừa bấm mũi tên để chọn nhanh 1 mức giá có
    // sẵn — nếu học phí cơ bản của học sinh không trùng mức giá nào đã có
    // trong danh sách gợi ý (VD giáo viên từng đặt 1 mức giá lẻ khác cho học
    // sinh đó), tự thêm tạm 1 option đúng bằng mức giá đó vào datalist để lần
    // sau vẫn thấy trong danh sách gợi ý.
    // Chuyển chuỗi học phí giáo viên gõ/chọn (VD "250.000 đ", "250000", hay
    // "250.000") thành số nguyên VNĐ, bỏ qua mọi ký tự không phải chữ số.
    parsePriceValue(str) {
        const digitsOnly = String(str || '').replace(/[^0-9]/g, '');
        return digitsOnly ? parseInt(digitsOnly, 10) : 0;
    }

    setPriceSelectValue(selectEl, value) {
        if (!selectEl) return;
        const val = this.parsePriceValue(value);
        const display = this.formatVND(val);
        const listEl = selectEl.list;
        if (listEl && !Array.from(listEl.options).some(o => o.value === display)) {
            const opt = document.createElement('option');
            opt.value = display;
            listEl.appendChild(opt);
        }
        selectEl.value = display;
    }

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
            titleEl.innerText = "Nhật ký Học tập";
            subtitleEl.innerText = `Theo dõi tiến độ học tập và bài tập của học sinh: ${this.getStudentName(this.currentStudentId)}`;
        } else if (viewId === 'view-scores') {
            titleEl.innerText = "Điểm số";
            subtitleEl.innerText = `Điểm BTVN, kiểm tra, thái độ và biểu đồ tiến bộ của học sinh: ${this.getStudentName(this.currentStudentId)}`;
        } else if (viewId === 'view-ai-chat') {
            titleEl.innerText = "Trợ lý AI";
            subtitleEl.innerText = "Hỏi đáp dựa trên dữ liệu lịch dạy và điểm số thật trong tài khoản của bạn.";
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
    }

    updateAllViews() {
        this.renderDashboard();
        this.renderStudentLogs();
        this.renderScores();
        this.renderWeeklyCalendar();
        this.renderTuitionOverview();
        this.renderStudentList();
        if (this.currentRole === 'admin') {
            this.renderUsersTable();
        }
        
        // Hide role-restricted elements
        this.applyPermissions();
    }

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
            const formCard = document.getElementById('logger-form-card');
            if (formCard) formCard.style.display = 'block';
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
            const formCard = document.getElementById('logger-form-card');
            if (formCard) formCard.style.display = 'block';
            
            const priceFormGroup = document.getElementById('sessionPrice').parentElement;
            if (priceFormGroup) priceFormGroup.style.display = 'none';
        } else if (this.currentRole === 'student') {
            // Student role: hide forms and administrative tools completely
            document.querySelectorAll('.admin-tutor, .admin-only').forEach(el => {
                el.style.display = 'none';
            });
            const formCard = document.getElementById('logger-form-card');
            if (formCard) formCard.style.display = 'none';
        }
    }

    getStudentName(id) {
        const s = this.students.find(x => x.id === id);
        return s ? s.name : "Học sinh";
    }

    getStudentSubject(id) {
        const s = this.students.find(x => x.id === id);
        return s ? s.subject : "Toán";
    }

    getStudentClass(id) {
        const s = this.students.find(x => x.id === id);
        return s ? s.class : "Lớp";
    }

    formatVND(amount) {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    }

    // Trả về danh sách studentId trong 1 buổi học CÓ đóng học phí (loại trừ
    // học sinh có học phí cơ bản = 0đ — VD học miễn phí/học thử). Dùng để
    // chia đều "Tổng thu buổi học" và tính "học phí chưa đóng" cho đúng,
    // tránh việc học sinh 0đ vừa bị tính vào tổng thu vừa bị tính là "nợ học phí".
    getPayingStudentIds(sess) {
        return (sess.studentIds || []).filter(sid => {
            const student = this.students.find(s => s.id === sid);
            return student && Number(student.basePrice) > 0;
        });
    }

    // --- VIEW 1: DASHBOARD ---
    renderDashboard() {
        // Set stats cards counts
        document.getElementById('stat-total-students').innerText = this.students.length;

        const monthSessions = this.filterByMonth(this.sessions);
        
        let totalSessions = 0;
        let totalHours = 0;
        let unpaidTuition = 0;

        if (this.currentRole === 'student') {
            // Only count for current student
            const studentSessions = monthSessions.filter(sess => sess.studentIds.includes(this.currentStudentId));
            totalSessions = studentSessions.length;
            totalHours = studentSessions.reduce((acc, curr) => acc + parseFloat(curr.duration), 0);
            
            // Sum unpaid tuition for this student (dựa trên trạng thái Paid
            // RIÊNG của chính học sinh này trong từng buổi, TÁCH BIỆT hoàn toàn
            // với trạng thái "đã dạy/chưa dạy" VÀ với trạng thái đóng tiền của
            // các bạn học chung buổi khác). Nếu chính học sinh này học phí 0đ
            // thì không bao giờ bị tính là "chưa đóng" (vì không có gì để đóng).
            studentSessions.forEach(sess => {
                const payingIds = this.getPayingStudentIds(sess);
                if (!payingIds.includes(this.currentStudentId)) return;
                const detail = sess.studentDetails && sess.studentDetails[this.currentStudentId];
                if (!detail || !detail.paid) {
                    // Price divided by number of PAYING participants if it's a shared session, or full price
                    const partCount = payingIds.length || 1;
                    unpaidTuition += sess.price / partCount;
                }
            });
        } else {
            // Teacher & Assistant see all stats
            totalSessions = monthSessions.length;
            totalHours = monthSessions.reduce((acc, curr) => acc + parseFloat(curr.duration), 0);

            // Cộng dồn phần học phí CHƯA đóng của TỪNG học sinh trong từng buổi
            // (dựa trên Paid riêng của mỗi em, không dùng Completed, không dùng
            // cờ tổng hợp cấp buổi) — để buổi học chung chỉ tính đúng phần của
            // (các) học sinh thực sự chưa đóng, không tính cả buổi. Học sinh
            // học phí 0đ được loại trừ hoàn toàn khỏi phép chia lẫn khỏi vòng
            // lặp tính "chưa đóng" (không đóng tiền thì không thể "nợ" học phí).
            monthSessions.forEach(sess => {
                const payingIds = this.getPayingStudentIds(sess);
                const partCount = payingIds.length || 1;
                const portion = sess.price / partCount;
                payingIds.forEach(sid => {
                    const detail = sess.studentDetails && sess.studentDetails[sid];
                    if (!detail || !detail.paid) {
                        unpaidTuition += portion;
                    }
                });
            });
        }

        document.getElementById('stat-total-sessions').innerText = totalSessions;
        document.getElementById('stat-total-hours').innerText = totalHours.toFixed(1) + 'h';
        document.getElementById('stat-unpaid-tuition').innerText = this.formatVND(unpaidTuition);

        // Render today + tomorrow classes (lối tắt: bấm vào 1 ca sẽ mở đúng
        // bảng "Nhập nhanh nội dung buổi học" giống hệt khi bấm ca đó bên
        // Lịch dạy, vì dùng chung đúng 1 hàm openSessionQuickEntry(sessionId)
        // — không có 2 bản logic tách rời dễ lệch nhau).
        const todayDate = new Date();
        const tomorrowDate = new Date();
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const todayStr = this.toISODateOnly(todayDate);
        const tomorrowStr = this.toISODateOnly(tomorrowDate);

        const todayLabelEl = document.getElementById('today-date-label');
        const tomorrowLabelEl = document.getElementById('tomorrow-date-label');
        if (todayLabelEl) todayLabelEl.innerText = this.formatDateVN(todayStr);
        if (tomorrowLabelEl) tomorrowLabelEl.innerText = this.formatDateVN(tomorrowStr);

        this.renderDashboardDaySessions('today-sessions-container', todayStr, 'hôm nay');
        this.renderDashboardDaySessions('tomorrow-sessions-container', tomorrowStr, 'ngày mai');
    }

    // Vẽ danh sách ca dạy của MỘT ngày cụ thể vào 1 container trên Tổng quan.
    // Tách riêng thành hàm dùng chung cho cả "hôm nay" và "ngày mai" để chắc
    // chắn 2 khối luôn cùng 1 logic lọc/hiển thị/click, tránh copy-paste lệch nhau.
    renderDashboardDaySessions(containerId, dateStr, dayLabel) {
        const container = document.getElementById(containerId);
        if (!container) return;

        let daySessions = this.sessions.filter(s => s.date === dateStr);

        // Học sinh chỉ nên thấy ca dạy có mặt mình trên Tổng quan (đồng nhất
        // với cách các thẻ thống kê phía trên đã lọc riêng cho học sinh).
        if (this.currentRole === 'student') {
            daySessions = daySessions.filter(s => s.studentIds.includes(this.currentStudentId));
        }

        // Sắp xếp theo giờ bắt đầu để hiển thị đúng thứ tự trong ngày.
        daySessions = daySessions.slice().sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

        container.innerHTML = '';

        if (daySessions.length === 0) {
            container.innerHTML = `
                <div style="padding: 15px; text-align: center; color: var(--text-muted); font-size: 13.5px;"> Không có ca dạy nào được xếp ${dayLabel} (${this.formatDateVN(dateStr)}).
                </div>
            `;
            return;
        }

        daySessions.forEach(sess => {
            const item = document.createElement('div');
            item.style.padding = '12px';
            item.style.background = 'white';
            item.style.border = '1px solid var(--border-color)';
            item.style.borderRadius = '10px';
            item.style.marginBottom = '8px';
            item.style.cursor = 'pointer';
            item.title = 'Bấm để nhập/xem nội dung buổi học';
            item.addEventListener('click', () => this.openSessionQuickEntry(sess.id));

            const names = sess.studentIds.map(id => this.getStudentName(id)).join(', ');
            const badgeClass = sess.type === 'riêng' ? 'badge-rieng' : 'badge-chung';

            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                    <span style="font-weight: 600; font-size: 13px; color: var(--primary);">${sess.startTime} - ${sess.endTime}</span>
                    <span class="badge ${badgeClass}" style="font-size: 10px; padding: 2px 8px;">Học ${sess.type}</span>
                </div>
                <div style="font-size:14px; font-weight:700; color:var(--text-main);">${sess.sessionName ? this.escapeHtml(sess.sessionName) + ' — ' : ''}${names}</div>
                <div style="font-size:12px; color:var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 4px;">
                    ${sess.content ? sess.content.replace(/\n/g, ' | ') : 'Chưa có nội dung'}
                </div>
            `;
            container.appendChild(item);
        });
    }

    // --- VIEW 2: STUDENT LOGS (Image 1 replica) ---
    renderStudentLogs() {
        const studentId = this.currentStudentId;
        const studentName = this.getStudentName(studentId);
        const studentClass = this.getStudentClass(studentId);
        const studentSubject = this.getStudentSubject(studentId);

        // Header mapping
        document.getElementById('logStudentNameHeader').innerText = `${studentName} ${studentSubject} ${studentClass}`.toUpperCase();
        
        // Find all sessions involving this student, sorted chronologically
        const studentSessions = this.filterByMonth(this.sessions)
            .filter(sess => sess.studentIds.includes(studentId))
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        const tbody = document.getElementById('studentLogsTableBody');
        tbody.innerHTML = '';

        if (studentSessions.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 30px; color: var(--text-muted);">
                        Chưa có buổi học nào được ghi nhận cho học sinh này.
                    </td>
                </tr>
            `;
            return;
        }

        studentSessions.forEach((sess, idx) => {
            const tr = document.createElement('tr');

            const detail = sess.studentDetails[studentId] || { homework: 'Chưa làm', attitude: 'Tốt', individualComment: '', note: '' };

            // BÀI TẬP VỀ NHÀ: chỉ HIỂN THỊ (badge tĩnh), không cho sửa trực
            // tiếp ở bảng này nữa — giá trị luôn lấy từ dữ liệu chấm công đã
            // nhập ở Lịch dạy & Chấm công (quick entry) hoặc modal "Đánh giá".
            // Màu theo mức độ nghiêm trọng: "Không hoàn thành" (hoàn toàn chưa
            // làm gì) dùng màu đỏ cảnh báo mạnh hơn; "Chưa hoàn thành" (làm dở/
            // chưa xong) dùng màu xanh nhạt trung tính hơn.
            let hwClass = 'not-done'; // mặc định ('Chưa làm' cũ / Không hoàn thành) -> đỏ
            if (detail.homework === 'Hoàn thành') hwClass = 'done';
            if (detail.homework === 'Chưa hoàn thành') hwClass = 'pending';
            const homeworkBadge = `<span class="homework-badge ${hwClass}">${this.getHomeworkLabel(detail.homework)}</span>`;

            // Session Date display: dòng trên "Thứ 7", dòng dưới "23/05" (không gạch ngang)
            const dateStr = this.formatDateVNSplit(sess.date);

            // NỘI DUNG BUỔI HỌC: hiển thị text thuần, không bullet point.
            const contentText = (sess.content || '').trim();
            const contentHTML = `<div class="session-content-text">${contentText ? this.nl2brText(contentText) : '<span style="color:var(--text-muted);">Chưa có nội dung.</span>'}</div>`;

            // NHẬN XÉT CỦA GIÁO VIÊN: gộp thành 1 trường duy nhất, chỉ lấy
            // nhận xét RIÊNG của học sinh này từ chấm công (individualComment).
            const commentHTML = `<div class="comment-text">${detail.individualComment ? this.nl2brText(detail.individualComment) : 'Chưa nhận xét.'}</div>`;

            // Actions for edit
            const actionsHTML = `
                <button class="btn btn-secondary btn-sm" onclick="app.openUpdateLogModal('${sess.id}', '${studentId}')">Đánh giá</button>
            `;

            tr.innerHTML = `
                <td class="session-number-cell">
                    <span class="session-number-val">Buổi ${idx + 1}</span>
                    <span class="session-time-val">${sess.startTime} - ${sess.endTime}</span>
                </td>
                <td class="session-date-cell">${dateStr}</td>
                <td class="col-content">${contentHTML}</td>
                <td style="text-align:center;">${homeworkBadge}</td>
                <td><strong>${detail.attitude || 'Tập trung'}</strong></td>
                <td>${commentHTML}</td>
                <td><span style="font-size:14.5px; color:var(--text-muted);">${detail.note || '-'}</span></td>
                <td class="role-restricted admin-tutor log-export-hide">${actionsHTML}</td>
            `;

            tbody.appendChild(tr);
        });
    }

    // Chuyển giá trị lưu trong DB (giữ nguyên để tương thích ngược) thành
    // nhãn hiển thị đúng 3 lựa chọn cố định theo yêu cầu UI mới.
    getHomeworkLabel(value) {
        if (value === 'Hoàn thành') return 'Hoàn thành';
        if (value === 'Chưa hoàn thành') return 'Chưa hoàn thành';
        return 'Không hoàn thành'; // giá trị cũ 'Chưa làm' hoặc rỗng
    }

    // Escape + giữ xuống dòng khi hiển thị text thuần (không bullet)
    nl2brText(text) {
        return this.escapeHtml(text).replace(/\n/g, '<br>');
    }

    // --- VIEW 2B: SCORES MODULE (Phase 3: nhập điểm BTVN/Kiểm tra/Thái độ
    //     + Phase 4: biểu đồ tiến bộ / so sánh / tỷ lệ hoàn thành BTVN) ---

    getScoresForStudent(studentId) {
        return (this.scores || [])
            .filter(sc => sc.studentId === studentId)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    scoreTypeLabel(type) {
        if (type === 'BTVN') return 'BTVN';
        if (type === 'KiemTra') return 'Kiểm tra';
        if (type === 'ThaiDo') return 'Thái độ';
        return type;
    }

    scoreTypeBadgeClass(type) {
        if (type === 'BTVN') return 'type-btvn';
        if (type === 'KiemTra') return 'type-kiemtra';
        if (type === 'ThaiDo') return 'type-thaido';
        return '';
    }

    average(nums) {
        if (!nums || !nums.length) return null;
        return nums.reduce((a, b) => a + b, 0) / nums.length;
    }

    // Nhận xét tự động dựa trên điểm trung bình chung của học sinh đang chọn
    getAutoComment(avg) {
        if (avg === null) return 'Chưa có dữ liệu điểm để đưa ra nhận xét — hãy nhập điểm cho học sinh này.';
        if (avg >= 8.5) return 'Xuất sắc! Học sinh duy trì phong độ rất tốt, tiếp tục phát huy nhé.';
        if (avg >= 7) return 'Khá tốt. Học sinh nắm chắc kiến thức, nên chú ý thêm các dạng bài nâng cao.';
        if (avg >= 5.5) return 'Trung bình khá. Cần luyện tập thêm để cải thiện độ chắc chắn kiến thức.';
        if (avg >= 4) return 'Cần cố gắng hơn. Nên tăng cường ôn tập và làm bài tập đều đặn hơn.';
        return 'Đáng lo ngại. Nên trao đổi sớm với phụ huynh và lên kế hoạch phụ đạo thêm.';
    }

    renderScores() {
        const studentId = this.currentStudentId;
        const studentScores = this.getScoresForStudent(studentId);

        // ----- Bảng danh sách điểm (mới nhất lên đầu) -----
        const tbody = document.getElementById('scoresTableBody');
        if (tbody) {
            tbody.innerHTML = '';
            if (studentScores.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">Chưa có điểm nào được ghi nhận cho học sinh này.</td></tr>`;
            } else {
                [...studentScores].reverse().forEach(sc => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${this.formatDateVN(sc.date)}</td>
                        <td><span class="score-type-badge ${this.scoreTypeBadgeClass(sc.scoreType)}">${this.scoreTypeLabel(sc.scoreType)}</span></td>
                        <td style="text-align:center; font-weight:700; color:var(--primary);">${sc.scoreValue}</td>
                        <td>${sc.note ? this.escapeHtml(sc.note) : '<span style="color:var(--text-muted);">-</span>'}</td>
                        <td class="role-restricted admin-tutor" style="text-align:center;">
                            <button class="btn btn-secondary btn-sm" onclick="app.openEditScoreModal('${sc.id}')">Sửa</button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        }

        // ----- Bảng tóm tắt trung bình theo từng loại điểm -----
        const byType = t => studentScores.filter(s => s.scoreType === t).map(s => s.scoreValue);
        const avgBTVN = this.average(byType('BTVN'));
        const avgKT   = this.average(byType('KiemTra'));
        const avgTD   = this.average(byType('ThaiDo'));
        const avgAll  = this.average(studentScores.map(s => s.scoreValue));
        const fmt = v => v === null ? '-' : v.toFixed(1);

        const summaryGrid = document.getElementById('scoreSummaryGrid');
        if (summaryGrid) {
            summaryGrid.innerHTML = `
                <div class="score-summary-card">
                    <div class="score-summary-label">TB BTVN</div>
                    <div class="score-summary-value">${fmt(avgBTVN)}</div>
                </div>
                <div class="score-summary-card">
                    <div class="score-summary-label">TB Kiểm tra</div>
                    <div class="score-summary-value">${fmt(avgKT)}</div>
                </div>
                <div class="score-summary-card">
                    <div class="score-summary-label">TB Thái độ</div>
                    <div class="score-summary-value">${fmt(avgTD)}</div>
                </div>
                <div class="score-summary-card score-summary-overall">
                    <div class="score-summary-label">Điểm TB chung</div>
                    <div class="score-summary-value">${fmt(avgAll)}</div>
                </div>
            `;
        }

        // ----- Nhận xét tự động -----
        const commentBox = document.getElementById('scoreAutoComment');
        if (commentBox) {
            commentBox.style.display = 'flex';
            commentBox.innerHTML = `<span><strong>Nhận xét tự động:</strong> ${this.getAutoComment(avgAll)}</span>`;
        }

        // ----- Biểu đồ (Phase 4) -----
        this.renderScoreCharts(studentId, studentScores);

        // Đồng bộ picker riêng của trang Điểm số với picker toàn cục
        const scoresPicker = document.getElementById('scoresStudentPicker');
        if (scoresPicker && scoresPicker.value !== studentId) {
            scoresPicker.value = studentId;
        }
    }

    // - Biểu đồ đường: tiến bộ điểm theo thời gian (1 đường / loại điểm)
    // - Biểu đồ cột: so sánh điểm trung bình giữa 3 loại
    // - Biểu đồ tròn: tỷ lệ hoàn thành BTVN (dựa trên Homework của SessionDetails)
    renderScoreCharts(studentId, studentScores) {
        if (typeof Chart === 'undefined') return; // Chart.js chưa tải xong / lỗi mạng CDN
        this.charts = this.charts || {};

        // --- LINE CHART: tiến bộ điểm theo thời gian ---
        const lineCanvas = document.getElementById('scoreLineChart');
        if (lineCanvas) {
            const labels = studentScores.map(s => (this.formatDateVN(s.date).split(' - ')[1]) || s.date);
            const dataFor = type => studentScores.map(s => s.scoreType === type ? s.scoreValue : null);

            if (this.charts.line) this.charts.line.destroy();
            this.charts.line = new Chart(lineCanvas, {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        { label: 'BTVN',     data: dataFor('BTVN'),    borderColor: '#2563eb', backgroundColor: '#2563eb', spanGaps: true, tension: 0.3 },
                        { label: 'Kiểm tra', data: dataFor('KiemTra'), borderColor: '#dc2626', backgroundColor: '#dc2626', spanGaps: true, tension: 0.3 },
                        { label: 'Thái độ',  data: dataFor('ThaiDo'),  borderColor: '#16a34a', backgroundColor: '#16a34a', spanGaps: true, tension: 0.3 }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    scales: { y: { min: 0, max: 10 } },
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } }
                }
            });
        }

        // --- BAR CHART: so sánh trung bình theo loại điểm ---
        const barCanvas = document.getElementById('scoreBarChart');
        if (barCanvas) {
            const byTypeAvg = t => this.average(studentScores.filter(s => s.scoreType === t).map(s => s.scoreValue));
            if (this.charts.bar) this.charts.bar.destroy();
            this.charts.bar = new Chart(barCanvas, {
                type: 'bar',
                data: {
                    labels: ['BTVN', 'Kiểm tra', 'Thái độ'],
                    datasets: [{
                        label: 'Điểm trung bình',
                        data: [byTypeAvg('BTVN'), byTypeAvg('KiemTra'), byTypeAvg('ThaiDo')].map(v => v === null ? 0 : v),
                        backgroundColor: ['#2563eb', '#dc2626', '#16a34a'],
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    scales: { y: { min: 0, max: 10 } },
                    plugins: { legend: { display: false } }
                }
            });
        }

        // --- PIE CHART: tỷ lệ hoàn thành BTVN (theo dữ liệu Homework của buổi học) ---
        const pieCanvas = document.getElementById('homeworkPieChart');
        if (pieCanvas) {
            const relevantSessions = (this.sessions || []).filter(sess => sess.studentIds && sess.studentIds.includes(studentId));
            let done = 0, pending = 0, notDone = 0;
            relevantSessions.forEach(sess => {
                const hw = (sess.studentDetails[studentId] || {}).homework;
                if (hw === 'Hoàn thành') done++;
                else if (hw === 'Chưa hoàn thành') pending++;
                else notDone++;
            });

            if (this.charts.pie) this.charts.pie.destroy();
            this.charts.pie = new Chart(pieCanvas, {
                type: 'pie',
                data: {
                    labels: ['Hoàn thành', 'Chưa hoàn thành', 'Không hoàn thành'],
                    datasets: [{
                        data: [done, pending, notDone],
                        backgroundColor: ['#16a34a', '#f59e0b', '#dc2626']
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } }
                }
            });
        }
    }

    // --- SCORE CRUD (modal thêm/sửa điểm) ---
    openAddScoreModal() {
        if (!this.currentStudentId) {
            this.showToast('Vui lòng chọn học sinh trước khi thêm điểm.', 'error');
            return;
        }
        document.getElementById('scoreModalTitle').innerText = 'Thêm Điểm Mới';
        document.getElementById('editScoreId').value = '';
        document.getElementById('scoreType').value = 'BTVN';
        document.getElementById('scoreValue').value = '';
        document.getElementById('scoreDate').value = this.toISODateOnly(new Date());
        document.getElementById('scoreNote').value = '';
        document.getElementById('scoreDeleteBtn').style.display = 'none';
        document.getElementById('scoreModalStudentLabel').innerText = `Học sinh: ${this.getStudentName(this.currentStudentId)}`;
        this.openModal('scoreModal');
    }

    openEditScoreModal(scoreId) {
        const sc = (this.scores || []).find(s => s.id === scoreId);
        if (!sc) return;
        document.getElementById('scoreModalTitle').innerText = 'Sửa Điểm';
        document.getElementById('editScoreId').value = sc.id;
        document.getElementById('scoreType').value = sc.scoreType;
        document.getElementById('scoreValue').value = sc.scoreValue;
        document.getElementById('scoreDate').value = sc.date;
        document.getElementById('scoreNote').value = sc.note || '';
        document.getElementById('scoreDeleteBtn').style.display = 'inline-block';
        document.getElementById('scoreModalStudentLabel').innerText = `Học sinh: ${this.getStudentName(sc.studentId)}`;
        this.openModal('scoreModal');
    }

    async saveScore() {
        const id         = document.getElementById('editScoreId').value;
        const scoreType  = document.getElementById('scoreType').value;
        const scoreValue = document.getElementById('scoreValue').value;
        const date       = document.getElementById('scoreDate').value;
        const note       = document.getElementById('scoreNote').value.trim();

        if (scoreValue === '' || isNaN(parseFloat(scoreValue)) || parseFloat(scoreValue) < 0 || parseFloat(scoreValue) > 10) {
            this.showToast('Điểm số phải là số từ 0 đến 10.', 'error');
            return;
        }
        if (!date) {
            this.showToast('Vui lòng chọn ngày chấm điểm.', 'error');
            return;
        }

        try {
            let res;
            if (id) {
                res = await this.authFetch(`${API_BASE_URL}/api/scores/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ scoreType, scoreValue, date, note })
                });
            } else {
                res = await this.authFetch(`${API_BASE_URL}/api/scores`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: 'sc_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
                        studentId: this.currentStudentId,
                        scoreType, scoreValue, date, note
                    })
                });
            }
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload.error || 'Không thể lưu điểm.');

            this.showToast(id ? 'Đã cập nhật điểm.' : 'Đã thêm điểm mới.', 'success');
            this.closeModal('scoreModal');
            await this.loadScores();
        } catch (err) {
            this.showToast(err.message || 'Không thể lưu điểm.', 'error');
        }
    }

    async deleteScore() {
        const id = document.getElementById('editScoreId').value;
        if (!id) return;
        if (!confirm('Xóa điểm này? Hành động không thể hoàn tác.')) return;
        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/scores/${id}`, { method: 'DELETE' });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload.error || 'Không thể xóa điểm.');

            this.showToast('Đã xóa điểm.', 'success');
            this.closeModal('scoreModal');
            await this.loadScores();
        } catch (err) {
            this.showToast(err.message || 'Không thể xóa điểm.', 'error');
        }
    }

    // Tải lại riêng danh sách điểm (nhanh hơn loadData() vì không cần tải lại
    // students/sessions), dùng ngay sau khi thêm/sửa/xóa 1 điểm.
    async loadScores() {
        try {
            const url = this.currentRole === 'student' ? `${API_BASE_URL}/api/me/scores` : `${API_BASE_URL}/api/scores`;
            const res = await this.authFetch(url);
            this.scores = res.ok ? await res.json() : [];
        } catch (err) {
            console.error('[loadScores]', err.message);
        }
        this.renderScores();
    }

    // --- VIEW 3: WEEKLY CALENDAR (Lịch dạy & Chấm công) ---
    // Thay thế hoàn toàn "Danh sách chi tiết" (list) + "Chấm công tuần" (bảng)
    // cũ bằng MỘT lịch xem theo tuần duy nhất (giống Google Calendar / ảnh mẫu),
    // để dễ quan sát ca dạy theo ngày/giờ hơn.
    renderWeeklyCalendar() {
        const headerRow = document.getElementById('weekCalendarHeaderRow');
        const body = document.getElementById('weekCalendarBody');
        if (!headerRow || !body) return;

        const HOUR_START = this.CAL_HOUR_START;
        const HOUR_END = this.CAL_HOUR_END;
        const HOUR_HEIGHT = this.CAL_HOUR_HEIGHT;

        const weekStart = this.currentWeekStart; // Thứ 2
        const dayLabels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + i);
            days.push(d);
        }

        // Nhãn khoảng tuần đang xem, ví dụ: "01/07 - 07/07/2026"
        const rangeLabel = document.getElementById('weekRangeLabel');
        if (rangeLabel) {
            const first = days[0], last = days[6];
            const fmt = (d) => `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
            rangeLabel.innerText = `${fmt(first)} - ${fmt(last)}/${last.getFullYear()}`;
        }

        // Lọc buổi học nằm trong tuần đang xem (bỏ qua bộ lọc Tháng toàn cục vì
        // lịch tuần đã tự xác định phạm vi thời gian riêng của nó)
        const todayStr = this.toISODateOnly(new Date());
        const weekDateStrs = days.map(d => this.toISODateOnly(d));
        let weekSessions = this.sessions.filter(s => weekDateStrs.includes(s.date));

        if (this.currentRole === 'student') {
            weekSessions = weekSessions.filter(s => s.studentIds.includes(this.currentStudentId));
        }

        // ----- Thẻ thống kê tổng quan (tính theo tuần đang xem) -----
        const totalCount = weekSessions.length;
        const totalHrs = weekSessions.reduce((a, b) => a + parseFloat(b.duration || 0), 0);
        const privateCount = weekSessions.filter(s => s.type === 'riêng').length;
        const groupCount = weekSessions.filter(s => s.type === 'chung').length;
        let totalMoney = 0;
        weekSessions.forEach(s => {
            if (this.currentRole === 'student') {
                const payingIds = this.getPayingStudentIds(s);
                totalMoney += payingIds.includes(this.currentStudentId) ? (s.price / (payingIds.length || 1)) : 0;
            } else {
                totalMoney += s.price;
            }
        });
        const elSessions = document.getElementById('summary-total-sessions');
        const elHours = document.getElementById('summary-total-hours');
        const elRatio = document.getElementById('summary-ratio');
        const elMoney = document.getElementById('summary-total-money');
        if (elSessions) elSessions.innerText = totalCount;
        if (elHours) elHours.innerText = totalHrs.toFixed(1);
        if (elRatio) elRatio.innerText = `${privateCount}/${groupCount}`;
        if (elMoney) elMoney.innerText = this.formatVND(totalMoney);

        // ----- Header row: 7 cột ngày -----
        headerRow.innerHTML = '<div style="grid-column:1;"></div>' + days.map((d, i) => {
            const isToday = this.toISODateOnly(d) === todayStr;
            return `
                <div class="week-day-header ${isToday ? 'is-today' : ''}" style="grid-column:${i + 2};">
                    <span class="day-name">${dayLabels[i]}</span>
                    <span class="day-date">${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}</span>
                </div>
            `;
        }).join('');

        // ----- Body: nhãn giờ bên trái + đường kẻ ngang + 7 cột ngày -----
        // QUAN TRỌNG: nhãn giờ VÀ đường kẻ ngang được vẽ CÙNG 1 VÒNG LẶP, DÙNG
        // CHUNG 1 giá trị "top" duy nhất cho mỗi giờ — trước đây nhãn giờ định
        // vị bằng 1 công thức px (JS) còn đường kẻ vẽ bằng CSS background-image
        // repeating-gradient (công thức px KHÁC, tính riêng trong CSS) — 2 hệ
        // toạ độ tách rời như vậy rất dễ bị lệch nhau dù mỗi bên tưởng là đúng.
        // Nay cả nhãn lẫn đường kẻ đều lấy từ ĐÚNG 1 con số "top" nên không thể
        // lệch nhau được nữa.
        const hourCount = HOUR_END - HOUR_START;
        let hourLabelsHTML = '';
        let hourLinesHTML = '';
        for (let h = HOUR_START; h < HOUR_END; h++) {
            const top = (h - HOUR_START) * HOUR_HEIGHT;
            hourLabelsHTML += `<div class="week-hour-label" style="top:${top}px;">${h}:00</div>`;
            hourLinesHTML += `<div class="week-hour-line" style="top:${top}px;"></div>`;
        }

        let dayColumnsHTML = '';
        days.forEach((d, i) => {
            const dateStr = this.toISODateOnly(d);
            const daySessions = weekSessions.filter(s => s.date === dateStr);

            let blocksHTML = '';
            daySessions.forEach(sess => {
                const [sh, sm] = (sess.startTime || '00:00').split(':').map(Number);
                const [eh, em] = (sess.endTime || '00:00').split(':').map(Number);
                const startMin = Math.max(0, (sh - HOUR_START) * 60 + sm);
                let endMin = (eh - HOUR_START) * 60 + em;
                if (endMin <= startMin) endMin = startMin + 60; // fallback an toàn
                const top = (startMin / 60) * HOUR_HEIGHT;
                const height = Math.max(24, ((endMin - startMin) / 60) * HOUR_HEIGHT - 2);

                const names = sess.studentIds.map(id => this.getStudentName(id)).join(', ');
                const typeClass = sess.type === 'chung' ? 'type-chung' : 'type-rieng';
                const unpaidClass = !sess.paid ? 'is-unpaid' : '';
                const evtTitle = sess.sessionName ? sess.sessionName : names;
                const evtTooltip = sess.sessionName ? `${sess.sessionName} — ${names}` : names;

                // Buổi học đã diễn ra rồi (giờ bắt đầu đã ở quá khứ so với hiện
                // tại) thì KHÔNG cho kéo-thả đổi lịch nữa — chỉ xem/chấm công.
                const sessionStartDate = new Date(`${sess.date}T${sess.startTime || '00:00'}:00`);
                const isPast = sessionStartDate < new Date();
                const lockedClass = isPast ? 'is-locked' : '';

                blocksHTML += `
                    <div class="week-event-block ${typeClass} ${unpaidClass} ${lockedClass}"
                         style="top:${top}px; height:${height}px;"
                         data-session-id="${sess.id}"
                         data-locked="${isPast ? '1' : '0'}"
                         onclick="app.openSessionQuickEntry('${sess.id}')"
                         title="${this.escapeHtmlAttr(isPast ? evtTooltip + ' (đã qua, không thể kéo)' : evtTooltip)}">
                        <span class="evt-time">${sess.startTime}–${sess.endTime}</span>
                        <span class="evt-title">${this.escapeHtml(evtTitle)}</span>
                    </div>
                `;
            });

            dayColumnsHTML += `<div class="week-day-column" data-date="${dateStr}" style="height:${hourCount * HOUR_HEIGHT}px; grid-column:${i + 2}; grid-row:1 / -1;">${blocksHTML}</div>`;
        });

        // QUAN TRỌNG: gán grid-column CỐ ĐỊNH cho cả cột giờ (cột 1) và 7 cột
        // ngày (cột 2..8) thay vì để CSS Grid tự động xếp (auto-placement).
        // Trước đây không khai báo grid-column cho các phần tử này, nên thứ tự
        // hiển thị phụ thuộc vào thuật toán auto-placement của trình duyệt và
        // có thể bị đảo/lệch (cột giờ bị đẩy sang phải thay vì bên trái).
        // Các đường kẻ ngang (hourLinesHTML) được đặt NGOÀI cột ngày, trải dài
        // hết chiều rộng thật (position:absolute, left/right:0 so với chính
        // .week-calendar-body) — vẽ 1 lần duy nhất, đảm bảo luôn khớp nhãn giờ.
        body.innerHTML = `<div class="week-hour-gutter" style="grid-column:1; grid-row:1 / -1;">${hourLabelsHTML}</div>`
            + `<div class="week-hour-lines" style="grid-column:1 / -1; grid-row:1 / -1;">${hourLinesHTML}</div>`
            + dayColumnsHTML;
    }

    // Mở bảng nhập nhanh khi click vào 1 ca dạy trên lịch tuần. Nếu ca đó có
    // nhiều học sinh (học chung), hiện MỘT THẺ RIÊNG cho từng em để chấm/nhận
    // xét độc lập — không gộp chung nội dung của các em lại với nhau.
    // ===== KÉO-THẢ ĐỔI LỊCH TRÊN LỊCH TUẦN =====
    // Giữ chuột (hoặc giữ tay trên điện thoại) vào 1 buổi học rồi kéo sang
    // cột ngày khác / vị trí giờ khác để đổi lịch — vẫn giữ nguyên số giờ học
    // (thời lượng) ban đầu. Quy tắc:
    //   - Buổi học ĐÃ QUA (giờ bắt đầu đã ở quá khứ) không kéo được.
    //   - Giờ bắt đầu mới luôn được làm tròn về mốc 30 phút gần nhất.
    //   - Nếu khung giờ mới bị TRÙNG với 1 buổi học khác -> chặn lại, báo lỗi,
    //     buổi học tự trả về đúng vị trí cũ.
    //   - Thả xong là lưu luôn, không hỏi xác nhận lại.
    // Dùng Pointer Events (không dùng HTML5 Drag&Drop API) để hoạt động giống
    // nhau trên cả chuột lẫn cảm ứng, và để tự tính toán/snap vị trí theo ý mình.
    initCalendarDragToReschedule() {
        const body = document.getElementById('weekCalendarBody');
        if (!body) return;

        const DRAG_THRESHOLD = 6; // px di chuyển tối thiểu mới coi là "đang kéo" (để không phá vỡ click mở chi tiết)
        const SNAP_MINUTES = 30;

        body.addEventListener('pointerdown', (e) => {
            const block = e.target.closest('.week-event-block');
            if (!block) return;
            if (block.dataset.locked === '1') return; // buổi đã qua -> không cho kéo

            const column = block.closest('.week-day-column');
            if (!column) return;

            const blockRect = block.getBoundingClientRect();
            this.calDrag = {
                pointerId: e.pointerId,
                sessionId: block.dataset.sessionId,
                block,
                originalColumn: column,
                originalTop: parseFloat(block.style.top) || 0,
                grabOffsetY: e.clientY - blockRect.top, // điểm đang giữ nằm cách mép trên khối bao nhiêu px
                blockHeightPx: blockRect.height,
                startClientX: e.clientX,
                startClientY: e.clientY,
                isDragging: false
            };
        });

        document.addEventListener('pointermove', (e) => {
            const drag = this.calDrag;
            if (!drag || e.pointerId !== drag.pointerId) return;

            const movedX = Math.abs(e.clientX - drag.startClientX);
            const movedY = Math.abs(e.clientY - drag.startClientY);
            if (!drag.isDragging) {
                if (movedX < DRAG_THRESHOLD && movedY < DRAG_THRESHOLD) return;
                // Bắt đầu kéo thật sự
                drag.isDragging = true;
                drag.block.classList.add('is-dragging');
                drag.block.setPointerCapture && drag.block.setPointerCapture(drag.pointerId);
            }

            // Xác định cột ngày đang ở dưới con trỏ (so khoảng cách trái/phải của
            // mỗi cột với vị trí X hiện tại của con trỏ)
            const columns = Array.from(body.querySelectorAll('.week-day-column'));
            let targetColumn = drag.originalColumn;
            for (const col of columns) {
                const rect = col.getBoundingClientRect();
                if (e.clientX >= rect.left && e.clientX < rect.right) {
                    targetColumn = col;
                    break;
                }
            }
            if (targetColumn !== drag.block.parentElement) {
                targetColumn.appendChild(drag.block);
            }

            // Tính vị trí top mới theo con trỏ, snap về mốc 30 phút
            const colRect = targetColumn.getBoundingClientRect();
            let newTopPx = e.clientY - colRect.top - drag.grabOffsetY;
            const totalMinutes = (this.CAL_HOUR_END - this.CAL_HOUR_START) * 60;
            const pxPerMinute = this.CAL_HOUR_HEIGHT / 60;
            let minutesFromStart = newTopPx / pxPerMinute;
            minutesFromStart = Math.round(minutesFromStart / SNAP_MINUTES) * SNAP_MINUTES;
            // Không cho kéo vượt ra ngoài khung giờ hiển thị 06:00 - 22:00
            const durationMinutes = Math.round((drag.blockHeightPx + 2) / pxPerMinute / SNAP_MINUTES) * SNAP_MINUTES || SNAP_MINUTES;
            minutesFromStart = Math.max(0, Math.min(minutesFromStart, totalMinutes - durationMinutes));
            newTopPx = minutesFromStart * pxPerMinute;

            drag.block.style.top = `${newTopPx}px`;
            drag.pendingDate = targetColumn.dataset.date;
            drag.pendingMinutesFromStart = minutesFromStart;
        });

        const endDrag = (e) => {
            const drag = this.calDrag;
            if (!drag || e.pointerId !== drag.pointerId) return;
            this.calDrag = null;
            drag.block.classList.remove('is-dragging');

            if (!drag.isDragging) return; // chỉ là 1 cú click bình thường, không kéo gì cả

            const sess = this.sessions.find(s => s.id === drag.sessionId);
            if (!sess || drag.pendingDate == null) {
                this.renderWeeklyCalendar();
                return;
            }

            const toHHMM = (mins) => {
                const h = this.CAL_HOUR_START + Math.floor(mins / 60);
                const m = mins % 60;
                return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
            };
            const [oh, om] = (sess.startTime || '00:00').split(':').map(Number);
            const [eh, em] = (sess.endTime || '00:00').split(':').map(Number);
            const durationMin = Math.max(SNAP_MINUTES, (eh * 60 + em) - (oh * 60 + om));

            const newDate = drag.pendingDate;
            const newStartTime = toHHMM(drag.pendingMinutesFromStart);
            const newEndTime = toHHMM(drag.pendingMinutesFromStart + durationMin);

            // Không đổi gì cả -> khỏi cần lưu
            if (newDate === sess.date && newStartTime === sess.startTime && newEndTime === sess.endTime) {
                this.renderWeeklyCalendar();
                return;
            }

            // Trùng lịch với buổi khác -> chặn lại, trả buổi học về đúng vị trí cũ
            const overlap = this.findOverlappingSession(newDate, newStartTime, newEndTime, sess.id);
            if (overlap) {
                this.showToast(
                    `Khung giờ ${newStartTime}-${newEndTime} ngày ${this.formatDateVN(newDate)} đang trùng với buổi học khác, không thể đặt vào đây!`,
                    "error"
                );
                this.renderWeeklyCalendar();
                return;
            }

            this.moveSessionByDrag(sess.id, newDate, newStartTime, newEndTime);
        };
        document.addEventListener('pointerup', endDrag);
        document.addEventListener('pointercancel', endDrag);
    }

    // Lưu lịch mới (ngày + giờ bắt đầu/kết thúc) sau khi kéo-thả 1 buổi học
    // trên Lịch tuần — cùng cơ chế lưu server/offline như handleEditSession.
    async moveSessionByDrag(sessionId, newDate, newStartTime, newEndTime) {
        const sess = this.sessions.find(s => s.id === sessionId);
        if (!sess) return;

        const updatedSession = { ...sess, date: newDate, startTime: newStartTime, endTime: newEndTime };
        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/sessions/${sessionId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedSession)
            });
            if (!res.ok) throw new Error("Server error");
            await this.loadData();
        } catch (err) {
            console.warn("API lỗi, lưu offline: ", err.message);
            sess.date = newDate;
            sess.startTime = newStartTime;
            sess.endTime = newEndTime;
            await this.saveData();
        }
        this.showToast("Đã cập nhật lịch học!", "success");
    }

    openSessionQuickEntry(sessionId) {
        const sess = this.sessions.find(s => s.id === sessionId);
        if (!sess) return;

        document.getElementById('quickEntrySessionId').value = sess.id;
        document.getElementById('quickEntryTimeMeta').innerText = `${sess.startTime} - ${sess.endTime} (${sess.duration} giờ) — Học ${sess.type}`;
        document.getElementById('quickEntryDateMeta').innerText = this.formatDateVN(sess.date);
        document.getElementById('quickEntrySessionName').value = sess.sessionName || '';
        const isDone = this.isSessionCompleted(sess);
        const statusHint = document.getElementById('quickEntryStatusHint');
        if (statusHint) {
            statusHint.innerText = isDone ? '✓ Đã dạy (tự động theo lịch)' : '⏳ Sắp tới — chưa đến giờ dạy';
            statusHint.style.background = isDone ? 'var(--hw-done-bg, #dcfce7)' : 'var(--primary-soft)';
            statusHint.style.color = isDone ? 'var(--hw-done-text, #16a34a)' : 'var(--primary)';
        }
        document.getElementById('quickEntryContent').value = sess.content || '';

        // Sinh 1 thẻ nhập liệu RIÊNG cho từng học sinh trong ca, dữ liệu khởi
        // tạo lấy từ studentDetails hiện có của đúng em đó (nếu có).
        const listWrap = document.getElementById('quickEntryStudentsList');
        listWrap.innerHTML = sess.studentIds.map(stId => {
            const detail = sess.studentDetails[stId] || { homework: 'Chưa làm', attitude: '', individualComment: '', note: '' };
            const name = this.getStudentName(stId);
            const homeworkVal = detail.homework || 'Chưa làm';
            const attitude = detail.attitude === 'Tốt' ? '' : (detail.attitude || '');
            return `
                <div class="qe-student-card" data-student-id="${stId}">
                    <div class="qe-student-name">${this.escapeHtml(name)}</div>
                    <div class="qe-field-grid">
                        <div>
                            <label>Bài tập về nhà (BTVN)</label>
                            <select class="qe-homework">
                                <option value="Chưa làm" ${homeworkVal === 'Chưa làm' ? 'selected' : ''}>Không hoàn thành</option>
                                <option value="Chưa hoàn thành" ${homeworkVal === 'Chưa hoàn thành' ? 'selected' : ''}>Chưa hoàn thành</option>
                                <option value="Hoàn thành" ${homeworkVal === 'Hoàn thành' ? 'selected' : ''}>Hoàn thành</option>
                            </select>
                        </div>
                        <div>
                            <label>Ý thức học tập</label>
                            <input type="text" class="qe-attitude" placeholder="Nhập tự do..." value="${this.escapeHtmlAttr(attitude)}">
                        </div>
                        <div class="full-span">
                            <label>Nhận xét riêng cho ${this.escapeHtml(name)}</label>
                            <textarea class="qe-comment" rows="2" placeholder="Nhận xét riêng...">${detail.individualComment || ''}</textarea>
                        </div>
                        <div class="full-span">
                            <label>Ghi chú (Minitest,...)</label>
                            <input type="text" class="qe-note" placeholder="Ghi chú thêm..." value="${this.escapeHtmlAttr(detail.note || '')}">
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        this.openModal('quickSessionEntryModal');
    }

    // Escape giá trị chèn vào thuộc tính value="" để tránh vỡ HTML khi nội
    // dung có chứa dấu ngoặc kép
    escapeHtmlAttr(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    }

    // Escape đầy đủ khi chèn text thuần vào NỘI DUNG thẻ HTML (khác với
    // escapeHtmlAttr chỉ dùng cho value="..."), tránh vỡ layout hoặc lộ HTML
    // injection nếu giáo viên gõ dấu < > trong nội dung buổi học.
    escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // Thêm 1 bong bóng chat vào khung Trợ lý AI, trả về element vừa tạo (để
    // có thể sửa nội dung sau, ví dụ thay bong bóng "Đang trả lời..." bằng
    // câu trả lời thật khi API phản hồi xong).
    appendAiChatBubble(role, text, extraClass = '') {
        const wrap = document.getElementById('aiChatMessages');
        const msgEl = document.createElement('div');
        msgEl.className = `ai-chat-msg ${role === 'user' ? 'ai-chat-msg-user' : 'ai-chat-msg-bot'}`;
        const bubbleEl = document.createElement('div');
        bubbleEl.className = `ai-chat-bubble ${extraClass}`.trim();
        bubbleEl.innerText = text;
        msgEl.appendChild(bubbleEl);
        wrap.appendChild(msgEl);
        wrap.scrollTop = wrap.scrollHeight;
        return bubbleEl;
    }

    // Gửi câu hỏi tới /api/ai-chat kèm lịch sử hội thoại gần nhất — server sẽ
    // tự lấy đúng dữ liệu (lịch dạy/điểm số/học sinh) của giáo viên hiệu lực
    // ứng với tài khoản đang đăng nhập rồi mới hỏi AI, nên trợ lý luôn trả
    // lời trong đúng phạm vi dữ liệu được phép xem.
    async sendAiChatMessage() {
        const input = document.getElementById('aiChatInput');
        const sendBtn = document.getElementById('aiChatSendBtn');
        const message = input.value.trim();
        if (!message) return;

        this.appendAiChatBubble('user', message);
        this.aiChatHistory.push({ role: 'user', content: message });
        input.value = '';
        input.disabled = true;
        sendBtn.disabled = true;

        const loadingBubble = this.appendAiChatBubble('bot', 'Đang trả lời...', 'ai-chat-loading');

        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/ai-chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, history: this.aiChatHistory })
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload.error || 'Trợ lý AI hiện không phản hồi được.');

            loadingBubble.innerText = payload.reply;
            loadingBubble.classList.remove('ai-chat-loading');
            this.aiChatHistory.push({ role: 'assistant', content: payload.reply });
        } catch (err) {
            loadingBubble.innerText = err.message || 'Có lỗi xảy ra, vui lòng thử lại.';
            loadingBubble.classList.remove('ai-chat-loading');
            loadingBubble.classList.add('ai-chat-error');
            // Bỏ câu hỏi vừa hỏi khỏi lịch sử vì chưa có câu trả lời hợp lệ
            // tương ứng, tránh gửi lịch sử lệch nhịp ở lần hỏi tiếp theo.
            this.aiChatHistory.pop();
        } finally {
            input.disabled = false;
            sendBtn.disabled = false;
            input.focus();
        }
    }

    // Xoá toàn bộ hội thoại Trợ lý AI hiện tại (chỉ ở phía client) và quay
    // lại lời chào ban đầu.
    clearAiChat() {
        this.aiChatHistory = [];
        const wrap = document.getElementById('aiChatMessages');
        wrap.innerHTML = `
            <div class="ai-chat-msg ai-chat-msg-bot">
                <div class="ai-chat-bubble">Xin chào! Mình là trợ lý AI của NttClass. Bạn có thể hỏi mình về lịch dạy, điểm số hoặc thông tin học sinh — mình sẽ trả lời dựa trên dữ liệu thật trong tài khoản của bạn.</div>
            </div>
        `;
    }

    // Lưu bảng nhập nhanh: MỖI học sinh được lưu nhận xét RIÊNG của mình (đọc
    // trực tiếp từ thẻ tương ứng), rồi đồng bộ luôn về trang Nhật ký học tập
    // (studentDetails dùng chung nguồn dữ liệu với renderStudentLogs()).
    async saveQuickSessionEntry() {
        const id = document.getElementById('quickEntrySessionId').value;
        const sess = this.sessions.find(s => s.id === id);
        if (!sess) return;

        const content = document.getElementById('quickEntryContent').value.trim();
        const sessionName = document.getElementById('quickEntrySessionName').value.trim();
        const completed = this.isSessionCompleted(sess);

        const newStudentDetails = {};
        document.querySelectorAll('#quickEntryStudentsList .qe-student-card').forEach(card => {
            const stId = card.getAttribute('data-student-id');
            const homework = card.querySelector('.qe-homework').value.trim() || 'Chưa làm';
            const attitude = card.querySelector('.qe-attitude').value.trim() || 'Tốt';
            const individualComment = card.querySelector('.qe-comment').value.trim();
            const note = card.querySelector('.qe-note').value.trim();
            newStudentDetails[stId] = { homework, attitude, individualComment, note };
        });

        // Đã bỏ ô "Nhận xét chung cho cả lớp" khỏi form nhập nhanh (chỉ còn
        // nhận xét RIÊNG cho từng học sinh). Với buổi học riêng (1 học sinh),
        // generalComment vẫn mirror theo nhận xét riêng của em đó để tương
        // thích với những chỗ khác trong hệ thống còn đọc field này (VD xuất
        // CSV) — với buổi học chung, giữ nguyên giá trị generalComment cũ
        // (không có nơi nào chỉnh sửa nó nữa qua form nhập nhanh).
        let finalGeneralComment = sess.generalComment || '';
        if (sess.type !== 'chung') {
            const onlyStudentId = sess.studentIds[0];
            finalGeneralComment = (newStudentDetails[onlyStudentId] && newStudentDetails[onlyStudentId].individualComment) || '';
        }

        const updatedSession = {
            ...sess,
            content,
            sessionName,
            generalComment: finalGeneralComment,
            completed,
            studentDetails: newStudentDetails
        };

        this.setBtnLoading('saveQuickEntryBtn', true, 'Đang lưu...');
        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/sessions/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedSession)
            });
            if (!res.ok) throw new Error("Server error");
            await this.loadData();
        } catch (err) {
            console.warn("API lỗi, lưu offline: ", err.message);
            sess.content = content;
            sess.sessionName = sessionName;
            sess.generalComment = finalGeneralComment;
            sess.completed = completed;
            sess.studentDetails = newStudentDetails;
            await this.saveData();
        } finally {
            this.setBtnLoading('saveQuickEntryBtn', false);
        }

        this.closeModal('quickSessionEntryModal');
        this.updateAllViews();
        this.showToast("Đã lưu nhận xét riêng cho từng học sinh và đồng bộ sang Nhật ký học tập!", "success");
    }


    // --- VIEW 4: TUITION & PAYMENTS OVERVIEW ---
    renderTuitionOverview() {
        const tbody = document.getElementById('tuitionOverviewTableBody');
        tbody.innerHTML = '';

        let paidSum = 0;
        let unpaidSum = 0;

        // If student role, only calculate and show theirs
        let studentsList = [...this.students];
        if (this.currentRole === 'student') {
            studentsList = studentsList.filter(s => s.id === this.currentStudentId);
        }

        studentsList.forEach(st => {
            // CHỈ tính các buổi học ĐÃ THỰC SỰ DIỄN RA (đã qua giờ kết thúc so
            // với hiện tại) vào báo cáo học phí — buổi học nằm trong tương lai
            // (kể cả ngày mai, tuần sau) sẽ KHÔNG được cộng vào số buổi/số giờ/
            // tiền học phí ở đây nữa, dù đã có mặt trên lịch dạy.
            const studentSessions = this.filterByMonth(this.sessions).filter(sess => sess.studentIds.includes(st.id) && this.isSessionCompleted(sess));
            
            const totalSessionsCount = studentSessions.length;
            const totalHours = studentSessions.reduce((acc, curr) => acc + parseFloat(curr.duration), 0);

            // Calculate money details
            let totalTuitionEarned = 0;
            let paidTuition = 0;
            let unpaidTuition = 0;

            studentSessions.forEach(sess => {
                // Học sinh học phí 0đ không đóng góp gì vào tổng thu/đã đóng/chưa
                // đóng của chính mình — bỏ qua buổi này hoàn toàn cho em đó.
                const payingIds = this.getPayingStudentIds(sess);
                if (!payingIds.includes(st.id)) return;
                // Nếu là buổi học chung, chia đều theo SỐ HỌC SINH THỰC SỰ ĐÓNG
                // HỌC PHÍ trong buổi (không tính các bạn học phí 0đ vào mẫu số).
                const sessionPricePortion = sess.price / (payingIds.length || 1);
                totalTuitionEarned += sessionPricePortion;
                // Dùng field Paid RIÊNG của chính học sinh này trong buổi học đó
                // (sess.studentDetails[st.id].paid) — KHÔNG dùng cờ paid cấp cả
                // buổi, vì với buổi học chung, trạng thái đóng tiền của mỗi học
                // sinh phải độc lập với các bạn học cùng buổi.
                const detail = sess.studentDetails && sess.studentDetails[st.id];
                if (detail && detail.paid) {
                    paidTuition += sessionPricePortion;
                } else {
                    unpaidTuition += sessionPricePortion;
                }
            });

            paidSum += paidTuition;
            unpaidSum += unpaidTuition;

            const tr = document.createElement('tr');

            // Trạng thái học phí: dropdown đơn giản 2 lựa chọn (Đã thanh toán /
            // Chưa thanh toán) áp dụng cho TẤT CẢ buổi học của học sinh này.
            const isFullyPaid = totalSessionsCount > 0 && unpaidTuition === 0;
            const statusSelect = `
                <select class="tuition-status-select ${isFullyPaid ? 'status-paid' : 'status-unpaid'}"
                        data-student="${st.id}"
                        ${totalSessionsCount === 0 || this.currentRole === 'student' ? 'disabled' : ''}>
                    <option value="unpaid" ${!isFullyPaid ? 'selected' : ''}>Chưa thanh toán</option>
                    <option value="paid" ${isFullyPaid ? 'selected' : ''}>Đã thanh toán</option>
                </select>
            `;

            tr.innerHTML = `
                <td><strong>${st.name}</strong></td>
                <td>${st.class} - ${st.subject}</td>
                <td style="text-align:center; font-weight:600;">${totalSessionsCount}</td>
                <td style="text-align:center; font-weight:600; color:var(--primary);">${totalHours.toFixed(1)}</td>
                
                <td class="role-restricted admin-only" style="text-align:right; font-weight:600;">${this.formatVND(totalTuitionEarned)}</td>
                <td class="role-restricted admin-only" style="text-align:right; color:#16a34a; font-weight:600;">${this.formatVND(paidTuition)}</td>
                <td class="role-restricted admin-only" style="text-align:right; color:#dc2626; font-weight:600;">${this.formatVND(unpaidTuition)}</td>
                
                <td style="text-align:center;">${statusSelect}</td>
                <td class="role-restricted admin-only" style="text-align:center;">
                    <button type="button" class="btn btn-secondary btn-sm" style="padding:6px 14px;"
                            ${totalSessionsCount === 0 ? 'disabled' : ''}
                            onclick="app.openInvoiceModal('${st.id}')">Xuất phiếu</button>
                </td>
            `;

            tbody.appendChild(tr);
        });

        // Set top dashboard level sums
        document.getElementById('tuition-paid-sum').innerText = this.formatVND(paidSum);
        document.getElementById('tuition-unpaid-sum').innerText = this.formatVND(unpaidSum);
        document.getElementById('tuition-total-sum').innerText = this.formatVND(paidSum + unpaidSum);

        // Hook up 2-state tuition toggle change events
        document.querySelectorAll('.tuition-status-select').forEach(sel => {
            sel.addEventListener('change', (e) => {
                const studentId = sel.getAttribute('data-student');
                const paid = e.target.value === 'paid';
                this.setStudentPaidStatus(studentId, paid);
            });
        });
    }

    // (Đã tách sang file invoice-export.js: openInvoiceModal, setInvoiceQrImage,
    // recomputeInvoiceTotals, exportInvoice — gắn vào prototype khi invoice-export.js được nạp)


    // --- VIEW 5: STUDENT MANAGEMENT ---
    renderStudentList() {
        const tbody = document.getElementById('studentsTableBody');
        tbody.innerHTML = '';

        const filterEl = document.getElementById('studentGradeFilter');
        const gradeFilter = filterEl ? filterEl.value : '';

        let list = this.students;
        if (gradeFilter) {
            list = list.filter(st => st.gradeLevel === parseInt(gradeFilter));
        }

        if (list.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 30px; color: var(--text-muted);">
                        Chưa có học sinh nào${gradeFilter ? ' trong khối lớp này' : ''}. Bấm nút phía trên để thêm mới!
                    </td>
                </tr>
            `;
            return;
        }

        // Nhóm theo khối lớp (6 -> 12, khối chưa xác định đưa xuống cuối)
        const sorted = [...list].sort((a, b) => {
            const ga = a.gradeLevel || 999;
            const gb = b.gradeLevel || 999;
            if (ga !== gb) return ga - gb;
            return (a.name || '').localeCompare(b.name || '', 'vi');
        });

        let lastGrade = null;
        sorted.forEach((st, idx) => {
            if (st.gradeLevel !== lastGrade) {
                lastGrade = st.gradeLevel;
                const groupRow = document.createElement('tr');
                groupRow.innerHTML = `
                    <td colspan="6" style="background:var(--primary-soft); color:var(--primary); font-weight:700; padding:8px 14px; font-size:13px;"> ${st.gradeLevel ? 'Lớp ' + st.gradeLevel : 'Chưa xác định khối lớp'}
                    </td>`;
                tbody.appendChild(groupRow);
            }

            const tr = document.createElement('tr');

            const actionsHTML = `
                <div style="display:flex; justify-content:center; gap:8px; flex-wrap:wrap;">
                    <button class="btn btn-secondary btn-sm" onclick="app.openEditStudentModal('${st.id}')"> Sửa
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="app.openStudentAccountModal('${st.id}')" title="Tạo/quản lý tài khoản đăng nhập cho học sinh này">
                        🔑 ${st.username ? 'Tài khoản' : 'Tạo TK'}
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="app.deleteStudent('${st.id}')"> Xóa
                    </button>
                </div>
            `;

            tr.innerHTML = `
                <td style="text-align:center; font-weight:700; color:var(--text-muted);">${idx + 1}</td>
                <td><strong>${st.name}</strong></td>
                <td>${st.class}</td>
                <td><span class="badge" style="background:var(--primary-soft); color:var(--primary); border-color:var(--primary-light);">${st.subject}</span></td>
                <td class="role-restricted admin-only" style="text-align:right; font-weight:700;">${this.formatVND(st.basePrice)}</td>
                <td style="text-align:center;">${actionsHTML}</td>
            `;

            tbody.appendChild(tr);
        });
    }

    // --- FORM & DATA HANDLERS ---

    // Mở modal ở chế độ "Thêm mới"
    openAddStudentModal() {
        document.getElementById('addStudentForm').reset();
        document.getElementById('editStudentId').value = '';
        document.getElementById('studentModalTitle').innerText = 'Thêm Học Sinh Mới';
        document.getElementById('saveStudentBtn').innerText = 'Thêm học sinh';
        document.getElementById('studentGrade').value = '8';
        document.getElementById('studentBasePrice').value = 250000;
        this.openModal('addStudentModal');
    }

    // Mở modal ở chế độ "Chỉnh sửa", điền sẵn dữ liệu học sinh hiện tại
    openEditStudentModal(id) {
        if (this.currentRole !== 'teacher') {
            this.showToast("Chỉ Giáo viên mới có quyền chỉnh sửa học sinh!", "error");
            return;
        }
        const student = this.students.find(s => s.id === id);
        if (!student) return;

        document.getElementById('editStudentId').value = student.id;
        document.getElementById('studentModalTitle').innerText = 'Chỉnh Sửa Học Sinh';
        document.getElementById('saveStudentBtn').innerText = 'Lưu thay đổi';
        document.getElementById('studentName').value = student.name;
        document.getElementById('studentGrade').value = student.gradeLevel || 8;
        document.getElementById('studentSubject').value = student.subject;
        document.getElementById('studentBasePrice').value = student.basePrice;
        this.openModal('addStudentModal');
    }

    // 1. Thêm / Sửa học sinh (dùng chung 1 form — editStudentId rỗng nghĩa là thêm mới)
    // Bật/tắt trạng thái "Đang lưu..." cho nút submit — vô hiệu hóa nút trong
    // lúc chờ API phản hồi để tránh double-submit (bấm 2 lần liên tiếp tạo ra
    // 2 bản ghi trùng nhau, đặc biệt khi mạng chậm).
    setBtnLoading(btnId, isLoading, loadingText = 'Đang lưu...') {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        if (isLoading) {
            btn.dataset.originalText = btn.dataset.originalText || btn.innerText;
            btn.innerText = loadingText;
            btn.disabled = true;
        } else {
            btn.innerText = btn.dataset.originalText || btn.innerText;
            btn.disabled = false;
        }
    }

    // Kiểm tra 1 buổi học mới/sửa có bị TRÙNG GIỜ với buổi học khác đã có của
    // CÙNG giáo viên hay không (dựa trên khung [startTime, endTime) cùng ngày).
    // excludeId dùng khi đang SỬA 1 buổi học để không tự so trùng với chính nó.
    findOverlappingSession(date, startTime, endTime, excludeId = null) {
        const toMin = (t) => {
            const [h, m] = (t || '00:00').split(':').map(Number);
            return h * 60 + m;
        };
        const newStart = toMin(startTime);
        const newEnd = toMin(endTime);
        return this.sessions.find(s => {
            if (excludeId && s.id === excludeId) return false;
            if (s.date !== date) return false;
            const sStart = toMin(s.startTime);
            const sEnd = toMin(s.endTime);
            return newStart < sEnd && sStart < newEnd; // 2 khoảng thời gian giao nhau
        });
    }

    async handleAddStudent() {
        const editId = document.getElementById('editStudentId').value;
        const name = document.getElementById('studentName').value.trim();
        const gradeLevel = parseInt(document.getElementById('studentGrade').value);
        const sClass = `Lớp ${gradeLevel}`;
        const subject = document.getElementById('studentSubject').value.trim();
        const basePrice = parseInt(document.getElementById('studentBasePrice').value);

        if (!name || !gradeLevel || !subject) return;

        // Học phí/buổi phải là số nguyên KHÔNG ÂM (>= 0) — cho phép để 0 (VD học
        // sinh học miễn phí/học thử), chỉ chặn số âm hoặc giá trị không hợp lệ.
        if (isNaN(basePrice) || basePrice < 0) {
            this.showToast("Học phí/buổi không được là số âm!", "error");
            return;
        }

        const payload = { name, class: sClass, gradeLevel, subject, basePrice };

        this.setBtnLoading('saveStudentBtn', true, editId ? 'Đang cập nhật...' : 'Đang thêm...');
        try {
            if (editId) {
                const res = await this.authFetch(`${API_BASE_URL}/api/students/${editId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) throw new Error("Server error");
            } else {
                // ID sinh từ Date.now() có thể trùng nếu 2 request được gửi
                // trong cùng 1 mili-giây (double-click, mạng lag khiến bấm 2
                // lần) — thêm hậu tố ngẫu nhiên để tránh xung đột.
                payload.id = "hs_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
                const res = await this.authFetch(`${API_BASE_URL}/api/students`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) throw new Error("Server error");
            }
            await this.loadData();
        } catch (err) {
            console.warn("API lỗi, cập nhật offline: ", err.message);
            if (editId) {
                const student = this.students.find(s => s.id === editId);
                if (student) Object.assign(student, payload);
            } else {
                this.students.push({ ...payload, id: payload.id || ("hs_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8)) });
            }
            await this.saveData();
        } finally {
            this.setBtnLoading('saveStudentBtn', false);
        }

        this.populateStudentPickers();
        document.getElementById('addStudentForm').reset();
        this.closeModal('addStudentModal');
        this.showToast(editId ? "Cập nhật thông tin học sinh thành công!" : `Đã thêm học sinh ${name} thành công!`, "success");
    }

    async deleteStudent(id) {
        if (this.currentRole !== 'teacher') {
            this.showToast("Chỉ Giáo viên mới có quyền xóa học sinh!", "error");
            return;
        }

        if (confirm("Bạn có chắc chắn muốn xóa học sinh này? Tất cả các ca học và nhật ký liên quan sẽ bị xóa!")) {
            try {
                const res = await this.authFetch(`${API_BASE_URL}/api/students/${id}`, { method: 'DELETE' });
                if (!res.ok) throw new Error("Server error");
                await this.loadData();
            } catch (err) {
                console.warn("API lỗi, cập nhật offline: ", err.message);
                this.students = this.students.filter(s => s.id !== id);
                this.sessions.forEach(sess => {
                    sess.studentIds = sess.studentIds.filter(x => x !== id);
                    if (sess.studentDetails[id]) {
                        delete sess.studentDetails[id];
                    }
                });
                this.sessions = this.sessions.filter(sess => sess.studentIds.length > 0);
                await this.saveData();
            }

            this.populateStudentPickers();
            this.showToast("Đã xóa học sinh và các dữ liệu liên quan.", "success");
        }
    }

    // 2. Log Session (Add Session)
    async handleLogSession() {
        const type = document.getElementById('sessionType').value;
        const sessionName = document.getElementById('sessionName').value.trim();
        const date = document.getElementById('sessionDate').value;
        const startTime = document.getElementById('sessionStartTime').value;
        const endTime = document.getElementById('sessionEndTime').value;
        const duration = parseFloat(document.getElementById('sessionHours').value) || 2.0;
        const unitPrice = this.parsePriceValue(document.getElementById('sessionPrice').value);
        const content = document.getElementById('sessionContent').value.trim();

        if (!date || !startTime || !endTime) {
            this.showToast("Vui lòng nhập đầy đủ ngày học và giờ học!", "error");
            return;
        }

        // Giờ kết thúc phải sau giờ bắt đầu — trước đây không kiểm tra, có thể
        // tạo buổi học với giờ kết thúc trước giờ bắt đầu, làm sai hiển thị
        // trên lịch tuần và sai số giờ tích lũy trên phiếu học phí.
        if (endTime <= startTime) {
            this.showToast("Giờ kết thúc phải sau giờ bắt đầu!", "error");
            return;
        }

        if (isNaN(unitPrice) || unitPrice < 0) {
            this.showToast("Đơn giá học phí không được là số âm!", "error");
            return;
        }

        // Get selected students
        const checkedBoxes = document.querySelectorAll('input[name="sessionStudents"]:checked');
        if (checkedBoxes.length === 0) {
            this.showToast("Vui lòng chọn ít nhất một học sinh tham gia!", "error");
            return;
        }
        if (type === 'riêng' && checkedBoxes.length > 1) {
            this.showToast("Học riêng (1 vs 1) chỉ được chọn đúng 1 học sinh!", "error");
            return;
        }

        // Cảnh báo trùng lịch: cùng ngày, khung giờ giao nhau với 1 buổi học
        // khác đã có — trước đây không kiểm tra nên rất dễ vô tình xếp 2 ca
        // chồng giờ nhau mà không hay biết cho tới khi mở lại lịch tuần.
        const overlap = this.findOverlappingSession(date, startTime, endTime);
        if (overlap) {
            const proceed = confirm(
                `Khung giờ ${startTime}-${endTime} ngày ${this.formatDateVN(date)} đang TRÙNG với 1 buổi học khác ` +
                `(${overlap.startTime}-${overlap.endTime}${overlap.sessionName ? ' — ' + overlap.sessionName : ''}).\n\n` +
                `Bạn có chắc chắn vẫn muốn tạo buổi học này không?`
            );
            if (!proceed) return;
        }

        const studentIds = [];
        checkedBoxes.forEach(cb => studentIds.push(cb.value));

        // Học chung: tổng thu = đơn giá/học sinh x SỐ HỌC SINH CÓ ĐÓNG HỌC PHÍ
        // (loại trừ học sinh học phí cơ bản = 0đ khỏi phép nhân). Học riêng:
        // giữ nguyên đơn giá đã nhập (đã tự = 0 nếu học sinh đó học phí 0đ).
        const payingCount = studentIds.filter(stId => {
            const student = this.students.find(s => s.id === stId);
            return student && Number(student.basePrice) > 0;
        }).length;
        const price = type === 'chung' ? unitPrice * payingCount : unitPrice;

        // Create studentDetails map
        const studentDetails = {};
        studentIds.forEach(stId => {
            studentDetails[stId] = {
                homework: "Chưa làm",
                attitude: "Tốt",
                individualComment: "",
                note: ""
            };
        });

        const newSession = {
            // ID sinh từ Date.now() có thể trùng nếu 2 request được gửi trong
            // cùng 1 mili-giây (double-click, mạng lag khiến bấm gửi 2 lần) —
            // thêm hậu tố ngẫu nhiên để đảm bảo luôn duy nhất.
            id: "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
            date,
            startTime,
            endTime,
            type,
            sessionName,
            studentIds,
            duration,
            price,
            content,
            generalComment: content ? `Cả lớp học: ${content.split('\n')[0]}` : "",
            completed: this.isSessionCompleted({ date, endTime }), // Tự động theo lịch, không cần chấm công thủ công
            paid: false,     // QUAN TRỌNG: học phí LUÔN mặc định "chưa thanh toán" khi mới lên lịch
            studentDetails
        };

        this.setBtnLoading('saveSessionBtn', true, 'Đang lưu...');
        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSession)
            });
            if (!res.ok) throw new Error("Server error");
            await this.loadData();
        } catch (err) {
            console.warn("API lỗi, lưu offline: ", err.message);
            this.sessions.push(newSession);
            await this.saveData();
        } finally {
            this.setBtnLoading('saveSessionBtn', false);
        }

        // Reset form
        document.getElementById('sessionLoggerForm').reset();
        delete document.getElementById('sessionPrice').dataset.userEdited;
        const today = this.toISODateOnly(new Date());
        document.getElementById('sessionDate').value = today;
        this.renderStudentSelectionGrid('studentsCheckboxGrid');

        this.showToast("Đã ghi nhận buổi học mới thành công!", "success");
    }

    // 3. Edit Session Modal triggers
    openEditSessionModal(sessionId) {
        const sess = this.sessions.find(x => x.id === sessionId);
        if (!sess) return;

        document.getElementById('editSessionId').value = sess.id;
        document.getElementById('editSessionType').value = sess.type;
        document.getElementById('editSessionName').value = sess.sessionName || '';
        document.getElementById('editSessionDate').value = sess.date;
        document.getElementById('editSessionStartTime').value = sess.startTime;
        document.getElementById('editSessionEndTime').value = sess.endTime;
        document.getElementById('editSessionHours').value = sess.duration;
        // sess.price được lưu là TỔNG thu của buổi học (đã loại trừ học sinh 0đ);
        // với học chung cần chia lại theo SỐ HỌC SINH CÓ ĐÓNG HỌC PHÍ để ra đúng
        // đơn giá/học sinh hiển thị trong ô nhập liệu.
        const payingCount = Math.max(this.getPayingStudentIds(sess).length, 1);
        const editPriceEl = document.getElementById('editSessionPrice');
        this.setPriceSelectValue(editPriceEl, sess.type === 'chung' ? Math.round(sess.price / payingCount) : sess.price);
        editPriceEl.dataset.userEdited = 'true'; // giữ đúng giá đã lưu, không để bị tự động ghi đè
        document.getElementById('editSessionContent').value = sess.content || '';

        // Dựng lại danh sách checkbox học sinh, đánh dấu các em đang tham gia
        const grid = document.getElementById('editStudentsCheckboxGrid');
        grid.innerHTML = '';
        // Reset lại ô tìm kiếm mỗi lần mở modal Sửa buổi học để luôn thấy đủ
        // danh sách học sinh trước khi lọc lại nếu cần.
        const searchInput = document.getElementById('editStudentsCheckboxSearch');
        if (searchInput) searchInput.value = '';
        this.students.forEach(st => {
            const label = document.createElement('label');
            label.className = 'student-check-item';

            const classNumberOnly = (st.class || '').replace(/lớp/i, '').trim();
            label.dataset.search = this.removeVietnameseTones(`${st.name} ${st.class} ${classNumberOnly}`);

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = st.id;
            checkbox.name = 'editSessionStudents';
            
            if (sess.studentIds.includes(st.id)) {
                checkbox.checked = true;
            }

            checkbox.addEventListener('change', () => {
                const isPrivate = document.getElementById('editSessionType').value !== 'chung';
                if (isPrivate && checkbox.checked) {
                    grid.querySelectorAll('input[type="checkbox"]').forEach(other => {
                        if (other !== checkbox) other.checked = false;
                    });
                }
                this.updateSessionPricing('editSession');
            });

            const span = document.createElement('span');
            span.innerText = `${st.name} - ${st.class}`;
            
            label.appendChild(checkbox);
            label.appendChild(span);
            grid.appendChild(label);
        });

        this.applySessionTypeRules('editSession');
        this.openModal('editSessionModal');
    }

    async handleEditSession() {
        const id = document.getElementById('editSessionId').value;
        const sess = this.sessions.find(x => x.id === id);
        if (!sess) return;

        const type = document.getElementById('editSessionType').value;
        const sessionName = document.getElementById('editSessionName').value.trim();
        const date = document.getElementById('editSessionDate').value;
        const startTime = document.getElementById('editSessionStartTime').value;
        const endTime = document.getElementById('editSessionEndTime').value;
        const duration = parseFloat(document.getElementById('editSessionHours').value) || 2.0;
        const unitPrice = this.parsePriceValue(document.getElementById('editSessionPrice').value);
        const content = document.getElementById('editSessionContent').value.trim();

        if (!date || !startTime || !endTime) {
            this.showToast("Vui lòng nhập đầy đủ ngày học và giờ học!", "error");
            return;
        }

        // Giờ kết thúc phải sau giờ bắt đầu (xem giải thích ở handleLogSession)
        if (endTime <= startTime) {
            this.showToast("Giờ kết thúc phải sau giờ bắt đầu!", "error");
            return;
        }

        if (isNaN(unitPrice) || unitPrice < 0) {
            this.showToast("Đơn giá học phí không được là số âm!", "error");
            return;
        }

        const checkedBoxes = document.querySelectorAll('input[name="editSessionStudents"]:checked');
        if (checkedBoxes.length === 0) {
            this.showToast("Vui lòng chọn ít nhất một học sinh tham gia!", "error");
            return;
        }
        if (type === 'riêng' && checkedBoxes.length > 1) {
            this.showToast("Học riêng (1 vs 1) chỉ được chọn đúng 1 học sinh!", "error");
            return;
        }

        // Cảnh báo trùng lịch (loại trừ chính buổi học đang sửa)
        const overlap = this.findOverlappingSession(date, startTime, endTime, id);
        if (overlap) {
            const proceed = confirm(
                `Khung giờ ${startTime}-${endTime} ngày ${this.formatDateVN(date)} đang TRÙNG với 1 buổi học khác ` +
                `(${overlap.startTime}-${overlap.endTime}${overlap.sessionName ? ' — ' + overlap.sessionName : ''}).\n\n` +
                `Bạn có chắc chắn vẫn muốn lưu thay đổi này không?`
            );
            if (!proceed) return;
        }

        const studentIds = [];
        checkedBoxes.forEach(cb => studentIds.push(cb.value));

        // Học chung: tổng thu = đơn giá/học sinh x SỐ HỌC SINH CÓ ĐÓNG HỌC PHÍ
        // (loại trừ học sinh học phí cơ bản = 0đ khỏi phép nhân), giống lúc tạo mới.
        const payingCount = studentIds.filter(stId => {
            const student = this.students.find(s => s.id === stId);
            return student && Number(student.basePrice) > 0;
        }).length;
        const price = type === 'chung' ? unitPrice * payingCount : unitPrice;

        // Sync studentDetails map (preserve existing if student already in class)
        const newStudentDetails = {};
        studentIds.forEach(stId => {
            if (sess.studentDetails[stId]) {
                newStudentDetails[stId] = sess.studentDetails[stId];
            } else {
                newStudentDetails[stId] = {
                    homework: "Chưa làm",
                    attitude: "Tốt",
                    individualComment: "",
                    note: ""
                };
            }
        });

        const updatedSession = {
            ...sess,
            type,
            sessionName,
            date,
            startTime,
            endTime,
            duration,
            price,
            content,
            studentIds,
            studentDetails: newStudentDetails
        };

        this.setBtnLoading('saveEditSessionBtn', true, 'Đang lưu...');
        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/sessions/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedSession)
            });
            if (!res.ok) throw new Error("Server error");
            await this.loadData();
        } catch (err) {
            console.warn("API lỗi, lưu offline: ", err.message);
            sess.type = type;
            sess.sessionName = sessionName;
            sess.date = date;
            sess.startTime = startTime;
            sess.endTime = endTime;
            sess.duration = duration;
            sess.price = price;
            sess.content = content;
            sess.studentIds = studentIds;
            sess.studentDetails = newStudentDetails;
            await this.saveData();
        } finally {
            this.setBtnLoading('saveEditSessionBtn', false);
        }

        this.closeModal('editSessionModal');
        this.showToast("Đã sửa lịch học thành công!", "success");
    }

    async deleteSession(id) {
        if (this.currentRole !== 'teacher') {
            this.showToast("Chỉ Giáo viên mới có quyền xóa buổi học!", "error");
            return;
        }

        if (confirm("Bạn có chắc muốn xóa ca dạy này khỏi lịch học?")) {
            try {
                const res = await this.authFetch(`${API_BASE_URL}/api/sessions/${id}`, { method: 'DELETE' });
                if (!res.ok) throw new Error("Server error");
                await this.loadData();
            } catch (err) {
                console.warn("API lỗi, lưu offline: ", err.message);
                this.sessions = this.sessions.filter(s => s.id !== id);
                await this.saveData();
            }
            this.showToast("Đã xóa buổi học thành công.", "success");
        }
    }

    // 4. Update Student Specific Evaluation Log (Homework, Attitude, Comments)
    openUpdateLogModal(sessionId, studentId) {
        const sess = this.sessions.find(x => x.id === sessionId);
        if (!sess) return;

        const detail = sess.studentDetails[studentId];
        if (!detail) return;

        document.getElementById('updateLogSessionId').value = sessionId;
        document.getElementById('updateLogStudentId').value = studentId;
        
        document.getElementById('updateLogStudentMeta').innerText = `Học sinh: ${this.getStudentName(studentId)} (${this.getStudentClass(studentId)})`;
        document.getElementById('updateLogSessionMeta').innerText = `Buổi ngày ${this.formatDateVN(sess.date)} | Ca ${sess.startTime} - ${sess.endTime}`;

        document.getElementById('updateHomework').value = detail.homework || 'Chưa làm';
        document.getElementById('updateAttitude').value = detail.attitude || 'Tốt';
        document.getElementById('updateGeneralComment').value = sess.generalComment || '';
        document.getElementById('updateIndividualComment').value = detail.individualComment || '';
        document.getElementById('updateNote').value = detail.note || '';

        // Show general comment updater field only if it's a shared session (chung)
        const generalCommentGroup = document.getElementById('generalCommentGroup');
        if (sess.type === 'chung') {
            generalCommentGroup.style.display = 'block';
        } else {
            // Private session: generalComment acts as the individualComment itself
            generalCommentGroup.style.display = 'none';
        }

        this.openModal('updateLogModal');
    }

    async handleUpdateLog() {
        const sessionId = document.getElementById('updateLogSessionId').value;
        const studentId = document.getElementById('updateLogStudentId').value;

        const sess = this.sessions.find(x => x.id === sessionId);
        if (!sess) return;

        const detail = sess.studentDetails[studentId];
        if (!detail) return;

        const homework = document.getElementById('updateHomework').value;
        const attitude = document.getElementById('updateAttitude').value.trim();
        const individualComment = document.getElementById('updateIndividualComment').value.trim();
        const note = document.getElementById('updateNote').value.trim();
        
        let generalComment = undefined;
        if (sess.type === 'chung') {
            generalComment = document.getElementById('updateGeneralComment').value.trim();
        } else {
            generalComment = individualComment;
        }

        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/session-details/${sessionId}/${studentId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ homework, attitude, individualComment, note, generalComment })
            });
            if (!res.ok) throw new Error("Server error");
            await this.loadData();
        } catch (err) {
            console.warn("API lỗi, lưu offline: ", err.message);
            detail.homework = homework;
            detail.attitude = attitude;
            detail.individualComment = individualComment;
            detail.note = note;
            if (sess.type === 'chung') {
                sess.generalComment = generalComment;
            } else {
                sess.generalComment = individualComment;
            }
            await this.saveData();
        }

        this.closeModal('updateLogModal');
        this.showToast("Cập nhật nhận xét học sinh thành công!", "success");
    }

    // Chuyển trạng thái học phí (Đã thanh toán <-> Chưa thanh toán) cho TẤT CẢ
    // buổi học của 1 học sinh. Hoàn toàn tách biệt với trạng thái "đã dạy" —
    // dùng field Paid riêng, không còn dùng chung với Completed nữa.
    async setStudentPaidStatus(studentId, paid) {
        if (this.currentRole !== 'teacher') {
            this.showToast("Chỉ Giáo viên mới có quyền cập nhật học phí!", "error");
            this.renderTuitionOverview();
            return;
        }

        const studentSessions = this.sessions.filter(sess => sess.studentIds.includes(studentId));
        if (studentSessions.length === 0) return;

        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/students/${studentId}/set-paid`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paid })
            });
            if (!res.ok) throw new Error("Server error");
            await this.loadData();
        } catch (err) {
            console.warn("API lỗi, cập nhật offline: ", err.message);
            // QUAN TRỌNG: chỉ set cờ Paid của ĐÚNG học sinh này trong từng buổi
            // học (sess.studentDetails[studentId].paid) — TUYỆT ĐỐI không set
            // sess.paid (cấp cả buổi), nếu không buổi học chung sẽ bị đổi trạng
            // thái of TẤT CẢ học sinh khác học cùng buổi theo em này.
            studentSessions.forEach(sess => {
                if (sess.studentDetails && sess.studentDetails[studentId]) {
                    sess.studentDetails[studentId].paid = paid;
                }
            });
            await this.saveData();
        }
        this.showToast(paid ? "Đã đánh dấu học phí: Đã thanh toán" : "Đã đánh dấu học phí: Chưa thanh toán", "success");
    }

    // Tự động tải thư viện html2canvas từ CDN (chỉ tải 1 lần) — dùng để chụp
    // khung Nhật ký học tập (banner tên học sinh + bảng) ra ảnh PNG.
    async ensureHtml2Canvas() {
        if (window.html2canvas) return window.html2canvas;
        if (!this._html2canvasLoadingPromise) {
            this._html2canvasLoadingPromise = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
                script.onload = () => resolve(window.html2canvas);
                script.onerror = () => reject(new Error('Không tải được thư viện xuất ảnh (kiểm tra kết nối mạng).'));
                document.head.appendChild(script);
            });
        }
        return this._html2canvasLoadingPromise;
    }

    // Chụp khung Nhật ký học tập (#logExportCapture) ra 1 file ảnh PNG — ẩn tạm
    // cột "Thao tác" trong lúc chụp (class .log-export-hide, xem style.css)
    // để ảnh gửi phụ huynh không có nút bấm thao tác trên web.
    async exportStudentLogToImage() {
        const studentId = this.currentStudentId;
        const studentName = this.getStudentName(studentId);

        const studentSessions = this.filterByMonth(this.sessions)
            .filter(sess => sess.studentIds.includes(studentId));

        if (studentSessions.length === 0) {
            this.showToast("Không có dữ liệu nhật ký để xuất!", "error");
            return;
        }

        const captureEl = document.getElementById('logExportCapture');
        this.setBtnLoading('btnExportLogImage', true, 'Đang tạo ảnh...');
        captureEl.classList.add('is-exporting');
        try {
            const html2canvas = await this.ensureHtml2Canvas();
            const canvas = await html2canvas(captureEl, {
                scale: 2,
                backgroundColor: '#ffffff',
                useCORS: true
            });

            const todayStr = this.toISODateOnly(new Date());
            const link = document.createElement('a');
            link.download = `NhatKyHocTap_${studentName.replace(/\s+/g, '')}_${todayStr}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();

            this.showToast("Đã xuất ảnh nhật ký học tập thành công!", "success");
        } catch (err) {
            console.error('Lỗi xuất ảnh:', err);
            this.showToast(err.message || "Xuất ảnh thất bại, vui lòng thử lại.", "error");
        } finally {
            captureEl.classList.remove('is-exporting');
            this.setBtnLoading('btnExportLogImage', false);
        }
    }

    // Export log to Excel
    // Tự động tải thư viện SheetJS (xlsx) từ CDN (chỉ tải 1 lần, dùng lại cho
    // các lần xuất Excel sau) — dùng để tạo file .xlsx trực tiếp trên trình duyệt.
    async ensureXLSX() {
        if (window.XLSX) return window.XLSX;
        if (!this._xlsxLoadingPromise) {
            this._xlsxLoadingPromise = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
                script.onload = () => resolve(window.XLSX);
                script.onerror = () => reject(new Error('Không tải được thư viện xuất Excel (kiểm tra kết nối mạng).'));
                document.head.appendChild(script);
            });
        }
        return this._xlsxLoadingPromise;
    }

    // Xuất bảng Nhật ký học tập (banner tên học sinh + bảng buổi học) ra 1
    // file Excel (.xlsx) — thay cho xuất ảnh trước đây, giúp dễ chỉnh sửa,
    // lọc, hoặc nhập tiếp vào các file quản lý khác.
    async exportStudentLogToCSV() {
        const studentId = this.currentStudentId;
        const studentName = this.getStudentName(studentId);
        const studentClass = this.getStudentClass(studentId);
        const studentSubject = this.getStudentSubject(studentId);

        // Dùng đúng danh sách đang hiển thị trên bảng (đã lọc theo Kỳ đang chọn)
        // để số liệu xuất ra khớp 100% với những gì giáo viên đang xem.
        const studentSessions = this.filterByMonth(this.sessions)
            .filter(sess => sess.studentIds.includes(studentId))
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        if (studentSessions.length === 0) {
            this.showToast("Không có dữ liệu nhật ký để xuất!", "error");
            return;
        }

        this.setBtnLoading('btnExportLog', true, 'Đang tạo file Excel...');
        try {
            const XLSX = await this.ensureXLSX();

            const header = ['STT', 'Ngày', 'Giờ học', 'Nội dung buổi học', 'Bài tập về nhà', 'Ý thức', 'Nhận xét của giáo viên', 'Ghi chú'];
            const rows = studentSessions.map((sess, idx) => {
                const detail = sess.studentDetails[studentId] || { homework: 'Chưa làm', attitude: 'Tốt', individualComment: '', note: '' };
                const d = this.parseLocalDate(sess.date);
                const days = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
                const dateLabel = d ? `${days[d.getDay()]}, ${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}` : sess.date;

                const contentParts = [];
                if (sess.sessionName) contentParts.push(sess.sessionName);
                contentParts.push(sess.content && sess.content.trim() ? sess.content.trim() : 'Chưa có nội dung.');

                return [
                    `Buổi ${idx + 1}`,
                    dateLabel,
                    `${sess.startTime} - ${sess.endTime}`,
                    contentParts.join('\n'),
                    this.getHomeworkLabel(detail.homework),
                    detail.attitude || 'Tốt',
                    detail.individualComment && detail.individualComment.trim() ? detail.individualComment.trim() : 'Chưa nhận xét.',
                    detail.note || ''
                ];
            });

            const titleRow = [`NHẬT KÝ HỌC TẬP - ${studentName.toUpperCase()} ${studentSubject} ${studentClass}`.trim()];
            const wsData = [titleRow, [], header, ...rows];

            const ws = XLSX.utils.aoa_to_sheet(wsData);
            ws['!cols'] = [
                { wch: 10 }, // STT
                { wch: 20 }, // Ngày
                { wch: 14 }, // Giờ học
                { wch: 40 }, // Nội dung
                { wch: 16 }, // Bài tập
                { wch: 14 }, // Ý thức
                { wch: 40 }, // Nhận xét
                { wch: 20 }  // Ghi chú
            ];
            // Gộp ô tiêu đề trên cùng cho đẹp (trải hết chiều rộng bảng)
            ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: header.length - 1 } }];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Nhat ky hoc tap');

            const todayStr = this.toISODateOnly(new Date());
            XLSX.writeFile(wb, `NhatKyHocTap_${studentName.replace(/\s+/g, '')}_${todayStr}.xlsx`);

            this.showToast("Đã xuất file Excel nhật ký học tập thành công!", "success");
        } catch (err) {
            console.error('Lỗi xuất Excel:', err);
            this.showToast(err.message || "Xuất file Excel thất bại, vui lòng thử lại.", "error");
        } finally {
            this.setBtnLoading('btnExportLog', false);
        }
    }

    // --- USER MANAGEMENT (Admin only) ---

    roleLabelText(role) {
        if (role === 'admin') return 'Quản trị viên';
        if (role === 'teacher') return 'Giáo viên';
        if (role === 'assistant') return 'Trợ giảng';
        return role;
    }

    // Returns the display name of the teacher a TA is assigned to, or '' if not applicable
    assignedTeacherName(assignedTeacherId) {
        if (!assignedTeacherId) return '';
        const t = (this.users || []).find(u => u.Id === assignedTeacherId);
        return t ? t.Name : assignedTeacherId;
    }

    // Toggle the "Assigned Teacher" field in the user modal depending on selected role
    onUserRoleChange() {
        const role = document.getElementById('userRole').value;
        const group = document.getElementById('userAssignedTeacherGroup');
        const select = document.getElementById('userAssignedTeacher');

        if (role === 'assistant') {
            group.style.display = 'block';
            select.innerHTML = '';
            const teachers = (this.users || []).filter(u => u.Role === 'teacher');
            if (teachers.length === 0) {
                select.innerHTML = '<option value="">Chưa có giáo viên nào để gán</option>';
            } else {
                teachers.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t.Id;
                    opt.innerText = t.Name;
                    select.appendChild(opt);
                });
            }
        } else {
            group.style.display = 'none';
            select.innerHTML = '';
        }
    }

    async renderUsersTable() {
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;

        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/users`);
            if (!res.ok) throw new Error('Server error');
            this.users = await res.json();
        } catch (err) {
            console.warn('Không tải được danh sách tài khoản: ', err.message);
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px;">Không thể tải danh sách tài khoản. Vui lòng kiểm tra kết nối máy chủ.</td></tr>`;
            return;
        }

        if (this.users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 20px;">Chưa có tài khoản nào.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        this.users.forEach(u => {
            const tr = document.createElement('tr');
            const activeBadge = u.Active
                ? `<span class="badge" style="background: var(--hw-done-bg); color: var(--hw-done-text); border: 1px solid var(--hw-done-border);">Đang hoạt động</span>`
                : `<span class="badge" style="background: var(--hw-not-done-bg); color: var(--hw-not-done-text); border: 1px solid var(--hw-not-done-border);">Đã vô hiệu hóa</span>`;

            tr.innerHTML = `
                <td style="text-align:center; font-size:12px; color:var(--text-muted);">${u.Id}</td>
                <td><strong>${u.Name}</strong><div style="font-size:11px; margin-top:2px;">${activeBadge}</div></td>
                <td>${u.Username}</td>
                <td>${this.roleLabelText(u.Role)}</td>
                <td>${u.Role === 'assistant' ? (this.assignedTeacherName(u.AssignedTeacherId) || '<span style="color:var(--text-muted);">Chưa gán</span>') : '<span style="color:var(--text-muted);">—</span>'}</td>
                <td style="text-align:center;">
                    <button class="btn btn-secondary btn-sm" onclick="app.openEditUserModal('${u.Id}')"> Sửa
                    </button>
                    <button class="btn ${u.Active ? 'btn-secondary' : 'btn-primary'} btn-sm" onclick="app.toggleUserActive('${u.Id}', ${u.Active ? 'false' : 'true'})"> ${u.Active ? 'Khóa' : 'Mở khóa'}
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="app.deleteUser('${u.Id}')"> Xóa
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    openAddUserModal() {
        document.getElementById('addUserForm').reset();
        document.getElementById('userModalTitle').innerText = 'Thêm Tài Khoản Mới';
        document.getElementById('editUserId').value = '';
        document.getElementById('userPassword').placeholder = 'Bắt buộc khi tạo mới';
        document.getElementById('userPassword').required = true;
        document.getElementById('userUsername').disabled = false;
        document.getElementById('userRole').value = 'teacher';
        this.onUserRoleChange();
        this.openModal('userModal');
    }

    openEditUserModal(id) {
        const user = (this.users || []).find(u => u.Id === id);
        if (!user) return;

        document.getElementById('addUserForm').reset();
        document.getElementById('userModalTitle').innerText = 'Chỉnh Sửa Tài Khoản';
        document.getElementById('editUserId').value = user.Id;
        document.getElementById('userName').value = user.Name;
        document.getElementById('userUsername').value = user.Username;
        document.getElementById('userUsername').disabled = true; // Username không đổi được
        document.getElementById('userRole').value = user.Role;
        document.getElementById('userPassword').value = '';
        document.getElementById('userPassword').placeholder = 'Để trống nếu không đổi mật khẩu';
        document.getElementById('userPassword').required = false;
        this.onUserRoleChange();
        if (user.Role === 'assistant' && user.AssignedTeacherId) {
            document.getElementById('userAssignedTeacher').value = user.AssignedTeacherId;
        }
        this.openModal('userModal');
    }

    async handleSaveUser() {
        const id = document.getElementById('editUserId').value;
        const name = document.getElementById('userName').value.trim();
        const username = document.getElementById('userUsername').value.trim();
        const role = document.getElementById('userRole').value;
        const password = document.getElementById('userPassword').value;
        const assignedTeacherId = role === 'assistant' ? document.getElementById('userAssignedTeacher').value : null;

        if (!name || !username || !role) {
            this.showToast('Vui lòng điền đầy đủ thông tin bắt buộc.', 'error');
            return;
        }
        if (role === 'assistant' && !assignedTeacherId) {
            this.showToast('Vui lòng chọn giáo viên mà trợ giảng này hỗ trợ.', 'error');
            return;
        }

        try {
            if (id) {
                // Edit existing user
                const payload = { name, role, assignedTeacherId };
                if (password) payload.password = password;
                const res = await this.authFetch(`${API_BASE_URL}/api/users/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || 'Cập nhật tài khoản thất bại.');
                }
                this.showToast('Cập nhật tài khoản thành công!', 'success');
            } else {
                // Create new user
                if (!password) {
                    this.showToast('Vui lòng nhập mật khẩu cho tài khoản mới.', 'error');
                    return;
                }
                const res = await this.authFetch(`${API_BASE_URL}/api/users`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, name, role, assignedTeacherId })
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || 'Tạo tài khoản thất bại.');
                }
                this.showToast('Tạo tài khoản mới thành công!', 'success');
            }

            this.closeModal('userModal');
            await this.renderUsersTable();
        } catch (err) {
            this.showToast(err.message || 'Có lỗi xảy ra.', 'error');
        }
    }

    async toggleUserActive(id, makeActive) {
        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/users/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ active: makeActive })
            });
            if (!res.ok) throw new Error('Server error');
            this.showToast(makeActive ? 'Đã mở khóa tài khoản.' : 'Đã khóa tài khoản.', 'success');
            await this.renderUsersTable();
        } catch (err) {
            this.showToast('Không thể cập nhật trạng thái tài khoản.', 'error');
        }
    }

    async deleteUser(id) {
        if (this.currentUser && this.currentUser.Id === id) {
            this.showToast('Bạn không thể tự xóa tài khoản đang đăng nhập!', 'error');
            return;
        }
        if (!confirm('Bạn có chắc chắn muốn xóa tài khoản này?')) return;

        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/users/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Server error');
            this.showToast('Đã xóa tài khoản.', 'success');
            await this.renderUsersTable();
        } catch (err) {
            this.showToast('Không thể xóa tài khoản.', 'error');
        }
    }

    // ==========================================
    // TÀI KHOẢN ĐĂNG NHẬP HỌC SINH (giáo viên/trợ giảng tạo & reset mật khẩu)
    // ==========================================

    openStudentAccountModal(id) {
        const student = this.students.find(s => s.id === id);
        if (!student) return;

        document.getElementById('accountStudentId').value = student.id;
        document.getElementById('accountStudentName').innerText = `${student.name} - ${student.class}`;
        document.getElementById('accountUsername').value = student.username || '';
        document.getElementById('accountPassword').value = '';

        const statusEl = document.getElementById('accountStatusText');
        if (!student.username) {
            statusEl.innerText = 'Học sinh này CHƯA có tài khoản đăng nhập.';
            statusEl.style.color = 'var(--text-muted)';
        } else {
            statusEl.innerText = student.accountActive
                ? `Đang hoạt động — tên đăng nhập: ${student.username}`
                : `ĐANG BỊ KHÓA — tên đăng nhập: ${student.username}`;
            statusEl.style.color = student.accountActive ? 'var(--success, green)' : 'var(--danger, red)';
        }

        // Nút khóa/mở khóa + xóa tài khoản: chỉ hiện khi ĐÃ có tài khoản, và
        // chỉ Giáo viên (không phải Trợ giảng) mới được thao tác — khớp với
        // phân quyền phía backend (requireRole('teacher') riêng cho 2 route này).
        const toggleBtn = document.getElementById('accountToggleBtn');
        const deleteBtn = document.getElementById('accountDeleteBtn');
        const hasAccount = !!student.username;
        toggleBtn.style.display = (hasAccount && this.currentRole === 'teacher') ? 'inline-flex' : 'none';
        deleteBtn.style.display = (hasAccount && this.currentRole === 'teacher') ? 'inline-flex' : 'none';
        toggleBtn.innerText = student.accountActive ? '🔒 Khóa tài khoản' : '🔓 Mở khóa';

        this.openModal('studentAccountModal');
    }

    // Tạo tài khoản mới HOẶC ghi đè username+mật khẩu của tài khoản đã có
    // (dùng chung 1 API cho cả 2 trường hợp — xem POST /api/students/:id/account)
    async saveStudentAccount() {
        const id = document.getElementById('accountStudentId').value;
        const username = document.getElementById('accountUsername').value.trim();
        const password = document.getElementById('accountPassword').value;

        if (!username || !password) {
            this.showToast('Vui lòng nhập tên đăng nhập và mật khẩu.', 'error');
            return;
        }
        if (password.length < 4) {
            this.showToast('Mật khẩu cần tối thiểu 4 ký tự.', 'error');
            return;
        }

        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/students/${id}/account`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload.error || 'Không thể lưu tài khoản.');

            this.showToast('Đã lưu tài khoản đăng nhập cho học sinh.', 'success');
            this.closeModal('studentAccountModal');
            await this.loadData();
        } catch (err) {
            this.showToast(err.message || 'Không thể lưu tài khoản.', 'error');
        }
    }

    async toggleStudentAccountLock() {
        const id = document.getElementById('accountStudentId').value;
        const student = this.students.find(s => s.id === id);
        if (!student) return;
        const nextActive = !student.accountActive;

        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/students/${id}/account/toggle`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ active: nextActive })
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload.error || 'Không thể đổi trạng thái tài khoản.');

            this.showToast(payload.message || 'Đã cập nhật trạng thái.', 'success');
            this.closeModal('studentAccountModal');
            await this.loadData();
        } catch (err) {
            this.showToast(err.message || 'Không thể đổi trạng thái tài khoản.', 'error');
        }
    }

    async deleteStudentAccount() {
        const id = document.getElementById('accountStudentId').value;
        if (!confirm('Xóa tài khoản đăng nhập của học sinh này? Học sinh sẽ không còn tự đăng nhập được nữa (hồ sơ học sinh vẫn được giữ nguyên).')) {
            return;
        }
        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/students/${id}/account`, { method: 'DELETE' });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload.error || 'Không thể xóa tài khoản.');

            this.showToast('Đã xóa tài khoản đăng nhập.', 'success');
            this.closeModal('studentAccountModal');
            await this.loadData();
        } catch (err) {
            this.showToast(err.message || 'Không thể xóa tài khoản.', 'error');
        }
    }

    // --- MODAL UTILS ---
    openModal(modalId) {
        document.getElementById(modalId).classList.add('show');
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('show');
    }

    // Date formatter helper (e.g. 23/05/2026 -> Thứ 7 - 23/05)
    // QUAN TRỌNG: parse thủ công từng phần năm/tháng/ngày rồi dựng Date bằng
    // constructor (y, m-1, d) — cách DUY NHẤT parse "yyyy-mm-dd" mà không bị
    // lệch ngày do quy đổi UTC, bất kể múi giờ máy/trình duyệt người dùng đặt
    // là gì. TUYỆT ĐỐI không dùng new Date("yyyy-mm-dd") trực tiếp để hiển thị
    // ngày — cách đó luôn bị JS hiểu là mốc UTC rồi mới quy đổi ra giờ local,
    // dễ lệch lùi 1 ngày với các múi giờ có offset âm.
    formatDateVN(dateStr) {
        const d = this.parseLocalDate(dateStr);
        if (!d) return dateStr || '';
        const days = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
        const dayName = days[d.getDay()];
        const day = d.getDate().toString().padStart(2, '0');
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        return `${dayName} - ${day}/${month}`;
    }

    // Giống formatDateVN nhưng trả về HTML 2 dòng, KHÔNG có dấu gạch ngang:
    // dòng trên là Thứ, dòng dưới là ngày/tháng. Dùng cho các bảng hẹp
    // (VD bảng Nhật ký học tập) để tránh bị coi là bị lệch dòng có gạch ngang.
    formatDateVNSplit(dateStr) {
        const d = this.parseLocalDate(dateStr);
        if (!d) return dateStr || '';
        const days = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
        const dayName = days[d.getDay()];
        const day = d.getDate().toString().padStart(2, '0');
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        return `<span class="session-date-day">${dayName}</span><span class="session-date-dm">${day}/${month}</span>`;
    }

    // Parse an toàn chuỗi "yyyy-mm-dd" (hoặc "yyyy-mm-ddTHH:mm:ss...") thành
    // đối tượng Date ở giờ LOCAL, không đi qua UTC nên không bao giờ lệch ngày.
    parseLocalDate(dateStr) {
        if (!dateStr) return null;
        const datePart = String(dateStr).slice(0, 10); // chỉ lấy "yyyy-mm-dd"
        const [y, m, d] = datePart.split('-').map(Number);
        if (!y || !m || !d) return null;
        return new Date(y, m - 1, d);
    }

    // Trả về Date của Thứ 2 (Monday) thuộc tuần chứa ngày `d`
    getMonday(d) {
        const date = new Date(d);
        date.setHours(0, 0, 0, 0);
        const day = date.getDay(); // 0 = CN, 1 = T2, ...
        const diff = (day === 0 ? -6 : 1 - day); // đưa về Thứ 2
        date.setDate(date.getDate() + diff);
        return date;
    }

    toISODateOnly(d) {
        const y = d.getFullYear();
        const m = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    // Trạng thái "đã dạy" (completed) được suy ra TỰ ĐỘNG từ ngày + giờ kết
    // thúc của buổi học so với thời điểm hiện tại — không còn dựa vào checkbox
    // giáo viên phải tự tay tích ("Đã dạy buổi này (chấm công)"). Nhờ vậy học
    // phí luôn được tính đúng, không bị thất thoát doanh thu chỉ vì quên
    // chấm công thủ công.
    isSessionCompleted(sess) {
        if (!sess || !sess.date) return false;
        const [eh, em] = (sess.endTime || '23:59').split(':').map(Number);
        const end = new Date(sess.date);
        end.setHours(eh || 0, em || 0, 0, 0);
        return end.getTime() <= Date.now();
    }

    // Toast Alert Helper
    showToast(message, type = "success") {
        const toast = document.getElementById('toastNotification');
        const icon = document.getElementById('toastIcon');
        const msg = document.getElementById('toastMessage');

        msg.innerText = message;
        toast.className = 'notification show ' + type;

        if (type === 'success') {
            icon.innerHTML = ' ';
        } else {
            icon.innerHTML = ' ';
        }

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

// Instantiate application on load
const app = new PinkyClassApp();
window.app = app; // Make it global