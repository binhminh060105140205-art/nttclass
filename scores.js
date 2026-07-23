// ================================================================
// SCORES.JS — Tra cứu, tổng hợp và quản lý điểm số
// ================================================================
Object.assign(PinkyClassApp.prototype, {
    renderScores() {
        this.scoreViewMode = this.scoreViewMode === 'students' ? 'students' : 'tests';
        this.renderScoreFilterOptions();
        this.renderBatchScoreRows();

        document.querySelectorAll('[data-score-view-mode]').forEach(button => {
            const active = button.dataset.scoreViewMode === this.scoreViewMode;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', String(active));
        });

        const filteredScores = this.getFilteredScores();
        const resultCount = document.getElementById('scoreFilterResultCount');
        if (resultCount) {
            const testCount = new Set(filteredScores.map(score => this.getScoreTestGroupId(score))).size;
            resultCount.innerText = `${filteredScores.length} lượt điểm · ${testCount} bài kiểm tra`;
        }

        this.renderScoreSummary(filteredScores);
        const results = document.getElementById('scoreResults');
        if (!results) return;
        results.innerHTML = this.scoreViewMode === 'students'
            ? this.renderScoresByStudents(filteredScores)
            : this.renderScoresByTests(filteredScores);
    },

    setScoreViewMode(mode) {
        this.scoreViewMode = mode === 'students' ? 'students' : 'tests';
        this.renderScores();
    },

    resetScoreFilters() {
        ['scoreFilterStudent', 'scoreFilterClass', 'scoreFilterMonth', 'scoreFilterType'].forEach(id => {
            const control = document.getElementById(id);
            if (control && !(this.currentRole === 'student' && id === 'scoreFilterStudent')) control.value = '';
        });
        this.renderScores();
    },

    renderScoreFilterOptions() {
        const classFilter = document.getElementById('scoreFilterClass');
        const batchClassFilter = document.getElementById('batchScoreGrade');
        const previousClass = classFilter?.value || '';
        const previousBatchClass = batchClassFilter?.value || '';
        const grades = [...new Set((this.students || [])
            .map(student => Number(student.gradeLevel))
            .filter(Number.isFinite))].sort((a, b) => a - b);
        const classes = [...new Set((this.students || [])
            .map(student => String(student.class || '').trim())
            .filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi'));

        const optionHtml = [
            ...grades.map(grade => `<option value="grade:${grade}">Khối ${grade}</option>`),
            ...classes.map(className => `<option value="class:${encodeURIComponent(className)}">${this.escapeHtml(className)}</option>`)
        ].join('');

        if (classFilter) {
            classFilter.innerHTML = `<option value="">Tất cả lớp và khối</option>${optionHtml}`;
            classFilter.value = [...classFilter.options].some(option => option.value === previousClass) ? previousClass : '';
        }
        if (batchClassFilter) {
            batchClassFilter.innerHTML = `<option value="">Tất cả học sinh</option>${optionHtml}`;
            batchClassFilter.value = [...batchClassFilter.options].some(option => option.value === previousBatchClass) ? previousBatchClass : '';
        }

        const studentFilter = document.getElementById('scoreFilterStudent');
        if (studentFilter && this.currentRole === 'student') {
            studentFilter.value = this.currentStudentId || '';
            studentFilter.disabled = true;
        } else if (studentFilter) {
            studentFilter.disabled = false;
        }
    },

    scoreStudentMatchesClass(student, filterValue) {
        if (!filterValue) return true;
        if (!student) return false;
        if (filterValue.startsWith('grade:')) {
            return String(student.gradeLevel || '') === filterValue.slice(6);
        }
        if (filterValue.startsWith('class:')) {
            return encodeURIComponent(String(student.class || '').trim()) === filterValue.slice(6);
        }
        return true;
    },

    getFilteredScores() {
        const selectedStudent = this.currentRole === 'student'
            ? this.currentStudentId
            : (document.getElementById('scoreFilterStudent')?.value || '');
        const selectedClass = document.getElementById('scoreFilterClass')?.value || '';
        const selectedMonth = document.getElementById('scoreFilterMonth')?.value || '';
        const selectedType = document.getElementById('scoreFilterType')?.value || '';

        return (this.scores || []).filter(score => {
            const student = (this.students || []).find(item => item.id === score.studentId);
            if (selectedStudent && score.studentId !== selectedStudent) return false;
            if (!this.scoreStudentMatchesClass(student, selectedClass)) return false;
            if (selectedMonth && !String(score.date || '').startsWith(`${selectedMonth}-`)) return false;
            if (selectedType && score.scoreType !== selectedType) return false;
            return true;
        });
    },

    getScoreTestGroupId(score) {
        if (score.testGroupId) return String(score.testGroupId);
        if (score.sessionId) return `session:${score.sessionId}`;
        return `score:${score.id}`;
    },

    getScoreNormalizedToTen(score) {
        const maxScore = Number(score.maxScore) > 0 ? Number(score.maxScore) : 10;
        const value = Number(score.scoreValue);
        return Number.isFinite(value) ? value / maxScore * 10 : null;
    },

    formatScoreDate(date) {
        const parts = String(date || '').split('-');
        return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : (date || '-');
    },

    getScoreTestTitle(score) {
        return String(score.testName || '').trim() || this.scoreTypeLabel(score.scoreType) || 'Bài kiểm tra';
    },

    renderScoreSummary(scores) {
        const summaryGrid = document.getElementById('scoreSummaryGrid');
        if (!summaryGrid) return;
        const groups = new Set(scores.map(score => this.getScoreTestGroupId(score)));
        const students = new Set(scores.map(score => score.studentId));
        const normalized = scores.map(score => this.getScoreNormalizedToTen(score)).filter(Number.isFinite);
        const average = normalized.length ? normalized.reduce((sum, value) => sum + value, 0) / normalized.length : null;

        summaryGrid.innerHTML = `
            <div class="score-summary-card">
                <div class="score-summary-label">Bài kiểm tra</div>
                <div class="score-summary-value">${groups.size}</div>
            </div>
            <div class="score-summary-card">
                <div class="score-summary-label">Lượt điểm</div>
                <div class="score-summary-value">${scores.length}</div>
            </div>
            <div class="score-summary-card">
                <div class="score-summary-label">Học sinh có điểm</div>
                <div class="score-summary-value">${students.size}</div>
            </div>
            <div class="score-summary-card score-summary-overall">
                <div class="score-summary-label">Trung bình quy đổi /10</div>
                <div class="score-summary-value">${average === null ? '-' : average.toFixed(1)}</div>
            </div>`;
    },

    renderScoresByTests(scores) {
        if (!scores.length) return this.renderScoreEmptyState('Không có bài kiểm tra nào phù hợp với bộ lọc.');
        const groups = new Map();
        scores.forEach(score => {
            const groupId = this.getScoreTestGroupId(score);
            if (!groups.has(groupId)) groups.set(groupId, []);
            groups.get(groupId).push(score);
        });

        return [...groups.entries()]
            .sort(([, left], [, right]) => String(right[0].date || '').localeCompare(String(left[0].date || '')))
            .map(([groupId, groupScores]) => {
                const sortedScores = [...groupScores].sort((a, b) => this.getStudentName(a.studentId).localeCompare(this.getStudentName(b.studentId), 'vi'));
                const first = sortedScores[0];
                const normalized = sortedScores.map(score => this.getScoreNormalizedToTen(score)).filter(Number.isFinite);
                const average = normalized.length ? normalized.reduce((sum, value) => sum + value, 0) / normalized.length : null;
                const classes = [...new Set(sortedScores.map(score => this.getStudentClass(score.studentId)).filter(Boolean))];
                const sessionId = sortedScores.find(score => score.sessionId)?.sessionId || '';
                const canManage = ['teacher', 'assistant'].includes(this.currentRole);
                const rows = sortedScores.map(score => `
                    <tr>
                        <td><strong>${this.escapeHtml(this.getStudentName(score.studentId))}</strong><span class="score-row-meta">${this.escapeHtml(this.getStudentClass(score.studentId))}</span></td>
                        <td class="score-value-cell">${score.scoreValue} <span>/ ${Number(score.maxScore) > 0 ? score.maxScore : 10}</span></td>
                        <td>${score.note ? this.escapeHtml(score.note) : '<span class="score-muted">-</span>'}</td>
                        ${canManage ? `<td class="score-actions-cell">
                            <button type="button" class="score-icon-btn" data-score-action="edit" data-score-id="${this.escapeHtmlAttr(score.id)}">Sửa</button>
                            <button type="button" class="score-icon-btn danger" data-score-action="delete" data-score-id="${this.escapeHtmlAttr(score.id)}">Xóa</button>
                        </td>` : ''}
                    </tr>`).join('');

                return `<article class="score-test-card">
                    <header class="score-test-header">
                        <div class="score-test-date"><span>${this.formatScoreDate(first.date)}</span><small>${first.sessionId ? 'Trong buổi học' : 'Ngoài buổi học'}</small></div>
                        <div class="score-test-title">
                            <span class="score-type-badge ${this.scoreTypeBadgeClass(first.scoreType)}">${this.scoreTypeLabel(first.scoreType)}</span>
                            <h3>${this.escapeHtml(this.getScoreTestTitle(first))}</h3>
                            <p>${classes.length ? this.escapeHtml(classes.join(', ')) : 'Chưa xác định lớp'} · ${sortedScores.length} học sinh</p>
                        </div>
                        <div class="score-test-average"><small>Điểm TB /10</small><strong>${average === null ? '-' : average.toFixed(1)}</strong></div>
                        ${canManage ? `<div class="score-test-actions">
                            ${sessionId ? `<button type="button" class="btn btn-secondary btn-sm" data-score-action="open-session" data-session-id="${this.escapeHtmlAttr(sessionId)}">Mở buổi học</button>` : ''}
                            <button type="button" class="btn btn-danger btn-sm" data-score-action="delete-test" data-test-group-id="${this.escapeHtmlAttr(groupId)}">Xóa bài</button>
                        </div>` : ''}
                    </header>
                    <div class="table-wrapper score-result-table-wrap">
                        <table class="custom-table score-result-table">
                            <thead><tr><th>Học sinh</th><th>Điểm</th><th>Ghi chú</th>${canManage ? '<th>Thao tác</th>' : ''}</tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </article>`;
            }).join('');
    },

    renderScoresByStudents(scores) {
        if (!scores.length) return this.renderScoreEmptyState('Không có học sinh hoặc lượt điểm nào phù hợp với bộ lọc.');
        const groups = new Map();
        scores.forEach(score => {
            if (!groups.has(score.studentId)) groups.set(score.studentId, []);
            groups.get(score.studentId).push(score);
        });
        const canManage = ['teacher', 'assistant'].includes(this.currentRole);

        return [...groups.entries()]
            .sort(([leftId], [rightId]) => this.getStudentName(leftId).localeCompare(this.getStudentName(rightId), 'vi'))
            .map(([studentId, studentScores]) => {
                const sortedScores = [...studentScores].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
                const normalized = sortedScores.map(score => this.getScoreNormalizedToTen(score)).filter(Number.isFinite);
                const average = normalized.length ? normalized.reduce((sum, value) => sum + value, 0) / normalized.length : null;
                const rows = sortedScores.map(score => `
                    <tr>
                        <td>${this.formatScoreDate(score.date)}</td>
                        <td><span class="score-type-badge ${this.scoreTypeBadgeClass(score.scoreType)}">${this.scoreTypeLabel(score.scoreType)}</span><span class="score-row-meta">${this.escapeHtml(this.getScoreTestTitle(score))}</span></td>
                        <td class="score-value-cell">${score.scoreValue} <span>/ ${Number(score.maxScore) > 0 ? score.maxScore : 10}</span></td>
                        <td>${score.note ? this.escapeHtml(score.note) : '<span class="score-muted">-</span>'}</td>
                        ${canManage ? `<td class="score-actions-cell">
                            <button type="button" class="score-icon-btn" data-score-action="edit" data-score-id="${this.escapeHtmlAttr(score.id)}">Sửa</button>
                            <button type="button" class="score-icon-btn danger" data-score-action="delete" data-score-id="${this.escapeHtmlAttr(score.id)}">Xóa</button>
                        </td>` : ''}
                    </tr>`).join('');

                return `<article class="score-student-card">
                    <header class="score-student-header">
                        <div class="score-student-avatar">${this.escapeHtml(this.getStudentName(studentId).trim().charAt(0).toUpperCase() || '?')}</div>
                        <div><h3>${this.escapeHtml(this.getStudentName(studentId))}</h3><p>${this.escapeHtml(this.getStudentClass(studentId))} · ${sortedScores.length} lượt điểm</p></div>
                        <div class="score-student-average"><small>Trung bình /10</small><strong>${average === null ? '-' : average.toFixed(1)}</strong></div>
                    </header>
                    <div class="table-wrapper score-result-table-wrap">
                        <table class="custom-table score-result-table score-student-table">
                            <thead><tr><th>Ngày</th><th>Bài kiểm tra</th><th>Điểm</th><th>Ghi chú</th>${canManage ? '<th>Thao tác</th>' : ''}</tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </article>`;
            }).join('');
    },

    renderScoreEmptyState(message) {
        return `<div class="score-empty-state"><strong>Chưa có dữ liệu</strong><p>${this.escapeHtml(message)}</p></div>`;
    },

    setOutsideScoreExpanded(expanded) {
        const toggle = document.getElementById('outsideScoreToggle');
        const panel = document.getElementById('outsideScorePanel');
        if (!toggle || !panel) return;
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.querySelector('span').innerText = expanded ? '− Thu gọn điểm ngoài buổi học' : '+ Thêm điểm ngoài buổi học';
        panel.hidden = !expanded;
        panel.querySelectorAll('input, select, textarea, button').forEach(control => { control.disabled = !expanded; });
        if (expanded) {
            this.renderBatchScoreRows();
            window.setTimeout(() => document.getElementById('batchScoreType')?.focus(), 0);
        }
    },

    renderBatchScoreRows() {
        const tbody = document.getElementById('batchScoreTableBody');
        if (!tbody) return;
        const existing = new Map();
        tbody.querySelectorAll('.batch-score-row').forEach(row => {
            existing.set(row.dataset.studentId, {
                score: row.querySelector('.batch-score-value').value,
                note: row.querySelector('.batch-score-student-note').value
            });
        });

        const maxScore = Number(document.getElementById('batchScoreMax')?.value) || 10;
        const expanded = document.getElementById('outsideScoreToggle')?.getAttribute('aria-expanded') === 'true';
        const students = [...(this.students || [])].sort((a, b) =>
            (Number(a.gradeLevel || 99) - Number(b.gradeLevel || 99)) ||
            String(a.name || '').localeCompare(String(b.name || ''), 'vi')
        );
        tbody.innerHTML = students.length ? students.map(student => {
            const old = existing.get(student.id) || { score: '', note: '' };
            const classFilterValue = `class:${encodeURIComponent(String(student.class || '').trim())}`;
            return `<tr class="batch-score-row" data-student-id="${this.escapeHtmlAttr(student.id)}" data-grade-filter="grade:${student.gradeLevel || ''}" data-class-filter="${this.escapeHtmlAttr(classFilterValue)}">
                <td><strong>${this.escapeHtml(student.name)}</strong></td>
                <td>${this.escapeHtml(student.class || (student.gradeLevel ? `Lớp ${student.gradeLevel}` : '-'))}</td>
                <td><input type="number" class="form-control batch-score-value" min="0" max="${maxScore}" step="0.01" inputmode="decimal" placeholder="-" value="${this.escapeHtmlAttr(old.score)}" aria-label="Điểm của ${this.escapeHtmlAttr(student.name)}" ${expanded ? '' : 'disabled'}></td>
                <td><input type="text" class="form-control batch-score-student-note" maxlength="500" placeholder="Không bắt buộc" value="${this.escapeHtmlAttr(old.note)}" aria-label="Ghi chú của ${this.escapeHtmlAttr(student.name)}" ${expanded ? '' : 'disabled'}></td>
            </tr>`;
        }).join('') : '<tr><td colspan="4" class="score-batch-empty">Chưa có học sinh để nhập điểm.</td></tr>';

        const dateInput = document.getElementById('batchScoreDate');
        if (dateInput && !dateInput.value) dateInput.value = this.toISODateOnly(new Date());
        this.updateBatchScoreMax();
        this.filterBatchScoreRows();
        this.updateBatchScoreCount();
    },

    filterBatchScoreRows() {
        const filterValue = document.getElementById('batchScoreGrade')?.value || '';
        document.querySelectorAll('#batchScoreTableBody .batch-score-row').forEach(row => {
            row.hidden = !!filterValue && row.dataset.gradeFilter !== filterValue && row.dataset.classFilter !== filterValue;
        });
    },

    updateBatchScoreMax() {
        const maxScore = Number(document.getElementById('batchScoreMax')?.value);
        if (!Number.isFinite(maxScore) || maxScore <= 0) return;
        document.querySelectorAll('#batchScoreTableBody .batch-score-value').forEach(input => { input.max = String(maxScore); });
        const label = document.getElementById('batchScoreTableMaxLabel');
        if (label) label.innerText = String(maxScore);
    },

    updateBatchScoreCount() {
        const count = [...document.querySelectorAll('#batchScoreTableBody .batch-score-value')]
            .filter(input => input.value.trim() !== '').length;
        const label = document.getElementById('batchScoreCount');
        if (label) label.innerText = `${count} học sinh có điểm`;
    },

    async saveBatchScores() {
        const scoreType = document.getElementById('batchScoreType').value;
        const testName = document.getElementById('batchScoreTestName').value.trim();
        const maxScore = Number(document.getElementById('batchScoreMax').value);
        const date = document.getElementById('batchScoreDate').value;
        const commonNote = document.getElementById('batchScoreNote').value.trim();
        const entries = [];
        let invalidStudent = '';

        if (!testName) {
            this.showToast('Vui lòng nhập tên bài kiểm tra.', 'error');
            return;
        }
        if (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 1000) {
            this.showToast('Thang điểm phải lớn hơn 0 và không vượt quá 1000.', 'error');
            return;
        }

        document.querySelectorAll('#batchScoreTableBody .batch-score-row').forEach(row => {
            const raw = row.querySelector('.batch-score-value').value.trim();
            if (raw === '') return;
            const value = Number(raw.replace(',', '.'));
            const studentId = row.dataset.studentId;
            if (!Number.isFinite(value) || value < 0 || value > maxScore) {
                invalidStudent = invalidStudent || this.getStudentName(studentId);
                return;
            }
            const privateNote = row.querySelector('.batch-score-student-note').value.trim();
            entries.push({ studentId, scoreValue: value, note: [commonNote, privateNote].filter(Boolean).join(' — ') });
        });

        if (invalidStudent) {
            this.showToast(`Điểm của ${invalidStudent} phải từ 0 đến ${maxScore}.`, 'error');
            return;
        }
        if (!date) {
            this.showToast('Vui lòng chọn ngày chấm điểm.', 'error');
            return;
        }
        if (!entries.length) {
            this.showToast('Hãy nhập điểm cho ít nhất một học sinh.', 'error');
            return;
        }

        this.setBtnLoading('saveBatchScoresBtn', true, 'Đang lưu bài kiểm tra...');
        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/scores/batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scoreType, testName, maxScore, date, note: commonNote, entries })
            });
            const payload = await this.requireApiSuccess(res, 'Không thể lưu bài kiểm tra.');
            document.querySelectorAll('#batchScoreTableBody .batch-score-value, #batchScoreTableBody .batch-score-student-note')
                .forEach(input => { input.value = ''; });
            document.getElementById('batchScoreTestName').value = '';
            document.getElementById('batchScoreNote').value = '';
            await this.loadScores();
            this.setOutsideScoreExpanded(false);
            this.showToast(`Đã lưu bài kiểm tra cho ${payload.count || entries.length} học sinh.`, 'success');
        } catch (err) {
            this.showToast(err.message || 'Không thể lưu bài kiểm tra.', 'error');
        } finally {
            this.setBtnLoading('saveBatchScoresBtn', false);
            this.updateBatchScoreCount();
        }
    },

    setScoreMetadataLocked(locked) {
        ['scoreType', 'scoreTestName', 'scoreMax', 'scoreDate'].forEach(id => {
            const control = document.getElementById(id);
            if (control) control.disabled = locked;
        });
    },

    openAddScoreModal() {
        const studentId = document.getElementById('scoreFilterStudent')?.value || this.currentStudentId;
        if (!studentId) {
            this.showToast('Vui lòng lọc một học sinh trước khi thêm điểm.', 'error');
            return;
        }
        document.getElementById('scoreModalTitle').innerText = 'Thêm điểm ngoài buổi học';
        document.getElementById('editScoreId').value = '';
        document.getElementById('scoreType').value = 'BTVN';
        document.getElementById('scoreTestName').value = '';
        document.getElementById('scoreMax').value = '10';
        document.getElementById('scoreValue').value = '';
        document.getElementById('scoreValue').max = '10';
        document.getElementById('scoreDate').value = this.toISODateOnly(new Date());
        document.getElementById('scoreNote').value = '';
        document.getElementById('scoreDeleteBtn').style.display = 'none';
        document.getElementById('scoreModalStudentLabel').innerText = `Học sinh: ${this.getStudentName(studentId)}`;
        document.getElementById('scoreModalHelp').innerText = 'Điểm này không gắn với một buổi học cụ thể.';
        document.getElementById('scoreForm').dataset.studentId = studentId;
        this.setScoreMetadataLocked(false);
        this.openModal('scoreModal');
    },

    openEditScoreModal(scoreId) {
        const score = (this.scores || []).find(item => item.id === scoreId);
        if (!score) return;
        document.getElementById('scoreModalTitle').innerText = 'Chỉnh sửa điểm và ghi chú';
        document.getElementById('editScoreId').value = score.id;
        const scoreType = document.getElementById('scoreType');
        if (![...scoreType.options].some(option => option.value === score.scoreType)) {
            scoreType.add(new Option(this.scoreTypeLabel(score.scoreType), score.scoreType));
        }
        scoreType.value = score.scoreType;
        document.getElementById('scoreTestName').value = this.getScoreTestTitle(score);
        document.getElementById('scoreMax').value = Number(score.maxScore) > 0 ? score.maxScore : 10;
        document.getElementById('scoreValue').max = Number(score.maxScore) > 0 ? score.maxScore : 10;
        document.getElementById('scoreValue').value = score.scoreValue;
        document.getElementById('scoreDate').value = score.date;
        document.getElementById('scoreNote').value = score.note || '';
        document.getElementById('scoreDeleteBtn').style.display = 'inline-block';
        document.getElementById('scoreModalStudentLabel').innerText = `Học sinh: ${this.getStudentName(score.studentId)} · ${this.getStudentClass(score.studentId)}`;
        document.getElementById('scoreModalHelp').innerText = score.sessionId
            ? 'Điểm thuộc một buổi học. Chỉ điểm số và ghi chú được chỉnh sửa tại đây.'
            : 'Thông tin chung của bài kiểm tra được khóa để giữ đồng nhất cho cả bài.';
        document.getElementById('scoreForm').dataset.studentId = score.studentId;
        this.setScoreMetadataLocked(true);
        this.openModal('scoreModal');
    },

    async saveScore() {
        const id = document.getElementById('editScoreId').value;
        const scoreValue = document.getElementById('scoreValue').value;
        const note = document.getElementById('scoreNote').value.trim();
        const existing = id ? (this.scores || []).find(score => score.id === id) : null;
        const maxScore = existing
            ? (Number(existing.maxScore) > 0 ? Number(existing.maxScore) : 10)
            : Number(document.getElementById('scoreMax').value);

        if (scoreValue === '' || !Number.isFinite(Number(scoreValue)) || Number(scoreValue) < 0 || Number(scoreValue) > maxScore) {
            this.showToast(`Điểm số phải nằm trong khoảng từ 0 đến ${maxScore}.`, 'error');
            return;
        }

        try {
            let res;
            if (existing) {
                res = await this.authFetch(`${API_BASE_URL}/api/scores/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ scoreValue: Number(scoreValue), note })
                });
            } else {
                const scoreType = document.getElementById('scoreType').value;
                const testName = document.getElementById('scoreTestName').value.trim();
                const date = document.getElementById('scoreDate').value;
                const studentId = document.getElementById('scoreForm').dataset.studentId;
                if (!testName || !date || !studentId || !Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 1000) {
                    this.showToast('Vui lòng nhập đầy đủ thông tin bài kiểm tra.', 'error');
                    return;
                }
                res = await this.authFetch(`${API_BASE_URL}/api/scores`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: `sc_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                        studentId, scoreType, testName, maxScore, scoreValue: Number(scoreValue), date, note
                    })
                });
            }
            await this.requireApiSuccess(res, 'Không thể lưu điểm.');
            this.closeModal('scoreModal');
            await this.loadScores();
            this.showToast(existing ? 'Đã cập nhật điểm và ghi chú.' : 'Đã thêm điểm mới.', 'success');
        } catch (err) {
            this.showToast(err.message || 'Không thể lưu điểm.', 'error');
        }
    },

    deleteScore() {
        const id = document.getElementById('editScoreId').value;
        if (id) this.deleteScoreFromList(id);
    },

    deleteScoreFromList(id) {
        const score = (this.scores || []).find(item => item.id === id);
        if (!score) return;
        if (!confirm(`Xóa điểm ${score.scoreValue}/${Number(score.maxScore) > 0 ? score.maxScore : 10} của ${this.getStudentName(score.studentId)}?`)) return;
        this.closeModal('scoreModal');
        this.queueDeletion('Điểm số', () => this.commitDeleteScore(id));
    },

    async commitDeleteScore(id) {
        const res = await this.authFetch(`${API_BASE_URL}/api/scores/${id}`, { method: 'DELETE' });
        await this.requireApiSuccess(res, 'Không thể xóa điểm.');
        await this.runDeletionRefresh(() => this.loadScores());
        this.showToast('Đã xóa điểm.', 'success');
    },

    deleteScoreTest(testGroupId) {
        const scores = (this.scores || []).filter(score => this.getScoreTestGroupId(score) === testGroupId);
        if (!scores.length) return;
        const title = this.getScoreTestTitle(scores[0]);
        if (!confirm(`Xóa toàn bộ bài "${title}" và ${scores.length} lượt điểm?`)) return;
        this.queueDeletion('Bài kiểm tra', () => this.commitDeleteScoreTest(testGroupId));
    },

    async commitDeleteScoreTest(testGroupId) {
        const res = await this.authFetch(`${API_BASE_URL}/api/score-tests/${encodeURIComponent(testGroupId)}`, { method: 'DELETE' });
        await this.requireApiSuccess(res, 'Không thể xóa bài kiểm tra.');
        await this.runDeletionRefresh(() => this.loadScores());
        this.showToast('Đã xóa bài kiểm tra và toàn bộ điểm liên quan.', 'success');
    },

    async loadScores() {
        try {
            const url = this.currentRole === 'student' ? `${API_BASE_URL}/api/me/scores` : `${API_BASE_URL}/api/scores`;
            const res = await this.authFetch(url);
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload.error || 'Không thể tải lại điểm số.');
            this.scores = Array.isArray(payload) ? payload : [];
        } catch (err) {
            console.error('[loadScores]', err.message);
            this.showToast(err.message || 'Không thể tải lại điểm số.', 'error');
            return;
        }
        this.renderScores();
    }
});
