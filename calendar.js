// ================================================================
// CALENDAR.JS — Trang "Lịch dạy & Chấm công": xem theo Ngày/Tuần/Tháng,
// kéo-thả đổi lịch/tạo lịch, ghi-sửa-xoá buổi học (kể cả lặp lịch),
// và lưới chọn học sinh dùng trong các form buổi học.
// Gộp từ 3 phần: hiển thị lịch, CRUD buổi học, chọn học sinh.
// ================================================================
// ================================================================
// CALENDAR.JS — Trang "Lịch dạy & Chấm công": xem theo Ngày/Tuần/Tháng,
// kéo-thả đổi lịch, và vài hàm escape HTML dùng chung.
// ================================================================
Object.assign(PinkyClassApp.prototype, {
    renderCalendarView() {
        const wrapperEl = document.getElementById('weekCalendarWrapper');
        const monthEl = document.getElementById('monthCalendarGrid');
        const titleEl = document.getElementById('calendarSectionTitle');

        if (this.calendarViewMode === 'month') {
            if (wrapperEl) wrapperEl.style.display = 'none';
            if (monthEl) monthEl.style.display = '';
            if (titleEl) titleEl.innerText = ' Lịch Dạy Theo Tháng';
            this.renderMonthCalendar();
        } else {
            if (wrapperEl) wrapperEl.style.display = '';
            if (monthEl) monthEl.style.display = 'none';
            if (titleEl) titleEl.innerText = this.calendarViewMode === 'day' ? ' Lịch Dạy Theo Ngày' : ' Lịch Dạy Theo Tuần';
            const days = this.calendarViewMode === 'day'
                ? [new Date(this.currentDayDate)]
                : this.getWeekDays(this.currentWeekStart);
            this.renderHourGridCalendar(days);
        }
        this.updateCalendarNavLabels();
    },

    // Trả về mảng 7 Date (Thứ 2 -> CN) của tuần bắt đầu từ weekStart.
    getWeekDays(weekStart) {
        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(weekStart);
            d.setDate(d.getDate() + i);
            days.push(d);
        }
        return days;
    },

    // Đổi nhãn 3 nút điều hướng (Trước/Hôm nay/Sau) cho khớp với kiểu xem đang chọn.
    updateCalendarNavLabels() {
        const prevBtn = document.getElementById('prevWeekBtn');
        const todayBtn = document.getElementById('todayWeekBtn');
        const nextBtn = document.getElementById('nextWeekBtn');
        if (!prevBtn || !todayBtn || !nextBtn) return;
        if (this.calendarViewMode === 'day') {
            prevBtn.innerText = 'Ngày trước'; todayBtn.innerText = 'Hôm nay'; nextBtn.innerText = 'Ngày sau';
        } else if (this.calendarViewMode === 'month') {
            prevBtn.innerText = 'Tháng trước'; todayBtn.innerText = 'Tháng này'; nextBtn.innerText = 'Tháng sau';
        } else {
            prevBtn.innerText = 'Tuần trước'; todayBtn.innerText = 'Tuần này'; nextBtn.innerText = 'Tuần sau';
        }
    },

    // Cập nhật 4 thẻ thống kê (Tổng buổi/Tổng giờ/Riêng-chung/Tổng tiền) theo
    // ĐÚNG danh sách buổi học đang được xem (ngày/tuần/tháng) — dùng chung cho
    // cả renderHourGridCalendar lẫn renderMonthCalendar để khỏi lặp code.
    updateCalendarSummaryStats(sessionsList) {
        const totalCount = sessionsList.length;
        const totalHrs = sessionsList.reduce((a, b) => a + parseFloat(b.duration || 0), 0);
        const privateCount = sessionsList.filter(s => s.type === 'riêng').length;
        const groupCount = sessionsList.filter(s => s.type === 'chung').length;
        let totalMoney = 0;
        sessionsList.forEach(s => {
            if (this.currentRole === 'student') {
                const payingIds = this.getPayingStudentIds(s);
                totalMoney += payingIds.includes(this.currentStudentId) ? (s.price / (payingIds.length || 1)) : 0;
            } else {
                totalMoney += s.price;
            }
        });
        const elSessions = document.getElementById('summary-total-sessions');
        const elHours = document.getElementById('summary-total-hours');
        const elRatio = document.getElementById('summary-ratio');
        const elMoney = document.getElementById('summary-total-money');
        if (elSessions) elSessions.innerText = totalCount;
        if (elHours) elHours.innerText = totalHrs.toFixed(1);
        if (elRatio) elRatio.innerText = `${privateCount}/${groupCount}`;
        if (elMoney) elMoney.innerText = this.formatVND(totalMoney);
    },

    // Vẽ lưới giờ dùng chung cho kiểu xem "Ngày" (days.length === 1) và "Tuần"
    // (days.length === 7) — cùng 1 công thức quy đổi px <-> giờ:phút, cùng 1
    // cách vẽ khối ca học, chỉ khác số cột hiển thị.
    renderHourGridCalendar(days) {
        const headerRow = document.getElementById('weekCalendarHeaderRow');
        const body = document.getElementById('weekCalendarBody');
        if (!headerRow || !body) return;

        const HOUR_START = this.CAL_HOUR_START;
        const HOUR_END = this.CAL_HOUR_END;
        const HOUR_HEIGHT = this.CAL_HOUR_HEIGHT;
        const numDays = days.length;
        // Nhãn thứ trong tuần lấy theo ĐÚNG ngày trong tháng (Date.getDay(): 0=CN)
        // thay vì theo vị trí trong vòng lặp — để chế độ "Ngày" hiển thị đúng
        // thứ dù xem bất kỳ ngày nào trong tuần, không chỉ riêng Thứ 2.
        const vnDayLabels = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

        const todayStr = this.toISODateOnly(new Date());

        // Nhãn khoảng đang xem
        const rangeLabel = document.getElementById('weekRangeLabel');
        if (rangeLabel) {
            const fmt = (d) => `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
            if (numDays === 1) {
                rangeLabel.innerText = `${vnDayLabels[days[0].getDay()]}, ${fmt(days[0])}/${days[0].getFullYear()}`;
            } else {
                const first = days[0], last = days[numDays - 1];
                rangeLabel.innerText = `${fmt(first)} - ${fmt(last)}/${last.getFullYear()}`;
            }
        }

        // Lọc buổi học nằm trong khoảng đang xem (bỏ qua bộ lọc Tháng toàn cục
        // vì lịch ngày/tuần đã tự xác định phạm vi thời gian riêng của nó)
        const viewDateStrs = days.map(d => this.toISODateOnly(d));
        let viewSessions = this.sessions.filter(s => viewDateStrs.includes(s.date));

        if (this.currentRole === 'student') {
            viewSessions = viewSessions.filter(s => s.studentIds.includes(this.currentStudentId));
        }

        this.updateCalendarSummaryStats(viewSessions);

        // ----- Header row: numDays cột ngày -----
        headerRow.style.gridTemplateColumns = `56px repeat(${numDays}, 1fr)`;
        headerRow.innerHTML = '<div style="grid-column:1;"></div>' + days.map((d, i) => {
            const isToday = this.toISODateOnly(d) === todayStr;
            return `
                <div class="week-day-header ${isToday ? 'is-today' : ''}" style="grid-column:${i + 2};">
                    <span class="day-name">${vnDayLabels[d.getDay()]}</span>
                    <span class="day-date">${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}</span>
                </div>
            `;
        }).join('');

        // ----- Body: nhãn giờ bên trái + đường kẻ ngang + numDays cột ngày -----
        // QUAN TRỌNG: nhãn giờ VÀ đường kẻ ngang được vẽ CÙNG 1 VÒNG LẶP, DÙNG
        // CHUNG 1 giá trị "top" duy nhất cho mỗi giờ — trước đây nhãn giờ định
        // vị bằng 1 công thức px (JS) còn đường kẻ vẽ bằng CSS background-image
        // repeating-gradient (công thức px KHÁC, tính riêng trong CSS) — 2 hệ
        // toạ độ tách rời như vậy rất dễ bị lệch nhau dù mỗi bên tưởng là đúng.
        // Nay cả nhãn lẫn đường kẻ đều lấy từ ĐÚNG 1 con số "top" nên không thể
        // lệch nhau được nữa.
        const hourCount = HOUR_END - HOUR_START;
        let hourLabelsHTML = '';
        let hourLinesHTML = '';
        for (let h = HOUR_START; h < HOUR_END; h++) {
            const top = (h - HOUR_START) * HOUR_HEIGHT;
            hourLabelsHTML += `<div class="week-hour-label" style="top:${top}px;">${h}:00</div>`;
            hourLinesHTML += `<div class="week-hour-line" style="top:${top}px;"></div>`;
        }

        let dayColumnsHTML = '';
        days.forEach((d, i) => {
            const dateStr = this.toISODateOnly(d);
            const daySessions = viewSessions.filter(s => s.date === dateStr);

            let blocksHTML = '';
            daySessions.forEach(sess => {
                const [sh, sm] = (sess.startTime || '00:00').split(':').map(Number);
                const [eh, em] = (sess.endTime || '00:00').split(':').map(Number);
                const startMin = Math.max(0, (sh - HOUR_START) * 60 + sm);
                let endMin = (eh - HOUR_START) * 60 + em;
                if (endMin <= startMin) endMin = startMin + 60; // fallback an toàn
                const top = (startMin / 60) * HOUR_HEIGHT;
                const height = Math.max(24, ((endMin - startMin) / 60) * HOUR_HEIGHT - 2);

                const names = sess.studentIds.map(id => this.getStudentName(id)).join(', ');
                const typeClass = sess.type === 'chung' ? 'type-chung' : 'type-rieng';
                const unpaidClass = !sess.paid ? 'is-unpaid' : '';
                const evtTitle = sess.sessionName ? sess.sessionName : names;
                const evtTooltip = sess.sessionName ? `${sess.sessionName} — ${names}` : names;

                // Buổi học đã diễn ra rồi (giờ bắt đầu đã ở quá khứ so với hiện
                // tại) thì KHÔNG cho kéo-thả đổi lịch nữa — chỉ xem/chấm công.
                const sessionStartDate = new Date(`${sess.date}T${sess.startTime || '00:00'}:00`);
                const isPast = sessionStartDate < new Date();
                const lockedClass = isPast ? 'is-locked' : '';

                blocksHTML += `
                    <div class="week-event-block ${typeClass} ${unpaidClass} ${lockedClass}"
                         style="top:${top}px; height:${height}px;"
                         data-session-id="${sess.id}"
                         data-locked="${isPast ? '1' : '0'}"
                         onclick="app.openSessionQuickEntry('${sess.id}')"
                         title="${this.escapeHtmlAttr(isPast ? evtTooltip + ' (đã qua, không thể kéo)' : evtTooltip)}">
                        <span class="evt-time">${sess.startTime}–${sess.endTime}</span>
                        <span class="evt-title">${this.escapeHtml(evtTitle)}</span>
                    </div>
                `;
            });

            dayColumnsHTML += `<div class="week-day-column" data-date="${dateStr}" style="height:${hourCount * HOUR_HEIGHT}px; grid-column:${i + 2}; grid-row:1 / -1;">${blocksHTML}</div>`;
        });

        // QUAN TRỌNG: gán grid-column CỐ ĐỊNH cho cả cột giờ (cột 1) và các cột
        // ngày (cột 2..) thay vì để CSS Grid tự động xếp (auto-placement).
        // Trước đây không khai báo grid-column cho các phần tử này, nên thứ tự
        // hiển thị phụ thuộc vào thuật toán auto-placement của trình duyệt và
        // có thể bị đảo/lệch (cột giờ bị đẩy sang phải thay vì bên trái).
        // Các đường kẻ ngang (hourLinesHTML) được đặt NGOÀI cột ngày, trải dài
        // hết chiều rộng thật (position:absolute, left/right:0 so với chính
        // .week-calendar-body) — vẽ 1 lần duy nhất, đảm bảo luôn khớp nhãn giờ.
        body.style.gridTemplateColumns = `56px repeat(${numDays}, 1fr)`;
        body.innerHTML = `<div class="week-hour-gutter" style="grid-column:1; grid-row:1 / -1;">${hourLabelsHTML}</div>`
            + `<div class="week-hour-lines" style="grid-column:1 / -1; grid-row:1 / -1;">${hourLinesHTML}</div>`
            + dayColumnsHTML;
    },

    // Vẽ lưới ô ngày kiểu tháng truyền thống (6 hàng x 7 cột, luôn đủ chỗ cho
    // mọi tháng kể cả tháng cần tràn sang tuần của tháng trước/sau). Mỗi ô
    // hiện tối đa 3 dòng ca học (giờ bắt đầu + tên/học sinh), dư ra thì gộp
    // thành "+N buổi khác". Bấm vào 1 ô ngày -> chuyển sang chế độ xem "Ngày"
    // của đúng ngày đó.
    renderMonthCalendar() {
        const container = document.getElementById('monthCalendarGrid');
        if (!container) return;

        const viewDate = this.currentMonthViewDate;
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth(); // 0-based

        const rangeLabel = document.getElementById('weekRangeLabel');
        if (rangeLabel) rangeLabel.innerText = `Tháng ${month + 1}/${year}`;

        const firstOfMonth = new Date(year, month, 1);
        // Ô đầu tiên của lưới = Thứ 2 của tuần chứa ngày 1 trong tháng, để mỗi
        // hàng luôn bắt đầu từ Thứ 2 và kết thúc ở Chủ nhật.
        const firstWeekday = (firstOfMonth.getDay() + 6) % 7; // 0 = Thứ 2 ... 6 = CN
        const gridStart = new Date(firstOfMonth);
        gridStart.setDate(gridStart.getDate() - firstWeekday);

        const totalCells = 42; // 6 tuần x 7 ngày — luôn đủ ô cho mọi tháng
        const todayStr = this.toISODateOnly(new Date());

        let monthSessions = this.sessions;
        if (this.currentRole === 'student') {
            monthSessions = monthSessions.filter(s => s.studentIds.includes(this.currentStudentId));
        }

        // Gom buổi học theo ngày để tra cứu nhanh khi vẽ từng ô
        const sessionsByDate = {};
        monthSessions.forEach(s => {
            if (!sessionsByDate[s.date]) sessionsByDate[s.date] = [];
            sessionsByDate[s.date].push(s);
        });

        const dayLabels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
        const headerHTML = dayLabels.map(l => `<div class="month-weekday-label">${l}</div>`).join('');

        let cellsHTML = '';
        const sessionsInMonth = []; // để tính thống kê tổng theo tháng bên dưới
        for (let i = 0; i < totalCells; i++) {
            const d = new Date(gridStart);
            d.setDate(d.getDate() + i);
            const dateStr = this.toISODateOnly(d);
            const isCurrentMonth = d.getMonth() === month;
            const isToday = dateStr === todayStr;
            const daySessions = (sessionsByDate[dateStr] || []).slice().sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
            if (isCurrentMonth) sessionsInMonth.push(...daySessions);

            const maxShow = 3;
            let sessionsHTML = '';
            daySessions.slice(0, maxShow).forEach(sess => {
                const typeClass = sess.type === 'chung' ? 'type-chung' : 'type-rieng';
                const names = sess.studentIds.map(id => this.getStudentName(id)).join(', ');
                const title = sess.sessionName ? sess.sessionName : names;
                sessionsHTML += `<div class="month-day-event ${typeClass}" title="${this.escapeHtmlAttr(`${sess.startTime}-${sess.endTime} ${title}`)}">${sess.startTime} ${this.escapeHtml(title)}</div>`;
            });
            if (daySessions.length > maxShow) {
                sessionsHTML += `<div class="month-day-more">+${daySessions.length - maxShow} buổi khác</div>`;
            }
            const countBadge = daySessions.length > 0
                ? `<div class="month-day-count-badge">${daySessions.length} buổi</div>`
                : '';

            cellsHTML += `
                <div class="month-day-cell ${isCurrentMonth ? '' : 'is-outside-month'} ${isToday ? 'is-today' : ''}" data-date="${dateStr}">
                    <div class="month-day-number">${d.getDate()}</div>
                    <div class="month-day-events">${sessionsHTML}</div>
                    ${countBadge}
                </div>
            `;
        }

        container.innerHTML = `<div class="month-weekday-row">${headerHTML}</div><div class="month-days-grid">${cellsHTML}</div>`;

        container.querySelectorAll('.month-day-cell').forEach(cell => {
            cell.addEventListener('click', () => {
                const dateStr = cell.dataset.date;
                this.currentDayDate = new Date(`${dateStr}T00:00:00`);
                this.calendarViewMode = 'day';
                document.querySelectorAll('.cal-view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === 'day'));
                this.renderCalendarView();
            });
        });

        this.updateCalendarSummaryStats(sessionsInMonth);
    },

    // Mở bảng nhập nhanh khi click vào 1 ca dạy trên lịch tuần. Nếu ca đó có
    // nhiều học sinh (học chung), hiện MỘT THẺ RIÊNG cho từng em để chấm/nhận
    // xét độc lập — không gộp chung nội dung của các em lại với nhau.
    // ===== KÉO-THẢ ĐỔI LỊCH TRÊN LỊCH TUẦN =====
    // Giữ chuột (hoặc giữ tay trên điện thoại) vào 1 buổi học rồi kéo sang
    // cột ngày khác / vị trí giờ khác để đổi lịch — vẫn giữ nguyên số giờ học
    // (thời lượng) ban đầu. Quy tắc:
    //   - Buổi học ĐÃ QUA (giờ bắt đầu đã ở quá khứ) không kéo được.
    //   - Giờ bắt đầu mới luôn được làm tròn về mốc 30 phút gần nhất.
    //   - Nếu khung giờ mới bị TRÙNG với 1 buổi học khác -> chặn lại, báo lỗi,
    //     buổi học tự trả về đúng vị trí cũ.
    //   - Thả xong là lưu luôn, không hỏi xác nhận lại.
    // Dùng Pointer Events (không dùng HTML5 Drag&Drop API) để hoạt động giống
    // nhau trên cả chuột lẫn cảm ứng, và để tự tính toán/snap vị trí theo ý mình.
    initCalendarDragToReschedule() {
        const body = document.getElementById('weekCalendarBody');
        if (!body) return;

        const DRAG_THRESHOLD = 6; // px di chuyển tối thiểu mới coi là "đang kéo" (để không phá vỡ click mở chi tiết)
        const SNAP_MINUTES = 30;

        body.addEventListener('pointerdown', (e) => {
            const block = e.target.closest('.week-event-block');
            if (!block) return;
            if (block.dataset.locked === '1') return; // buổi đã qua -> không cho kéo

            const column = block.closest('.week-day-column');
            if (!column) return;

            const blockRect = block.getBoundingClientRect();
            this.calDrag = {
                pointerId: e.pointerId,
                sessionId: block.dataset.sessionId,
                block,
                originalColumn: column,
                originalTop: parseFloat(block.style.top) || 0,
                grabOffsetY: e.clientY - blockRect.top, // điểm đang giữ nằm cách mép trên khối bao nhiêu px
                blockHeightPx: blockRect.height,
                startClientX: e.clientX,
                startClientY: e.clientY,
                isDragging: false
            };
        });

        document.addEventListener('pointermove', (e) => {
            const drag = this.calDrag;
            if (!drag || e.pointerId !== drag.pointerId) return;

            const movedX = Math.abs(e.clientX - drag.startClientX);
            const movedY = Math.abs(e.clientY - drag.startClientY);
            if (!drag.isDragging) {
                if (movedX < DRAG_THRESHOLD && movedY < DRAG_THRESHOLD) return;
                // Bắt đầu kéo thật sự
                drag.isDragging = true;
                drag.block.classList.add('is-dragging');
                drag.block.setPointerCapture && drag.block.setPointerCapture(drag.pointerId);
            }

            // Xác định cột ngày đang ở dưới con trỏ (so khoảng cách trái/phải của
            // mỗi cột với vị trí X hiện tại của con trỏ)
            const columns = Array.from(body.querySelectorAll('.week-day-column'));
            let targetColumn = drag.originalColumn;
            for (const col of columns) {
                const rect = col.getBoundingClientRect();
                if (e.clientX >= rect.left && e.clientX < rect.right) {
                    targetColumn = col;
                    break;
                }
            }
            if (targetColumn !== drag.block.parentElement) {
                targetColumn.appendChild(drag.block);
            }

            // Tính vị trí top mới theo con trỏ, snap về mốc 30 phút
            const colRect = targetColumn.getBoundingClientRect();
            let newTopPx = e.clientY - colRect.top - drag.grabOffsetY;
            const totalMinutes = (this.CAL_HOUR_END - this.CAL_HOUR_START) * 60;
            const pxPerMinute = this.CAL_HOUR_HEIGHT / 60;
            let minutesFromStart = newTopPx / pxPerMinute;
            minutesFromStart = Math.round(minutesFromStart / SNAP_MINUTES) * SNAP_MINUTES;
            // Không cho kéo vượt ra ngoài khung giờ hiển thị 06:00 - 22:00
            const durationMinutes = Math.round((drag.blockHeightPx + 2) / pxPerMinute / SNAP_MINUTES) * SNAP_MINUTES || SNAP_MINUTES;
            minutesFromStart = Math.max(0, Math.min(minutesFromStart, totalMinutes - durationMinutes));
            newTopPx = minutesFromStart * pxPerMinute;

            drag.block.style.top = `${newTopPx}px`;
            drag.pendingDate = targetColumn.dataset.date;
            drag.pendingMinutesFromStart = minutesFromStart;
        });

        const endDrag = (e) => {
            const drag = this.calDrag;
            if (!drag || e.pointerId !== drag.pointerId) return;
            this.calDrag = null;
            drag.block.classList.remove('is-dragging');

            if (!drag.isDragging) return; // chỉ là 1 cú click bình thường, không kéo gì cả

            const sess = this.sessions.find(s => s.id === drag.sessionId);
            if (!sess || drag.pendingDate == null) {
                this.renderCalendarView();
                return;
            }

            const toHHMM = (mins) => {
                const h = this.CAL_HOUR_START + Math.floor(mins / 60);
                const m = mins % 60;
                return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
            };
            const [oh, om] = (sess.startTime || '00:00').split(':').map(Number);
            const [eh, em] = (sess.endTime || '00:00').split(':').map(Number);
            const durationMin = Math.max(SNAP_MINUTES, (eh * 60 + em) - (oh * 60 + om));

            const newDate = drag.pendingDate;
            const newStartTime = toHHMM(drag.pendingMinutesFromStart);
            const newEndTime = toHHMM(drag.pendingMinutesFromStart + durationMin);

            // Không đổi gì cả -> khỏi cần lưu
            if (newDate === sess.date && newStartTime === sess.startTime && newEndTime === sess.endTime) {
                this.renderCalendarView();
                return;
            }

            // Trùng lịch với buổi khác -> chặn lại, trả buổi học về đúng vị trí cũ
            const overlap = this.findOverlappingSession(newDate, newStartTime, newEndTime, sess.id);
            if (overlap) {
                this.showToast(
                    `Khung giờ ${newStartTime}-${newEndTime} ngày ${this.formatDateVN(newDate)} đang trùng với buổi học khác, không thể đặt vào đây!`,
                    "error"
                );
                this.renderCalendarView();
                return;
            }

            this.moveSessionByDrag(sess.id, newDate, newStartTime, newEndTime);
        };
        document.addEventListener('pointerup', endDrag);
        document.addEventListener('pointercancel', endDrag);
    },

    // Lưu lịch mới (ngày + giờ bắt đầu/kết thúc) sau khi kéo-thả 1 buổi học
    // trên Lịch tuần — cùng cơ chế lưu server/offline như handleEditSession.
    async moveSessionByDrag(sessionId, newDate, newStartTime, newEndTime) {
        const sess = this.sessions.find(s => s.id === sessionId);
        if (!sess) return;

        const updatedSession = { ...sess, date: newDate, startTime: newStartTime, endTime: newEndTime };
        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/sessions/${sessionId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedSession)
            });
            if (!res.ok) throw new Error("Server error");
            await this.loadData();
        } catch (err) {
            console.warn("API lỗi, lưu offline: ", err.message);
            sess.date = newDate;
            sess.startTime = newStartTime;
            sess.endTime = newEndTime;
            await this.saveData();
        }
        this.showToast("Đã cập nhật lịch học!", "success");
    },

    openSessionQuickEntry(sessionId) {
        const sess = this.sessions.find(s => s.id === sessionId);
        if (!sess) return;

        document.getElementById('quickEntrySessionId').value = sess.id;
        document.getElementById('quickEntryTimeMeta').innerText = `${sess.startTime} - ${sess.endTime} (${sess.duration} giờ) — Học ${sess.type}`;
        document.getElementById('quickEntryDateMeta').innerText = this.formatDateVN(sess.date);
        document.getElementById('quickEntrySessionName').value = sess.sessionName || '';
        const isDone = this.isSessionCompleted(sess);
        const statusHint = document.getElementById('quickEntryStatusHint');
        if (statusHint) {
            statusHint.innerText = isDone ? '✓ Đã dạy (tự động theo lịch)' : '⏳ Sắp tới — chưa đến giờ dạy';
            statusHint.style.background = isDone ? 'var(--hw-done-bg, #dcfce7)' : 'var(--primary-soft)';
            statusHint.style.color = isDone ? 'var(--hw-done-text, #16a34a)' : 'var(--primary)';
        }
        document.getElementById('quickEntryContent').value = sess.content || '';

        // Sinh 1 thẻ nhập liệu RIÊNG cho từng học sinh trong ca, dữ liệu khởi
        // tạo lấy từ studentDetails hiện có của đúng em đó (nếu có).
        const listWrap = document.getElementById('quickEntryStudentsList');
        listWrap.innerHTML = sess.studentIds.map(stId => {
            const detail = sess.studentDetails[stId] || { homework: '0%', attitude: '', individualComment: '', note: '' };
            const name = this.getStudentName(stId);
            const homeworkVal = this.normalizeHomeworkValue(detail.homework);
            const attitude = detail.attitude === 'Tốt' ? '' : (detail.attitude || '');
            const homeworkOptionsHTML = this.getHomeworkLevels().map(level =>
                `<option value="${level}" ${homeworkVal === level ? 'selected' : ''}>${level}</option>`
            ).join('');
            return `
                <div class="qe-student-card" data-student-id="${stId}">
                    <div class="qe-student-name">${this.escapeHtml(name)}</div>
                    <div class="qe-field-grid">
                        <div>
                            <label>Bài tập về nhà (BTVN) — mức hoàn thành</label>
                            <select class="qe-homework">
                                ${homeworkOptionsHTML}
                            </select>
                        </div>
                        <div>
                            <label>Ý thức học tập</label>
                            <input type="text" class="qe-attitude" placeholder="Nhập tự do..." value="${this.escapeHtmlAttr(attitude)}">
                        </div>
                        <div class="full-span">
                            <label>Nhận xét riêng cho ${this.escapeHtml(name)}</label>
                            <textarea class="qe-comment" rows="2" placeholder="Nhận xét riêng...">${detail.individualComment || ''}</textarea>
                        </div>
                        <div class="full-span">
                            <label>Ghi chú (Minitest,...)</label>
                            <input type="text" class="qe-note" placeholder="Ghi chú thêm..." value="${this.escapeHtmlAttr(detail.note || '')}">
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        this.openModal('quickSessionEntryModal');
    },

    // Escape giá trị chèn vào thuộc tính value="" để tránh vỡ HTML khi nội
    // dung có chứa dấu ngoặc kép
    escapeHtmlAttr(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    },

    // Escape đầy đủ khi chèn text thuần vào NỘI DUNG thẻ HTML (khác với
    // escapeHtmlAttr chỉ dùng cho value="..."), tránh vỡ layout hoặc lộ HTML
    // injection nếu giáo viên gõ dấu < > trong nội dung buổi học.
    escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // Thêm 1 bong bóng chat vào khung Trợ lý AI, trả về element vừa tạo (để
    // có thể sửa nội dung sau, ví dụ thay bong bóng "Đang trả lời..." bằng
    // câu trả lời thật khi API phản hồi xong).
});

