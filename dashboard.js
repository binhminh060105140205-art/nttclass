// ================================================================
// DASHBOARD.JS — Trang "Tổng quan"
// ================================================================
Object.assign(PinkyClassApp.prototype, {
    renderDashboard() {
        // Set stats cards counts
        document.getElementById('stat-total-students').innerText = this.students.length;

        const monthSessions = this.filterByMonth(this.sessions);
        
        let totalSessions = 0;
        let totalHours = 0;
        let unpaidTuition = 0;

        if (this.currentRole === 'student') {
            // Only count for current student
            const studentSessions = monthSessions.filter(sess => sess.studentIds.includes(this.currentStudentId));
            totalSessions = studentSessions.length;
            totalHours = studentSessions.reduce((acc, curr) => acc + parseFloat(curr.duration), 0);
            
            // Sum unpaid tuition for this student (dựa trên trạng thái Paid
            // RIÊNG của chính học sinh này trong từng buổi, TÁCH BIỆT hoàn toàn
            // với trạng thái "đã dạy/chưa dạy" VÀ với trạng thái đóng tiền của
            // các bạn học chung buổi khác). Nếu chính học sinh này học phí 0đ
            // thì không bao giờ bị tính là "chưa đóng" (vì không có gì để đóng).
            studentSessions.forEach(sess => {
                const payingIds = this.getPayingStudentIds(sess);
                if (!payingIds.includes(this.currentStudentId)) return;
                const detail = sess.studentDetails && sess.studentDetails[this.currentStudentId];
                if (!detail || !detail.paid) {
                    // Price divided by number of PAYING participants if it's a shared session, or full price
                    const partCount = payingIds.length || 1;
                    unpaidTuition += sess.price / partCount;
                }
            });
        } else {
            // Teacher & Assistant see all stats
            totalSessions = monthSessions.length;
            totalHours = monthSessions.reduce((acc, curr) => acc + parseFloat(curr.duration), 0);

            // Cộng dồn phần học phí CHƯA đóng của TỪNG học sinh trong từng buổi
            // (dựa trên Paid riêng của mỗi em, không dùng Completed, không dùng
            // cờ tổng hợp cấp buổi) — để buổi học chung chỉ tính đúng phần của
            // (các) học sinh thực sự chưa đóng, không tính cả buổi. Học sinh
            // học phí 0đ được loại trừ hoàn toàn khỏi phép chia lẫn khỏi vòng
            // lặp tính "chưa đóng" (không đóng tiền thì không thể "nợ" học phí).
            monthSessions.forEach(sess => {
                const payingIds = this.getPayingStudentIds(sess);
                const partCount = payingIds.length || 1;
                const portion = sess.price / partCount;
                payingIds.forEach(sid => {
                    const detail = sess.studentDetails && sess.studentDetails[sid];
                    if (!detail || !detail.paid) {
                        unpaidTuition += portion;
                    }
                });
            });
        }

        document.getElementById('stat-total-sessions').innerText = totalSessions;
        document.getElementById('stat-total-hours').innerText = totalHours.toFixed(1) + 'h';
        document.getElementById('stat-unpaid-tuition').innerText = this.formatVND(unpaidTuition);

        // Render today + tomorrow classes (lối tắt: bấm vào 1 ca sẽ mở đúng
        // bảng "Nhập nhanh nội dung buổi học" giống hệt khi bấm ca đó bên
        // Lịch dạy, vì dùng chung đúng 1 hàm openSessionQuickEntry(sessionId)
        // — không có 2 bản logic tách rời dễ lệch nhau).
        const todayDate = new Date();
        const tomorrowDate = new Date();
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const todayStr = this.toISODateOnly(todayDate);
        const tomorrowStr = this.toISODateOnly(tomorrowDate);

        const todayLabelEl = document.getElementById('today-date-label');
        const tomorrowLabelEl = document.getElementById('tomorrow-date-label');
        if (todayLabelEl) todayLabelEl.innerText = this.formatDateVN(todayStr);
        if (tomorrowLabelEl) tomorrowLabelEl.innerText = this.formatDateVN(tomorrowStr);

        this.renderDashboardDaySessions('today-sessions-container', todayStr, 'hôm nay');
        this.renderDashboardDaySessions('tomorrow-sessions-container', tomorrowStr, 'ngày mai');
    },

    // Vẽ danh sách ca dạy của MỘT ngày cụ thể vào 1 container trên Tổng quan.
    // Tách riêng thành hàm dùng chung cho cả "hôm nay" và "ngày mai" để chắc
    // chắn 2 khối luôn cùng 1 logic lọc/hiển thị/click, tránh copy-paste lệch nhau.
    renderDashboardDaySessions(containerId, dateStr, dayLabel) {
        const container = document.getElementById(containerId);
        if (!container) return;

        let daySessions = this.sessions.filter(s => s.date === dateStr);

        // Học sinh chỉ nên thấy ca dạy có mặt mình trên Tổng quan (đồng nhất
        // với cách các thẻ thống kê phía trên đã lọc riêng cho học sinh).
        if (this.currentRole === 'student') {
            daySessions = daySessions.filter(s => s.studentIds.includes(this.currentStudentId));
        }

        // Sắp xếp theo giờ bắt đầu để hiển thị đúng thứ tự trong ngày.
        daySessions = daySessions.slice().sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

        container.innerHTML = '';

        if (daySessions.length === 0) {
            container.innerHTML = `
                <div style="padding: 15px; text-align: center; color: var(--text-muted); font-size: 13.5px;"> Không có ca dạy nào được xếp ${dayLabel} (${this.formatDateVN(dateStr)}).
                </div>
            `;
            return;
        }

        daySessions.forEach(sess => {
            const item = document.createElement('div');
            item.style.padding = '12px';
            item.style.background = 'white';
            item.style.border = '1px solid var(--border-color)';
            item.style.borderRadius = '10px';
            item.style.marginBottom = '8px';
            item.style.cursor = 'pointer';
            item.title = 'Bấm để nhập/xem nội dung buổi học';
            item.addEventListener('click', () => this.openSessionQuickEntry(sess.id));

            const names = sess.studentIds.map(id => this.getStudentName(id)).join(', ');
            const badgeClass = sess.type === 'riêng' ? 'badge-rieng' : 'badge-chung';

            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                    <span style="font-weight: 600; font-size: 13px; color: var(--primary);">${sess.startTime} - ${sess.endTime}</span>
                    <span class="badge ${badgeClass}" style="font-size: 10px; padding: 2px 8px;">Học ${sess.type}</span>
                </div>
                <div style="font-size:14px; font-weight:700; color:var(--text-main);">${sess.sessionName ? this.escapeHtml(sess.sessionName) + ' — ' : ''}${names}</div>
                <div style="font-size:12px; color:var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 4px;">
                    ${sess.content ? sess.content.replace(/\n/g, ' | ') : 'Chưa có nội dung'}
                </div>
            `;
            container.appendChild(item);
        });
    }

    // --- VIEW 2: STUDENT LOGS (Image 1 replica) ---
});
