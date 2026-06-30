// PinkyClass Student Management System
// JavaScript logic with localStorage and role-based views

const MOCK_STUDENTS = [];
const MOCK_SESSIONS = [];

class PinkyClassApp {
    constructor() {
        this.students = [];
        this.sessions = [];
        this.users = [];
        this.currentUser = null;
        this.currentRole = null; // admin or teacher
        this.currentStudentId = null; // Active student filter

        this.init();
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
        }

        // Default date on scheduler to today
        const today = new Date().toISOString().split('T')[0];
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
        return {
            id: s.Id,
            name: s.Name,
            class: s.Class,
            subject: s.Subject,
            basePrice: s.BasePrice,
            teacherId: s.TeacherId
        };
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

    async loadData() {
        try {
            const resStud = await this.authFetch('http://localhost:3000/api/students');
            if (!resStud.ok) {
                const errBody = await resStud.json().catch(() => ({}));
                throw new Error(`GET /api/students -> ${resStud.status}: ${errBody.error || 'API error'}`);
            }
            const rawStudents = await resStud.json();
            console.log('[loadData] /api/students trả về', rawStudents.length, 'học sinh');
            this.students = rawStudents.map(s => this.normalizeStudent(s));

            const resSess = await this.authFetch('http://localhost:3000/api/sessions');
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

            this.populateStudentPickers();
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
        }
    }

    async saveData() {
        localStorage.setItem('pinky_students', JSON.stringify(this.students));
        localStorage.setItem('pinky_sessions', JSON.stringify(this.sessions));
        this.updateAllViews();
    }

