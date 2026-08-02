// ================================================================
// STUDENT-JOURNAL.JS — Nhật ký học tập mở trực tiếp từ Hồ sơ học sinh.
// ================================================================
Object.assign(PinkyClassApp.prototype, {
    openStudentJournalModal(studentId) {
        const student = (this.students || []).find(item => String(item.id) === String(studentId));
        if (!student) {
            this.showToast('Không tìm thấy học sinh này.', 'error');
            return;
        }

        this.studentJournalStudentId = String(student.id);
        this.studentJournalMonthFilter = this.currentMonthFilter || '';
        this.studentJournalEditingSessionId = null;
        this.renderStudentJournalModal();
        this.openModal('studentJournalModal');
    },

    closeStudentJournalModal() {
        this.studentJournalEditingSessionId = null;
        this.closeModal('studentJournalModal');
    },

    changeStudentJournalMonth(monthKey) {
        this.studentJournalMonthFilter = monthKey || '';
        this.studentJournalEditingSessionId = null;
        this.renderStudentJournalModal();
    },

    getStudentJournalSessions(studentId) {
        const selectedMonth = String(this.studentJournalMonthFilter || '');
        const selectedParts = selectedMonth.split('-').map(Number);
        const selectedYear = selectedParts[0];
        const selectedMonthNumber = selectedParts[1];

        return (this.sessions || [])
            .filter(session => (session.studentIds || []).some(id => String(id) === String(studentId)))
            .filter(session => this.isSessionCompleted(session))
            .filter(session => {
                if (!selectedMonth) return true;
                const dateParts = String(session.date || '').split('-').map(Number);
                return dateParts[0] === selectedYear && dateParts[1] === selectedMonthNumber;
            })
            .sort((first, second) => {
                const dateCompare = String(first.date || '').localeCompare(String(second.date || ''));
                if (dateCompare !== 0) return dateCompare;
                return String(first.startTime || '').localeCompare(String(second.startTime || ''));
            });
    },

    renderStudentJournalModal() {
        const studentId = this.studentJournalStudentId;
        const tbody = document.getElementById('studentJournalTableBody');
        const meta = document.getElementById('studentJournalStudentMeta');
        const monthSelect = document.getElementById('studentJournalMonthFilter');
        if (!studentId || !tbody || !meta || !monthSelect) return;

        const student = (this.students || []).find(item => String(item.id) === String(studentId));
        if (!student) return;

        const classLabel = student.class || (student.gradeLevel ? 'Lớp ' + student.gradeLevel : 'Chưa nhập lớp');
        meta.innerText = (student.name || 'Học sinh') + ' • ' + classLabel + ' • ' + (student.subject || 'Chưa nhập môn');

        const monthKeys = new Set();
        (this.sessions || []).forEach(session => {
            if (!(session.studentIds || []).some(id => String(id) === String(studentId))) return;
            const dateParts = String(session.date || '').split('-').map(Number);
            if (dateParts[0] && dateParts[1]) monthKeys.add(dateParts[0] + '-' + dateParts[1]);
        });
        if (this.currentMonthFilter) monthKeys.add(this.currentMonthFilter);
        if (this.studentJournalMonthFilter) monthKeys.add(this.studentJournalMonthFilter);

        const sortedMonthKeys = Array.from(monthKeys).sort((first, second) => {
            const firstParts = first.split('-').map(Number);
            const secondParts = second.split('-').map(Number);
            return secondParts[0] - firstParts[0] || secondParts[1] - firstParts[1];
        });
        monthSelect.innerHTML = '<option value="">Tất cả tháng</option>' + sortedMonthKeys.map(key => {
            const parts = key.split('-').map(Number);
            return '<option value="' + this.escapeHtmlAttr(key) + '">Tháng ' + parts[1] + '/' + parts[0] + '</option>';
        }).join('');
        monthSelect.value = this.studentJournalMonthFilter || '';

        const sessions = this.getStudentJournalSessions(studentId);
        if (sessions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="student-journal-empty-cell">Chưa có buổi học đã dạy nào trong tháng đã chọn.</td></tr>';
            return;
        }

        tbody.innerHTML = sessions.map((session, index) => this.renderStudentJournalRow(session, index, studentId)).join('');
        if (!this.studentJournalEditingSessionId) {
            const tableWrap = document.querySelector('#studentJournalModal .student-journal-table-wrap');
            if (tableWrap) {
                tableWrap.scrollLeft = 0;
                tableWrap.scrollTop = 0;
            }
        }
    },

    renderStudentJournalRow(session, index, studentId) {
        const details = session.studentDetails || {};
        const detail = details[studentId] || {
            homework: '',
            attitude: '',
            individualComment: '',
            note: ''
        };
        const sessionCompleted = this.isSessionCompleted(session);
        const displayedHomework = sessionCompleted ? detail.homework : null;
        const displayedAttitude = sessionCompleted ? detail.attitude : null;
        const homeworkClass = this.getHomeworkClass(displayedHomework);
        const homeworkInlineStyle = homeworkClass === 'no-data'
            ? ' style="background:transparent;color:var(--text-muted);"'
            : '';
        const homeworkBadge = '<span class="homework-badge ' + homeworkClass + '"' + homeworkInlineStyle + '>'
            + this.getHomeworkLabel(displayedHomework) + '</span>';
        const sessionIdArg = this.escapeHtmlAttr(JSON.stringify(String(session.id)));
        const isEditing = String(this.studentJournalEditingSessionId || '') === String(session.id);
        const content = String(session.content || '').trim();
        const normalizedHomework = this.normalizeHomeworkValue(detail.homework);

        let homeworkCell = homeworkBadge;
        let attitudeCell = this.escapeHtml(displayedAttitude || '-');
        let commentCell = '<div class="comment-text">'
            + (detail.individualComment ? this.nl2brText(detail.individualComment) : '-') + '</div>';
        let noteCell = this.escapeHtml(detail.note || '-');
        let actionCell = '<button type="button" class="btn btn-secondary btn-sm student-journal-edit-btn" '
            + 'onclick="app.editStudentJournalRow(' + sessionIdArg + ')">Sửa trực tiếp</button>';

        if (isEditing) {
            const homeworkOptions = this.getHomeworkLevels().map(level => {
                const selected = normalizedHomework === level ? ' selected' : '';
                return '<option value="' + level + '"' + selected + '>' + level + '</option>';
            }).join('');
            homeworkCell = '<select class="form-control student-journal-edit-control" data-journal-field="homework" aria-label="Bài tập về nhà">'
                + '<option value=""' + (normalizedHomework ? '' : ' selected') + '>-</option>'
                + homeworkOptions + '</select>';
            attitudeCell = '<input type="text" class="form-control student-journal-edit-control" data-journal-field="attitude" '
                + 'maxlength="500" value="' + this.escapeHtmlAttr(detail.attitude || '') + '" placeholder="Ý thức học tập">';
            commentCell = '<textarea class="form-control student-journal-edit-control student-journal-edit-textarea" '
                + 'data-journal-field="individualComment" maxlength="3000" rows="4" placeholder="Nhận xét riêng">'
                + this.escapeHtml(detail.individualComment || '') + '</textarea>';
            noteCell = '<textarea class="form-control student-journal-edit-control student-journal-edit-textarea student-journal-note-input" '
                + 'data-journal-field="note" maxlength="1000" rows="3" placeholder="Ghi chú">'
                + this.escapeHtml(detail.note || '') + '</textarea>';
            actionCell = '<div class="student-journal-row-actions">'
                + '<button type="button" class="btn btn-primary btn-sm student-journal-save-btn" '
                + 'onclick="app.saveStudentJournalRow(' + sessionIdArg + ', this)">Lưu</button>'
                + '<button type="button" class="btn btn-secondary btn-sm" onclick="app.cancelStudentJournalEdit()">Hủy</button>'
                + '</div>';
        }

        const contentHtml = content ? this.nl2brText(content) : '<span class="student-journal-muted">-</span>';
        return '<tr class="' + (isEditing ? 'student-journal-edit-row' : '') + '" data-session-id="'
            + this.escapeHtmlAttr(String(session.id)) + '">'
            + '<td class="session-number-cell"><span class="session-number-val">Buổi ' + (index + 1) + '</span>'
            + '<span class="session-time-val">' + this.escapeHtml(session.startTime || '-') + ' - '
            + this.escapeHtml(session.endTime || '-') + '</span></td>'
            + '<td class="session-date-cell">' + this.formatDateVNSplit(session.date) + '</td>'
            + '<td class="col-content-compact"><div class="session-content-text">' + contentHtml + '</div></td>'
            + '<td class="student-log-homework-cell">' + homeworkCell + '</td>'
            + '<td class="student-journal-attitude-cell">' + attitudeCell + '</td>'
            + '<td class="col-comment">' + commentCell + '</td>'
            + '<td class="student-log-note">' + noteCell + '</td>'
            + '<td class="student-journal-action-cell">' + actionCell + '</td>'
            + '</tr>';
    },

    editStudentJournalRow(sessionId) {
        this.studentJournalEditingSessionId = String(sessionId);
        this.renderStudentJournalModal();

        const row = Array.from(document.querySelectorAll('#studentJournalTableBody tr[data-session-id]'))
            .find(item => String(item.dataset.sessionId) === String(sessionId));
        if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            const firstField = row.querySelector('[data-journal-field]');
            if (firstField) firstField.focus({ preventScroll: true });
        }
    },

    cancelStudentJournalEdit() {
        this.studentJournalEditingSessionId = null;
        this.renderStudentJournalModal();
    },

    async saveStudentJournalRow(sessionId, button) {
        const studentId = this.studentJournalStudentId;
        const row = Array.from(document.querySelectorAll('#studentJournalTableBody tr[data-session-id]'))
            .find(item => String(item.dataset.sessionId) === String(sessionId));
        if (!studentId || !row) return;

        const getFieldValue = field => {
            const control = row.querySelector('[data-journal-field="' + field + '"]');
            return control ? control.value : '';
        };
        const payload = {
            homework: getFieldValue('homework'),
            attitude: getFieldValue('attitude').trim(),
            individualComment: getFieldValue('individualComment').trim(),
            note: getFieldValue('note').trim()
        };

        const originalText = button ? button.innerText : 'Lưu';
        if (button) {
            button.disabled = true;
            button.innerText = 'Đang lưu...';
        }

        try {
            const response = await this.authFetch(API_BASE_URL + '/api/session-details/' + sessionId + '/' + studentId, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            await this.requireApiSuccess(response, 'Không thể lưu nhật ký học tập.');
            await this.loadData({ render: false });
            this.studentJournalEditingSessionId = null;
            this.renderStudentJournalModal();
            this.showToast('Đã cập nhật nhật ký học tập.', 'success');
        } catch (error) {
            if (button) {
                button.disabled = false;
                button.innerText = originalText;
            }
            this.showToast(error.message || 'Không thể lưu nhật ký học tập.', 'error');
        }
    }
});
