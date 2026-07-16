// ================================================================
// STUDENTS.JS — Trang "Hồ sơ học sinh": danh sách, thêm/sửa/xoá học sinh.
// a================================================================
Object.assign(PinkyClassApp.prototype, {
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
                    <td colspan="7" style="text-align: center; padding: 30px; color: var(--text-muted);">
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
                    <td colspan="7" style="background:var(--primary-soft); color:var(--primary); font-weight:700; padding:8px 14px; font-size:13px;"> ${st.gradeLevel ? 'Lớp ' + st.gradeLevel : 'Chưa xác định khối lớp'}
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

            // Hiển thị ngày sinh dạng dd/mm/yyyy (dễ đọc) — "-" nếu chưa nhập
            // (học sinh cũ trước khi có tính năng này).
            const dobLabel = (() => {
                if (!st.dob) return '-';
                const [y, m, d] = st.dob.split('-');
                return `${d}/${m}/${y}`;
            })();

            tr.innerHTML = `
                <td style="text-align:center; font-weight:700; color:var(--text-muted);">${idx + 1}</td>
                <td><strong>${st.name}</strong></td>
                <td>${st.class}</td>
                <td><span class="badge" style="background:var(--primary-soft); color:var(--primary); border-color:var(--primary-light);">${st.subject}</span></td>
                <td style="text-align:center;">${dobLabel}</td>
                <td class="role-restricted admin-only" style="text-align:right; font-weight:700;">${this.formatVND(st.basePrice)}</td>
                <td style="text-align:center;">${actionsHTML}</td>
            `;

            tbody.appendChild(tr);
        });
    },

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
    },

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
        document.getElementById('studentDob').value = student.dob || '';
        document.getElementById('studentBasePrice').value = student.basePrice;
        this.openModal('addStudentModal');
    },

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
    },

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
    },

    async handleAddStudent() {
        const editId = document.getElementById('editStudentId').value;
        const name = document.getElementById('studentName').value.trim();
        const gradeLevel = parseInt(document.getElementById('studentGrade').value);
        const sClass = `Lớp ${gradeLevel}`;
        const subject = document.getElementById('studentSubject').value.trim();
        // Ngày sinh — không bắt buộc, để trống nếu chưa muốn nhập. Giá trị
        // input[type=date] đã sẵn ở dạng "yyyy-mm-dd" nên gửi thẳng lên API.
        const dob = document.getElementById('studentDob').value || null;
        const basePrice = parseInt(document.getElementById('studentBasePrice').value);

        if (!name || !gradeLevel || !subject) return;

        // Học phí/buổi phải là số nguyên KHÔNG ÂM (>= 0) — cho phép để 0 (VD học
        // sinh học miễn phí/học thử), chỉ chặn số âm hoặc giá trị không hợp lệ.
        if (isNaN(basePrice) || basePrice < 0) {
            this.showToast("Học phí/buổi không được là số âm!", "error");
            return;
        }

        const payload = { name, class: sClass, gradeLevel, subject, basePrice, dateOfBirth: dob };

        this.setBtnLoading('saveStudentBtn', true, editId ? 'Đang cập nhật...' : 'Đang thêm...');
        try {
            if (editId) {
                const res = await this.authFetch(`${API_BASE_URL}/api/students/${editId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                await this.requireApiSuccess(res, 'Không thể cập nhật học sinh.');
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
                await this.requireApiSuccess(res, 'Không thể thêm học sinh.');
            }
            await this.loadData();
        } catch (err) {
            this.showToast(err.message || (editId ? 'Không thể cập nhật học sinh.' : 'Không thể thêm học sinh.'), 'error');
            return;
        } finally {
            this.setBtnLoading('saveStudentBtn', false);
        }

        this.populateStudentPickers();
        document.getElementById('addStudentForm').reset();
        this.closeModal('addStudentModal');
        this.showToast(editId ? "Cập nhật thông tin học sinh thành công!" : `Đã thêm học sinh ${name} thành công!`, "success");
    },

    async deleteStudent(id) {
        if (this.currentRole !== 'teacher') {
            this.showToast("Chỉ Giáo viên mới có quyền xóa học sinh!", "error");
            return;
        }
        if (!confirm('Xóa học sinh này cùng toàn bộ ca học liên quan? Bạn có 7 giây để hoàn tác.')) return;
        this.queueDeletion('Học sinh', () => this.commitDeleteStudent(id));
    },

    async commitDeleteStudent(id) {
        const res = await this.authFetch(`${API_BASE_URL}/api/students/${id}`, { method: 'DELETE' });
        await this.requireApiSuccess(res, 'Không thể xóa học sinh.');
        await this.runDeletionRefresh(() => this.loadData());
        this.populateStudentPickers();
        this.showToast("Đã xóa học sinh và các dữ liệu liên quan.", "success");
    }

    // 2. Log Session (Add Session)
    // ----- Lặp lại buổi học trong tháng: thêm từng ngày thủ công -----
    // Người dùng chọn 1 ngày bất kỳ trong CÙNG THÁNG với "Ngày học" chính rồi
    // bấm "+ Thêm ngày" -> ngày đó được thêm vào this.repeatExtraDates, hiển
    // thị dưới dạng "chip" có thể xoá. Khi lưu buổi học, mỗi ngày trong danh
    // sách này sẽ tự tạo thêm 1 buổi học giống hệt buổi chính (xem
    // createRepeatedSessions bên dưới).
});