    registerEvents() {
        // Lọc học sinh theo lớp (Lớp 6 -> Lớp 12)
        const gradeFilterEl = document.getElementById('studentGradeFilter');
        if (gradeFilterEl) {
            gradeFilterEl.addEventListener('change', () => this.renderStudentList());
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

        // Scheduler Sub-tabs (List vs Weekly)
        document.querySelectorAll('[data-tab]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabId = btn.getAttribute('data-tab');
                document.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
                document.getElementById(tabId).style.display = 'block';
            });
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
            const today = new Date().toISOString().split('T')[0];
            document.getElementById('sessionDate').value = today;
            this.renderStudentSelectionGrid('studentsCheckboxGrid');
        });

        // Quick add session floating button
        document.getElementById('quickScheduleBtn').addEventListener('click', () => {
            this.switchView('view-scheduler');
            // Scroll to the logger form
            document.getElementById('logger-form-card').scrollIntoView({ behavior: 'smooth' });
        });

        // Date filters for list view
        document.getElementById('filterStartDate').addEventListener('change', () => this.renderSessionListTab());
        document.getElementById('filterEndDate').addEventListener('change', () => this.renderSessionListTab());
        document.getElementById('clearFiltersBtn').addEventListener('click', () => {
            document.getElementById('filterStartDate').value = '';
            document.getElementById('filterEndDate').value = '';
            this.renderSessionListTab();
        });

        // Export Log Action
        document.getElementById('btnExportLog').addEventListener('click', () => {
            this.exportStudentLogToCSV();
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

        // Student Manager Add Student Button
        document.getElementById('addNewStudentBtn').addEventListener('click', () => {
            this.openModal('addStudentModal');
        });

        // Session Type selection changes unit prices or selections
        document.getElementById('sessionType').addEventListener('change', (e) => {
            const isGroup = e.target.value === 'chung';
            const priceInput = document.getElementById('sessionPrice');
            if (isGroup) {
                // Average group price or base
                priceInput.value = 250000;
            } else {
                // If single student selected, set their base price
                this.updateFormPriceFromSelectedStudent();
            }
        });

        // User Management (Admin only)
        document.getElementById('addNewUserBtn').addEventListener('click', () => {
            this.openAddUserModal();
        });
        document.getElementById('addUserForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSaveUser();
        });
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
        this.currentStudentId = this.currentStudentId || (this.students[0] ? this.students[0].id : null);
        const roleLabel = user.role === 'admin' ? 'Quản trị viên' : user.role === 'teacher' ? 'Giáo viên' : 'Trợ giảng';
        document.getElementById('sidebarUserName').innerText = user.name;
        document.getElementById('sidebarUserRole').innerText = user.role === 'assistant' && user.assignedTeacherName
            ? `${roleLabel} (của ${user.assignedTeacherName})`
            : roleLabel;
        this.showAppPage();
        this.switchRole(user.role);
        this.switchView(user.role === 'admin' ? 'view-users' : 'view-dashboard');
        this.showToast(`Đăng nhập thành công với vai trò: ${roleLabel}`, 'success');
    }

    async handleLoginSubmit() {
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value.trim();
        if (!username || !password) {
            this.showToast('Vui lòng nhập tên đăng nhập và mật khẩu.', 'error');
            return;
        }

        try {
            const res = await fetch('http://127.0.0.1:3000/api/login', {
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
            await this.onLoginSuccess(user);
        } catch (err) {
            this.showToast(err.message || 'Đăng nhập thất bại.', 'error');
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
            badge.innerText = '🔑 Quản trị viên';
            badge.classList.add('role-badge-admin');
        } else if (role === 'teacher') {
            badge.innerText = '👑 Giáo viên';
            badge.classList.add('role-badge-teacher');
        } else if (role === 'assistant') {
            badge.innerText = '📝 Trợ giảng';
            badge.classList.add('role-badge-assistant');
        } else {
            badge.innerText = '🎒 Học sinh';
            badge.classList.add('role-badge-student');
        }

        // Show/hide navigation tabs
        const navDashboard = document.getElementById('nav-dashboard');
        const navLogs = document.getElementById('nav-logs');
        const navTuition = document.getElementById('nav-tuition');
        const navScheduler = document.getElementById('nav-scheduler');
        const navStudents = document.getElementById('nav-students');
        const navUsers = document.getElementById('nav-users');
        const quickScheduleBtn = document.getElementById('quickScheduleBtn');
        const picker = document.getElementById('studentContextPicker');

        if (role === 'admin') {
            // Admin: chỉ được quản lý tài khoản người dùng, không truy cập
            // các chức năng dạy học khác.
            navDashboard.style.display = 'none';
            navLogs.style.display = 'none';
            navTuition.style.display = 'none';
            navScheduler.style.display = 'none';
            navStudents.style.display = 'none';
            navUsers.style.display = 'flex';
            quickScheduleBtn.style.display = 'none';
            picker.style.display = 'none';
        } else if (role === 'assistant') {
            navDashboard.style.display = 'flex';
            navLogs.style.display = 'flex';
            navTuition.style.display = 'flex';
            navScheduler.style.display = 'flex';
            navStudents.style.display = 'flex'; // TA can view classes/students of their assigned teacher
            navUsers.style.display = 'none';
            quickScheduleBtn.style.display = 'flex';
            picker.style.display = 'flex';
        } else {
            // teacher: toàn quyền với các chức năng dạy học
            navDashboard.style.display = 'flex';
            navLogs.style.display = 'flex';
            navTuition.style.display = 'flex';
            navScheduler.style.display = 'flex';
            navStudents.style.display = 'flex';
            navUsers.style.display = 'none';
            quickScheduleBtn.style.display = 'flex';
            picker.style.display = 'flex';
        }

        // Trigger UI updates
        this.updateAllViews();
        const roleLabel = role === 'admin' ? 'Quản trị viên' : role === 'teacher' ? 'Giáo viên' : role === 'assistant' ? 'Trợ giảng' : 'Học sinh';
        this.showToast(`Đã chuyển sang vai trò: ${roleLabel}`, "success");
    }

    populateStudentPickers() {
        const globalPicker = document.getElementById('globalStudentPicker');
        globalPicker.innerHTML = '';
        
        this.students.forEach(st => {
            const opt = document.createElement('option');
            opt.value = st.id;
            opt.innerText = `${st.name} (${st.class})`;
            globalPicker.appendChild(opt);
        });

        if (this.students.length > 0) {
            // Restore selection if exists
            if (this.students.find(s => s.id === this.currentStudentId)) {
                globalPicker.value = this.currentStudentId;
            } else {
                this.currentStudentId = this.students[0].id;
                globalPicker.value = this.currentStudentId;
            }
        }

        // Also render checkboxes in scheduler logger form
        this.renderStudentSelectionGrid('studentsCheckboxGrid');
        this.renderStudentSelectionGrid('editStudentsCheckboxGrid');
    }

    renderStudentSelectionGrid(containerId) {
        const grid = document.getElementById(containerId);
        grid.innerHTML = '';
        this.students.forEach(st => {
            const label = document.createElement('label');
            label.className = 'student-check-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = st.id;
            checkbox.name = containerId === 'studentsCheckboxGrid' ? 'sessionStudents' : 'editSessionStudents';
            
            // Auto check if it's the current selected student
            if (st.id === this.currentStudentId && containerId === 'studentsCheckboxGrid') {
                checkbox.checked = true;
            }

            // Click listener to update default price
            checkbox.addEventListener('change', () => {
                if (containerId === 'studentsCheckboxGrid') {
                    this.updateFormPriceFromSelectedStudent();
                }
            });

            const span = document.createElement('span');
            span.innerText = `${st.name} - ${st.class}`;
            
            label.appendChild(checkbox);
            label.appendChild(span);
            grid.appendChild(label);
        });
    }

    updateFormPriceFromSelectedStudent() {
        const type = document.getElementById('sessionType').value;
        if (type === 'rieng') {
            const checkedBoxes = document.querySelectorAll('input[name="sessionStudents"]:checked');
            if (checkedBoxes.length === 1) {
                const studentId = checkedBoxes[0].value;
                const student = this.students.find(s => s.id === studentId);
                if (student) {
                    document.getElementById('sessionPrice').value = student.basePrice;
                }
            }
        }
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
        this.renderSessionListTab();
        this.renderWeeklyAttendanceGrid();
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

    // --- VIEW 1: DASHBOARD ---
    renderDashboard() {
        // Set stats cards counts
        document.getElementById('stat-total-students').innerText = this.students.length;
        
        let totalSessions = 0;
        let totalHours = 0;
        let unpaidTuition = 0;

        if (this.currentRole === 'student') {
            // Only count for current student
            const studentSessions = this.sessions.filter(sess => sess.studentIds.includes(this.currentStudentId));
            totalSessions = studentSessions.length;
            totalHours = studentSessions.reduce((acc, curr) => acc + parseFloat(curr.duration), 0);
            
            // Sum unpaid tuition for this student
            studentSessions.forEach(sess => {
                if (!sess.completed) {
                    // Price divided by number of participants if it's a shared session, or full price
                    const partCount = sess.studentIds.length;
                    unpaidTuition += sess.price / partCount;
                }
            });
        } else {
            // Teacher & Assistant see all stats
            totalSessions = this.sessions.length;
            totalHours = this.sessions.reduce((acc, curr) => acc + parseFloat(curr.duration), 0);
            
            // Sum all unpaid sessions
            this.sessions.forEach(sess => {
                if (!sess.completed) {
                    unpaidTuition += sess.price;
                }
            });
        }

        document.getElementById('stat-total-sessions').innerText = totalSessions;
        document.getElementById('stat-total-hours').innerText = totalHours.toFixed(1) + 'h';
        document.getElementById('stat-unpaid-tuition').innerText = this.formatVND(unpaidTuition);

        // Render today classes
        const todayStr = new Date().toISOString().split('T')[0];
        const todaySessions = this.sessions.filter(s => s.date === todayStr);
        const container = document.getElementById('today-sessions-container');
        container.innerHTML = '';

        if (todaySessions.length === 0) {
            container.innerHTML = `
                <div style="padding: 15px; text-align: center; color: var(--text-muted); font-size: 13.5px;">
                    <i class="fa-solid fa-calendar-xmark" style="font-size: 24px; color: var(--accent); margin-bottom: 8px; display: block;"></i>
                    Không có ca dạy nào được xếp hôm nay (${this.formatDateVN(todayStr)}).
                </div>
            `;
        } else {
            todaySessions.forEach(sess => {
                const item = document.createElement('div');
                item.style.padding = '12px';
                item.style.background = 'white';
                item.style.border = '1px solid var(--border-color)';
                item.style.borderRadius = '10px';
                item.style.marginBottom = '8px';
                
                const names = sess.studentIds.map(id => this.getStudentName(id)).join(', ');
                const badgeClass = sess.type === 'riêng' ? 'badge-rieng' : 'badge-chung';
                
                item.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                        <span style="font-weight: 600; font-size: 13px; color: var(--primary);">${sess.startTime} - ${sess.endTime}</span>
                        <span class="badge ${badgeClass}" style="font-size: 10px; padding: 2px 8px;">Học ${sess.type}</span>
                    </div>
                    <div style="font-size:14px; font-weight:700; color:var(--text-main);">${names}</div>
                    <div style="font-size:12px; color:var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 4px;">
                        ${sess.content ? sess.content.replace(/\n/g, ' | ') : 'Chưa có nội dung'}
                    </div>
                `;
                container.appendChild(item);
            });
        }
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
        const studentSessions = this.sessions
            .filter(sess => sess.studentIds.includes(studentId))
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        // Group Indicator (just private vs group text based on ratio)
        const privateCount = studentSessions.filter(s => s.type === 'riêng').length;
        const groupCount = studentSessions.filter(s => s.type === 'chung').length;
        const indicator = document.getElementById('logBadgeIndicator');
        if (privateCount > groupCount) {
            indicator.className = 'badge badge-rieng';
            indicator.innerHTML = `<i class="fa-solid fa-user"></i> Chủ yếu học riêng (${privateCount}b)`;
        } else if (groupCount > privateCount) {
            indicator.className = 'badge badge-chung';
            indicator.innerHTML = `<i class="fa-solid fa-user-group"></i> Chủ yếu học chung (${groupCount}b)`;
        } else {
            indicator.className = 'badge';
            indicator.style.background = '#f1f5f9';
            indicator.style.color = '#334155';
            indicator.style.borderColor = '#cbd5e1';
            indicator.innerHTML = `<i class="fa-solid fa-chart-simple"></i> Cân bằng chung/riêng`;
        }

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
            
            // Homework select badge style setup
            const detail = sess.studentDetails[studentId] || { homework: 'Chưa làm', attitude: 'Tốt', individualComment: '', note: '' };
            
            let hwClass = 'pending';
            if (detail.homework === 'Hoàn thành') hwClass = 'done';
            if (detail.homework === 'Chưa hoàn thành') hwClass = 'not-done';

            const homeworkDropdown = `
                <select class="homework-select ${hwClass}" data-session="${sess.id}" data-student="${studentId}" ${this.currentRole === 'student' ? 'disabled' : ''}>
                    <option value="Hoàn thành" ${detail.homework === 'Hoàn thành' ? 'selected' : ''}>✅ Hoàn thành</option>
                    <option value="Chưa hoàn thành" ${detail.homework === 'Chưa hoàn thành' ? 'selected' : ''}>❌ Không hoàn thành</option>
                    <option value="Chưa làm" ${detail.homework === 'Chưa làm' ? 'selected' : ''}>⚠️ Chưa làm / Chưa nộp</option>
                </select>
            `;

            // Session Date display formatted like 'Thứ 7 - 23/05'
            const dateObj = new Date(sess.date);
            const dateStr = this.formatDateVN(sess.date);

            // Nội dung format lines
            const contentLines = sess.content ? sess.content.split('\n') : [];
            let contentHTML = '<ul class="bullet-list">';
            contentLines.forEach(line => {
                if (line.trim().startsWith('BTVN:')) {
                    contentHTML += `<li class="subtask">${line}</li>`;
                } else if (line.trim()) {
                    contentHTML += `<li>${line}</li>`;
                }
            });
            contentHTML += '</ul>';

            // Nhận xét column (Image 1 layout)
            // Displays group remarks if group session, then individual remarks
            let commentHTML = '';
            if (sess.type === 'chung' && sess.generalComment) {
                commentHTML += `
                    <div class="comment-block">
                        <div class="comment-header"><span>Nhận xét chung ca</span> <span class="badge badge-chung" style="font-size:8px; padding:1px 4px;">Chung</span></div>
                        <div class="comment-text" style="color: #6d28d9; font-weight: 500;">${sess.generalComment}</div>
                    </div>
                    <div class="comment-divider"></div>
                `;
            }

            commentHTML += `
                <div class="comment-block">
                    <div class="comment-header"><span>Nhận xét riêng</span></div>
                    <div class="comment-text">${detail.individualComment || sess.generalComment || 'Chưa nhận xét.'}</div>
                </div>
            `;

            // Actions for edit
            const actionsHTML = `
                <button class="btn btn-secondary btn-sm" onclick="app.openUpdateLogModal('${sess.id}', '${studentId}')">
                    <i class="fa-solid fa-pen-to-square"></i> Đánh giá
                </button>
            `;

            tr.innerHTML = `
                <td class="session-number-cell">
                    <span class="session-number-val">Buổi ${idx + 1}</span>
                    <span class="session-time-val">${sess.startTime} - ${sess.endTime}</span>
                </td>
                <td class="session-date-cell">${dateStr}</td>
                <td>${contentHTML}</td>
                <td style="text-align:center;">${homeworkDropdown}</td>
                <td><strong>${detail.attitude || 'Tập trung'}</strong></td>
                <td>${commentHTML}</td>
                <td><span style="font-size:13px; color:var(--text-muted);">${detail.note || '-'}</span></td>
                <td class="role-restricted admin-tutor">${actionsHTML}</td>
            `;

            tbody.appendChild(tr);
        });

        // Hook up immediate select change listeners
        document.querySelectorAll('.homework-select').forEach(sel => {
            sel.addEventListener('change', (e) => {
                const sId = sel.getAttribute('data-session');
                const studId = sel.getAttribute('data-student');
                const val = e.target.value;
                
                const sessionObj = this.sessions.find(x => x.id === sId);
                if (sessionObj && sessionObj.studentDetails[studId]) {
                    sessionObj.studentDetails[studId].homework = val;
                    this.saveData();
                    this.showToast(`Đã cập nhật bài tập của ${this.getStudentName(studId)}: ${val}`, "success");
                }
            });
        });
    }

    // --- VIEW 3: SCHEDULER & SESSION LIST (Image 2 and 3) ---
    renderSessionListTab() {
        const container = document.getElementById('sessionsListContainer');
        container.innerHTML = '';

        const filterStart = document.getElementById('filterStartDate').value;
        const filterEnd = document.getElementById('filterEndDate').value;

        // Filter sessions list
        let filtered = [...this.sessions];
        
        // If student role, only show theirs
        if (this.currentRole === 'student') {
            filtered = filtered.filter(s => s.studentIds.includes(this.currentStudentId));
        }

        if (filterStart) {
            filtered = filtered.filter(s => s.date >= filterStart);
        }
        if (filterEnd) {
            filtered = filtered.filter(s => s.date <= filterEnd);
        }

        // Sort desc
        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Calculate filtered summary stats
        const totalCount = filtered.length;
        const totalHrs = filtered.reduce((a, b) => a + parseFloat(b.duration), 0);
        const privateCount = filtered.filter(s => s.type === 'riêng').length;
        const groupCount = filtered.filter(s => s.type === 'chung').length;
        
        // Sum total money (if student role: sum their portion; else sum absolute total)
        let totalMoney = 0;
        filtered.forEach(s => {
            if (this.currentRole === 'student') {
                totalMoney += s.price / s.studentIds.length;
            } else {
                totalMoney += s.price;
            }
        });

        document.getElementById('summary-total-sessions').innerText = totalCount;
        document.getElementById('summary-total-hours').innerText = totalHrs.toFixed(1);
        document.getElementById('summary-ratio').innerText = `${privateCount}/${groupCount}`;
        document.getElementById('summary-total-money').innerText = this.formatVND(totalMoney);

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-calendar-day"></i>
                    <h3>Không tìm thấy buổi học nào</h3>
                    <p>Hãy điều chỉnh khoảng thời gian lọc hoặc thêm ca dạy mới.</p>
                </div>
            `;
            return;
        }

        filtered.forEach(sess => {
            const card = document.createElement('div');
            card.className = 'session-item';

            const badgeClass = sess.type === 'riêng' ? 'badge-rieng' : 'badge-chung';
            const studentNames = sess.studentIds.map(id => this.getStudentName(id)).join(', ');
            
            // Format details of students inside card
            let studentsTagsHTML = '';
            sess.studentIds.forEach(id => {
                studentsTagsHTML += `<span class="student-tag">${this.getStudentName(id)}</span>`;
            });

            // Date format components
            const d = new Date(sess.date);
            const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
            const dayName = days[d.getDay()];
            const formattedDateStr = `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;

            let actionsHTML = '';
            if (this.currentRole === 'teacher') {
                actionsHTML = `
                    <div class="session-actions">
                        <button class="btn btn-secondary btn-sm" onclick="app.openEditSessionModal('${sess.id}')">
                            <i class="fa-solid fa-pencil"></i> Sửa
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="app.deleteSession('${sess.id}')">
                            <i class="fa-solid fa-trash-can"></i> Xóa
                        </button>
                    </div>
                `;
            } else if (this.currentRole === 'assistant') {
                // Tutor can edit but not delete
                actionsHTML = `
                    <div class="session-actions">
                        <button class="btn btn-secondary btn-sm" onclick="app.openEditSessionModal('${sess.id}')">
                            <i class="fa-solid fa-pencil"></i> Sửa
                        </button>
                    </div>
                `;
            }

            const priceDisplay = this.currentRole === 'student' 
                ? `<span style="font-weight:700; color:var(--primary);">${this.formatVND(sess.price / sess.studentIds.length)}</span> <span style="font-size:11px; color:var(--text-muted);">(Học chung chia đều)</span>`
                : `<span style="font-weight:700; color:var(--primary);">${this.formatVND(sess.price)}</span>`;

            card.innerHTML = `
                <div class="session-info">
                    <div class="session-date-box">
                        <span class="day">${formattedDateStr}</span>
                        <span class="year">${dayName}</span>
                    </div>
                    <div class="session-details">
                        <div class="session-time-row">
                            <span><i class="fa-regular fa-clock" style="color:var(--primary);"></i> ${sess.startTime} – ${sess.endTime} (${sess.duration} giờ)</span>
                            <span class="badge ${badgeClass}">Học ${sess.type}</span>
                            <span style="color:var(--text-muted); font-size:12px;">|</span>
                            <span class="role-restricted admin-only" style="font-weight:600;">Đơn giá: ${priceDisplay}</span>
                        </div>
                        <div class="session-students">
                            ${studentsTagsHTML}
                        </div>
                        <div style="font-size:13px; color:var(--text-main); margin-top: 4px; border-left:2px solid var(--primary); padding-left:8px; white-space: pre-line;">
                            ${sess.content || 'Không có ghi chú nội dung'}
                        </div>
                    </div>
                </div>
                ${actionsHTML}
            `;

            container.appendChild(card);
        });
    }

    // --- VIEW 3 SUB-TAB 2: WEEKLY ATTENDANCE GRID (Image 4 replica) ---
    renderWeeklyAttendanceGrid() {
        const tbody = document.getElementById('weeklyAttendanceTableBody');
        tbody.innerHTML = '';

        // Sort all sessions by date chronological
        let sorted = [...this.sessions].sort((a, b) => new Date(a.date) - new Date(b.date));

        if (this.currentRole === 'student') {
            sorted = sorted.filter(s => s.studentIds.includes(this.currentStudentId));
        }

        if (sorted.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">
                        Chưa có ca dạy nào được lên lịch.
                    </td>
                </tr>
            `;
            return;
        }

        // Helper to group dates by custom week definitions
        // For simple demo, we will calculate week numbers based on date ranges
        // Let's create actual week labels e.g. "Tuần 1", "Tuần 2" depending on date.
        // We'll sort by month, and calculate weeks inside that month.
        let currentWeekKey = "";
        let weekCounter = 1;

        // Group by month
        sorted.forEach((sess, index) => {
            const d = new Date(sess.date);
            // Calculate a simple week string like: "Tuần 2 (Tháng 6)"
            // Week is determined by which block of 7 days in the month it falls: 1-7 (Week 1), 8-14 (Week 2), etc.
            const dateNum = d.getDate();
            const monthNum = d.getMonth() + 1;
            const weekNum = Math.ceil(dateNum / 7);
            const weekKey = `Tuần ${weekNum} (Tháng ${monthNum})`;

            const tr = document.createElement('tr');
            
            // Checkbox for completed status
            const completedCheckbox = `
                <input type="checkbox" class="weekly-status-checkbox" data-session="${sess.id}" ${sess.completed ? 'checked' : ''} ${this.currentRole === 'student' ? 'disabled' : ''} style="width: 18px; height: 18px; accent-color: var(--primary); cursor: pointer;">
            `;

            // Dropdown tags representation of ca dạy
            let caDayTags = '';
            sess.studentIds.forEach(id => {
                const sName = this.getStudentName(id);
                const sClass = this.getStudentClass(id);
                // Custom color background tags
                caDayTags += `<span class="badge" style="background:#e0f2fe; color:#0369a1; border-color:#bae6fd; font-size:11px; margin-right:4px; margin-bottom:4px;">${sName.toUpperCase()} ${sClass.toUpperCase()}</span>`;
            });

            // Weekly headers: merge row span or just render grouped headers
            let weekHeaderHTML = '';
            if (weekKey !== currentWeekKey) {
                currentWeekKey = weekKey;
                weekHeaderHTML = `<span style="font-weight: 700; color: var(--primary); display:block; margin-bottom: 5px;">${weekKey}</span>`;
            }

            const formattedDate = this.formatDateVN(sess.date);

            const isGroup = sess.type === 'chung';
            const priceVal = this.currentRole === 'student' ? (sess.price / sess.studentIds.length) : sess.price;

            tr.innerHTML = `
                <td>
                    ${weekHeaderHTML}
                    <span style="font-size:12px; color:var(--text-muted);">${formattedDate}</span>
                </td>
                <td>
                    <div style="display:flex; flex-wrap:wrap; align-items:center;">
                        ${caDayTags}
                        <span class="badge ${isGroup ? 'badge-chung' : 'badge-rieng'}" style="font-size:9px; padding: 1px 6px;">Học ${sess.type}</span>
                    </div>
                </td>
                <td class="role-restricted admin-only" style="font-weight:700; text-align:right;">
                    ${this.formatVND(priceVal)}
                </td>
                <td style="text-align:center; font-weight:500;">2.0</td>
                <td style="text-align:center; font-weight:700; color:var(--primary);">${sess.duration}</td>
                <td style="text-align:center;">
                    <div style="display:flex; justify-content:center; align-items:center; gap: 8px;">
                        ${completedCheckbox}
                        <span style="font-size:11px; font-weight:600; color: ${sess.completed ? '#16a34a' : '#dc2626'}">
                            ${sess.completed ? 'Đã dạy' : 'Chưa dạy'}
                        </span>
                    </div>
                </td>
                <td>
                    <div style="font-size:12.5px; color:var(--text-main); font-style:italic;">
                        ${sess.content ? sess.content.replace(/\n/g, ' / ') : 'Trống'}
                    </div>
                </td>
            `;

            tbody.appendChild(tr);
        });

        // Register checkbox update events
        document.querySelectorAll('.weekly-status-checkbox').forEach(cb => {
            cb.addEventListener('change', async (e) => {
                const sId = cb.getAttribute('data-session');
                const isChecked = e.target.checked;
                
                const sessionObj = this.sessions.find(x => x.id === sId);
                if (sessionObj) {
                    const oldStatus = sessionObj.completed;
                    sessionObj.completed = isChecked;
                    
                    try {
                        const res = await this.authFetch(`http://localhost:3000/api/sessions/${sId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(sessionObj)
                        });
                        if (!res.ok) throw new Error("Server error");
                        await this.loadData();
                    } catch (err) {
                        console.warn("API lỗi, lưu offline: ", err.message);
                        sessionObj.completed = isChecked;
                        await this.saveData();
                    }
                    this.showToast(`Đã cập nhật trạng thái buổi học: ${isChecked ? 'Đã dạy' : 'Chưa dạy'}`, "success");
                }
            });
        });
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
            const studentSessions = this.sessions.filter(sess => sess.studentIds.includes(st.id));
            
            const totalSessionsCount = studentSessions.length;
            const totalHours = studentSessions.reduce((acc, curr) => acc + parseFloat(curr.duration), 0);

            // Calculate money details
            let totalTuitionEarned = 0;
            let paidTuition = 0;
            let unpaidTuition = 0;

            studentSessions.forEach(sess => {
                // If it's a shared session, split price equally among participants
                const sessionPricePortion = sess.price / sess.studentIds.length;
                totalTuitionEarned += sessionPricePortion;
                if (sess.completed) {
                    paidTuition += sessionPricePortion;
                } else {
                    unpaidTuition += sessionPricePortion;
                }
            });

            paidSum += paidTuition;
            unpaidSum += unpaidTuition;

            const tr = document.createElement('tr');
            
            // Payment status pill
            let statusBadge = '';
            if (unpaidTuition === 0 && totalSessionsCount > 0) {
                statusBadge = '<span class="payment-status-badge payment-status-paid">Đã thanh toán</span>';
            } else if (unpaidTuition > 0) {
                statusBadge = `<span class="payment-status-badge payment-status-unpaid">Nợ ${this.formatVND(unpaidTuition)}</span>`;
            } else {
                statusBadge = '<span class="payment-status-badge" style="background:#f1f5f9; color:#64748b;">Chưa học</span>';
            }

            // Action triggers payment modal or direct toggle
            const actionBtn = `
                <button class="btn btn-secondary btn-sm" onclick="app.toggleStudentAllTuitionPaid('${st.id}')">
                    <i class="fa-solid fa-circle-check"></i> Thu học phí
                </button>
            `;

            tr.innerHTML = `
                <td><strong>${st.name}</strong></td>
                <td>${st.class} - ${st.subject}</td>
                <td style="text-align:center; font-weight:600;">${totalSessionsCount}</td>
                <td style="text-align:center; font-weight:600; color:var(--primary);">${totalHours.toFixed(1)}</td>
                
                <td class="role-restricted admin-only" style="text-align:right; font-weight:600;">${this.formatVND(totalTuitionEarned)}</td>
                <td class="role-restricted admin-only" style="text-align:right; color:#16a34a; font-weight:600;">${this.formatVND(paidTuition)}</td>
                <td class="role-restricted admin-only" style="text-align:right; color:#dc2626; font-weight:600;">${this.formatVND(unpaidTuition)}</td>
                
                <td style="text-align:center;">${statusBadge}</td>
                <td class="role-restricted admin-only" style="text-align:center;">${actionBtn}</td>
            `;

            tbody.appendChild(tr);
        });

        // Set top dashboard level sums
        document.getElementById('tuition-paid-sum').innerText = this.formatVND(paidSum);
        document.getElementById('tuition-unpaid-sum').innerText = this.formatVND(unpaidSum);
        document.getElementById('tuition-total-sum').innerText = this.formatVND(paidSum + unpaidSum);
    }

    // --- VIEW 5: STUDENT MANAGEMENT ---
    renderStudentList() {
        const tbody = document.getElementById('studentsTableBody');
        tbody.innerHTML = '';

        const filterEl = document.getElementById('studentGradeFilter');
        const gradeFilter = filterEl ? filterEl.value : '';

        // Trích số lớp từ chuỗi "Lớp 8" -> "8" để lọc/group
        const extractGrade = (cls) => {
            const m = String(cls || '').match(/\d+/);
            return m ? m[0] : '';
        };

        let list = this.students;
        if (gradeFilter) {
            list = list.filter(st => extractGrade(st.class) === gradeFilter);
        }

        if (list.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 30px; color: var(--text-muted);">
                        Chưa có học sinh nào${gradeFilter ? ' trong lớp này' : ''}. Bấm nút phía trên để thêm mới!
                    </td>
                </tr>
            `;
            return;
        }

        // Nhóm theo lớp (Lớp 6 -> Lớp 12, lớp nào không khớp số đưa xuống cuối)
        const sorted = [...list].sort((a, b) => {
            const ga = parseInt(extractGrade(a.class)) || 999;
            const gb = parseInt(extractGrade(b.class)) || 999;
            if (ga !== gb) return ga - gb;
            return (a.name || '').localeCompare(b.name || '', 'vi');
        });

        let lastClass = null;
        sorted.forEach((st, idx) => {
            if (st.class !== lastClass) {
                lastClass = st.class;
                const groupRow = document.createElement('tr');
                groupRow.innerHTML = `
                    <td colspan="6" style="background:var(--primary-soft); color:var(--primary); font-weight:700; padding:8px 14px; font-size:13px;">
                        <i class="fa-solid fa-people-group"></i> ${st.class}
                    </td>`;
                tbody.appendChild(groupRow);
            }

            const tr = document.createElement('tr');

            const actionsHTML = `
                <div style="display:flex; justify-content:center; gap:8px;">
                    <button class="btn btn-secondary btn-sm" onclick="app.editStudentPrompt('${st.id}')">
                        <i class="fa-solid fa-user-pen"></i> Sửa
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="app.deleteStudent('${st.id}')">
                        <i class="fa-solid fa-user-xmark"></i> Xóa
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

    // 1. Add Student
    async handleAddStudent() {
        const name = document.getElementById('studentName').value.trim();
        const sClass = document.getElementById('studentClass').value.trim();
        const subject = document.getElementById('studentSubject').value.trim();
        const basePrice = parseInt(document.getElementById('studentBasePrice').value) || 250000;

        if (name && sClass && subject) {
            const newStudent = {
                id: "hs_" + Date.now(),
                name,
                class: sClass,
                subject,
                basePrice
            };

            try {
                const res = await this.authFetch('http://localhost:3000/api/students', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newStudent)
                });
                if (!res.ok) throw new Error("Server error");
                await this.loadData();
            } catch (err) {
                console.warn("API lỗi, cập nhật offline: ", err.message);
                this.students.push(newStudent);
                await this.saveData();
            }

            this.populateStudentPickers();
            document.getElementById('addStudentForm').reset();
            this.closeModal('addStudentModal');
            this.showToast(`Đã thêm học sinh ${name} thành công!`, "success");
        }
    }

    // Edit student base price and names
    async editStudentPrompt(id) {
        if (this.currentRole !== 'teacher') {
            this.showToast("Chỉ Giáo viên mới có quyền chỉnh sửa học sinh!", "error");
            return;
        }

        const student = this.students.find(s => s.id === id);
        if (student) {
            const newName = prompt("Nhập tên mới:", student.name);
            if (newName === null) return; // cancel
            const newClass = prompt("Nhập lớp mới:", student.class);
            if (newClass === null) return;
            const newSubject = prompt("Nhập môn học mới:", student.subject);
            if (newSubject === null) return;
            const newPriceStr = prompt("Nhập học phí cơ bản mới (VNĐ):", student.basePrice);
            if (newPriceStr === null) return;
            const newPrice = parseInt(newPriceStr) || student.basePrice;

            const updated = {
                id: student.id,
                name: newName.trim() || student.name,
                class: newClass.trim() || student.class,
                subject: newSubject.trim() || student.subject,
                basePrice: newPrice
            };

            try {
                const res = await this.authFetch(`http://localhost:3000/api/students/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updated)
                });
                if (!res.ok) throw new Error("Server error");
                await this.loadData();
            } catch (err) {
                console.warn("API lỗi, cập nhật offline: ", err.message);
                student.name = updated.name;
                student.class = updated.class;
                student.subject = updated.subject;
                student.basePrice = updated.basePrice;
                await this.saveData();
            }

            this.populateStudentPickers();
            this.showToast("Cập nhật thông tin học sinh thành công!", "success");
        }
    }

    async deleteStudent(id) {
        if (this.currentRole !== 'teacher') {
            this.showToast("Chỉ Giáo viên mới có quyền xóa học sinh!", "error");
            return;
        }

        if (confirm("Bạn có chắc chắn muốn xóa học sinh này? Tất cả các ca học và nhật ký liên quan sẽ bị xóa!")) {
            try {
                const res = await this.authFetch(`http://localhost:3000/api/students/${id}`, { method: 'DELETE' });
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
        const date = document.getElementById('sessionDate').value;
        const startTime = document.getElementById('sessionStartTime').value;
        const endTime = document.getElementById('sessionEndTime').value;
        const duration = parseFloat(document.getElementById('sessionHours').value) || 2.0;
        const price = parseInt(document.getElementById('sessionPrice').value) || 250000;
        const content = document.getElementById('sessionContent').value.trim();

        // Get selected students
        const checkedBoxes = document.querySelectorAll('input[name="sessionStudents"]:checked');
        if (checkedBoxes.length === 0) {
            this.showToast("Vui lòng chọn ít nhất một học sinh tham gia!", "error");
            return;
        }

        const studentIds = [];
        checkedBoxes.forEach(cb => studentIds.push(cb.value));

        // Create studentDetails map
        const studentDetails = {};
        studentIds.forEach(stId => {
            studentDetails[stId] = {
                homework: "Chưa làm",
                attitude: "Tốt",
                individualComment: "",
                note: this.getStudentSubject(stId) + " " + this.getStudentClass(stId).replace("Lớp ", "")
            };
        });

        const newSession = {
            id: "sess_" + Date.now(),
            date,
            startTime,
            endTime,
            type,
            studentIds,
            duration,
            price,
            content,
            generalComment: content ? `Cả lớp học: ${content.split('\n')[0]}` : "",
            completed: true, // Default to completed once logged
            studentDetails
        };

        try {
            const res = await this.authFetch('http://localhost:3000/api/sessions', {
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
        }

        // Reset form
        document.getElementById('sessionLoggerForm').reset();
        const today = new Date().toISOString().split('T')[0];
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
        document.getElementById('editSessionDate').value = sess.date;
        document.getElementById('editSessionStartTime').value = sess.startTime;
        document.getElementById('editSessionEndTime').value = sess.endTime;
        document.getElementById('editSessionHours').value = sess.duration;
        document.getElementById('editSessionPrice').value = sess.price;
        document.getElementById('editSessionContent').value = sess.content || '';

        // Check checkboxes
        const grid = document.getElementById('editStudentsCheckboxGrid');
        grid.innerHTML = '';
        this.students.forEach(st => {
            const label = document.createElement('label');
            label.className = 'student-check-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = st.id;
            checkbox.name = 'editSessionStudents';
            
            if (sess.studentIds.includes(st.id)) {
                checkbox.checked = true;
            }

            const span = document.createElement('span');
            span.innerText = `${st.name} - ${st.class}`;
            
            label.appendChild(checkbox);
            label.appendChild(span);
            grid.appendChild(label);
        });

        this.openModal('editSessionModal');
    }

    async handleEditSession() {
        const id = document.getElementById('editSessionId').value;
        const sess = this.sessions.find(x => x.id === id);
        if (!sess) return;

        const type = document.getElementById('editSessionType').value;
        const date = document.getElementById('editSessionDate').value;
        const startTime = document.getElementById('editSessionStartTime').value;
        const endTime = document.getElementById('editSessionEndTime').value;
        const duration = parseFloat(document.getElementById('editSessionHours').value) || 2.0;
        const price = parseInt(document.getElementById('editSessionPrice').value) || 250000;
        const content = document.getElementById('editSessionContent').value.trim();

        const checkedBoxes = document.querySelectorAll('input[name="editSessionStudents"]:checked');
        if (checkedBoxes.length === 0) {
            this.showToast("Vui lòng chọn ít nhất một học sinh tham gia!", "error");
            return;
        }

        const studentIds = [];
        checkedBoxes.forEach(cb => studentIds.push(cb.value));

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
                    note: this.getStudentSubject(stId) + " " + this.getStudentClass(stId).replace("Lớp ", "")
                };
            }
        });

        const updatedSession = {
            ...sess,
            type,
            date,
            startTime,
            endTime,
            duration,
            price,
            content,
            studentIds,
            studentDetails: newStudentDetails
        };

        try {
            const res = await this.authFetch(`http://localhost:3000/api/sessions/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedSession)
            });
            if (!res.ok) throw new Error("Server error");
            await this.loadData();
        } catch (err) {
            console.warn("API lỗi, lưu offline: ", err.message);
            sess.type = type;
            sess.date = date;
            sess.startTime = startTime;
            sess.endTime = endTime;
            sess.duration = duration;
            sess.price = price;
            sess.content = content;
            sess.studentIds = studentIds;
            sess.studentDetails = newStudentDetails;
            await this.saveData();
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
                const res = await this.authFetch(`http://localhost:3000/api/sessions/${id}`, { method: 'DELETE' });
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
            const res = await this.authFetch(`http://localhost:3000/api/session-details/${sessionId}/${studentId}`, {
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

    // Toggle Payment state (Collect tuition)
    async toggleStudentAllTuitionPaid(studentId) {
        if (this.currentRole !== 'teacher') {
            this.showToast("Chỉ Giáo viên mới có quyền thu học phí!", "error");
            return;
        }

        const studentSessions = this.sessions.filter(sess => sess.studentIds.includes(studentId) && !sess.completed);
        
        if (studentSessions.length === 0) {
            this.showToast("Học sinh này đã hoàn thành tất cả học phí!", "success");
            return;
        }

        if (confirm(`Xác nhận đã thu tiền học phí cho tất cả ${studentSessions.length} buổi chưa thanh toán của học sinh ${this.getStudentName(studentId)}?`)) {
            try {
                const res = await this.authFetch(`http://localhost:3000/api/students/${studentId}/pay-all`, { method: 'PUT' });
                if (!res.ok) throw new Error("Server error");
                await this.loadData();
            } catch (err) {
                console.warn("API lỗi, cập nhật offline: ", err.message);
                studentSessions.forEach(sess => {
                    sess.completed = true;
                });
                await this.saveData();
            }
            this.showToast("Đã thanh toán học phí thành công!", "success");
        }
    }

    // Export log to CSV
    exportStudentLogToCSV() {
        const studentId = this.currentStudentId;
        const studentName = this.getStudentName(studentId);
        const studentSessions = this.sessions
            .filter(sess => sess.studentIds.includes(studentId))
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        if (studentSessions.length === 0) {
            this.showToast("Không có dữ liệu nhật ký để xuất!", "error");
            return;
        }

        let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // UTF-8 BOM
        csvContent += "STT,Ngay,Buoi Hoc,Noi Dung,Bai Tap Ve Nha,Y Thuc,Nhan Xet,Ghi Chu\n";

        studentSessions.forEach((sess, idx) => {
            const detail = sess.studentDetails[studentId] || { homework: 'Chưa làm', attitude: 'Tốt', individualComment: '', note: '' };
            const dateStr = this.formatDateVN(sess.date);
            const contentClean = (sess.content || '').replace(/"/g, '""').replace(/\n/g, ' | ');
            const commentClean = ((sess.type === 'chung' && sess.generalComment ? '[CHUNG]: ' + sess.generalComment + ' | ' : '') + 
                                  (detail.individualComment || sess.generalComment || '')).replace(/"/g, '""').replace(/\n/g, ' | ');
            
            const row = `"${idx + 1}","${dateStr}","Ca ${sess.startTime}-${sess.endTime}","${contentClean}","${detail.homework}","${detail.attitude}","${commentClean}","${detail.note}"`;
            csvContent += row + "\n";
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `NhatKyHocTap_${studentName.replace(/\s+/g, '')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        this.showToast("Xuất file báo cáo thành công!", "success");
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
            const res = await this.authFetch('http://localhost:3000/api/users');
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
                    <button class="btn btn-secondary btn-sm" onclick="app.openEditUserModal('${u.Id}')">
                        <i class="fa-solid fa-pen-to-square"></i> Sửa
                    </button>
                    <button class="btn ${u.Active ? 'btn-secondary' : 'btn-primary'} btn-sm" onclick="app.toggleUserActive('${u.Id}', ${u.Active ? 'false' : 'true'})">
                        <i class="fa-solid ${u.Active ? 'fa-lock' : 'fa-lock-open'}"></i> ${u.Active ? 'Khóa' : 'Mở khóa'}
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="app.deleteUser('${u.Id}')">
                        <i class="fa-solid fa-trash-can"></i> Xóa
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
                const res = await this.authFetch(`http://localhost:3000/api/users/${id}`, {
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
                const res = await this.authFetch('http://localhost:3000/api/users', {
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
            const res = await this.authFetch(`http://localhost:3000/api/users/${id}`, {
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
            const res = await this.authFetch(`http://localhost:3000/api/users/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Server error');
            this.showToast('Đã xóa tài khoản.', 'success');
            await this.renderUsersTable();
        } catch (err) {
            this.showToast('Không thể xóa tài khoản.', 'error');
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
    formatDateVN(dateStr) {
        const d = new Date(dateStr);
        const days = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
        const dayName = days[d.getDay()];
        const day = d.getDate().toString().padStart(2, '0');
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        return `${dayName} - ${day}/${month}`;
    }

    // Toast Alert Helper
    showToast(message, type = "success") {
        const toast = document.getElementById('toastNotification');
        const icon = document.getElementById('toastIcon');
        const msg = document.getElementById('toastMessage');

        msg.innerText = message;
        toast.className = 'notification show ' + type;

        if (type === 'success') {
            icon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
        } else {
            icon.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i>';
        }

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
}

// Instantiate application on load
const app = new PinkyClassApp();
window.app = app; // Make it global