// ================================================================
// SCORES.JS — Trang "Điểm số" (biểu đồ + CRUD điểm)
// ================================================================
Object.assign(PinkyClassApp.prototype, {
    renderScores() {
        const studentId = this.currentStudentId;
        const studentScores = this.getScoresForStudent(studentId);
        this.renderBatchScoreRows();

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
                        <td>
                            <span class="score-type-badge ${this.scoreTypeBadgeClass(sc.scoreType)}">${this.scoreTypeLabel(sc.scoreType)}</span>
                            ${sc.testName ? `<div class="score-test-name">${this.escapeHtml(sc.testName)}</div>` : ''}
                        </td>
                        <td style="text-align:center; font-weight:700; color:var(--primary);">${sc.scoreValue} / ${Number(sc.maxScore) > 0 ? sc.maxScore : 10}</td>
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
        const normalizedToTen = score => {
            const maxScore = Number(score.maxScore) > 0 ? Number(score.maxScore) : 10;
            return Number(score.scoreValue) / maxScore * 10;
        };
        const byTypes = (...types) => studentScores.filter(s => types.includes(s.scoreType)).map(normalizedToTen);
        const avgBTVN = this.average(byTypes('BTVN'));
        const avgKTTX = this.average(byTypes('KTTX', 'KiemTra'));
        const avgCC   = this.average(byTypes('CuoiChuong'));
        const avgAll  = this.average(studentScores.map(normalizedToTen));
        const fmt = v => v === null ? '-' : v.toFixed(1);

        const summaryGrid = document.getElementById('scoreSummaryGrid');
        if (summaryGrid) {
            summaryGrid.innerHTML = `
                <div class="score-summary-card">
                    <div class="score-summary-label">TB BTVN</div>
                    <div class="score-summary-value">${fmt(avgBTVN)}</div>
                </div>
                <div class="score-summary-card">
                    <div class="score-summary-label">TB kiểm tra thường xuyên</div>
                    <div class="score-summary-value">${fmt(avgKTTX)}</div>
                </div>
                <div class="score-summary-card">
                    <div class="score-summary-label">TB kiểm tra cuối chương</div>
                    <div class="score-summary-value">${fmt(avgCC)}</div>
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

        // Đồng bộ picker riêng của trang Điểm số với picker toàn cục
        const scoresPicker = document.getElementById('scoresStudentPicker');
        if (scoresPicker && scoresPicker.value !== studentId) {
            scoresPicker.value = studentId;
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

        const students = [...(this.students || [])].sort((a, b) =>
            (Number(a.gradeLevel || 99) - Number(b.gradeLevel || 99)) ||
            String(a.name || '').localeCompare(String(b.name || ''), 'vi')
        );
        tbody.innerHTML = students.length ? students.map(student => {
            const old = existing.get(student.id) || { score: '', note: '' };
            return `
                <tr class="batch-score-row" data-student-id="${this.escapeHtmlAttr(student.id)}" data-grade="${student.gradeLevel || ''}">
                    <td><strong>${this.escapeHtml(student.name)}</strong></td>
                    <td>${this.escapeHtml(student.class || (student.gradeLevel ? `Lớp ${student.gradeLevel}` : '-'))}</td>
                    <td><input type="number" class="form-control batch-score-value" min="0" max="10" step="0.1" inputmode="decimal" placeholder="-" value="${this.escapeHtmlAttr(old.score)}" aria-label="Điểm của ${this.escapeHtmlAttr(student.name)}"></td>
                    <td><input type="text" class="form-control batch-score-student-note" placeholder="Không bắt buộc" value="${this.escapeHtmlAttr(old.note)}" aria-label="Ghi chú của ${this.escapeHtmlAttr(student.name)}"></td>
                </tr>
            `;
        }).join('') : '<tr><td colspan="4" class="score-batch-empty">Chưa có học sinh để nhập điểm.</td></tr>';

        const dateInput = document.getElementById('batchScoreDate');
        if (dateInput && !dateInput.value) dateInput.value = this.toISODateOnly(new Date());
        this.filterBatchScoreRows();
        this.updateBatchScoreCount();
    },

    filterBatchScoreRows() {
        const grade = document.getElementById('batchScoreGrade')?.value || '';
        document.querySelectorAll('#batchScoreTableBody .batch-score-row').forEach(row => {
            row.hidden = !!grade && row.dataset.grade !== grade;
        });
    },

    updateBatchScoreCount() {
        const count = [...document.querySelectorAll('#batchScoreTableBody .batch-score-value')]
            .filter(input => input.value.trim() !== '').length;
        const label = document.getElementById('batchScoreCount');
        if (label) label.innerText = `${count} học sinh có điểm`;
    },

    async saveBatchScores() {
        const scoreType = document.getElementById('batchScoreType').value;
        const date = document.getElementById('batchScoreDate').value;
        const commonNote = document.getElementById('batchScoreNote').value.trim();
        const entries = [];
        let invalidStudent = '';

        document.querySelectorAll('#batchScoreTableBody .batch-score-row').forEach(row => {
            const scoreInput = row.querySelector('.batch-score-value');
            const raw = scoreInput.value.trim();
            if (raw === '') return;
            const value = Number(raw.replace(',', '.'));
            const studentId = row.dataset.studentId;
            if (!Number.isFinite(value) || value < 0 || value > 10) {
                invalidStudent = invalidStudent || this.getStudentName(studentId);
                return;
            }
            const privateNote = row.querySelector('.batch-score-student-note').value.trim();
            entries.push({
                studentId,
                scoreValue: value,
                note: [commonNote, privateNote].filter(Boolean).join(' — ')
            });
        });

        if (invalidStudent) {
            this.showToast(`Điểm của ${invalidStudent} phải từ 0 đến 10.`, 'error');
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

        this.setBtnLoading('saveBatchScoresBtn', true, 'Đang lưu cả lớp...');
        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/scores/batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scoreType, date, note: commonNote, entries })
            });
            const payload = await this.requireApiSuccess(res, 'Không thể lưu bảng điểm.');
            document.querySelectorAll('#batchScoreTableBody .batch-score-value, #batchScoreTableBody .batch-score-student-note')
                .forEach(input => { input.value = ''; });
            document.getElementById('batchScoreNote').value = '';
            await this.loadScores();
            this.showToast(`Đã lưu điểm cho ${payload.count || entries.length} học sinh.`, 'success');
        } catch (err) {
            this.showToast(err.message || 'Không thể lưu bảng điểm.', 'error');
        } finally {
            this.setBtnLoading('saveBatchScoresBtn', false);
            this.updateBatchScoreCount();
        }
    },

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
    },

    openEditScoreModal(scoreId) {
        const sc = (this.scores || []).find(s => s.id === scoreId);
        if (!sc) return;
        if (sc.sessionId) {
            this.openEditSessionModal(sc.sessionId);
            this.setSessionScoreExpanded('editSession', true);
            window.setTimeout(() => document.getElementById('editSessionScorePanel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
            return;
        }
        document.getElementById('scoreModalTitle').innerText = 'Sửa Điểm';
        document.getElementById('editScoreId').value = sc.id;
        const scoreTypeEl = document.getElementById('scoreType');
        if (![...scoreTypeEl.options].some(option => option.value === sc.scoreType)) {
            scoreTypeEl.add(new Option(this.scoreTypeLabel(sc.scoreType), sc.scoreType));
        }
        scoreTypeEl.value = sc.scoreType;
        document.getElementById('scoreValue').value = sc.scoreValue;
        document.getElementById('scoreDate').value = sc.date;
        document.getElementById('scoreNote').value = sc.note || '';
        document.getElementById('scoreDeleteBtn').style.display = 'inline-block';
        document.getElementById('scoreModalStudentLabel').innerText = `Học sinh: ${this.getStudentName(sc.studentId)}`;
        this.openModal('scoreModal');
    },

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
    },

    async deleteScore() {
        const id = document.getElementById('editScoreId').value;
        if (!id || !confirm('Xóa điểm này? Bạn có 7 giây để hoàn tác.')) return;
        this.closeModal('scoreModal');
        this.queueDeletion('Điểm số', () => this.commitDeleteScore(id));
    },

    async commitDeleteScore(id) {
        const res = await this.authFetch(`${API_BASE_URL}/api/scores/${id}`, { method: 'DELETE' });
        await this.requireApiSuccess(res, 'Không thể xóa điểm.');
        await this.runDeletionRefresh(() => this.loadScores());
        this.showToast('Đã xóa điểm.', 'success');
    },

    // Tải lại riêng danh sách điểm (nhanh hơn loadData() vì không cần tải lại
    // students/sessions), dùng ngay sau khi thêm/sửa/xóa 1 điểm.
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

    // --- VIEW 3: LỊCH DẠY (Lịch dạy & Chấm công) ---
    // Có 3 kiểu xem: Ngày / Tuần (lưới giờ, dùng chung 1 hàm renderHourGridCalendar)
    // và Tháng (lưới ô ngày truyền thống, renderMonthCalendar). renderCalendarView()
    // là điểm vào DUY NHẤT — mọi nơi khác trong code chỉ cần gọi hàm này, không
    // cần biết đang ở kiểu xem nào.
});
