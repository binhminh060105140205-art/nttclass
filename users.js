// ================================================================
// USERS.JS — Quản lý tài khoản (Admin): giáo viên/trợ giảng + tài khoản
// đăng nhập riêng của học sinh.
// ================================================================
Object.assign(PinkyClassApp.prototype, {
    roleLabelText(role) {
        if (role === 'admin') return 'Quản trị viên';
        if (role === 'teacher') return 'Giáo viên';
        if (role === 'assistant') return 'Trợ giảng';
        return role;
    },

    // Returns the display name of the teacher a TA is assigned to, or '' if not applicable
    assignedTeacherName(assignedTeacherId) {
        if (!assignedTeacherId) return '';
        const t = (this.users || []).find(u => u.Id === assignedTeacherId);
        return t ? t.Name : assignedTeacherId;
    },

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
    },

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
            const isProtected = u.Id === 'u_teacher';
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
            if (isProtected) {
                tr.querySelectorAll('button').forEach(btn => {
                    btn.disabled = true;
                    btn.title = 'Tài khoản chủ sở hữu được bảo vệ';
                    btn.style.display = 'none';
                });
                const actionCell = tr.lastElementChild;
                actionCell.innerHTML = '<span class="protected-account-badge">🔒 Tài khoản chủ</span>';
            }
            tbody.appendChild(tr);
        });
    },

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
    },

    openEditUserModal(id) {
        if (id === 'u_teacher') {
            this.showToast('Tài khoản Nguyễn Thanh Thúy là tài khoản chủ sở hữu, không thể chỉnh sửa.', 'error');
            return;
        }
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
    },

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
    },

    async toggleUserActive(id, makeActive) {
        if (id === 'u_teacher') {
            this.showToast('Không thể khóa tài khoản chủ sở hữu.', 'error');
            return;
        }
        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/users/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ active: makeActive })
            });
            await this.requireApiSuccess(res, 'Không thể cập nhật trạng thái tài khoản.');
            this.showToast(makeActive ? 'Đã mở khóa tài khoản.' : 'Đã khóa tài khoản.', 'success');
            await this.renderUsersTable();
        } catch (err) {
            this.showToast(err.message || 'Không thể cập nhật trạng thái tài khoản.', 'error');
        }
    },

    async deleteUser(id) {
        if (id === 'u_teacher') {
            this.showToast('Không thể xóa tài khoản chủ sở hữu.', 'error');
            return;
        }
        if (this.currentUser && (this.currentUser.id || this.currentUser.Id) === id) {
            this.showToast('Bạn không thể tự xóa tài khoản đang đăng nhập!', 'error');
            return;
        }
        if (!confirm('Xóa tài khoản này? Bạn có 7 giây để hoàn tác.')) return;
        this.queueDeletion('Tài khoản', () => this.commitDeleteUser(id));
    },

    async commitDeleteUser(id) {
        const res = await this.authFetch(`${API_BASE_URL}/api/users/${id}`, { method: 'DELETE' });
        await this.requireApiSuccess(res, 'Không thể xóa tài khoản.');
        this.showToast('Đã xóa tài khoản.', 'success');
        await this.runDeletionRefresh(() => this.renderUsersTable());
    },

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
    },

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
        if (password.length < 8) {
            this.showToast('Mật khẩu cần tối thiểu 8 ký tự.', 'error');
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
    },

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
    },

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
});
