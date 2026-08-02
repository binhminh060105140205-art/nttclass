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
        this.currentUser = null;
        this.currentRole = null; // admin or teacher
        this.currentStudentId = null; // Active student filter (chỉ dùng ở trang Nhật ký học tập)
        const currentDate = new Date();
        this.currentMonthFilter = `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}`;
        this.currentWeekStart = this.getMonday(new Date()); // Thứ 2 đầu tuần đang xem ở Lịch dạy & Chấm công
        this.calendarViewMode = 'week'; // 'day' | 'week' | 'month' — kiểu xem đang chọn ở Lịch dạy & Chấm công
        this.currentDayDate = new Date(); // Ngày đang xem khi ở chế độ "Ngày"
        this.currentMonthViewDate = new Date(); // Tháng đang xem khi ở chế độ "Tháng" (chỉ quan tâm tháng/năm)

        // Hằng số lưới giờ của Lịch dạy — dùng chung giữa renderHourGridCalendar()
        // và tính năng kéo-thả đổi lịch (initCalendarDragToReschedule) để 2 bên
        // luôn quy đổi px <-> giờ:phút theo ĐÚNG 1 công thức, không thể lệch nhau.
        this.CAL_HOUR_START = 6;   // 06:00
        this.CAL_HOUR_END = 22;    // 22:00
        this.CAL_HOUR_HEIGHT = 52; // px, phải khớp với .week-hour-label height trong CSS
        this.calDrag = null; // Trạng thái đang kéo-thả 1 buổi học trên lịch tuần (null = không kéo)
        this.calCreateDrag = null; // Trạng thái đang kéo-CHỌN 1 khung giờ trống để tạo ca học mới (null = không kéo)
        this.repeatExtraDates = []; // Các ngày lặp lại thủ công được thêm vào form "Ghi Buổi Học Mới" (chỉ trong cùng tháng với Ngày học)
        this.aiChatHistory = []; // Lịch sử hội thoại Trợ lý AI (chỉ lưu ở client, gửi kèm mỗi lần hỏi để AI nhớ ngữ cảnh)
        this.aiChatSavedLoaded = false;
        this.lastVisitedFeatureViewId = null;
        this.requests = [];
        this.requestFilter = 'pending';
        this.requestImageDraft = [];
        this.requestsLoaded = false;
        this.appTheme = 'blue';

        // Áp dụng lại màu giao diện đã lưu (nếu có) ngay từ đầu, trước khi vẽ
        // bất cứ gì, để tránh bị "chớp" màu mặc định rồi mới đổi màu.
        this.initTheme();

        this.init();
    }

    // Hệ thống chỉ dùng một bảng màu xanh; xóa lựa chọn màu cũ đã lưu.
    initTheme() {
        localStorage.removeItem('nttclass_theme');
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.removeAttribute('data-app-variant');
        document.documentElement.setAttribute('data-app-theme', 'blue');
        document.documentElement.setAttribute('data-app-surface', 'loading');
        this.setThemeStylesheetEnabled(document.getElementById('appThemeStylesheet'), false);
        this.setThemeStylesheetEnabled(document.getElementById('pinkAppThemeStylesheet'), false);

        // Khởi tạo chế độ sáng/tối
        const mode = localStorage.getItem('nttclass_theme_mode') || 'light';
        document.documentElement.setAttribute('data-theme-mode', mode);
    }

    normalizeAppTheme(theme) {
        return ['blue', 'lithos', 'pink'].includes(theme) ? theme : 'blue';
    }

    getPersonalAppThemeKey() {
        if (!this.currentUser?.id || !this.currentUser?.role) return null;
        return 'nttclass_app_theme_' + encodeURIComponent(`${this.currentUser.role}:${this.currentUser.id}`);
    }

    getPersonalAppTheme() {
        const key = this.getPersonalAppThemeKey();
        if (!key) return null;
        const savedTheme = localStorage.getItem(key);
        return savedTheme ? this.normalizeAppTheme(savedTheme) : null;
    }

    clearPersonalAppTheme() {
        const key = this.getPersonalAppThemeKey();
        if (key) localStorage.removeItem(key);
    }

    getResolvedAppTheme() {
        return this.getPersonalAppTheme()
            || this.normalizeAppTheme(localStorage.getItem('nttclass_app_theme'));
    }

    setThemeStylesheetEnabled(stylesheet, enabled) {
        if (!stylesheet) return;
        stylesheet.media = enabled ? 'all' : 'not all';
        stylesheet.disabled = !enabled;
    }

    syncAppThemeForCurrentSurface() {
        const surface = document.documentElement.getAttribute('data-app-surface');
        if (surface === 'app' && this.currentUser) {
            this.applyAppTheme(this.getResolvedAppTheme(), { persist: false });
            return;
        }
        if (surface === 'landing' || surface === 'login') {
            this.useLandingTheme({ render: false });
        }
    }

    bindAppThemeLifecycle() {
        if (this._appThemeLifecycleBound) return;
        this._appThemeLifecycleBound = true;
        window.addEventListener('pageshow', () => this.syncAppThemeForCurrentSurface());
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) this.syncAppThemeForCurrentSurface();
        });
    }

    setVelorahAppVideo() {
        const video = document.getElementById('velorahAppBackground');
        if (!video) return;
        video.pause();
        video.style.display = 'none';
    }

    applyAppTheme(theme, options = {}) {
        const normalizedTheme = this.normalizeAppTheme(theme);
        const usesLithosBase = normalizedTheme === 'lithos' || normalizedTheme === 'pink';
        this.appTheme = normalizedTheme;
        if (options.persist === true) localStorage.setItem('nttclass_app_theme', normalizedTheme);
        document.documentElement.setAttribute('data-app-theme', usesLithosBase ? 'lithos' : normalizedTheme);
        if (normalizedTheme === 'pink') document.documentElement.setAttribute('data-app-variant', 'pink');
        else document.documentElement.removeAttribute('data-app-variant');

        const lithosStylesheet = document.getElementById('appThemeStylesheet');
        const pinkStylesheet = document.getElementById('pinkAppThemeStylesheet');
        const velorahStylesheet = document.getElementById('velorahAppThemeStylesheet');
        this.setThemeStylesheetEnabled(lithosStylesheet, usesLithosBase);
        this.setThemeStylesheetEnabled(pinkStylesheet, normalizedTheme === 'pink');
        this.setThemeStylesheetEnabled(velorahStylesheet, normalizedTheme === 'velorah');
        this.setVelorahAppVideo(normalizedTheme === 'velorah');
        if (typeof window.refreshLithosPetals === 'function') window.refreshLithosPetals();

        if (typeof this.updateAppThemeActiveButtons === 'function') {
            this.updateAppThemeActiveButtons();
        }
    }

    useLandingTheme(options = {}) {
        const landingTheme = 'lithos';
        document.documentElement.removeAttribute('data-app-variant');
        document.documentElement.setAttribute('data-app-theme', landingTheme);
        const lithosStylesheet = document.getElementById('appThemeStylesheet');
        const pinkStylesheet = document.getElementById('pinkAppThemeStylesheet');
        const velorahStylesheet = document.getElementById('velorahAppThemeStylesheet');
        this.setThemeStylesheetEnabled(lithosStylesheet, landingTheme === 'lithos');
        this.setThemeStylesheetEnabled(pinkStylesheet, false);
        this.setThemeStylesheetEnabled(velorahStylesheet, landingTheme === 'velorah');
        this.setVelorahAppVideo(false);
        if (typeof window.refreshLithosPetals === 'function') window.refreshLithosPetals();
        if (options.render !== false && typeof window.renderLandingTheme === 'function') {
            window.renderLandingTheme(landingTheme);
        }
    }

    async loadAppTheme() {
        this.appTheme = this.getResolvedAppTheme();
        if (this.currentUser) this.applyAppTheme(this.appTheme, { persist: false });

        try {
            const response = await fetch(`${API_BASE_URL}/api/app-settings/theme`, { cache: 'no-store' });
            if (!response.ok) throw new Error('Không thể tải giao diện hệ thống.');
            const data = await response.json();
            const globalTheme = this.normalizeAppTheme(data.theme);
            localStorage.setItem('nttclass_app_theme', globalTheme);
            this.appTheme = this.getResolvedAppTheme();
        } catch (error) {
            console.warn('[GET /api/app-settings/theme]', error.message);
        }

        if (this.currentUser) this.applyAppTheme(this.appTheme, { persist: false });
    }

    // Đồng bộ trạng thái nút Sáng/Tối trong modal.
    bindThemeSwitcher() {
        this.updateThemeModeActiveButtons();
    }

    async init() {
        localStorage.removeItem('pinky_current_user');
        localStorage.removeItem('pinky_students');
        localStorage.removeItem('pinky_sessions');
        localStorage.removeItem('nttclass_remembered_username');
        localStorage.removeItem('nttclass_invoice_qr');

        this.registerEvents();
        this.bindAppThemeLifecycle();
        const sessionPromise = fetch(`${API_BASE_URL}/api/session`, {
            cache: 'no-store',
            credentials: 'same-origin'
        }).catch(error => {
            console.warn('[init] Không thể kiểm tra phiên đăng nhập.', error.message);
            return null;
        });

        // Dùng giao diện đã cache ngay; đồng bộ cấu hình server chạy nền để không chặn khôi phục phiên.
        const themePromise = this.loadAppTheme();

        let savedUser = null;
        const sessionResponse = await sessionPromise;
        if (sessionResponse?.ok) {
            savedUser = await sessionResponse.json();
        }

        if (savedUser && savedUser.role) {
            this.currentUser = savedUser;
            this.currentRole = savedUser.role;
            await themePromise;
            this.appTheme = this.getResolvedAppTheme();
            this.applyAppTheme(this.appTheme, { persist: false });
            await this.loadData({ render: false });
            await this.onLoginSuccess(savedUser, false);
        } else {
            const loginRequested = window.__nttLoginRequested
                || new URLSearchParams(window.location.search).get('login') === '1';
            if (loginRequested) this.showLoginPage();
            else this.showLandingPage();
        }

        const today = this.toISODateOnly(new Date());
        document.getElementById('sessionDate').value = today;
    }
    // Requests cùng origin mang cookie HttpOnly; frontend không còn giữ bearer token.
    escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[character]));
    }

    escapeHtmlAttr(value) {
        return this.escapeHtml(value);
    }

    clearSensitiveClientState() {
        this.currentUser = null;
        this.currentRole = null;
        this.currentStudentId = null;
        this.students = [];
        this.sessions = [];
        this.users = [];
        this.scores = [];
        this.requests = [];
        this.requestsLoaded = false;
        this.requestImageDraft = [];
        this.aiChatHistory = [];
        this.aiChatSavedLoaded = false;
        this._invoiceQrDataUrl = null;
        this._invoiceTemplateCache = new Map();
        this._invoiceTemplateLoadToken = null;
    }

    authHeaders(extra = {}) {
        return { 'X-NTT-Client': 'web', ...extra };
    }

    async authFetch(url, options = {}) {
        const opts = { ...options, credentials: 'same-origin' };
        opts.headers = this.authHeaders(options.headers || {});
        const response = await fetch(url, opts);
        if (response.status === 401 && this.currentUser && !this._sessionExpiredHandled) {
            this._sessionExpiredHandled = true;
            this.clearSensitiveClientState();
            localStorage.removeItem('pinky_current_user');
            localStorage.removeItem('pinky_students');
            localStorage.removeItem('pinky_sessions');
            localStorage.removeItem('nttclass_remembered_username');
            localStorage.removeItem('nttclass_invoice_qr');
            this._invoiceQrDataUrl = null;
            this.showLoginPage();
            this.showToast('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.', 'error');
            setTimeout(() => { this._sessionExpiredHandled = false; }, 1000);
        }
        return response;
    }

    // Mọi thao tác ghi dữ liệu phải đi qua hàm này. Trước đây nhiều màn hình
    // chỉ kiểm tra res.ok rồi nuốt nội dung lỗi, sau đó lưu tạm localStorage và
    // vẫn báo thành công. Kết quả là người dùng tưởng đã lưu nhưng tải lại thì
    // dữ liệu biến mất. Hàm chung này giữ đúng thông báo từ server và tuyệt đối
    // không biến một request lỗi thành một lần lưu thành công giả.
    async requireApiSuccess(response, fallbackMessage = 'Không thể lưu dữ liệu.') {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            const message = payload && (payload.error || payload.message);
            throw new Error(message || fallbackMessage);
        }
        return payload;
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
            // Ngày sinh (yyyy-mm-dd, khớp trực tiếp với <input type="date">) —
            // có thể null với học sinh cũ chưa nhập.
            dob: s.DateOfBirth || null,
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

    // Dùng cho công nợ: lấy mọi buổi học từ trước tới hết kỳ đang chọn để nợ
    // chưa thanh toán của tháng trước tự động được cộng tiếp vào tháng sau.
    filterThroughMonth(sessions) {
        if (!this.currentMonthFilter) return sessions || [];
        const [yearValue, monthValue] = this.currentMonthFilter.split('-').map(Number);
        const nextYear = monthValue === 12 ? yearValue + 1 : yearValue;
        const nextMonth = monthValue === 12 ? 1 : monthValue + 1;
        const endExclusive = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
        return (sessions || []).filter(session => session.date && String(session.date).slice(0, 10) < endExclusive);
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
                    recurrenceGroupId: row.RecurrenceGroupId || null,
                    recurrenceSequence: row.RecurrenceSequence === null || row.RecurrenceSequence === undefined ? null : Number(row.RecurrenceSequence),
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
                    homework: row.Homework || '',
                    attitude: row.Attitude || '',
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
    async loadStudentSelfData(options = {}) {
        const shouldRender = options.render !== false;
        try {
            const [resMe, resSched, resScores] = await Promise.all([
                this.authFetch(`${API_BASE_URL}/api/me`),
                this.authFetch(`${API_BASE_URL}/api/me/schedule`),
                this.authFetch(`${API_BASE_URL}/api/me/scores`)
            ]);
            if (!resMe.ok) {
                const errBody = await resMe.json().catch(() => ({}));
                throw new Error(errBody.error || `GET /api/me -> ${resMe.status}`);
            }

            const [me, rawSched, rawScores] = await Promise.all([
                resMe.json(),
                resSched.ok ? resSched.json() : Promise.resolve([]),
                resScores.ok ? resScores.json() : Promise.resolve([])
            ]);
            this.students = [this.normalizeStudent({
                Id: me.Id, Name: me.Name, Class: me.Class,
                GradeLevel: me.GradeLevel, Subject: me.Subject,
                BasePrice: 0, TeacherId: this.currentUser.assignedTeacherId
            })];
            this.currentStudentId = me.Id;
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
            this.scores = Array.isArray(rawScores) ? rawScores : [];
            this.computeSessionPaidFlags();
            this.populateMonthFilterOptions();
            this.populateStudentPickers();
            if (shouldRender && this.currentUser) this.updateAllViews();
        } catch (err) {
            console.error('[loadStudentSelfData]', err.message);
            this.students = [];
            this.sessions = [];
            this.scores = [];
            this.populateStudentPickers();
            if (shouldRender && this.currentUser) this.updateAllViews();
            this.showToast('Không tải được dữ liệu cá nhân của bạn.', 'error');
        }
    }

    async loadData(options = {}) {
        const shouldRender = options.render !== false;
        if (this.currentRole === 'admin') {
            this.students = [];
            this.sessions = [];
            this.scores = [];
            this.populateStudentPickers();
            if (shouldRender && this.currentUser) this.updateAllViews();
            return;
        }
        if (this.currentRole === 'student') {
            return this.loadStudentSelfData(options);
        }

        try {
            const [resStud, resSess, resScores] = await Promise.all([
                this.authFetch(`${API_BASE_URL}/api/students`),
                this.authFetch(`${API_BASE_URL}/api/sessions`),
                this.authFetch(`${API_BASE_URL}/api/scores`)
            ]);
            if (!resStud.ok) {
                const errBody = await resStud.json().catch(() => ({}));
                throw new Error(`GET /api/students -> ${resStud.status}: ${errBody.error || 'API error'}`);
            }
            if (!resSess.ok) {
                const errBody = await resSess.json().catch(() => ({}));
                throw new Error(`GET /api/sessions -> ${resSess.status}: ${errBody.error || 'API error'}`);
            }

            const [rawStudents, rawSessions, rawScores] = await Promise.all([
                resStud.json(),
                resSess.json(),
                resScores.ok ? resScores.json() : Promise.resolve([])
            ]);
            this.students = rawStudents.map(student => this.normalizeStudent(student));
            this.sessions = Array.isArray(rawSessions) ? rawSessions : [];
            this.scores = Array.isArray(rawScores) ? rawScores : [];
            this.computeSessionPaidFlags();
            this.populateMonthFilterOptions();
            this.populateStudentPickers();
            if (shouldRender && this.currentUser) this.updateAllViews();
        } catch (err) {
            console.error('Lỗi khi kết nối API Server:', err.message);
            this.students = [];
            this.sessions = [];
            this.scores = [];
            this.populateStudentPickers();
            if (shouldRender && this.currentUser) this.updateAllViews();
            this.showToast('Không tải được dữ liệu hệ thống. Vui lòng thử lại.', 'error');
        }
    }

    async saveData() {
        this.computeSessionPaidFlags();
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

    initSidebarCollapse() {
        const sidebar = document.querySelector('.sidebar');
        const toggle = document.getElementById('sidebarCollapseToggle');
        if (!sidebar || !toggle) return;

        const icons = {
            'view-dashboard': '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
            'view-logs': '<svg viewBox="0 0 24 24"><path d="M6 3h9l3 3v15H6z"/><path d="M9 11h6M9 15h6M9 7h3"/></svg>',
            'view-scheduler': '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>',
            'view-tuition': '<svg viewBox="0 0 24 24"><path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
            'view-students': '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3"/><path d="M5 21c.7-4 3-6 7-6s6.3 2 7 6"/></svg>',
            'view-users': '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="10" r="2"/><path d="M3 21c.6-4 2.6-6 6-6s5.4 2 6 6M15 15c3 0 4.8 1.7 5.4 4"/></svg>',
            'view-scores': '<svg viewBox="0 0 24 24"><path d="m4 15 5-5 4 3 7-8"/><path d="M16 5h4v4"/><path d="M4 20h16"/></svg>',
            'view-ai-chat': '<svg viewBox="0 0 24 24"><path d="M5 5h14v11H9l-4 3z"/><path d="M9 10h.01M12 10h.01M15 10h.01"/></svg>',
            'view-requests': '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h5M8 16h4"/><path d="m15 16 1.5 1.5L20 14"/></svg>'
        };

        document.querySelectorAll('.menu-item').forEach(item => {
            if (item.querySelector('.menu-icon')) return;
            const icon = document.createElement('span');
            icon.className = 'menu-icon';
            icon.setAttribute('aria-hidden', 'true');
            icon.innerHTML = icons[item.dataset.target] || icons['view-dashboard'];
            item.prepend(icon);
        });

        const applyState = (collapsed) => {
            sidebar.classList.toggle('is-collapsed', collapsed);
            toggle.setAttribute('aria-expanded', String(!collapsed));
            const label = collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng';
            toggle.setAttribute('aria-label', label);
            toggle.setAttribute('title', label);
        };

        applyState(localStorage.getItem('nttclass_sidebar_collapsed') === 'true');
        toggle.addEventListener('click', () => {
            const collapsed = !sidebar.classList.contains('is-collapsed');
            applyState(collapsed);
            localStorage.setItem('nttclass_sidebar_collapsed', String(collapsed));
        });
    }

}

// ----------------------------------------------------------------
// (Gộp thêm từ utils.js) — Modal, định dạng ngày tháng kiểu VN, toast
// ----------------------------------------------------------------
// ================================================================
// UTILS.JS — Modal, định dạng ngày tháng kiểu VN, toast thông báo...
// ================================================================
Object.assign(PinkyClassApp.prototype, {
    openModal(modalId) {
        document.getElementById(modalId).classList.add('show');
    },

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('show');
    },

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
    },

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
    },

    // Parse an toàn chuỗi "yyyy-mm-dd" (hoặc "yyyy-mm-ddTHH:mm:ss...") thành
    // đối tượng Date ở giờ LOCAL, không đi qua UTC nên không bao giờ lệch ngày.
    parseLocalDate(dateStr) {
        if (!dateStr) return null;
        const datePart = String(dateStr).slice(0, 10); // chỉ lấy "yyyy-mm-dd"
        const [y, m, d] = datePart.split('-').map(Number);
        if (!y || !m || !d) return null;
        return new Date(y, m - 1, d);
    },

    // Trả về Date của Thứ 2 (Monday) thuộc tuần chứa ngày `d`
    getMonday(d) {
        const date = new Date(d);
        date.setHours(0, 0, 0, 0);
        const day = date.getDay(); // 0 = CN, 1 = T2, ...
        const diff = (day === 0 ? -6 : 1 - day); // đưa về Thứ 2
        date.setDate(date.getDate() + diff);
        return date;
    },

    toISODateOnly(d) {
        const y = d.getFullYear();
        const m = (d.getMonth() + 1).toString().padStart(2, '0');
        const day = d.getDate().toString().padStart(2, '0');
        return `${y}-${m}-${day}`;
    },

    // Trạng thái "đã dạy" (completed) được suy ra TỰ ĐỘNG từ ngày + giờ kết
    // thúc của buổi học so với thời điểm hiện tại — không còn dựa vào checkbox
    // giáo viên phải tự tay tích ("Đã dạy buổi này (chấm công)"). Nhờ vậy học
    // phí luôn được tính đúng, không bị thất thoát doanh thu chỉ vì quên
    // chấm công thủ công.
    isSessionCompleted(sess) {
        if (!sess || !sess.date) return false;
        const [eh, em] = (sess.endTime || '23:59').split(':').map(Number);
        const end = this.parseLocalDate(sess.date);
        if (!end) return false;
        end.setHours(eh || 0, em || 0, 0, 0);
        return end.getTime() <= Date.now();
    },

    queueDeletion(label, commit) {
        this._pendingDeletions = this._pendingDeletions || new Map();
        let stack = document.getElementById('undoDeletionStack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'undoDeletionStack';
            stack.className = 'undo-deletion-stack';
            document.body.appendChild(stack);
        }

        const deletionId = `del_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const item = document.createElement('div');
        item.className = 'undo-deletion-item';
        item.innerHTML = `
            <div class="undo-deletion-copy">
                <strong>${this.escapeHtml ? this.escapeHtml(label) : label}</strong>
                <span>Sẽ xóa sau 7 giây</span>
            </div>
            <button type="button" class="undo-deletion-btn">Hoàn tác</button>
            <span class="undo-deletion-progress" aria-hidden="true"></span>
        `;
        stack.appendChild(item);

        const pending = { cancelled: false, timer: null, item };
        this._pendingDeletions.set(deletionId, pending);
        const removePending = () => {
            this._pendingDeletions.delete(deletionId);
            item.remove();
            if (stack && !stack.children.length) stack.remove();
        };

        item.querySelector('.undo-deletion-btn').addEventListener('click', () => {
            pending.cancelled = true;
            clearTimeout(pending.timer);
            removePending();
            this.showToast('Đã hoàn tác. Dữ liệu vẫn được giữ nguyên.', 'success');
        });
        pending.timer = setTimeout(async () => {
            removePending();
            if (pending.cancelled) return;
            try {
                await commit();
            } catch (err) {
                this.showToast(err.message || `Không thể xóa ${label.toLowerCase()}.`, 'error');
            }
        }, 7000);
    },

    async runDeletionRefresh(refresh) {
        const previous = this._deletionRefresh || Promise.resolve();
        const current = previous.catch(() => {}).then(refresh);
        this._deletionRefresh = current;
        try {
            return await current;
        } finally {
            if (this._deletionRefresh === current) this._deletionRefresh = null;
        }
    },

    // Toast Alert Helper
    showToast(message, type = "success") {
        const toast = document.getElementById('toastNotification');
        const icon = document.getElementById('toastIcon');
        const msg = document.getElementById('toastMessage');

        msg.innerText = message;
        toast.className = 'notification show ' + type;
        const undoBtn = document.getElementById('undoDeleteBtn');
        if (undoBtn) undoBtn.hidden = true;

        if (type === 'success') {
            icon.innerHTML = ' ';
        } else {
            icon.innerHTML = ' ';
        }

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
});
