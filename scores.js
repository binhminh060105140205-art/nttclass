// ================================================================
// SCORES.JS — Trang "Điểm số" (biểu đồ + CRUD điểm)
// ================================================================
Object.assign(PinkyClassApp.prototype, {
    renderScores() {
        const studentId = this.currentStudentId;
        const studentScores = this.getScoresForStudent(studentId);

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
                        <td><span class="score-type-badge ${this.scoreTypeBadgeClass(sc.scoreType)}">${this.scoreTypeLabel(sc.scoreType)}</span></td>
                        <td style="text-align:center; font-weight:700; color:var(--primary);">${sc.scoreValue}</td>
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
        const byType = t => studentScores.filter(s => s.scoreType === t).map(s => s.scoreValue);
        const avgBTVN = this.average(byType('BTVN'));
        const avgKT   = this.average(byType('KiemTra'));
        const avgTD   = this.average(byType('ThaiDo'));
        const avgAll  = this.average(studentScores.map(s => s.scoreValue));
        const fmt = v => v === null ? '-' : v.toFixed(1);

        const summaryGrid = document.getElementById('scoreSummaryGrid');
        if (summaryGrid) {
            summaryGrid.innerHTML = `
                <div class="score-summary-card">
                    <div class="score-summary-label">TB BTVN</div>
                    <div class="score-summary-value">${fmt(avgBTVN)}</div>
                </div>
                <div class="score-summary-card">
                    <div class="score-summary-label">TB Kiểm tra</div>
                    <div class="score-summary-value">${fmt(avgKT)}</div>
                </div>
                <div class="score-summary-card">
                    <div class="score-summary-label">TB Thái độ</div>
                    <div class="score-summary-value">${fmt(avgTD)}</div>
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

        // ----- Biểu đồ (Phase 4) -----
        this.renderScoreCharts(studentId, studentScores);

        // Đồng bộ picker riêng của trang Điểm số với picker toàn cục
        const scoresPicker = document.getElementById('scoresStudentPicker');
        if (scoresPicker && scoresPicker.value !== studentId) {
            scoresPicker.value = studentId;
        }
    },

    // - Biểu đồ đường: tiến bộ điểm theo thời gian (1 đường / loại điểm)
    // - Biểu đồ cột: so sánh điểm trung bình giữa 3 loại
    // - Biểu đồ tròn: tỷ lệ hoàn thành BTVN (dựa trên Homework của SessionDetails)
    renderScoreCharts(studentId, studentScores) {
        if (typeof Chart === 'undefined') return; // Chart.js chưa tải xong / lỗi mạng CDN
        this.charts = this.charts || {};

        // --- LINE CHART: tiến bộ điểm theo thời gian ---
        const lineCanvas = document.getElementById('scoreLineChart');
        if (lineCanvas) {
            const labels = studentScores.map(s => (this.formatDateVN(s.date).split(' - ')[1]) || s.date);
            const dataFor = type => studentScores.map(s => s.scoreType === type ? s.scoreValue : null);

            if (this.charts.line) this.charts.line.destroy();
            this.charts.line = new Chart(lineCanvas, {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        { label: 'BTVN',     data: dataFor('BTVN'),    borderColor: '#2563eb', backgroundColor: '#2563eb', spanGaps: true, tension: 0.3 },
                        { label: 'Kiểm tra', data: dataFor('KiemTra'), borderColor: '#dc2626', backgroundColor: '#dc2626', spanGaps: true, tension: 0.3 },
                        { label: 'Thái độ',  data: dataFor('ThaiDo'),  borderColor: '#16a34a', backgroundColor: '#16a34a', spanGaps: true, tension: 0.3 }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    scales: { y: { min: 0, max: 10 } },
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } }
                }
            });
        }

        // --- BAR CHART: so sánh trung bình theo loại điểm ---
        const barCanvas = document.getElementById('scoreBarChart');
        if (barCanvas) {
            const byTypeAvg = t => this.average(studentScores.filter(s => s.scoreType === t).map(s => s.scoreValue));
            if (this.charts.bar) this.charts.bar.destroy();
            this.charts.bar = new Chart(barCanvas, {
                type: 'bar',
                data: {
                    labels: ['BTVN', 'Kiểm tra', 'Thái độ'],
                    datasets: [{
                        label: 'Điểm trung bình',
                        data: [byTypeAvg('BTVN'), byTypeAvg('KiemTra'), byTypeAvg('ThaiDo')].map(v => v === null ? 0 : v),
                        backgroundColor: ['#2563eb', '#dc2626', '#16a34a'],
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    scales: { y: { min: 0, max: 10 } },
                    plugins: { legend: { display: false } }
                }
            });
        }

        // --- PIE CHART: tỷ lệ hoàn thành BTVN (theo dữ liệu Homework của buổi học) ---
        const pieCanvas = document.getElementById('homeworkPieChart');
        if (pieCanvas) {
            const relevantSessions = (this.sessions || []).filter(sess => sess.studentIds && sess.studentIds.includes(studentId));
            let done = 0, pending = 0, notDone = 0;
            relevantSessions.forEach(sess => {
                const hw = (sess.studentDetails[studentId] || {}).homework;
                const hwClass = this.getHomeworkClass(hw);
                if (hwClass === 'done') done++;
                else if (hwClass === 'pending') pending++;
                else notDone++;
            });

            if (this.charts.pie) this.charts.pie.destroy();
            this.charts.pie = new Chart(pieCanvas, {
                type: 'pie',
                data: {
                    labels: ['Hoàn thành (100%)', 'Đang làm (50-70%)', 'Chưa làm (0-30%)'],
                    datasets: [{
                        data: [done, pending, notDone],
                        backgroundColor: ['#16a34a', '#f59e0b', '#dc2626']
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } }
                }
            });
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
        document.getElementById('scoreModalTitle').innerText = 'Sửa Điểm';
        document.getElementById('editScoreId').value = sc.id;
        document.getElementById('scoreType').value = sc.scoreType;
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
        if (!this._committingDeletion) {
            const scoreId = document.getElementById('editScoreId').value;
            if (!scoreId || !confirm('Xóa điểm này? Bạn có 7 giây để hoàn tác.')) return;
            this.queueDeletion('Điểm số', async () => {
                const originalConfirm = window.confirm;
                this._committingDeletion = true;
                window.confirm = () => true;
                try { await this.deleteScore(); } finally { window.confirm = originalConfirm; this._committingDeletion = false; }
            });
            return;
        }
        const id = document.getElementById('editScoreId').value;
        if (!id) return;
        if (!confirm('Xóa điểm này? Hành động không thể hoàn tác.')) return;
        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/scores/${id}`, { method: 'DELETE' });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload.error || 'Không thể xóa điểm.');

            this.showToast('Đã xóa điểm.', 'success');
            this.closeModal('scoreModal');
            await this.loadScores();
        } catch (err) {
            this.showToast(err.message || 'Không thể xóa điểm.', 'error');
        }
    },

    // Tải lại riêng danh sách điểm (nhanh hơn loadData() vì không cần tải lại
    // students/sessions), dùng ngay sau khi thêm/sửa/xóa 1 điểm.
    async loadScores() {
        try {
            const url = this.currentRole === 'student' ? `${API_BASE_URL}/api/me/scores` : `${API_BASE_URL}/api/scores`;
            const res = await this.authFetch(url);
            this.scores = res.ok ? await res.json() : [];
        } catch (err) {
            console.error('[loadScores]', err.message);
        }
        this.renderScores();
    }

    // --- VIEW 3: LỊCH DẠY (Lịch dạy & Chấm công) ---
    // Có 3 kiểu xem: Ngày / Tuần (lưới giờ, dùng chung 1 hàm renderHourGridCalendar)
    // và Tháng (lưới ô ngày truyền thống, renderMonthCalendar). renderCalendarView()
    // là điểm vào DUY NHẤT — mọi nơi khác trong code chỉ cần gọi hàm này, không
    // cần biết đang ở kiểu xem nào.
});