// ================================================================
// SESSIONS.JS — Ghi buổi học mới (kể cả lặp lại), sửa/xoá buổi học,
// kéo-thả tạo buổi học mới trên lịch, cập nhật nhật ký & học phí buổi học.
// ================================================================
Object.assign(PinkyClassApp.prototype, {
    async saveQuickSessionEntry() {
        const id = document.getElementById('quickEntrySessionId').value;
        const sess = this.sessions.find(s => s.id === id);
        if (!sess) return;

        const content = document.getElementById('quickEntryContent').value.trim();
        const sessionName = document.getElementById('quickEntrySessionName').value.trim();
        const completed = this.isSessionCompleted(sess);

        const newStudentDetails = {};
        document.querySelectorAll('#quickEntryStudentsList .qe-student-card').forEach(card => {
            const stId = card.getAttribute('data-student-id');
            const homework = card.querySelector('.qe-homework').value.trim() || '0%';
            const attitude = card.querySelector('.qe-attitude').value.trim() || 'Tốt';
            const individualComment = card.querySelector('.qe-comment').value.trim();
            const note = card.querySelector('.qe-note').value.trim();
            newStudentDetails[stId] = { homework, attitude, individualComment, note };
        });

        // Đã bỏ ô "Nhận xét chung cho cả lớp" khỏi form nhập nhanh (chỉ còn
        // nhận xét RIÊNG cho từng học sinh). Với buổi học riêng (1 học sinh),
        // generalComment vẫn mirror theo nhận xét riêng của em đó để tương
        // thích với những chỗ khác trong hệ thống còn đọc field này (VD xuất
        // CSV) — với buổi học chung, giữ nguyên giá trị generalComment cũ
        // (không có nơi nào chỉnh sửa nó nữa qua form nhập nhanh).
        let finalGeneralComment = sess.generalComment || '';
        if (sess.type !== 'chung') {
            const onlyStudentId = sess.studentIds[0];
            finalGeneralComment = (newStudentDetails[onlyStudentId] && newStudentDetails[onlyStudentId].individualComment) || '';
        }

        const updatedSession = {
            ...sess,
            content,
            sessionName,
            generalComment: finalGeneralComment,
            completed,
            studentDetails: newStudentDetails
        };

        this.setBtnLoading('saveQuickEntryBtn', true, 'Đang lưu...');
        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/sessions/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedSession)
            });
            if (!res.ok) throw new Error("Server error");
            await this.loadData();
        } catch (err) {
            console.warn("API lỗi, lưu offline: ", err.message);
            sess.content = content;
            sess.sessionName = sessionName;
            sess.generalComment = finalGeneralComment;
            sess.completed = completed;
            sess.studentDetails = newStudentDetails;
            await this.saveData();
        } finally {
            this.setBtnLoading('saveQuickEntryBtn', false);
        }

        this.closeModal('quickSessionEntryModal');
        this.updateAllViews();
        this.showToast("Đã lưu nhận xét riêng cho từng học sinh và đồng bộ sang Nhật ký học tập!", "success");
    },


    // --- VIEW 4: TUITION & PAYMENTS OVERVIEW ---
    handleAddRepeatDate() {
        const mainDate = document.getElementById('sessionDate').value;
        const extraInput = document.getElementById('repeatExtraDateInput');
        const extraDate = extraInput.value;

        if (!mainDate) {
            this.showToast('Vui lòng chọn "Ngày học" chính trước khi thêm ngày lặp lại.', 'error');
            return;
        }
        if (!extraDate) {
            this.showToast('Vui lòng chọn 1 ngày để thêm vào danh sách lặp lại.', 'error');
            return;
        }
        const [mainYear, mainMonth] = mainDate.split('-');
        const [extraYear, extraMonth] = extraDate.split('-');
        if (extraYear !== mainYear || extraMonth !== mainMonth) {
            this.showToast('Chỉ được chọn ngày lặp lại trong CÙNG THÁNG với "Ngày học" chính.', 'error');
            return;
        }
        if (extraDate === mainDate) {
            this.showToast('Ngày này trùng với "Ngày học" chính rồi, không cần thêm nữa.', 'error');
            return;
        }
        if (this.repeatExtraDates.includes(extraDate)) {
            this.showToast('Ngày này đã có trong danh sách lặp lại rồi.', 'error');
            return;
        }

        this.repeatExtraDates.push(extraDate);
        this.repeatExtraDates.sort();
        this.renderRepeatDatesChips();
        extraInput.value = '';
    },

    renderRepeatDatesChips() {
        const list = document.getElementById('repeatDatesList');
        if (!list) return;
        list.innerHTML = '';
        this.repeatExtraDates.forEach(dateStr => {
            const chip = document.createElement('span');
            chip.className = 'repeat-date-chip';
            const label = document.createElement('span');
            label.innerText = this.formatDateVN(dateStr);
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.setAttribute('aria-label', 'Xoá ngày lặp lại này');
            removeBtn.innerText = '✕';
            removeBtn.addEventListener('click', () => {
                this.repeatExtraDates = this.repeatExtraDates.filter(d => d !== dateStr);
                this.renderRepeatDatesChips();
            });
            chip.appendChild(label);
            chip.appendChild(removeBtn);
            list.appendChild(chip);
        });
    },

    // Sau khi buổi học CHÍNH đã lưu thành công, tạo thêm 1 buổi học giống hệt
    // cho mỗi ngày trong danh sách lặp lại thủ công. Ngày nào bị trùng lịch
    // với 1 buổi học khác thì bỏ qua (không chặn các ngày còn lại), rồi báo
    // cáo tổng kết cho giáo viên biết đã tạo được bao nhiêu / bỏ qua bao nhiêu.
    async createRepeatedSessions(baseSession, extraDates) {
        let createdCount = 0;
        const skippedDates = [];

        for (const extraDate of extraDates) {
            const overlap = this.findOverlappingSession(extraDate, baseSession.startTime, baseSession.endTime);
            if (overlap) {
                skippedDates.push(extraDate);
                continue;
            }

            const clonedStudentDetails = {};
            Object.keys(baseSession.studentDetails || {}).forEach(stId => {
                clonedStudentDetails[stId] = { homework: "0%", attitude: "Tốt", individualComment: "", note: "" };
            });

            const repeatedSession = {
                ...baseSession,
                id: "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
                date: extraDate,
                completed: this.isSessionCompleted({ date: extraDate, endTime: baseSession.endTime }),
                paid: false,
                studentDetails: clonedStudentDetails
            };

            try {
                const res = await this.authFetch(`${API_BASE_URL}/api/sessions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(repeatedSession)
                });
                if (!res.ok) throw new Error("Server error");
                createdCount++;
            } catch (err) {
                console.warn("API lỗi khi tạo buổi lặp lại, lưu offline: ", err.message);
                this.sessions.push(repeatedSession);
                await this.saveData();
                createdCount++;
            }
        }

        await this.loadData();

        if (createdCount > 0) {
            this.showToast(`Đã tự động tạo thêm ${createdCount} buổi học lặp lại trong tháng.`, "success");
        }
        if (skippedDates.length > 0) {
            const listStr = skippedDates.map(d => this.formatDateVN(d)).join(', ');
            this.showToast(`Bỏ qua ${skippedDates.length} ngày bị trùng lịch với buổi học khác: ${listStr}`, "error");
        }
    },

    // ----- Kéo-CHỌN 1 khung giờ TRỐNG trên Lịch tuần để tạo ca học mới -----
    // Giữ chuột/tay vào 1 chỗ TRỐNG trên cột ngày rồi kéo từ giờ này đến giờ
    // kia -> nhả ra sẽ MỞ MODAL "Ghi Buổi Học Mới" (không cuộn/nhảy trang),
    // điền sẵn đúng ngày + khung giờ vừa kéo. Nếu chỉ bấm 1 cái (không kéo)
    // vào chỗ trống thì KHÔNG làm gì cả — tránh việc lỡ tay bấm nhầm cũng bị
    // "nhảy" màn hình như trước đây. Dùng chung hằng số quy đổi px <-> giờ:phút
    // với initCalendarDragToReschedule để không lệch nhau.
    initCalendarDragToCreate() {
        const body = document.getElementById('weekCalendarBody');
        if (!body) return;

        const DRAG_THRESHOLD = 6;
        const SNAP_MINUTES = 30;

        body.addEventListener('pointerdown', (e) => {
            // Học sinh chỉ được XEM lịch, không có quyền tạo buổi học mới.
            if (this.currentRole === 'student') return;
            // Bấm trúng 1 ca học đã có -> để nguyên cho initCalendarDragToReschedule xử lý
            if (e.target.closest('.week-event-block')) return;
            const column = e.target.closest('.week-day-column');
            if (!column) return;

            const rect = column.getBoundingClientRect();
            const startTop = Math.max(0, Math.min(e.clientY - rect.top, rect.height));

            this.calCreateDrag = {
                pointerId: e.pointerId,
                column,
                startTop,
                currentTop: startTop,
                preview: null,
                startClientX: e.clientX,
                startClientY: e.clientY,
                isDragging: false
            };
        });

        document.addEventListener('pointermove', (e) => {
            const drag = this.calCreateDrag;
            if (!drag || e.pointerId !== drag.pointerId) return;

            const movedX = Math.abs(e.clientX - drag.startClientX);
            const movedY = Math.abs(e.clientY - drag.startClientY);
            if (!drag.isDragging) {
                if (movedX < DRAG_THRESHOLD && movedY < DRAG_THRESHOLD) return;
                drag.isDragging = true;
                const preview = document.createElement('div');
                preview.className = 'week-create-preview';
                drag.column.appendChild(preview);
                drag.preview = preview;
                drag.column.setPointerCapture && drag.column.setPointerCapture(drag.pointerId);
            }

            const rect = drag.column.getBoundingClientRect();
            const currentTop = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
            drag.currentTop = currentTop;

            const top = Math.min(drag.startTop, currentTop);
            const height = Math.max(4, Math.abs(currentTop - drag.startTop));
            drag.preview.style.top = `${top}px`;
            drag.preview.style.height = `${height}px`;
        });

        const endDrag = (e) => {
            const drag = this.calCreateDrag;
            if (!drag || e.pointerId !== drag.pointerId) return;
            this.calCreateDrag = null;
            if (drag.preview) drag.preview.remove();

            // Chỉ bấm 1 cái, KHÔNG kéo -> coi như bấm nhầm vào chỗ trống trên
            // lịch, không mở form/modal gì cả (trước đây tự tạo khối 1 tiếng
            // rồi cuộn/nhảy lên form ở đầu trang, gây khó chịu).
            if (!drag.isDragging) return;

            const HOUR_START = this.CAL_HOUR_START;
            const HOUR_HEIGHT = this.CAL_HOUR_HEIGHT;
            const pxPerMinute = HOUR_HEIGHT / 60;
            const snap = (px) => Math.round((px / pxPerMinute) / SNAP_MINUTES) * SNAP_MINUTES;

            let startMin = snap(Math.min(drag.startTop, drag.currentTop));
            let endMin = snap(Math.max(drag.startTop, drag.currentTop));
            if (endMin - startMin < SNAP_MINUTES) endMin = startMin + SNAP_MINUTES;

            const totalMinutes = (this.CAL_HOUR_END - HOUR_START) * 60;
            startMin = Math.max(0, Math.min(startMin, totalMinutes - SNAP_MINUTES));
            endMin = Math.max(startMin + SNAP_MINUTES, Math.min(endMin, totalMinutes));

            const toHHMM = (mins) => {
                const h = HOUR_START + Math.floor(mins / 60);
                const m = mins % 60;
                return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
            };

            this.openCreateSessionQuickForm(drag.column.dataset.date, toHHMM(startMin), toHHMM(endMin));
        };
        document.addEventListener('pointerup', endDrag);
        document.addEventListener('pointercancel', endDrag);
    },

    // Mở modal "Ghi Buổi Học Mới" ở TRẠNG THÁI SẠCH (reset toàn bộ), dùng cho
    // nút "+ Ghi buổi học mới" bấm thủ công (không xuất phát từ kéo-chọn trên
    // lịch) — mặc định điền sẵn ngày hôm nay.
    openCreateSessionModal() {
        this.resetSessionLoggerForm();
        this.openModal('createSessionModal');
        const searchInput = document.getElementById('studentsCheckboxSearch');
        if (searchInput) setTimeout(() => searchInput.focus(), 200);
    },

    // Điền sẵn ngày + khung giờ vừa kéo-chọn trên lịch tuần vào form "Ghi Buổi
    // Học Mới", rồi MỞ MODAL ngay tại chỗ (không cuộn/nhảy trang như trước).
    openCreateSessionQuickForm(dateStr, startTime, endTime) {
        document.getElementById('sessionDate').value = dateStr;
        document.getElementById('sessionStartTime').value = startTime;
        document.getElementById('sessionEndTime').value = endTime;
        // Kích hoạt lại đúng handler tính "Số giờ học" tự động đã gắn sẵn trên input giờ kết thúc
        document.getElementById('sessionEndTime').dispatchEvent(new Event('change'));

        this.openModal('createSessionModal');

        const searchInput = document.getElementById('studentsCheckboxSearch');
        if (searchInput) setTimeout(() => searchInput.focus(), 300);
    },

    async handleLogSession() {
        const type = document.getElementById('sessionType').value;
        const sessionName = document.getElementById('sessionName').value.trim();
        const date = document.getElementById('sessionDate').value;
        const startTime = document.getElementById('sessionStartTime').value;
        const endTime = document.getElementById('sessionEndTime').value;
        const duration = parseFloat(document.getElementById('sessionHours').value) || 2.0;
        const unitPrice = this.parsePriceValue(document.getElementById('sessionPrice').value);
        const content = document.getElementById('sessionContent').value.trim();

        if (!date || !startTime || !endTime) {
            this.showToast("Vui lòng nhập đầy đủ ngày học và giờ học!", "error");
            return;
        }

        // Giờ kết thúc phải sau giờ bắt đầu — trước đây không kiểm tra, có thể
        // tạo buổi học với giờ kết thúc trước giờ bắt đầu, làm sai hiển thị
        // trên lịch tuần và sai số giờ tích lũy trên phiếu học phí.
        if (endTime <= startTime) {
            this.showToast("Giờ kết thúc phải sau giờ bắt đầu!", "error");
            return;
        }

        if (isNaN(unitPrice) || unitPrice < 0) {
            this.showToast("Đơn giá học phí không được là số âm!", "error");
            return;
        }

        // Get selected students
        const checkedBoxes = document.querySelectorAll('input[name="sessionStudents"]:checked');
        if (checkedBoxes.length === 0) {
            this.showToast("Vui lòng chọn ít nhất một học sinh tham gia!", "error");
            return;
        }
        if (type === 'riêng' && checkedBoxes.length > 1) {
            this.showToast("Học riêng (1 vs 1) chỉ được chọn đúng 1 học sinh!", "error");
            return;
        }

        // Cảnh báo trùng lịch: cùng ngày, khung giờ giao nhau với 1 buổi học
        // khác đã có — trước đây không kiểm tra nên rất dễ vô tình xếp 2 ca
        // chồng giờ nhau mà không hay biết cho tới khi mở lại lịch tuần.
        const overlap = this.findOverlappingSession(date, startTime, endTime);
        if (overlap) {
            const proceed = confirm(
                `Khung giờ ${startTime}-${endTime} ngày ${this.formatDateVN(date)} đang TRÙNG với 1 buổi học khác ` +
                `(${overlap.startTime}-${overlap.endTime}${overlap.sessionName ? ' — ' + overlap.sessionName : ''}).\n\n` +
                `Bạn có chắc chắn vẫn muốn tạo buổi học này không?`
            );
            if (!proceed) return;
        }

        const studentIds = [];
        checkedBoxes.forEach(cb => studentIds.push(cb.value));

        // Học chung: tổng thu = đơn giá/học sinh x SỐ HỌC SINH CÓ ĐÓNG HỌC PHÍ
        // (loại trừ học sinh học phí cơ bản = 0đ khỏi phép nhân). Học riêng:
        // giữ nguyên đơn giá đã nhập (đã tự = 0 nếu học sinh đó học phí 0đ).
        const payingCount = studentIds.filter(stId => {
            const student = this.students.find(s => s.id === stId);
            return student && Number(student.basePrice) > 0;
        }).length;
        const price = type === 'chung' ? unitPrice * payingCount : unitPrice;

        // Create studentDetails map
        const studentDetails = {};
        studentIds.forEach(stId => {
            studentDetails[stId] = {
                homework: "0%",
                attitude: "Tốt",
                individualComment: "",
                note: ""
            };
        });

        const newSession = {
            // ID sinh từ Date.now() có thể trùng nếu 2 request được gửi trong
            // cùng 1 mili-giây (double-click, mạng lag khiến bấm gửi 2 lần) —
            // thêm hậu tố ngẫu nhiên để đảm bảo luôn duy nhất.
            id: "sess_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
            date,
            startTime,
            endTime,
            type,
            sessionName,
            studentIds,
            duration,
            price,
            content,
            generalComment: content ? `Cả lớp học: ${content.split('\n')[0]}` : "",
            completed: this.isSessionCompleted({ date, endTime }), // Tự động theo lịch, không cần chấm công thủ công
            paid: false,     // QUAN TRỌNG: học phí LUÔN mặc định "chưa thanh toán" khi mới lên lịch
            studentDetails
        };

        this.setBtnLoading('saveSessionBtn', true, 'Đang lưu...');
        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/sessions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSession)
            });
            if (!res.ok) throw new Error("Server error");
            await this.loadData();
        } catch (err) {
            console.warn("API lỗi, lưu offline: ", err.message);
            this.sessions.push(newSession);
            await this.saveData();
        } finally {
            this.setBtnLoading('saveSessionBtn', false);
        }

        // Nếu giáo viên có bật "Lặp lại buổi học" và đã thêm ít nhất 1 ngày,
        // tự động tạo thêm các buổi học giống hệt cho từng ngày đó.
        const repeatToggleEl = document.getElementById('sessionRepeatToggle');
        if (repeatToggleEl && repeatToggleEl.checked && this.repeatExtraDates.length > 0) {
            await this.createRepeatedSessions(newSession, this.repeatExtraDates);
        }

        // Reset form
        this.resetSessionLoggerForm();

        this.closeModal('createSessionModal');
        this.showToast("Đã ghi nhận buổi học mới thành công!", "success");
    },

    // Đưa form "Ghi Buổi Học Mới" về trạng thái mặc định ban đầu (ngày = hôm
    // nay, giá tiền mặc định, bỏ chọn học sinh, xoá danh sách ngày lặp lại...).
    // Dùng chung sau khi lưu thành công VÀ khi mở modal thủ công bằng nút
    // "+ Ghi buổi học mới" để luôn bắt đầu từ 1 form sạch.
    resetSessionLoggerForm() {
        document.getElementById('sessionLoggerForm').reset();
        delete document.getElementById('sessionPrice').dataset.userEdited;
        const today = this.toISODateOnly(new Date());
        document.getElementById('sessionDate').value = today;
        this.renderStudentSelectionGrid('studentsCheckboxGrid');

        // Reset trạng thái "Lặp lại buổi học"
        this.repeatExtraDates = [];
        this.renderRepeatDatesChips();
        const repeatToggleEl = document.getElementById('sessionRepeatToggle');
        if (repeatToggleEl) repeatToggleEl.checked = false;
        const repeatPanelEl = document.getElementById('repeatDatesPanel');
        if (repeatPanelEl) repeatPanelEl.style.display = 'none';
    },

    // 3. Edit Session Modal triggers
    openEditSessionModal(sessionId) {
        const sess = this.sessions.find(x => x.id === sessionId);
        if (!sess) return;

        document.getElementById('editSessionId').value = sess.id;
        document.getElementById('editSessionType').value = sess.type;
        document.getElementById('editSessionName').value = sess.sessionName || '';
        document.getElementById('editSessionDate').value = sess.date;
        document.getElementById('editSessionStartTime').value = sess.startTime;
        document.getElementById('editSessionEndTime').value = sess.endTime;
        document.getElementById('editSessionHours').value = sess.duration;
        // sess.price được lưu là TỔNG thu của buổi học (đã loại trừ học sinh 0đ);
        // với học chung cần chia lại theo SỐ HỌC SINH CÓ ĐÓNG HỌC PHÍ để ra đúng
        // đơn giá/học sinh hiển thị trong ô nhập liệu.
        const payingCount = Math.max(this.getPayingStudentIds(sess).length, 1);
        const editPriceEl = document.getElementById('editSessionPrice');
        this.setPriceSelectValue(editPriceEl, sess.type === 'chung' ? Math.round(sess.price / payingCount) : sess.price);
        editPriceEl.dataset.userEdited = 'true'; // giữ đúng giá đã lưu, không để bị tự động ghi đè
        document.getElementById('editSessionContent').value = sess.content || '';

        // Dựng lại danh sách checkbox học sinh (gom theo lớp), đánh dấu các
        // em đang tham gia — dùng chung hàm renderStudentSelectionGrid với
        // form tạo mới để không lặp lại logic 2 lần.
        // Reset lại ô tìm kiếm mỗi lần mở modal Sửa buổi học để luôn thấy đủ
        // danh sách học sinh trước khi lọc lại nếu cần.
        const searchInput = document.getElementById('editStudentsCheckboxSearch');
        if (searchInput) searchInput.value = '';
        this.renderStudentSelectionGrid('editStudentsCheckboxGrid', sess.studentIds);

        this.applySessionTypeRules('editSession');
        this.openModal('editSessionModal');
    },

    async handleEditSession() {
        const id = document.getElementById('editSessionId').value;
        const sess = this.sessions.find(x => x.id === id);
        if (!sess) return;

        const type = document.getElementById('editSessionType').value;
        const sessionName = document.getElementById('editSessionName').value.trim();
        const date = document.getElementById('editSessionDate').value;
        const startTime = document.getElementById('editSessionStartTime').value;
        const endTime = document.getElementById('editSessionEndTime').value;
        const duration = parseFloat(document.getElementById('editSessionHours').value) || 2.0;
        const unitPrice = this.parsePriceValue(document.getElementById('editSessionPrice').value);
        const content = document.getElementById('editSessionContent').value.trim();

        if (!date || !startTime || !endTime) {
            this.showToast("Vui lòng nhập đầy đủ ngày học và giờ học!", "error");
            return;
        }

        // Giờ kết thúc phải sau giờ bắt đầu (xem giải thích ở handleLogSession)
        if (endTime <= startTime) {
            this.showToast("Giờ kết thúc phải sau giờ bắt đầu!", "error");
            return;
        }

        if (isNaN(unitPrice) || unitPrice < 0) {
            this.showToast("Đơn giá học phí không được là số âm!", "error");
            return;
        }

        const checkedBoxes = document.querySelectorAll('input[name="editSessionStudents"]:checked');
        if (checkedBoxes.length === 0) {
            this.showToast("Vui lòng chọn ít nhất một học sinh tham gia!", "error");
            return;
        }
        if (type === 'riêng' && checkedBoxes.length > 1) {
            this.showToast("Học riêng (1 vs 1) chỉ được chọn đúng 1 học sinh!", "error");
            return;
        }

        // Cảnh báo trùng lịch (loại trừ chính buổi học đang sửa)
        const overlap = this.findOverlappingSession(date, startTime, endTime, id);
        if (overlap) {
            const proceed = confirm(
                `Khung giờ ${startTime}-${endTime} ngày ${this.formatDateVN(date)} đang TRÙNG với 1 buổi học khác ` +
                `(${overlap.startTime}-${overlap.endTime}${overlap.sessionName ? ' — ' + overlap.sessionName : ''}).\n\n` +
                `Bạn có chắc chắn vẫn muốn lưu thay đổi này không?`
            );
            if (!proceed) return;
        }

        const studentIds = [];
        checkedBoxes.forEach(cb => studentIds.push(cb.value));

        // Học chung: tổng thu = đơn giá/học sinh x SỐ HỌC SINH CÓ ĐÓNG HỌC PHÍ
        // (loại trừ học sinh học phí cơ bản = 0đ khỏi phép nhân), giống lúc tạo mới.
        const payingCount = studentIds.filter(stId => {
            const student = this.students.find(s => s.id === stId);
            return student && Number(student.basePrice) > 0;
        }).length;
        const price = type === 'chung' ? unitPrice * payingCount : unitPrice;

        // Sync studentDetails map (preserve existing if student already in class)
        const newStudentDetails = {};
        studentIds.forEach(stId => {
            if (sess.studentDetails[stId]) {
                newStudentDetails[stId] = sess.studentDetails[stId];
            } else {
                newStudentDetails[stId] = {
                    homework: "0%",
                    attitude: "Tốt",
                    individualComment: "",
                    note: ""
                };
            }
        });

        const updatedSession = {
            ...sess,
            type,
            sessionName,
            date,
            startTime,
            endTime,
            duration,
            price,
            content,
            studentIds,
            studentDetails: newStudentDetails
        };

        this.setBtnLoading('saveEditSessionBtn', true, 'Đang lưu...');
        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/sessions/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedSession)
            });
            if (!res.ok) throw new Error("Server error");
            await this.loadData();
        } catch (err) {
            console.warn("API lỗi, lưu offline: ", err.message);
            sess.type = type;
            sess.sessionName = sessionName;
            sess.date = date;
            sess.startTime = startTime;
            sess.endTime = endTime;
            sess.duration = duration;
            sess.price = price;
            sess.content = content;
            sess.studentIds = studentIds;
            sess.studentDetails = newStudentDetails;
            await this.saveData();
        } finally {
            this.setBtnLoading('saveEditSessionBtn', false);
        }

        this.closeModal('editSessionModal');
        this.showToast("Đã sửa lịch học thành công!", "success");
    },

    async deleteSession(id) {
        if (!this._committingDeletion) {
            if (!confirm('Xóa buổi học này? Bạn có 7 giây để hoàn tác.')) return;
            this.queueDeletion('Buổi học', async () => {
                const originalConfirm = window.confirm;
                this._committingDeletion = true;
                window.confirm = () => true;
                try { await this.deleteSession(id); } finally { window.confirm = originalConfirm; this._committingDeletion = false; }
            });
            return;
        }
        if (this.currentRole !== 'teacher') {
            this.showToast("Chỉ Giáo viên mới có quyền xóa buổi học!", "error");
            return;
        }

        if (confirm("Bạn có chắc muốn xóa ca dạy này khỏi lịch học?")) {
            try {
                const res = await this.authFetch(`${API_BASE_URL}/api/sessions/${id}`, { method: 'DELETE' });
                if (!res.ok) throw new Error("Server error");
                await this.loadData();
            } catch (err) {
                console.warn("API lỗi, lưu offline: ", err.message);
                this.sessions = this.sessions.filter(s => s.id !== id);
                await this.saveData();
            }
            this.showToast("Đã xóa buổi học thành công.", "success");
        }
    },

    // 4. Update Student Specific Evaluation Log (Homework, Attitude, Comments)
    openUpdateLogModal(sessionId, studentId) {
        const sess = this.sessions.find(x => x.id === sessionId);
        if (!sess) return;

        const detail = sess.studentDetails[studentId];
        if (!detail) return;

        document.getElementById('updateLogSessionId').value = sessionId;
        document.getElementById('updateLogStudentId').value = studentId;
        
        document.getElementById('updateLogStudentMeta').innerText = `Học sinh: ${this.getStudentName(studentId)} (${this.getStudentClass(studentId)})`;
        document.getElementById('updateLogSessionMeta').innerText = `Buổi ngày ${this.formatDateVN(sess.date)} | Ca ${sess.startTime} - ${sess.endTime}`;

        document.getElementById('updateHomework').value = this.normalizeHomeworkValue(detail.homework);
        document.getElementById('updateAttitude').value = detail.attitude || 'Tốt';
        document.getElementById('updateGeneralComment').value = sess.generalComment || '';
        document.getElementById('updateIndividualComment').value = detail.individualComment || '';
        document.getElementById('updateNote').value = detail.note || '';

        // Show general comment updater field only if it's a shared session (chung)
        const generalCommentGroup = document.getElementById('generalCommentGroup');
        if (sess.type === 'chung') {
            generalCommentGroup.style.display = 'block';
        } else {
            // Private session: generalComment acts as the individualComment itself
            generalCommentGroup.style.display = 'none';
        }

        this.openModal('updateLogModal');
    },

    async handleUpdateLog() {
        const sessionId = document.getElementById('updateLogSessionId').value;
        const studentId = document.getElementById('updateLogStudentId').value;

        const sess = this.sessions.find(x => x.id === sessionId);
        if (!sess) return;

        const detail = sess.studentDetails[studentId];
        if (!detail) return;

        const homework = document.getElementById('updateHomework').value;
        const attitude = document.getElementById('updateAttitude').value.trim();
        const individualComment = document.getElementById('updateIndividualComment').value.trim();
        const note = document.getElementById('updateNote').value.trim();
        
        let generalComment = undefined;
        if (sess.type === 'chung') {
            generalComment = document.getElementById('updateGeneralComment').value.trim();
        } else {
            generalComment = individualComment;
        }

        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/session-details/${sessionId}/${studentId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ homework, attitude, individualComment, note, generalComment })
            });
            if (!res.ok) throw new Error("Server error");
            await this.loadData();
        } catch (err) {
            console.warn("API lỗi, lưu offline: ", err.message);
            detail.homework = homework;
            detail.attitude = attitude;
            detail.individualComment = individualComment;
            detail.note = note;
            if (sess.type === 'chung') {
                sess.generalComment = generalComment;
            } else {
                sess.generalComment = individualComment;
            }
            await this.saveData();
        }

        this.closeModal('updateLogModal');
        this.showToast("Cập nhật nhận xét học sinh thành công!", "success");
    },

    // Chuyển trạng thái học phí (Đã thanh toán <-> Chưa thanh toán) cho TẤT CẢ
    // buổi học của 1 học sinh. Hoàn toàn tách biệt với trạng thái "đã dạy" —
    // dùng field Paid riêng, không còn dùng chung với Completed nữa.
    async setStudentPaidStatus(studentId, paid) {
        if (this.currentRole !== 'teacher') {
            this.showToast("Chỉ Giáo viên mới có quyền cập nhật học phí!", "error");
            this.renderTuitionOverview();
            return;
        }

        const studentSessions = this.sessions.filter(sess => sess.studentIds.includes(studentId));
        if (studentSessions.length === 0) return;

        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/students/${studentId}/set-paid`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paid })
            });
            if (!res.ok) throw new Error("Server error");
            await this.loadData();
        } catch (err) {
            console.warn("API lỗi, cập nhật offline: ", err.message);
            // QUAN TRỌNG: chỉ set cờ Paid của ĐÚNG học sinh này trong từng buổi
            // học (sess.studentDetails[studentId].paid) — TUYỆT ĐỐI không set
            // sess.paid (cấp cả buổi), nếu không buổi học chung sẽ bị đổi trạng
            // thái of TẤT CẢ học sinh khác học cùng buổi theo em này.
            studentSessions.forEach(sess => {
                if (sess.studentDetails && sess.studentDetails[studentId]) {
                    sess.studentDetails[studentId].paid = paid;
                }
            });
            await this.saveData();
        }
        this.showToast(paid ? "Đã đánh dấu học phí: Đã thanh toán" : "Đã đánh dấu học phí: Chưa thanh toán", "success");
    }
});

