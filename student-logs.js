// ================================================================
// STUDENT-LOGS.JS — Trang "Nhật ký học tập" + các hàm phụ trợ
// bài tập về nhà / điểm số dùng chung với trang Điểm số.
// ================================================================
Object.assign(PinkyClassApp.prototype, {
    renderStudentLogs() {
        const studentId = this.currentStudentId;
        const studentName = this.getStudentName(studentId);
        const studentClass = this.getStudentClass(studentId);
        const studentSubject = this.getStudentSubject(studentId);

        // Header mapping
        document.getElementById('logStudentNameHeader').innerText = `${studentName} ${studentSubject} ${studentClass}`.toUpperCase();
        
        // Find all sessions involving this student, sorted chronologically
        const studentSessions = this.filterByMonth(this.sessions)
            .filter(sess => sess.studentIds.includes(studentId))
            .sort((a, b) => new Date(a.date) - new Date(b.date));

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

            const detail = sess.studentDetails[studentId] || { homework: '0%', attitude: 'Tốt', individualComment: '', note: '' };

            // BÀI TẬP VỀ NHÀ: chỉ HIỂN THỊ (badge tĩnh), không cho sửa trực
            // tiếp ở bảng này nữa — giá trị luôn lấy từ dữ liệu chấm công đã
            // nhập ở Lịch dạy & Chấm công (quick entry) hoặc modal "Đánh giá".
            // Giá trị lưu là MỨC % HOÀN THÀNH (0% / 30% / 50% / 70% / 100%),
            // màu badge đi theo mức độ: 100% xanh (done), 50-70% vàng
            // (pending), 0-30% đỏ (not-done).
            const hwClass = this.getHomeworkClass(detail.homework);
            const homeworkBadge = `<span class="homework-badge ${hwClass}">${this.getHomeworkLabel(detail.homework)}</span>`;

            // Session Date display: dòng trên "Thứ 7", dòng dưới "23/05" (không gạch ngang)
            const dateStr = this.formatDateVNSplit(sess.date);

            // NỘI DUNG BUỔI HỌC: hiển thị text thuần, không bullet point.
            const contentText = (sess.content || '').trim();
            const contentHTML = `<div class="session-content-text">${contentText ? this.nl2brText(contentText) : '<span style="color:var(--text-muted);">Chưa có nội dung.</span>'}</div>`;

            // NHẬN XÉT CỦA GIÁO VIÊN: gộp thành 1 trường duy nhất, chỉ lấy
            // nhận xét RIÊNG của học sinh này từ chấm công (individualComment).
            const commentHTML = `<div class="comment-text">${detail.individualComment ? this.nl2brText(detail.individualComment) : 'Chưa nhận xét.'}</div>`;

            // Actions for edit
            const actionsHTML = `
                <button class="btn btn-secondary btn-sm" onclick="app.openUpdateLogModal('${sess.id}', '${studentId}')">Đánh giá</button>
            `;

            tr.innerHTML = `
                <td class="session-number-cell">
                    <span class="session-number-val">Buổi ${idx + 1}</span>
                    <span class="session-time-val">${sess.startTime} - ${sess.endTime}</span>
                </td>
                <td class="session-date-cell">${dateStr}</td>
                <td class="col-content-compact">${contentHTML}</td>
                <td style="text-align:center;">${homeworkBadge}</td>
                <td><strong>${detail.attitude || 'Tập trung'}</strong></td>
                <td>${commentHTML}</td>
                <td><span style="font-size:14.5px; color:var(--text-muted);">${detail.note || '-'}</span></td>
                <td class="role-restricted admin-tutor log-export-hide">${actionsHTML}</td>
            `;

            tbody.appendChild(tr);
        });
    },

    // Danh sách các mức hoàn thành BTVN có thể chọn.
    getHomeworkLevels() {
        return ['0%', '30%', '50%', '70%', '100%'];
    },

    // Chuẩn hóa giá trị BTVN lưu trong DB về đúng 1 trong 5 mức % cố định.
    // Vẫn hiểu được dữ liệu CŨ (dạng chữ: "Chưa làm" / "Chưa hoàn thành" /
    // "Hoàn thành") để không vỡ báo cáo của các buổi học đã nhập từ trước.
    normalizeHomeworkValue(value) {
        const legacyMap = {
            'Chưa làm': '0%',
            'Chưa hoàn thành': '50%',
            'Hoàn thành': '100%'
        };
        if (legacyMap[value]) return legacyMap[value];
        if (this.getHomeworkLevels().includes(value)) return value;
        return '0%';
    },

    // Nhãn hiển thị = chính mức % đã chuẩn hóa.
    getHomeworkLabel(value) {
        return this.normalizeHomeworkValue(value);
    },

    // Màu badge theo mức độ hoàn thành: 100% -> xanh (done),
    // 50%/70% -> vàng (pending), 0%/30% -> đỏ (not-done).
    getHomeworkClass(value) {
        const percent = parseInt(this.normalizeHomeworkValue(value), 10) || 0;
        if (percent >= 100) return 'done';
        if (percent >= 50) return 'pending';
        return 'not-done';
    },

    // Escape + giữ xuống dòng khi hiển thị text thuần (không bullet)
    nl2brText(text) {
        return this.escapeHtml(text).replace(/\n/g, '<br>');
    },

    // --- VIEW 2B: SCORES MODULE (Phase 3: nhập điểm BTVN/Kiểm tra/Thái độ
    //     + Phase 4: biểu đồ tiến bộ / so sánh / tỷ lệ hoàn thành BTVN) ---

    getScoresForStudent(studentId) {
        return (this.scores || [])
            .filter(sc => sc.studentId === studentId)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
    },

    scoreTypeLabel(type) {
        if (type === 'BTVN') return 'BTVN';
        if (type === 'KiemTra') return 'Kiểm tra';
        if (type === 'ThaiDo') return 'Thái độ';
        return type;
    },

    scoreTypeBadgeClass(type) {
        if (type === 'BTVN') return 'type-btvn';
        if (type === 'KiemTra') return 'type-kiemtra';
        if (type === 'ThaiDo') return 'type-thaido';
        return '';
    },

    average(nums) {
        if (!nums || !nums.length) return null;
        return nums.reduce((a, b) => a + b, 0) / nums.length;
    },

    // Nhận xét tự động dựa trên điểm trung bình chung của học sinh đang chọn
    getAutoComment(avg) {
        if (avg === null) return 'Chưa có dữ liệu điểm để đưa ra nhận xét — hãy nhập điểm cho học sinh này.';
        if (avg >= 8.5) return 'Xuất sắc! Học sinh duy trì phong độ rất tốt, tiếp tục phát huy nhé.';
        if (avg >= 7) return 'Khá tốt. Học sinh nắm chắc kiến thức, nên chú ý thêm các dạng bài nâng cao.';
        if (avg >= 5.5) return 'Trung bình khá. Cần luyện tập thêm để cải thiện độ chắc chắn kiến thức.';
        if (avg >= 4) return 'Cần cố gắng hơn. Nên tăng cường ôn tập và làm bài tập đều đặn hơn.';
        return 'Đáng lo ngại. Nên trao đổi sớm với phụ huynh và lên kế hoạch phụ đạo thêm.';
    }

});
