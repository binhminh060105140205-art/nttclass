Object.assign(PinkyClassApp.prototype, {
    getClassProfileKey(className) {
        const normalized = typeof this.removeVietnameseTones === 'function'
            ? this.removeVietnameseTones(className)
            : String(className || '').toLowerCase();
        return normalized.replace(/\s+/g, ' ').trim() || 'unassigned';
    },

    getClassProfiles() {
        const groups = new Map();
        (this.students || []).forEach(student => {
            const gradeLevel = Number(student.gradeLevel);
            const className = String(student.class || '').normalize('NFC').trim()
                || (Number.isInteger(gradeLevel) ? `Lớp ${gradeLevel}` : 'Chưa xếp lớp');
            const key = this.getClassProfileKey(className);
            if (!groups.has(key)) {
                groups.set(key, {
                    key,
                    className,
                    gradeLevel: Number.isInteger(gradeLevel) ? gradeLevel : null,
                    students: [],
                    subjects: new Set()
                });
            }
            const group = groups.get(key);
            group.students.push(student);
            if (student.subject) group.subjects.add(String(student.subject).normalize('NFC').trim());
        });

        return Array.from(groups.values()).map(group => {
            const fees = group.students.map(student => Math.max(0, Number(student.basePrice) || 0));
            const positiveFees = [...new Set(fees.filter(fee => fee > 0))].sort((a, b) => a - b);
            const feeCounts = new Map();
            fees.filter(fee => fee > 0).forEach(fee => feeCounts.set(fee, (feeCounts.get(fee) || 0) + 1));
            const suggestedUnitPrice = Array.from(feeCounts.entries())
                .sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] || 0;
            const tuition = group.students.reduce((totals, student) => {
                const breakdown = this.getTuitionPeriodBreakdown(this.sessions || [], student.id);
                totals.total += breakdown.currentMonthTuition;
                totals.paid += breakdown.currentMonthPaid;
                totals.unpaid += breakdown.currentMonthUnpaid;
                return totals;
            }, { total: 0, paid: 0, unpaid: 0 });

            return {
                ...group,
                subjects: Array.from(group.subjects).filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi')),
                students: group.students.slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi')),
                positiveFees,
                suggestedUnitPrice,
                expectedPerSession: fees.reduce((sum, fee) => sum + fee, 0),
                tuition
            };
        }).sort((a, b) => {
            const gradeA = Number.isInteger(a.gradeLevel) ? a.gradeLevel : 999;
            const gradeB = Number.isInteger(b.gradeLevel) ? b.gradeLevel : 999;
            return gradeA - gradeB || a.className.localeCompare(b.className, 'vi');
        });
    },

    getClassProfilePeriodLabel() {
        const match = String(this.currentMonthFilter || '').match(/^(\d{4})-(\d{1,2})$/);
        return match ? `Tháng ${Number(match[2])}/${match[1]}` : 'Tất cả kỳ';
    },

    renderClassProfiles() {
        const grid = document.getElementById('classProfilesGrid');
        if (!grid) return;
        const profiles = this.getClassProfiles();
        const totalStudents = profiles.reduce((sum, profile) => sum + profile.students.length, 0);
        const expectedPerSession = profiles.reduce((sum, profile) => sum + profile.expectedPerSession, 0);
        const periodTuition = profiles.reduce((sum, profile) => sum + profile.tuition.total, 0);
        const totalClassesEl = document.getElementById('classProfileTotalClasses');
        const totalStudentsEl = document.getElementById('classProfileTotalStudents');
        const expectedEl = document.getElementById('classProfileExpectedTotal');
        const periodEl = document.getElementById('classProfilePeriodTotal');
        const periodLabelEl = document.getElementById('classProfilePeriodLabel');
        if (totalClassesEl) totalClassesEl.textContent = profiles.length;
        if (totalStudentsEl) totalStudentsEl.textContent = totalStudents;
        if (expectedEl) expectedEl.textContent = this.formatVND(expectedPerSession);
        if (periodEl) periodEl.textContent = this.formatVND(periodTuition);
        if (periodLabelEl) periodLabelEl.textContent = this.getClassProfilePeriodLabel();

        grid.innerHTML = '';
        if (profiles.length === 0) {
            grid.innerHTML = '<div class="class-profile-empty">Chưa có lớp học. Hãy thêm hoặc nhập học sinh trong Hồ sơ học sinh.</div>';
            return;
        }

        profiles.forEach(profile => {
            const subjectLabel = profile.subjects.join(', ') || 'Chưa nhập môn học';
            const feeLabel = profile.positiveFees.length === 0
                ? 'Miễn phí'
                : profile.positiveFees.length === 1
                    ? this.formatVND(profile.positiveFees[0])
                    : `${this.formatVND(profile.positiveFees[0])} – ${this.formatVND(profile.positiveFees.at(-1))}`;
            const card = document.createElement('article');
            card.className = 'class-profile-card';
            card.dataset.classKey = profile.key;
            card.innerHTML = `
                <div class="class-profile-card-header">
                    <div>
                        <span class="class-profile-eyebrow">Hồ sơ lớp học</span>
                        <h3>${this.escapeHtml(profile.className)}</h3>
                        <p>${this.escapeHtml(subjectLabel)}</p>
                    </div>
                    <span class="class-profile-count">${profile.students.length} học sinh</span>
                </div>
                <div class="class-profile-main-stats">
                    <div><span>Sĩ số</span><strong>${profile.students.length}</strong></div>
                    <div><span>Môn học</span><strong>${this.escapeHtml(subjectLabel)}</strong></div>
                </div>
                <div class="class-profile-finance role-restricted admin-only">
                    <div><span>Học phí/HS/buổi</span><strong>${feeLabel}</strong></div>
                    <div><span>Dự kiến cả lớp/buổi</span><strong>${this.formatVND(profile.expectedPerSession)}</strong></div>
                    <div><span>${this.escapeHtml(this.getClassProfilePeriodLabel())}</span><strong>${this.formatVND(profile.tuition.total)}</strong></div>
                    <div><span>Còn chưa thu</span><strong>${this.formatVND(profile.tuition.unpaid)}</strong></div>
                </div>
                <details class="class-profile-members">
                    <summary>Danh sách học sinh</summary>
                    <div>${profile.students.map(student => `<span>${this.escapeHtml(student.name || '-')}</span>`).join('')}</div>
                </details>
                <div class="class-profile-actions">
                    <button type="button" class="btn btn-secondary btn-sm" data-class-action="students">Hồ sơ học sinh</button>
                    <button type="button" class="btn btn-primary btn-sm" data-class-action="schedule">Xếp lịch lớp</button>
                </div>
            `;
            card.querySelector('[data-class-action="students"]')?.addEventListener('click', () => this.openStudentsForClass(profile.key));
            card.querySelector('[data-class-action="schedule"]')?.addEventListener('click', () => this.openClassScheduleModal(profile.key));
            grid.appendChild(card);
        });
    },

    openStudentsForClass(classKey) {
        const profile = this.getClassProfiles().find(item => item.key === classKey);
        if (!profile) return;
        this.switchView('view-students');
        this.syncStudentGradeFilterOptions();
        const filter = document.getElementById('studentGradeFilter');
        if (filter) filter.value = Number.isInteger(profile.gradeLevel) ? String(profile.gradeLevel) : '';
        if (!(this.expandedStudentGradeGroups instanceof Set)) this.expandedStudentGradeGroups = new Set();
        this.expandedStudentGradeGroups.add(Number.isInteger(profile.gradeLevel) ? `grade-${profile.gradeLevel}` : 'unassigned');
        this.renderStudentList();
    },

    openClassScheduleModal(classKey) {
        if (!['teacher', 'assistant'].includes(this.currentRole)) {
            this.showToast('Tài khoản này không có quyền xếp lịch lớp.', 'error');
            return;
        }
        const profile = this.getClassProfiles().find(item => item.key === classKey);
        if (!profile || profile.students.length === 0) {
            this.showToast('Lớp chưa có học sinh để xếp lịch.', 'error');
            return;
        }

        this.resetSessionLoggerForm();
        const selectedIds = new Set(profile.students.map(student => String(student.id)));
        const grid = document.getElementById('studentsCheckboxGrid');
        grid?.querySelectorAll('input[name="sessionStudents"]').forEach(checkbox => {
            checkbox.checked = selectedIds.has(String(checkbox.value));
        });
        grid?.querySelectorAll('.student-class-group').forEach(group => {
            const checkboxes = Array.from(group.querySelectorAll('input[name="sessionStudents"]'));
            const hasSelected = checkboxes.some(checkbox => checkbox.checked);
            const selectAll = group.querySelector('.select-all-class-checkbox');
            if (selectAll) selectAll.checked = checkboxes.length > 0 && checkboxes.every(checkbox => checkbox.checked);
            this.setClassGroupCollapsed(group, !hasSelected);
        });

        this.syncSessionTypeFromSelection('session');
        this.updateSessionNameFromSelectedClasses('session');
        const nameInput = document.getElementById('sessionName');
        if (nameInput && !nameInput.value.trim()) nameInput.value = profile.className;
        const priceInput = document.getElementById('sessionPrice');
        this.setPriceSelectValue(priceInput, profile.suggestedUnitPrice);
        if (priceInput) priceInput.dataset.userEdited = 'true';
        this.updateSessionPricing('session');
        const modalTitle = document.getElementById('createSessionModalTitle');
        if (modalTitle) modalTitle.textContent = `Xếp lịch ${profile.className}`;
        this.openModal('createSessionModal');
        document.getElementById('sessionDate')?.focus();

        if (profile.positiveFees.length > 1) {
            this.showToast(`Lớp có nhiều mức học phí. Đã chọn mức phổ biến ${this.formatVND(profile.suggestedUnitPrice)}, hãy kiểm tra lại trước khi lưu.`, 'error');
        }
    }
});