// ================================================================
// STUDENT-PICKERS.JS — Lưới chọn học sinh, quy tắc loại buổi học & học phí
// ================================================================
Object.assign(PinkyClassApp.prototype, {
    populateStudentPickers() {
        const globalPicker = document.getElementById('globalStudentPicker');
        const scoresPicker = document.getElementById('scoresStudentPicker');
        globalPicker.innerHTML = '';
        if (scoresPicker) scoresPicker.innerHTML = '';

        this.students.forEach(st => {
            const opt = document.createElement('option');
            opt.value = st.id;
            opt.innerText = `${st.name} (${st.class})`;
            globalPicker.appendChild(opt);

            if (scoresPicker) scoresPicker.appendChild(opt.cloneNode(true));
        });

        if (this.students.length > 0) {
            // Restore selection if exists
            if (this.students.find(s => s.id === this.currentStudentId)) {
                globalPicker.value = this.currentStudentId;
            } else {
                this.currentStudentId = this.students[0].id;
                globalPicker.value = this.currentStudentId;
            }
            if (scoresPicker) scoresPicker.value = this.currentStudentId;
        }

        // Also render checkboxes in scheduler logger form
        this.renderStudentSelectionGrid('studentsCheckboxGrid');
        this.renderStudentSelectionGrid('editStudentsCheckboxGrid');
    },

    // Bỏ dấu tiếng Việt để tìm kiếm không phân biệt có dấu/không dấu
    // (VD gõ "quynh" vẫn tìm ra "Quỳnh").
    removeVietnameseTones(str) {
        return (str || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd').replace(/Đ/g, 'D')
            .toLowerCase();
    },

    // Dựng lưới chọn học sinh, GOM THEO LỚP (mỗi lớp 1 khối thu gọn/mở rộng
    // được + nút "Chọn cả lớp") thay vì 1 danh sách phẳng — để đỡ rối mắt và
    // dễ tìm khi giáo viên dạy nhiều lớp/nhiều học sinh.
    // preselectedIds: mảng id học sinh cần tick sẵn (dùng khi mở modal Sửa
    // buổi học); để null/không truyền thì dùng hành vi mặc định của form tạo
    // mới (tự tick đúng học sinh đang được lọc ở trang Nhật ký học tập, nếu có).
    renderStudentSelectionGrid(containerId, preselectedIds = null) {
        const prefix = containerId === 'studentsCheckboxGrid' ? 'session' : 'editSession';
        const typeSelectId = prefix === 'session' ? 'sessionType' : 'editSessionType';
        const grid = document.getElementById(containerId);
        if (!grid) return;
        grid.innerHTML = '';

        const isGroupTypeNow = document.getElementById(typeSelectId).value === 'chung';

        // Gom học sinh theo lớp, giữ nguyên thứ tự học sinh trong từng lớp;
        // sắp xếp các lớp theo số lớp tăng dần (lớp không xác định được số thì xếp cuối).
        const groupsMap = new Map();
        this.students.forEach(st => {
            const className = st.class || 'Chưa xếp lớp';
            if (!groupsMap.has(className)) groupsMap.set(className, []);
            groupsMap.get(className).push(st);
        });
        const classNames = Array.from(groupsMap.keys()).sort((a, b) => {
            const numA = parseInt((a || '').replace(/\D/g, ''), 10);
            const numB = parseInt((b || '').replace(/\D/g, ''), 10);
            const hasA = !isNaN(numA), hasB = !isNaN(numB);
            if (hasA && hasB) return numA - numB;
            if (hasA) return -1;
            if (hasB) return 1;
            return a.localeCompare(b, 'vi');
        });

        classNames.forEach(className => {
            const studentsInClass = groupsMap.get(className);

            const groupEl = document.createElement('div');
            groupEl.className = 'student-class-group';

            const header = document.createElement('div');
            header.className = 'student-class-group-header';

            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'student-class-toggle-btn';
            toggleBtn.innerHTML = `
                <svg class="chevron-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span class="student-class-name">${this.escapeHtml(className)}</span>
                <span class="student-class-count">(${studentsInClass.length})</span>
            `;

            const selectAllLabel = document.createElement('label');
            selectAllLabel.className = 'student-class-select-all';
            const selectAllCheckbox = document.createElement('input');
            selectAllCheckbox.type = 'checkbox';
            selectAllCheckbox.className = 'select-all-class-checkbox';
            selectAllCheckbox.disabled = !isGroupTypeNow;
            const selectAllText = document.createElement('span');
            selectAllText.innerText = 'Chọn cả lớp';
            selectAllLabel.appendChild(selectAllCheckbox);
            selectAllLabel.appendChild(selectAllText);

            header.appendChild(toggleBtn);
            header.appendChild(selectAllLabel);

            const body = document.createElement('div');
            body.className = 'student-class-group-body';

            let anyCheckedInGroup = false;

            studentsInClass.forEach(st => {
                const label = document.createElement('label');
                label.className = 'student-check-item';

                // Chuỗi dùng để tìm kiếm/lọc: tên + lớp đầy đủ ("Lớp 6") + số lớp
                // riêng ("6") — để gõ "6", "lớp 6" hay "Lớp 6" đều lọc ra đúng.
                const classNumberOnly = (st.class || '').replace(/lớp/i, '').trim();
                label.dataset.search = this.removeVietnameseTones(`${st.name} ${st.class} ${classNumberOnly}`);

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = st.id;
                checkbox.name = containerId === 'studentsCheckboxGrid' ? 'sessionStudents' : 'editSessionStudents';

                const shouldCheck = Array.isArray(preselectedIds)
                    ? preselectedIds.includes(st.id)
                    : (st.id === this.currentStudentId && containerId === 'studentsCheckboxGrid');
                if (shouldCheck) {
                    checkbox.checked = true;
                    anyCheckedInGroup = true;
                }

                // Học riêng (private) => chỉ được chọn đúng 1 học sinh: hành xử như radio.
                // QUAN TRỌNG: đọc lại giá trị "riêng/chung" MỚI NHẤT ngay trong lúc bấm,
                // thay vì dùng biến đã "chốt cứng" từ lúc vẽ checkbox lần đầu.
                checkbox.addEventListener('change', () => {
                    const isPrivateNow = document.getElementById(typeSelectId).value !== 'chung';
                    if (isPrivateNow && checkbox.checked) {
                        grid.querySelectorAll('input[type="checkbox"]').forEach(other => {
                            if (other !== checkbox) other.checked = false;
                        });
                    }
                    // Học sinh vừa đổi -> cho phép gợi ý lại học phí cơ bản của
                    // học sinh MỚI (xóa cờ "người dùng đã tự sửa" của lần chọn trước).
                    const priceInputId = prefix === 'session' ? 'sessionPrice' : 'editSessionPrice';
                    const priceEl = document.getElementById(priceInputId);
                    if (priceEl) delete priceEl.dataset.userEdited;
                    this.updateSessionPricing(prefix);
                });

                const span = document.createElement('span');
                span.innerText = `${st.name} - ${st.class}`;

                label.appendChild(checkbox);
                label.appendChild(span);
                body.appendChild(label);
            });

            // Nhóm lớp có sẵn học sinh đang được chọn -> tự mở rộng để giáo
            // viên thấy ngay; các nhóm khác mặc định thu gọn cho gọn màn hình.
            const startExpanded = anyCheckedInGroup;
            body.style.display = startExpanded ? '' : 'none';
            groupEl.classList.toggle('is-collapsed', !startExpanded);
            groupEl.dataset.wasExpanded = String(startExpanded);
            toggleBtn.setAttribute('aria-expanded', String(startExpanded));

            toggleBtn.addEventListener('click', () => {
                const collapsedNow = groupEl.classList.contains('is-collapsed');
                this.setClassGroupCollapsed(groupEl, !collapsedNow, true);
            });

            selectAllCheckbox.addEventListener('change', () => {
                const isPrivateNow = document.getElementById(typeSelectId).value !== 'chung';
                if (isPrivateNow) {
                    selectAllCheckbox.checked = false;
                    this.showToast('Học riêng (1 vs 1) chỉ được chọn 1 học sinh, không thể chọn cả lớp.', 'error');
                    return;
                }
                body.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = selectAllCheckbox.checked; });
                const priceInputId = prefix === 'session' ? 'sessionPrice' : 'editSessionPrice';
                const priceEl = document.getElementById(priceInputId);
                if (priceEl) delete priceEl.dataset.userEdited;
                this.updateSessionPricing(prefix);
            });

            groupEl.appendChild(header);
            groupEl.appendChild(body);
            grid.appendChild(groupEl);
        });

        // Giữ nguyên từ khóa đang lọc (nếu có) khi lưới được vẽ lại — tránh
        // việc mở modal Sửa buổi học lại hiện ra danh sách đầy đủ chưa lọc.
        const searchInputId = containerId === 'studentsCheckboxGrid' ? 'studentsCheckboxSearch' : 'editStudentsCheckboxSearch';
        const searchInput = document.getElementById(searchInputId);
        if (searchInput) this.filterStudentCheckboxGrid(containerId, searchInput.value);

        this.updateSessionPricing(prefix);
    },

    // Thu gọn/mở rộng 1 nhóm lớp trong lưới chọn học sinh. remember=true khi
    // đây là thao tác CHỦ ĐỘNG của người dùng (bấm mũi tên) — ghi nhớ lại để
    // khôi phục đúng trạng thái này sau khi xoá từ khoá tìm kiếm; remember=false
    // khi chỉ là tự động mở tạm để lộ kết quả tìm kiếm.
    setClassGroupCollapsed(groupEl, collapsed, remember = false) {
        const body = groupEl.querySelector('.student-class-group-body');
        const btn = groupEl.querySelector('.student-class-toggle-btn');
        if (!body || !btn) return;
        body.style.display = collapsed ? 'none' : '';
        btn.setAttribute('aria-expanded', String(!collapsed));
        groupEl.classList.toggle('is-collapsed', collapsed);
        if (remember) groupEl.dataset.wasExpanded = String(!collapsed);
    },

    // Ẩn/hiện các học sinh trong lưới checkbox theo từ khóa gõ vào ô tìm kiếm
    // (so khớp theo tên HOẶC theo lớp, không phân biệt dấu/không dấu/hoa thường).
    // Nhóm lớp không có học sinh nào khớp thì ẩn cả khối; nhóm có khớp thì tự
    // mở ra để thấy ngay, và khi xoá hết từ khoá sẽ trả lại đúng trạng thái
    // đóng/mở trước đó (không ép mở hết mọi lớp).
    filterStudentCheckboxGrid(gridId, keyword) {
        const grid = document.getElementById(gridId);
        if (!grid) return;
        const kw = this.removeVietnameseTones((keyword || '').trim());
        grid.querySelectorAll('.student-class-group').forEach(groupEl => {
            const items = groupEl.querySelectorAll('.student-check-item');
            let anyMatch = false;
            items.forEach(label => {
                const match = !kw || (label.dataset.search || '').includes(kw);
                label.style.display = match ? '' : 'none';
                if (match) anyMatch = true;
            });
            groupEl.style.display = anyMatch ? '' : 'none';
            if (kw) {
                if (anyMatch) this.setClassGroupCollapsed(groupEl, false);
            } else {
                const wasExpanded = groupEl.dataset.wasExpanded === 'true';
                this.setClassGroupCollapsed(groupEl, !wasExpanded);
            }
        });
    },

    // Áp dụng quy tắc "Học riêng chỉ 1 học sinh / Học chung nhiều học sinh" khi
    // đổi loại buổi học, và cập nhật lại nhãn + đơn giá tương ứng.
    applySessionTypeRules(prefix) {
        const typeSelectId = prefix === 'session' ? 'sessionType' : 'editSessionType';
        const gridId = prefix === 'session' ? 'studentsCheckboxGrid' : 'editStudentsCheckboxGrid';
        const priceLabelId = prefix === 'session' ? 'sessionPriceLabel' : 'editSessionPriceLabel';
        const isGroup = document.getElementById(typeSelectId).value === 'chung';

        const priceLabel = document.getElementById(priceLabelId);
        if (priceLabel) {
            priceLabel.innerText = isGroup ? 'Đơn giá buổi học (VNĐ/học sinh)' : 'Học phí buổi học (VNĐ)';
        }

        if (!isGroup) {
            // Chuyển sang "riêng": nếu đang chọn nhiều hơn 1 học sinh thì chỉ giữ lại học sinh đầu tiên.
            const checked = document.querySelectorAll(`#${gridId} input[type="checkbox"]:checked`);
            checked.forEach((cb, idx) => { if (idx > 0) cb.checked = false; });
        }

        // "Chọn cả lớp" chỉ có ý nghĩa với Học chung — khoá lại khi chuyển sang Học riêng.
        document.querySelectorAll(`#${gridId} .select-all-class-checkbox`).forEach(cb => {
            cb.disabled = !isGroup;
            if (!isGroup) cb.checked = false;
        });

        // Đổi loại buổi học -> cho phép gợi ý lại học phí (xóa cờ "đã tự sửa").
        const priceInputId = prefix === 'session' ? 'sessionPrice' : 'editSessionPrice';
        const priceEl = document.getElementById(priceInputId);
        if (priceEl) delete priceEl.dataset.userEdited;

        this.updateSessionPricing(prefix);
    },

    // Tính "Tổng thu buổi học": học riêng = đơn giá nhập; học chung = đơn giá/học sinh
    // x SỐ HỌC SINH CÓ ĐÓNG HỌC PHÍ (loại trừ học sinh học phí 0đ ra khỏi phép nhân,
    // vì các em này không đóng tiền nên không được tính vào tổng thu buổi học).
    updateSessionPricing(prefix) {
        const typeSelectId = prefix === 'session' ? 'sessionType' : 'editSessionType';
        const gridName = prefix === 'session' ? 'sessionStudents' : 'editSessionStudents';
        const priceInputId = prefix === 'session' ? 'sessionPrice' : 'editSessionPrice';
        const totalDisplayId = prefix === 'session' ? 'sessionTotalPriceDisplay' : 'editSessionTotalPriceDisplay';

        const typeEl = document.getElementById(typeSelectId);
        const priceEl = document.getElementById(priceInputId);
        const totalEl = document.getElementById(totalDisplayId);
        if (!typeEl || !priceEl || !totalEl) return;

        const isGroup = typeEl.value === 'chung';
        const checkedBoxes = Array.from(document.querySelectorAll(`input[name="${gridName}"]:checked`));
        const checkedCount = checkedBoxes.length;
        // Số học sinh THỰC SỰ đóng học phí trong buổi (bỏ qua các em có học phí
        // cơ bản = 0đ — ví dụ học miễn phí/học thử) — dùng số này để nhân với
        // đơn giá/học sinh khi tính tổng thu của buổi học chung.
        const payingCount = checkedBoxes.filter(cb => {
            const student = this.students.find(s => s.id === cb.value);
            return student && Number(student.basePrice) > 0;
        }).length;
        const unitPrice = this.parsePriceValue(priceEl.value);

        // Học riêng, tự động gợi ý học phí cơ bản của học sinh khi chỉ chọn 1 em
        // — nhưng CHỈ khi giáo viên chưa tự tay đổi lựa chọn học phí (đánh dấu
        // bằng priceEl.dataset.userEdited, được set ở sự kiện 'change' của ô
        // học phí). Trước đây cờ này không bao giờ được set nên điều kiện luôn
        // đúng, khiến ô học phí bị ghi đè liên tục và không thể sửa được.
        if (!isGroup && checkedCount === 1 && !priceEl.dataset.userEdited) {
            const cb = document.querySelector(`input[name="${gridName}"]:checked`);
            const student = this.students.find(s => s.id === cb.value);
            if (student) {
                this.setPriceSelectValue(priceEl, student.basePrice);
            }
        }

        const total = isGroup ? unitPrice * Math.max(payingCount, 0) : (this.parsePriceValue(priceEl.value) || 0);
        totalEl.innerText = this.formatVND(total);
    },

    // Gán giá trị cho ô học phí (input số, có gợi ý mức giá 100k/120k/150k/
    // 180k/200k/250k qua danh sách datalist đi kèm). Ô này cho phép giáo viên
    // vừa gõ tay số tiền tuỳ ý, vừa bấm mũi tên để chọn nhanh 1 mức giá có
    // sẵn — nếu học phí cơ bản của học sinh không trùng mức giá nào đã có
    // trong danh sách gợi ý (VD giáo viên từng đặt 1 mức giá lẻ khác cho học
    // sinh đó), tự thêm tạm 1 option đúng bằng mức giá đó vào datalist để lần
    // sau vẫn thấy trong danh sách gợi ý.
    // Chuyển chuỗi học phí giáo viên gõ/chọn (VD "250.000 đ", "250000", hay
    // "250.000") thành số nguyên VNĐ, bỏ qua mọi ký tự không phải chữ số.
    parsePriceValue(str) {
        const digitsOnly = String(str || '').replace(/[^0-9]/g, '');
        return digitsOnly ? parseInt(digitsOnly, 10) : 0;
    },

    setPriceSelectValue(selectEl, value) {
        if (!selectEl) return;
        const val = this.parsePriceValue(value);
        const display = this.formatVND(val);
        const listEl = selectEl.list;
        if (listEl && !Array.from(listEl.options).some(o => o.value === display)) {
            const opt = document.createElement('option');
            opt.value = display;
            listEl.appendChild(opt);
        }
        selectEl.value = display;
    }

});
