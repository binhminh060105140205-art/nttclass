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

        const results = document.getElementById('scoreResults');
        if (!results) return;
        results.innerHTML = this.scoreViewMode === 'students'
            ? this.renderScoresByStudents(filteredScores)
            : this.renderScoresByTests(filteredScores);
        this.activateScoreInlineEditing();
    },

    setScoreViewMode(mode) {
        this.scoreViewMode = mode === 'students' ? 'students' : 'tests';
        this.renderScores();
    },

    resetScoreFilters() {
        ['scoreFilterStudent', 'scoreFilterClass', 'scoreFilterType'].forEach(id => {
            const control = document.getElementById(id);
            if (control && !(this.currentRole === 'student' && id === 'scoreFilterStudent')) control.value = '';
        });
        this.renderScores();
    },

    scoreClassKey(value) {
        const raw = String(value ?? '').trim();
        const normalized = raw.replace(/^lớp\s*/i, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('vi');
        if (!normalized) return '';
        const numeric = Number(normalized);
        if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) return `grade-${numeric}`;
        return `class-${normalized}`;
    },

    scoreClassLabel(value) {
        const raw = String(value ?? '').trim();
        if (!raw) return '';
        const withoutPrefix = raw.replace(/^lớp\s*/i, '').trim();
        const numeric = Number(withoutPrefix);
        if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 12) return `Lớp ${numeric}`;
        return /^lớp\s*/i.test(raw) ? `Lớp ${withoutPrefix}` : raw;
    },

    getStudentScoreClassGroups(student) {
        if (!student) return [];
        const groups = new Map();
        const grade = Number(student.gradeLevel);
        if (Number.isInteger(grade) && grade >= 1 && grade <= 12) {
            groups.set(`grade-${grade}`, `Lớp ${grade}`);
        }
        const classKey = this.scoreClassKey(student.class);
        const classLabel = this.scoreClassLabel(student.class);
        if (classKey && classLabel && !groups.has(classKey)) groups.set(classKey, classLabel);
        return [...groups].map(([key, label]) => ({ key, label }));
    },
    renderScoreFilterOptions() {
        const students = this.students || [];
        const optionsSignature = JSON.stringify([
            this.currentRole || '',
            this.currentStudentId || '',
            ...students.map(student => [
                student.id,
                student.gradeLevel,
                String(student.class || '').trim()
            ])
        ]);
        if (this._scoreFilterOptionsSignature === optionsSignature) return;

        const classFilter = document.getElementById('scoreFilterClass');
        const batchClassFilter = document.getElementById('batchScoreGrade');
        const previousClass = classFilter?.value || '';
        const previousBatchClass = batchClassFilter?.value || '';
        const classGroups = new Map();
        students.forEach(student => {
            this.getStudentScoreClassGroups(student).forEach(group => {
                if (!classGroups.has(group.key)) classGroups.set(group.key, group.label);
            });
        });
        const classOptionHtml = [...classGroups]
            .sort((left, right) => left[1].localeCompare(right[1], 'vi', { numeric: true }))
            .map(([key, label]) => `<option value="group:${encodeURIComponent(key)}">${this.escapeHtml(label)}</option>`)
            .join('');
        const optionHtml = classOptionHtml;

        if (classFilter) {
            classFilter.innerHTML = `<option value="">Tất cả lớp</option>${classOptionHtml}`;
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
        this._scoreFilterOptionsSignature = optionsSignature;
    },

    scoreStudentMatchesClass(student, filterValue) {
        if (!filterValue) return true;
        if (!student) return false;
        if (filterValue.startsWith('group:')) {
            const selectedKey = decodeURIComponent(filterValue.slice(6));
            return this.getStudentScoreClassGroups(student).some(group => group.key === selectedKey);
        }
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
        const selectedType = document.getElementById('scoreFilterType')?.value || '';
        const monthFilteredScores = this.filterByMonth(this.scores || []);

        return monthFilteredScores.filter(score => {
            const student = (this.students || []).find(item => item.id === score.studentId);
            if (selectedStudent && score.studentId !== selectedStudent) return false;
            if (!this.scoreStudentMatchesClass(student, selectedClass)) return false;
            if (selectedType && score.scoreType !== selectedType) return false;
            return true;
        });
    },

    getScoreTestGroupId(score) {
        if (score.testGroupId) return String(score.testGroupId);
        if (score.sessionId) return `session:${score.sessionId}`;
        return `score:${score.id}`;
    },

    getSelectedScoreType(selectId, customInputId) {
        const select = document.getElementById(selectId);
        if (!select) return '';
        if (select.value !== '__custom__') return String(select.value || '').trim();
        return String(document.getElementById(customInputId)?.value || '').trim();
    },

    syncCustomScoreTypeInput(select, customInput) {
        if (!select || !customInput) return;
        const isCustom = select.value === '__custom__';
        customInput.hidden = !isCustom;
        customInput.disabled = select.disabled || !isCustom;
        customInput.required = isCustom && !select.disabled;
        if (isCustom && !select.disabled) window.setTimeout(() => customInput.focus(), 0);
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

    fitScoreInlineTextarea(textarea) {
        if (!textarea) return;
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 36), 140)}px`;
    },

    mountScoreValueEditor(cell, score) {
        if (!cell || !score) return;
        const input = document.createElement('input');
        input.type = 'text';
        input.inputMode = 'decimal';
        input.className = 'score-inline-editor score-inline-score-value';
        input.dataset.scoreInline = 'score-value';
        input.dataset.scoreId = score.id;
        input.dataset.originalValue = String(score.scoreValue);
        input.value = String(score.scoreValue);
        input.setAttribute('aria-label', 'Điểm số');
        const scale = document.createElement('span');
        const wrapper = document.createElement('label');
        scale.textContent = `/ ${Number(score.maxScore) > 0 ? score.maxScore : 10}`;
        wrapper.className = 'score-inline-score-wrap';
        wrapper.append(input, scale);
        cell.replaceChildren(wrapper);
    },

    mountScoreNoteEditor(cell, score) {
        if (!cell || !score) return;
        const textarea = document.createElement('textarea');
        textarea.className = 'score-inline-editor score-inline-note';
        textarea.rows = 1;
        textarea.maxLength = 500;
        textarea.dataset.scoreInline = 'note';
        textarea.dataset.scoreId = score.id;
        textarea.dataset.originalValue = score.note || '';
        textarea.value = score.note || '';
        textarea.setAttribute('aria-label', 'Ghi chú điểm');
        textarea.placeholder = '-';
        cell.replaceChildren(textarea);
        this.fitScoreInlineTextarea(textarea);
    },

    mountScoreTestNameEditor(container, score, compact = false) {
        if (!container || !score) return;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = `score-inline-editor score-inline-test-name${compact ? ' is-compact' : ''}`;
        input.maxLength = 150;
        input.dataset.scoreInline = 'test-name';
        input.dataset.testGroupId = this.getScoreTestGroupId(score);
        input.dataset.originalValue = this.getScoreTestTitle(score);
        input.value = this.getScoreTestTitle(score);
        input.setAttribute('aria-label', 'Tên bài kiểm tra');
        container.replaceChildren(input);
    },

    activateScoreInlineEditing() {
        if (!['teacher', 'assistant'].includes(this.currentRole)) return;
        const results = document.getElementById('scoreResults');
        if (!results) return;
        results.querySelectorAll('[data-score-action=edit]').forEach(button => {
            const score = (this.scores || []).find(item => item.id === button.dataset.scoreId);
            const row = button.closest('tr');
            if (!score || !row) return;
            const scoreCell = row.querySelector('.score-value-cell');
            const noteCell = scoreCell?.nextElementSibling;
            this.mountScoreValueEditor(scoreCell, score);
            this.mountScoreNoteEditor(noteCell, score);
            if (this.scoreViewMode === 'students') {
                this.mountScoreTestNameEditor(row.querySelector('.score-row-meta'), score, true);
            }
            button.remove();
        });
        results.querySelectorAll('.score-test-card').forEach(card => {
            const action = card.querySelector('[data-score-action=delete-test]');
            const groupId = action?.dataset.testGroupId;
            const score = (this.scores || []).find(item => this.getScoreTestGroupId(item) === groupId);
            if (!score) return;
            this.mountScoreTestNameEditor(card.querySelector('.score-test-title h3'), score);
        });
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
        const expanded = document.getElementById('outsideScoreToggle')?.getAttribute('aria-expanded') === 'true';
        const students = [...(this.students || [])].sort((a, b) =>
            (Number(a.gradeLevel || 99) - Number(b.gradeLevel || 99)) ||
            String(a.name || '').localeCompare(String(b.name || ''), 'vi')
        );
        const rowsSignature = JSON.stringify([
            expanded,
            ...students.map(student => [student.id, student.name, student.class, student.gradeLevel])
        ]);

        if (this._batchScoreRowsSignature !== rowsSignature || !tbody.childElementCount) {
        const existing = new Map();
        tbody.querySelectorAll('.batch-score-row').forEach(row => {
            existing.set(row.dataset.studentId, {
                score: row.querySelector('.batch-score-value').value,
                note: row.querySelector('.batch-score-student-note').value
            });
        });

        tbody.innerHTML = students.length ? students.map(student => {
            const old = existing.get(String(student.id)) || { score: '', note: '' };
            return `<tr class="batch-score-row" data-student-id="${this.escapeHtmlAttr(student.id)}">
                <td><strong>${this.escapeHtml(student.name)}</strong></td>
                <td>${this.escapeHtml(student.class || (student.gradeLevel ? `Lớp ${student.gradeLevel}` : '-'))}</td>
                <td><input type="text" class="form-control batch-score-value" inputmode="decimal" placeholder="-" value="${this.escapeHtmlAttr(old.score)}" aria-label="Điểm của ${this.escapeHtmlAttr(student.name)}" ${expanded ? '' : 'disabled'}></td>
                <td><input type="text" class="form-control batch-score-student-note" maxlength="500" value="${this.escapeHtmlAttr(old.note)}" aria-label="Ghi chú của ${this.escapeHtmlAttr(student.name)}" ${expanded ? '' : 'disabled'}></td>
            </tr>`;
        }).join('') : '<tr><td colspan="4" class="score-batch-empty">Chưa có học sinh để nhập điểm.</td></tr>';

        }

        this._batchScoreRowsSignature = rowsSignature;
        const dateInput = document.getElementById('batchScoreDate');
        if (dateInput && !dateInput.value) dateInput.value = this.toISODateOnly(new Date());
        this.updateBatchScoreMax();
        this.filterBatchScoreRows();
        this.updateBatchScoreCount();
    },

    filterBatchScoreRows() {
        const filterValue = document.getElementById('batchScoreGrade')?.value || '';
        document.querySelectorAll('#batchScoreTableBody .batch-score-row').forEach(row => {
            const student = (this.students || []).find(item => String(item.id) === row.dataset.studentId);
            row.hidden = !this.scoreStudentMatchesClass(student, filterValue);
        });
    },

    updateBatchScoreMax() {
        const maxScore = Number(String(document.getElementById('batchScoreMax')?.value || '').replace(',', '.'));
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
        const scoreType = this.getSelectedScoreType('batchScoreType', 'batchScoreCustomType');
        const testName = document.getElementById('batchScoreTestName').value.trim();
        const maxScore = Number(String(document.getElementById('batchScoreMax').value || '').replace(',', '.'));
        const date = document.getElementById('batchScoreDate').value;
        const commonNote = document.getElementById('batchScoreNote').value.trim();
        const entries = [];
        let invalidStudent = '';

        if (!scoreType) {
            this.showToast('Vui lòng chọn hoặc nhập loại điểm.', 'error');
            return;
        }
        if (scoreType.length > 100) {
            this.showToast('Loại điểm không được vượt quá 100 ký tự.', 'error');
            return;
        }
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
            document.getElementById('batchScoreType').value = 'BTVN';
            document.getElementById('batchScoreCustomType').value = '';
            this.syncCustomScoreTypeInput(document.getElementById('batchScoreType'), document.getElementById('batchScoreCustomType'));
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
        ['scoreType', 'scoreCustomType', 'scoreTestName', 'scoreMax', 'scoreDate'].forEach(id => {
            const control = document.getElementById(id);
            if (control) control.disabled = locked;
        });
        this.syncCustomScoreTypeInput(document.getElementById('scoreType'), document.getElementById('scoreCustomType'));
    },

    async saveScoreInlineEditor(editor) {
        if (!editor || editor.disabled) return;
        const score = (this.scores || []).find(item => item.id === editor.dataset.scoreId);
        const field = editor.dataset.scoreInline;
        if (!score || !['score-value', 'note'].includes(field)) return;
        let scoreValue = Number(score.scoreValue);
        let note = String(score.note || '');
        if (field === 'score-value') {
            const rawValue = String(editor.value || '').trim().replace(',', '.');
            const nextValue = Number(rawValue);
            const maxScore = Number(score.maxScore) > 0 ? Number(score.maxScore) : 10;
            if (!rawValue || !Number.isFinite(nextValue) || nextValue < 0 || nextValue > maxScore) {
                this.showToast(`Điểm số phải nằm trong khoảng từ 0 đến ${maxScore}.`, 'error');
                this.renderScores();
                return;
            }
            scoreValue = nextValue;
        } else {
            note = String(editor.value || '').trim();
        }
        if (scoreValue === Number(score.scoreValue) && note === String(score.note || '')) return;
        editor.disabled = true;
        editor.classList.add('is-saving');
        try {
            const response = await this.authFetch(`${API_BASE_URL}/api/scores/${score.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scoreValue, note })
            });
            await this.requireApiSuccess(response, 'Không thể lưu thay đổi điểm số.');
            score.scoreValue = scoreValue;
            score.note = note;
            this.renderScores();
            this.showToast('Đã tự động lưu điểm và ghi chú.', 'success');
        } catch (error) {
            this.renderScores();
            this.showToast(error.message || 'Không thể lưu thay đổi điểm số.', 'error');
        }
    },

    async saveScoreInlineTestName(editor) {
        if (!editor || editor.disabled) return;
        const testGroupId = String(editor.dataset.testGroupId || '').trim();
        const testName = String(editor.value || '').trim();
        const originalValue = String(editor.dataset.originalValue || '').trim();
        if (!testGroupId || testName === originalValue) return;
        if (!testName || testName.length > 150) {
            this.showToast('Tên bài kiểm tra phải có từ 1 đến 150 ký tự.', 'error');
            this.renderScores();
            return;
        }
        editor.disabled = true;
        editor.classList.add('is-saving');
        try {
            const response = await this.authFetch(`${API_BASE_URL}/api/score-tests/${encodeURIComponent(testGroupId)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ testName })
            });
            await this.requireApiSuccess(response, 'Không thể đổi tên bài kiểm tra.');
            (this.scores || []).forEach(score => {
                if (this.getScoreTestGroupId(score) === testGroupId) score.testName = testName;
            });
            this.renderScores();
            this.showToast('Đã tự động lưu tên bài kiểm tra.', 'success');
        } catch (error) {
            this.renderScores();
            this.showToast(error.message || 'Không thể đổi tên bài kiểm tra.', 'error');
        }
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
        document.getElementById('scoreCustomType').value = '';
        this.syncCustomScoreTypeInput(scoreType, document.getElementById('scoreCustomType'));
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
        const scoreValueRaw = document.getElementById('scoreValue').value.trim();
        const scoreValue = Number(scoreValueRaw.replace(',', '.'));
        const note = document.getElementById('scoreNote').value.trim();
        const existing = id ? (this.scores || []).find(score => score.id === id) : null;
        const maxScore = existing
            ? (Number(existing.maxScore) > 0 ? Number(existing.maxScore) : 10)
            : Number(String(document.getElementById('scoreMax').value || '').replace(',', '.'));

        if (scoreValueRaw === '' || !Number.isFinite(scoreValue) || scoreValue < 0 || scoreValue > maxScore) {
            this.showToast(`Điểm số phải nằm trong khoảng từ 0 đến ${maxScore}.`, 'error');
            return;
        }

        try {
            let res;
            if (existing) {
                res = await this.authFetch(`${API_BASE_URL}/api/scores/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ scoreValue, note })
                });
            } else {
                const scoreType = this.getSelectedScoreType('scoreType', 'scoreCustomType');
                const testName = document.getElementById('scoreTestName').value.trim();
                const date = document.getElementById('scoreDate').value;
                const studentId = document.getElementById('scoreForm').dataset.studentId;
                if (!scoreType || scoreType.length > 100 || !testName || !date || !studentId || !Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 1000) {
                    this.showToast('Vui lòng nhập đầy đủ thông tin bài kiểm tra.', 'error');
                    return;
                }
                res = await this.authFetch(`${API_BASE_URL}/api/scores`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: `sc_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                        studentId, scoreType, testName, maxScore, scoreValue, date, note
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
            this.populateMonthFilterOptions();
        } catch (err) {
            console.error('[loadScores]', err.message);
            this.showToast(err.message || 'Không thể tải lại điểm số.', 'error');
            return;
        }
        this.renderScores();
    }
});
