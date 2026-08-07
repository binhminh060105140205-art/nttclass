// ================================================================
// STUDENTS.JS — Trang "Hồ sơ học sinh": danh sách, thêm/sửa/xoá học sinh.
// a================================================================
Object.assign(PinkyClassApp.prototype, {
    syncStudentGradeFilterOptions() {
        const filterEl = document.getElementById("studentGradeFilter");
        if (!filterEl) return;

        const selectedGrade = filterEl.value;
        const availableGrades = [...new Set((this.students || [])
            .map(student => Number(student.gradeLevel))
            .filter(grade => Number.isInteger(grade) && grade >= 1 && grade <= 12))]
            .sort((a, b) => a - b);

        filterEl.replaceChildren();
        filterEl.add(new Option("Tất cả các lớp", ""));
        availableGrades.forEach(grade => filterEl.add(new Option(`Lớp ${grade}`, String(grade))));
        filterEl.value = availableGrades.includes(Number(selectedGrade)) ? selectedGrade : "";
    },

    toggleStudentGradeGroup(groupKey) {
        if (!(this.expandedStudentGradeGroups instanceof Set)) {
            this.expandedStudentGradeGroups = new Set();
        }
        if (this.expandedStudentGradeGroups.has(groupKey)) {
            this.expandedStudentGradeGroups.delete(groupKey);
        } else {
            this.expandedStudentGradeGroups.add(groupKey);
        }
        this.renderStudentList();
    },

    renderStudentList() {
        const tbody = document.getElementById("studentsTableBody");
        if (!tbody) return;
        tbody.innerHTML = "";

        this.syncStudentGradeFilterOptions();
        const filterEl = document.getElementById("studentGradeFilter");
        const gradeFilter = filterEl ? filterEl.value : "";
        let list = this.students || [];
        if (gradeFilter) list = list.filter(student => student.gradeLevel === parseInt(gradeFilter, 10));

        if (list.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="student-empty-cell">
                        Chưa có học sinh${gradeFilter ? " trong lớp này" : ""}. Bấm nút phía trên để thêm mới!
                    </td>
                </tr>
            `;
            return;
        }

        const sorted = [...list].sort((a, b) => {
            const gradeCompare = Number(a.gradeLevel || 999) - Number(b.gradeLevel || 999);
            if (gradeCompare !== 0) return gradeCompare;
            return String(a.name || "").localeCompare(String(b.name || ""), "vi");
        });

        if (!(this.expandedStudentGradeGroups instanceof Set)) {
            this.expandedStudentGradeGroups = new Set();
        }

        const groups = new Map();
        sorted.forEach((student, index) => {
            const numericGrade = Number(student.gradeLevel);
            const hasGrade = Number.isInteger(numericGrade) && numericGrade >= 1 && numericGrade <= 12;
            const groupKey = hasGrade ? `grade-${numericGrade}` : "unassigned";
            if (!groups.has(groupKey)) {
                groups.set(groupKey, {
                    label: hasGrade ? `Lớp ${numericGrade}` : "Chưa nhập lớp",
                    students: []
                });
            }
            groups.get(groupKey).students.push({ student, index });
        });

        const visibleGroupKeys = new Set(groups.keys());
        [...this.expandedStudentGradeGroups].forEach(groupKey => {
            if (!visibleGroupKeys.has(groupKey)) this.expandedStudentGradeGroups.delete(groupKey);
        });

        groups.forEach((group, groupKey) => {
            const isExpanded = this.expandedStudentGradeGroups.has(groupKey);
            const groupRow = document.createElement("tr");
            groupRow.className = `student-grade-group-row${isExpanded ? " is-expanded" : ""}`;
            groupRow.dataset.gradeGroup = groupKey;
            groupRow.innerHTML = `
                <td colspan="7">
                    <button type="button" class="student-grade-toggle" aria-expanded="${isExpanded}" aria-label="Xem danh sách ${this.escapeHtmlAttr(group.label)}" title="Bấm để xem danh sách học sinh">
                        <span class="student-grade-toggle-content">
                            <span class="student-grade-label">${this.escapeHtml(group.label)}</span>
                        </span>
                    </button>
                </td>
            `;
            groupRow.querySelector(".student-grade-toggle")?.addEventListener("click", () => {
                this.toggleStudentGradeGroup(groupKey);
            });
            tbody.appendChild(groupRow);

            group.students.forEach(({ student, index }) => {
                const dobLabel = (() => {
                    if (!student.dob) return "-";
                    const [year, month, day] = String(student.dob).split("T")[0].split("-");
                    return year && month && day ? `${day}/${month}/${year}` : "-";
                })();
                const studentId = this.escapeHtmlAttr(JSON.stringify(String(student.id)));
                const classLabel = student.class || (student.gradeLevel ? `Lớp ${student.gradeLevel}` : "-");
                const actionsHtml = `
                    <div class="student-table-actions">
                        <button class="btn btn-primary btn-sm" onclick="app.openStudentJournalModal(${studentId})">Nhật ký</button>
                        <button class="btn btn-secondary btn-sm" onclick="app.openEditStudentModal(${studentId})">Sửa</button>
                    </div>
                `;

                const row = document.createElement("tr");
                row.className = "student-data-row";
                row.dataset.gradeGroup = groupKey;
                row.hidden = !isExpanded;
                row.innerHTML = `
                    <td class="student-stt-cell">${index + 1}</td>
                    <td class="student-name-cell">${this.escapeHtml(student.name || "-")}</td>
                    <td>${this.escapeHtml(classLabel)}</td>
                    <td><span class="student-subject-badge">${this.escapeHtml(student.subject || "-")}</span></td>
                    <td class="student-dob-cell">${dobLabel}</td>
                    <td class="role-restricted admin-only student-price-cell">${this.formatVND(student.basePrice)}</td>
                    <td class="student-actions-cell">${actionsHtml}</td>
                `;
                tbody.appendChild(row);
            });
        });
    },

    // --- FORM & DATA HANDLERS ---

    setStudentModalActions(isEditing, student = null) {
        const actions = document.getElementById("studentModalEditActions");
        const accountButton = document.getElementById("studentModalAccountBtn");
        if (!actions) return;
        actions.hidden = !isEditing;
        if (accountButton) accountButton.innerText = student?.username ? "Quản lý tài khoản" : "Tạo tài khoản";
    },

    openStudentAccountFromEdit() {
        const studentId = document.getElementById("editStudentId")?.value;
        if (!studentId) return;
        this.closeModal("addStudentModal");
        this.openStudentAccountModal(studentId);
    },

    deleteStudentFromEdit() {
        const studentId = document.getElementById("editStudentId")?.value;
        if (!studentId) return;
        if (this.currentRole !== 'teacher') {
            this.showToast("Chỉ Giáo viên mới có quyền xóa học sinh!", "error");
            return;
        }
        if (!confirm('Xóa học sinh này cùng toàn bộ ca học liên quan? Bạn có 5 giây để hoàn tác.')) return;
        this.closeModal("addStudentModal");
        this.queueDeletion('Học sinh', () => this.commitDeleteStudent(studentId));
    },

    openAddStudentModal() {
        document.getElementById("addStudentForm").reset();
        document.getElementById("editStudentId").value = "";
        document.getElementById("studentModalTitle").innerText = "Thêm Học Sinh Mới";
        document.getElementById("saveStudentBtn").innerText = "Thêm học sinh";
        document.getElementById("studentGrade").value = "";
        document.getElementById("studentBasePrice").value = 250000;
        this.setStudentModalActions(false);
        this.openModal("addStudentModal");
    },

    openEditStudentModal(id) {
        if (this.currentRole !== "teacher") {
            this.showToast("Chỉ Giáo viên mới có quyền chỉnh sửa học sinh!", "error");
            return;
        }
        const student = this.students.find(item => item.id === id);
        if (!student) return;

        document.getElementById("editStudentId").value = student.id;
        document.getElementById("studentModalTitle").innerText = "Chỉnh Sửa Học Sinh";
        document.getElementById("saveStudentBtn").innerText = "Lưu thay đổi";
        document.getElementById("studentName").value = student.name;
        const storedClass = String(student.class || '').trim();
        const standardClass = student.gradeLevel ? `Lớp ${student.gradeLevel}` : '';
        document.getElementById("studentGrade").value = storedClass && storedClass !== standardClass
            ? storedClass
            : (student.gradeLevel || "");
        document.getElementById("studentSubject").value = student.subject;
        document.getElementById("studentDob").value = student.dob || "";
        document.getElementById("studentBasePrice").value = student.basePrice;
        this.setStudentModalActions(true, student);
        this.openModal("addStudentModal");
    },
    // 1. Thêm / Sửa học sinh (dùng chung 1 form — editStudentId rỗng nghĩa là thêm mới)
    // Bật/tắt trạng thái "Đang lưu..." cho nút submit — vô hiệu hóa nút trong
    // lúc chờ API phản hồi để tránh double-submit (bấm 2 lần liên tiếp tạo ra
    // 2 bản ghi trùng nhau, đặc biệt khi mạng chậm).
    setBtnLoading(btnId, isLoading, loadingText = 'Đang lưu...') {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        const textTarget = btn.querySelector('.lithos-vine-button-label') || btn;
        if (isLoading) {
            btn.dataset.originalText = btn.dataset.originalText || textTarget.textContent.trim();
            textTarget.textContent = loadingText;
            btn.disabled = true;
        } else {
            textTarget.textContent = btn.dataset.originalText || textTarget.textContent;
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

    formatSessionConflictMessage(date, startTime, endTime, overlap) {
        const participantNames = (overlap?.studentIds || []).map(studentId => this.getStudentName(studentId)).filter(Boolean);
        const conflictName = String(overlap?.sessionName || '').trim() || participantNames.join(', ') || 'Buổi học';
        return `Không thể lưu lịch ${startTime}-${endTime} ngày ${this.formatDateVN(date)} vì trùng với “${conflictName}” (${overlap?.startTime || '?'}-${overlap?.endTime || '?'}). Hãy chọn lại ngày hoặc giờ.`;
    },

    async handleAddStudent() {
        const editId = document.getElementById('editStudentId').value;
        const name = document.getElementById('studentName').value.trim();
        const classInput = document.getElementById('studentGrade').value.trim().replace(/\s+/g, ' ');
        const classWithoutPrefix = classInput.replace(/^lớp\s*/i, '');
        const gradeMatch = classWithoutPrefix.match(/^(1[0-2]|[1-9])/);
        const gradeCandidate = gradeMatch ? Number(gradeMatch[1]) : null;
        const nextClassCharacter = gradeMatch ? classWithoutPrefix.charAt(gradeMatch[1].length) : '';
        const gradeLevel = gradeCandidate && !/\d/.test(nextClassCharacter) ? gradeCandidate : null;
        const isGradeOnly = gradeLevel !== null && classWithoutPrefix === String(gradeLevel);
        const sClass = classInput && isGradeOnly ? 'Lớp ' + gradeLevel : classInput;
        const subject = document.getElementById('studentSubject').value.trim();
        // Ngày sinh — không bắt buộc, để trống nếu chưa muốn nhập. Giá trị
        // input[type=date] đã sẵn ở dạng "yyyy-mm-dd" nên gửi thẳng lên API.
        const dob = document.getElementById('studentDob').value || null;
        const basePrice = parseInt(document.getElementById('studentBasePrice').value);

        if (!name || !subject) return;

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
        if (!confirm('Xóa học sinh này cùng toàn bộ ca học liên quan? Bạn có 5 giây để hoàn tác.')) return;
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
