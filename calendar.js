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

        if (this.calendarViewMode === 'month') {
            if (wrapperEl) wrapperEl.style.display = 'none';
            if (monthEl) monthEl.style.display = '';
            this.renderMonthCalendar();
        } else {
            if (wrapperEl) wrapperEl.style.display = '';
            if (monthEl) monthEl.style.display = 'none';
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
        for (let h = HOUR_START; h <= HOUR_END; h++) {
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
                const recurrenceIcon = sess.recurrenceGroupId
                    ? '<span class="evt-repeat-icon" title="Buổi học thuộc chuỗi lặp" aria-label="Lịch lặp lại">↻</span>'
                    : '';
                const evtTooltip = (sess.sessionName ? `${sess.sessionName} — ${names}` : names)
                    + (sess.recurrenceGroupId ? ' — Lịch lặp lại' : '');

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
                        ${recurrenceIcon}
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
                const repeatMark = sess.recurrenceGroupId
                    ? '<span class="month-repeat-icon" aria-label="Lịch lặp lại">↻</span>'
                    : '';
                const tooltip = `${sess.startTime}-${sess.endTime} ${title}${sess.recurrenceGroupId ? ' — Lịch lặp lại' : ''}`;
                sessionsHTML += `<div class="month-day-event ${typeClass}" title="${this.escapeHtmlAttr(tooltip)}">${repeatMark}<span>${this.escapeHtml(sess.startTime)} ${this.escapeHtml(title)}</span></div>`;
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
            // Không cho kéo vượt ra ngoài khung giờ hiển thị 07:00 - 24:00
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
                const absoluteMinutes = Math.min((this.CAL_HOUR_START * 60) + mins, (24 * 60) - 1);
                const h = Math.floor(absoluteMinutes / 60);
                const m = absoluteMinutes % 60;
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

        const updateScope = await this.requestRecurrenceScope(sess, 'di chuyển');
        if (!updateScope) {
            this.renderCalendarView();
            return;
        }
        const overlap = this.findOverlappingSession(newDate, newStartTime, newEndTime, sessionId);
        const overlapMovesTogether = updateScope === 'following'
            && overlap?.recurrenceGroupId === sess.recurrenceGroupId
            && Number(overlap.recurrenceSequence) >= Number(sess.recurrenceSequence);
        if (overlap && !overlapMovesTogether) {
            this.renderCalendarView();
            this.showToast(this.formatSessionConflictMessage(newDate, newStartTime, newEndTime, overlap), 'error');
            return;
        }
        const updatedSession = { ...sess, date: newDate, startTime: newStartTime, endTime: newEndTime, updateScope };
        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/sessions/${sessionId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedSession)
            });
            await this.requireApiSuccess(res, 'Không thể cập nhật lịch học.');
            await this.loadData();
        } catch (err) {
            this.renderCalendarView();
            this.showToast(err.message || 'Không thể cập nhật lịch học.', 'error');
            return;
        }
        this.showToast("Đã cập nhật lịch học!", "success");
    },

    openSessionQuickEntry(sessionId) {
        const sess = this.sessions.find(s => s.id === sessionId);
        if (!sess) return;

        document.getElementById('quickEntrySessionId').value = sess.id;
        const sessionTypeLabel = sess.type === 'chung' ? 'Lớp học' : '1-1';
        document.getElementById('quickEntryTimeMeta').innerText = `${sess.startTime} - ${sess.endTime} (${sess.duration} giờ) — ${sessionTypeLabel}`;
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

        const linkedScores = (this.scores || []).filter(score =>
            score.sessionId === sess.id && sess.studentIds.includes(score.studentId)
        );
        this.renderQuickEntryScoreGroups(sess, linkedScores);

        const scoreToggle = document.getElementById('quickEntryScoreToggle');
        if (scoreToggle) {
            scoreToggle.dataset.hasScores = String(linkedScores.some(score => score.scoreValue !== null && score.scoreValue !== undefined && String(score.scoreValue).trim() !== ''));
            scoreToggle.onclick = () => {
                const expanded = scoreToggle.getAttribute('aria-expanded') === 'true';
                this.setQuickEntryScoreExpanded(!expanded);
            };
        }
        const addTestButton = document.getElementById('quickEntryAddTestBtn');
        if (addTestButton) addTestButton.onclick = () => this.addQuickEntryScoreGroup();
        this.updateQuickEntryScoreCount();
        this.setQuickEntryScoreExpanded(false);

        // Sinh 1 thẻ nhập liệu RIÊNG cho từng học sinh trong ca, dữ liệu khởi
        // tạo lấy từ studentDetails hiện có của đúng em đó (nếu có).
        const listWrap = document.getElementById('quickEntryStudentsList');
        listWrap.innerHTML = sess.studentIds.map(stId => {
            const detail = sess.studentDetails[stId] || { homework: null, attitude: '', individualComment: '', note: '' };
            const name = this.getStudentName(stId);
            const homeworkVal = isDone ? this.normalizeHomeworkValue(detail.homework) : null;
            const attitude = isDone ? (detail.attitude || '') : '';
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
                                <option value="" ${homeworkVal === null ? 'selected' : ''}>-</option>
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

    getQuickEntryScoreTypeOptions(selectedType) {
        const labels = {
            BTVN: 'BTVN',
            KTTX: 'Kiểm tra thường xuyên',
            CuoiChuong: 'Kiểm tra cuối chương',
            KiemTra: 'Kiểm tra (dữ liệu cũ)',
            ThaiDo: 'Thái độ (dữ liệu cũ)'
        };
        const normalized = String(selectedType || 'BTVN').trim() || 'BTVN';
        const options = ['BTVN', 'KTTX'];
        if (normalized !== '__custom__' && !options.includes(normalized)) options.push(normalized);
        return options.map(type =>
            `<option value="${this.escapeHtmlAttr(type)}" ${type === normalized ? 'selected' : ''}>${this.escapeHtml(labels[type] || type)}</option>`
        ).join('') + `<option value="__custom__" ${normalized === '__custom__' ? 'selected' : ''}>+ Thêm</option>`;
    },

    buildQuickEntryScoreGroupHtml(sess, group, index, total) {
        const selectedType = String(group.scoreType || 'BTVN').trim() || 'BTVN';
        const useCustomType = selectedType === '__custom__';
        const customType = useCustomType ? '' : (['BTVN', 'KTTX', 'CuoiChuong', 'KiemTra', 'ThaiDo'].includes(selectedType) ? '' : selectedType);
        const selectValue = customType ? '__custom__' : selectedType;
        const maxScore = Number(group.maxScore) > 0 ? Number(group.maxScore) : 10;
        const scoreMap = group.scores instanceof Map ? group.scores : new Map();
        const groupId = String(group.testGroupId || '');
        const rows = sess.studentIds.map(stId => {
            const linkedScore = scoreMap.get(stId) || {};
            const student = (this.students || []).find(item => item.id === stId);
            const studentClass = student?.class || (student?.gradeLevel ? `Lớp ${student.gradeLevel}` : '-');
            const name = this.getStudentName(stId);
            return `
                <tr class="batch-score-row qe-score-row" data-student-id="${this.escapeHtmlAttr(stId)}">
                    <td><strong>${this.escapeHtml(name)}</strong></td>
                    <td>${this.escapeHtml(studentClass)}</td>
                    <td><input type="text" class="form-control batch-score-value qe-score-value" inputmode="decimal" placeholder="-" value="${this.escapeHtmlAttr(linkedScore.scoreValue ?? '')}" aria-label="Điểm của ${this.escapeHtmlAttr(name)}"></td>
                    <td><input type="text" class="form-control batch-score-student-note qe-score-note" maxlength="500" value="${this.escapeHtmlAttr(linkedScore.note || '')}" aria-label="Ghi chú của ${this.escapeHtmlAttr(name)}"></td>
                </tr>
            `;
        }).join('');
        return `
            <article class="quick-entry-score-group" data-test-group-id="${this.escapeHtmlAttr(groupId)}">
                <div class="quick-entry-score-group-heading">
                    <strong>Bài kiểm tra ${index + 1}</strong>
                    ${total > 1 ? '<button type="button" class="btn btn-danger btn-sm qe-remove-score-group">Xóa</button>' : ''}
                </div>
                <div class="score-batch-controls">
                    <label>Loại điểm
                        <select class="form-control qe-score-type" data-score-type-select>
                            ${this.getQuickEntryScoreTypeOptions(selectValue)}
                        </select>
                        <input type="text" class="form-control score-custom-type-input qe-custom-score-type" maxlength="100" placeholder="Nhập loại điểm" value="${this.escapeHtmlAttr(customType)}" ${customType ? '' : 'hidden'}>
                    </label>
                    <label class="score-batch-test-name">Tên bài kiểm tra
                        <input type="text" class="form-control qe-score-test-name" maxlength="150" value="${this.escapeHtmlAttr(group.testName || '')}">
                    </label>
                    <label>Thang điểm
                        <input type="text" inputmode="decimal" class="form-control qe-score-max" value="${this.escapeHtmlAttr(maxScore)}">
                    </label>
                </div>
                <div class="table-wrapper score-batch-table-wrap">
                    <table class="custom-table score-batch-table quick-entry-score-table">
                        <thead><tr><th>Học sinh</th><th>Lớp</th><th>Điểm (<span class="qe-score-max-label">${this.escapeHtml(maxScore)}</span>)</th><th>Ghi chú riêng</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <div class="quick-entry-score-group-spacer" aria-hidden="true"></div>
            </article>
        `;
    },

    renderQuickEntryScoreGroups(sess, linkedScores) {
        const wrap = document.getElementById('quickEntryScoreGroups');
        if (!wrap) return;
        const groupsById = new Map();
        (linkedScores || []).forEach(score => {
            const groupId = String(score.testGroupId || `session:${sess.id}`);
            if (!groupsById.has(groupId)) {
                groupsById.set(groupId, {
                    testGroupId: groupId,
                    scoreType: score.scoreType || 'BTVN',
                    testName: score.testName || sess.sessionName || '',
                    maxScore: score.maxScore,
                    scores: new Map()
                });
            }
            groupsById.get(groupId).scores.set(score.studentId, score);
        });
        const groups = groupsById.size ? [...groupsById.values()] : [{
            testGroupId: '',
            scoreType: 'BTVN',
            testName: sess.sessionName || '',
            maxScore: 10,
            scores: new Map()
        }];
        wrap.innerHTML = groups.map((group, index) => this.buildQuickEntryScoreGroupHtml(sess, group, index, groups.length)).join('');
        wrap.oninput = event => {
            const group = event.target.closest('.quick-entry-score-group');
            if (event.target.matches('.qe-score-max')) this.updateQuickEntryScoreMax(group);
            if (event.target.matches('.qe-score-value')) this.updateQuickEntryScoreCount();
        };
        wrap.onchange = event => {
            if (!event.target.matches('.qe-score-type')) return;
            const customInput = event.target.closest('label')?.querySelector('.qe-custom-score-type');
            this.syncCustomScoreTypeInput(event.target, customInput);
        };
        wrap.onclick = event => {
            const removeButton = event.target.closest('.qe-remove-score-group');
            if (!removeButton) return;
            const group = removeButton.closest('.quick-entry-score-group');
            const groupsNow = [...wrap.querySelectorAll('.quick-entry-score-group')];
            if (groupsNow.length <= 1) return;
            group?.remove();
            this.refreshQuickEntryScoreGroupHeadings();
            this.updateQuickEntryScoreCount();
        };
        wrap.querySelectorAll('.qe-score-type').forEach(select => {
            const customInput = select.closest('label')?.querySelector('.qe-custom-score-type');
            this.syncCustomScoreTypeInput(select, customInput);
        });
        this.updateQuickEntryScoreMax();
    },

    refreshQuickEntryScoreGroupHeadings() {
        const groups = [...document.querySelectorAll('#quickEntryScoreGroups .quick-entry-score-group')];
        groups.forEach((group, index) => {
            const title = group.querySelector('.quick-entry-score-group-heading strong');
            if (title) title.innerText = `Bài kiểm tra ${index + 1}`;
            const oldRemove = group.querySelector('.qe-remove-score-group');
            if (groups.length > 1 && !oldRemove) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'btn btn-danger btn-sm qe-remove-score-group';
                button.innerText = 'Xóa';
                group.querySelector('.quick-entry-score-group-heading')?.appendChild(button);
            } else if (groups.length <= 1 && oldRemove) {
                oldRemove.remove();
            }
        });
    },

    addQuickEntryScoreGroup() {
        const wrap = document.getElementById('quickEntryScoreGroups');
        const sessionId = document.getElementById('quickEntrySessionId')?.value;
        const sess = (this.sessions || []).find(item => item.id === sessionId);
        if (!wrap || !sess) return;
        const groups = [...wrap.querySelectorAll('.quick-entry-score-group')];
        const group = {
            testGroupId: '',
            scoreType: 'BTVN',
            testName: '',
            maxScore: 10,
            scores: new Map()
        };
        wrap.insertAdjacentHTML('beforeend', this.buildQuickEntryScoreGroupHtml(sess, group, groups.length, groups.length + 1));
        this.refreshQuickEntryScoreGroupHeadings();
        this.setQuickEntryScoreExpanded(true);
        this.updateQuickEntryScoreCount();
        wrap.querySelectorAll('.qe-score-type').forEach(select => {
            const customInput = select.closest('label')?.querySelector('.qe-custom-score-type');
            this.syncCustomScoreTypeInput(select, customInput);
        });
    },

    setQuickEntryScoreExpanded(expanded) {
        const toggle = document.getElementById('quickEntryScoreToggle');
        const panel = document.getElementById('quickEntryScorePanel');
        if (!toggle || !panel) return;
        const hasScores = toggle.dataset.hasScores === 'true';
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.querySelector('span').innerText = expanded
            ? '− Thu gọn nhập điểm buổi học'
            : (hasScores ? '+ Xem và sửa điểm buổi học' : '+ Nhập điểm buổi học');
        panel.hidden = !expanded;
        panel.querySelectorAll('input, select, textarea').forEach(control => { control.disabled = !expanded; });
        panel.querySelectorAll('[data-score-type-select]').forEach(select => {
            const customInput = select.closest('label')?.querySelector('.qe-custom-score-type');
            this.syncCustomScoreTypeInput(select, customInput);
        });
        if (expanded) window.setTimeout(() => document.querySelector('#quickEntryScoreGroups .qe-score-type')?.focus(), 0);
    },

    updateQuickEntryScoreMax(groupElement) {
        const groups = groupElement ? [groupElement] : [...document.querySelectorAll('#quickEntryScoreGroups .quick-entry-score-group')];
        groups.forEach(group => {
            const maxInput = group.querySelector('.qe-score-max');
            const maxLabel = group.querySelector('.qe-score-max-label');
            const maxScore = Number(String(maxInput?.value || '').replace(',', '.'));
            if (Number.isFinite(maxScore) && maxScore > 0 && maxLabel) maxLabel.innerText = String(maxScore);
        });
    },

    updateQuickEntryScoreCount() {
        const count = [...document.querySelectorAll('#quickEntryScoreGroups .qe-score-value')]
            .filter(input => input.value.trim() !== '').length;
        const label = document.getElementById('quickEntryScoreCount');
        if (label) label.innerText = `${count} học sinh có điểm`;
        const toggle = document.getElementById('quickEntryScoreToggle');
        if (toggle) {
            toggle.dataset.hasScores = String(count > 0);
            if (toggle.getAttribute('aria-expanded') !== 'true') {
                toggle.querySelector('span').innerText = count > 0 ? '+ Xem và sửa điểm buổi học' : '+ Nhập điểm buổi học';
            }
        }
    },

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
        const scoreGroups = [];
        const newStudentDetails = {};
        let scoreValidationError = '';
        document.querySelectorAll('#quickEntryScoreGroups .quick-entry-score-group').forEach((group, groupIndex) => {
            const typeSelect = group.querySelector('.qe-score-type');
            const customTypeInput = group.querySelector('.qe-custom-score-type');
            const scoreType = typeSelect?.value === '__custom__'
                ? String(customTypeInput?.value || '').trim()
                : String(typeSelect?.value || '').trim();
            const scoreTestName = group.querySelector('.qe-score-test-name')?.value.trim() || '';
            const scoreMaxRaw = group.querySelector('.qe-score-max')?.value || '';
            const scoreMax = Number(String(scoreMaxRaw).replace(',', '.'));
            const entries = [];
            let hasAnyScore = false;
            group.querySelectorAll('.qe-score-row').forEach(row => {
                const studentId = row.getAttribute('data-student-id');
                const scoreValueRaw = row.querySelector('.qe-score-value').value.trim();
                const scoreNote = row.querySelector('.qe-score-note').value.trim();
                const scoreValue = scoreValueRaw === '' ? null : Number(scoreValueRaw.replace(',', '.'));
                if (scoreValueRaw !== '') hasAnyScore = true;
                if (!scoreValidationError && scoreValueRaw !== '' && (!Number.isFinite(scoreValue) || scoreValue < 0 || !Number.isFinite(scoreMax) || scoreMax <= 0 || scoreValue > scoreMax)) {
                    scoreValidationError = `Điểm của ${this.getStudentName(studentId)} ở bài ${groupIndex + 1} phải từ 0 đến ${Number.isFinite(scoreMax) && scoreMax > 0 ? scoreMax : 'thang điểm đã chọn'}.`;
                }
                if (!scoreValidationError && scoreNote.length > 500) scoreValidationError = 'Ghi chú điểm không được vượt quá 500 ký tự.';
                entries.push({ studentId, scoreValue, scoreNote });
            });
            if (!hasAnyScore) return;
            if (!scoreValidationError && !scoreType) scoreValidationError = `Vui lòng chọn hoặc nhập loại điểm cho bài ${groupIndex + 1}.`;
            else if (!scoreValidationError && scoreType.length > 100) scoreValidationError = 'Loại điểm không được vượt quá 100 ký tự.';
            else if (!scoreValidationError && (!scoreTestName || scoreTestName.length > 150)) scoreValidationError = `Vui lòng nhập tên bài kiểm tra cho bài ${groupIndex + 1}, tối đa 150 ký tự.`;
            else if (!scoreValidationError && (!Number.isFinite(scoreMax) || scoreMax <= 0 || scoreMax > 1000)) scoreValidationError = 'Thang điểm phải lớn hơn 0 và không vượt quá 1000.';
            scoreGroups.push({
                testGroupId: group.dataset.testGroupId || '',
                scoreType,
                testName: scoreTestName,
                maxScore: Number.isFinite(scoreMax) && scoreMax > 0 ? scoreMax : 10,
                entries
            });
        });

        document.querySelectorAll('#quickEntryStudentsList .qe-student-card').forEach(card => {
            const stId = card.getAttribute('data-student-id');
            const oldDetail = (sess.studentDetails && sess.studentDetails[stId]) || {};
            const homework = card.querySelector('.qe-homework').value.trim() || null;
            const attitude = card.querySelector('.qe-attitude').value.trim();
            const individualComment = card.querySelector('.qe-comment').value.trim();
            const note = card.querySelector('.qe-note').value.trim();
            newStudentDetails[stId] = {
                homework,
                attitude,
                individualComment,
                note,
                feeAmount: oldDetail.feeAmount,
                paid: !!oldDetail.paid
            };

        });

        if (scoreValidationError) {
            this.showToast(scoreValidationError, 'error');
            return;
        }
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

        this.setBtnLoading('saveQuickEntryBtn', true, 'Đang lưu...');
        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/sessions/${id}/quick-entry`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content,
                    sessionName,
                    generalComment: finalGeneralComment,
                    scoreGroups,
                    studentDetails: newStudentDetails
                })
            });
            await this.requireApiSuccess(res, 'Không thể lưu nội dung và nhận xét buổi học.');
            await this.loadData();
        } catch (err) {
            this.showToast(err.message || 'Không thể lưu nội dung và nhận xét buổi học.', 'error');
            return;
        } finally {
            this.setBtnLoading('saveQuickEntryBtn', false);
        }

        this.closeModal('quickSessionEntryModal');
        this.updateAllViews();
        this.showToast("Đã lưu nội dung, nhận xét và điểm của buổi học!", "success");
    },


    // --- VIEW 4: TUITION & PAYMENTS OVERVIEW ---
    getRepeatFormConfig(mode = 'create') {
        const isEdit = mode === 'edit';
        return {
            mode: isEdit ? 'edit' : 'create',
            dateId: isEdit ? 'editSessionDate' : 'sessionDate',
            toggleId: isEdit ? 'editSessionRepeatToggle' : 'sessionRepeatToggle',
            panelId: isEdit ? 'editRepeatDatesPanel' : 'repeatDatesPanel',
            frequencyId: isEdit ? 'editRepeatFrequency' : 'repeatFrequency',
            untilId: isEdit ? 'editRepeatUntilDate' : 'repeatUntilDate',
            untilGroupId: isEdit ? 'editRepeatUntilGroup' : 'repeatUntilGroup',
            extraInputId: isEdit ? 'editRepeatExtraDateInput' : 'repeatExtraDateInput',
            extraRowId: isEdit ? 'editRepeatExtraDateRow' : 'repeatExtraDateRow',
            addButtonId: isEdit ? 'editAddRepeatDateBtn' : 'addRepeatDateBtn',
            listId: isEdit ? 'editRepeatDatesList' : 'repeatDatesList',
            hintId: isEdit ? 'editRepeatDatesHint' : 'repeatDatesHint',
            weekdaysGroupId: isEdit ? 'editRepeatWeekdaysGroup' : 'repeatWeekdaysGroup',
            weekdayName: isEdit ? 'editRepeatWeekdays' : 'repeatWeekdays',
            datesKey: isEdit ? 'editRepeatExtraDates' : 'repeatExtraDates'
        };
    },

    getRepeatDates(mode = 'create') {
        const config = this.getRepeatFormConfig(mode);
        if (!Array.isArray(this[config.datesKey])) this[config.datesKey] = [];
        return this[config.datesKey];
    },

    setRepeatDates(mode = 'create', dates = []) {
        const config = this.getRepeatFormConfig(mode);
        this[config.datesKey] = [...new Set((dates || []).filter(Boolean))].sort().slice(0, 366);
    },

    syncRepeatBaseWeekday(mode = 'create', resetSelections = false) {
        const config = this.getRepeatFormConfig(mode);
        const dateValue = document.getElementById(config.dateId)?.value;
        const inputs = [...document.querySelectorAll(`input[name="${config.weekdayName}"]`)];
        inputs.forEach(input => {
            const wasBaseDay = input.dataset.repeatBaseDay === 'true';
            if (wasBaseDay) {
                input.disabled = false;
                delete input.dataset.repeatBaseDay;
                input.checked = false;
            } else if (resetSelections) {
                input.checked = false;
            }
        });
        if (!dateValue) return;
        const baseDay = new Date(`${dateValue}T00:00:00Z`).getUTCDay();
        const baseInput = inputs.find(input => Number(input.value) === baseDay);
        if (baseInput) {
            baseInput.checked = true;
            baseInput.disabled = true;
            baseInput.dataset.repeatBaseDay = 'true';
        }
    },

    getRepeatSelectedWeekdays(mode = 'create') {
        const config = this.getRepeatFormConfig(mode);
        return [...document.querySelectorAll(`input[name="${config.weekdayName}"]:checked`)]
            .map(input => Number(input.value))
            .filter(day => Number.isInteger(day) && day >= 0 && day <= 6);
    },

    handleAddRepeatDate(mode = 'create') {
        const config = this.getRepeatFormConfig(mode);
        const mainDate = document.getElementById(config.dateId)?.value;
        const extraInput = document.getElementById(config.extraInputId);
        const extraDate = extraInput?.value;
        const currentDates = this.getRepeatDates(mode);

        if (!mainDate) {
            this.showToast('Vui lòng chọn ngày học chính trước khi thêm ngày lặp lại.', 'error');
            return;
        }
        if (!extraDate) {
            this.showToast('Vui lòng chọn một ngày để thêm vào lịch lặp.', 'error');
            return;
        }
        if (extraDate <= mainDate) {
            this.showToast('Ngày lặp lại phải sau ngày học chính.', 'error');
            return;
        }
        if (currentDates.includes(extraDate)) {
            this.showToast('Ngày này đã có trong danh sách lặp lại.', 'error');
            return;
        }

        this.setRepeatDates(mode, [...currentDates, extraDate]);
        this.renderRepeatDatesChips(mode);
        if (extraInput) extraInput.value = '';
    },

    updateRepeatScheduleUI(mode = 'create') {
        const config = this.getRepeatFormConfig(mode);
        const frequency = document.getElementById(config.frequencyId)?.value || 'weekly';
        const custom = frequency === 'custom';
        const usesWeekdays = frequency === 'weekly' || frequency === 'monthly';
        const addRow = document.getElementById(config.extraRowId);
        const untilGroup = document.getElementById(config.untilGroupId);
        const weekdaysGroup = document.getElementById(config.weekdaysGroupId);
        const hint = document.getElementById(config.hintId);
        if (addRow) addRow.style.display = custom ? '' : 'none';
        if (untilGroup) untilGroup.style.display = custom ? 'none' : '';
        if (weekdaysGroup) weekdaysGroup.style.display = usesWeekdays ? '' : 'none';
        if (hint) {
            hint.textContent = custom
                ? 'Chọn từng ngày bất kỳ sau ngày học chính rồi bấm “Thêm ngày”.'
                : frequency === 'daily'
                    ? 'Chọn ngày kết thúc để tạo buổi học mỗi ngày. Tối đa 366 buổi.'
                    : `Chọn thêm các thứ muốn dạy và ngày kết thúc để tạo lịch ${frequency === 'monthly' ? 'theo tháng' : 'theo tuần'}.`;
        }
        this.setRepeatDates(mode, []);
        this.renderRepeatDatesChips(mode);
        this.syncRepeatBaseWeekday(mode);
        if (!custom) this.generateRepeatDates(mode);
    },

    generateRepeatDates(mode = 'create') {
        const config = this.getRepeatFormConfig(mode);
        const frequency = document.getElementById(config.frequencyId)?.value;
        if (!frequency || frequency === 'custom') return;
        const startValue = document.getElementById(config.dateId)?.value;
        const untilValue = document.getElementById(config.untilId)?.value;
        if (!startValue || !untilValue) {
            this.setRepeatDates(mode, []);
            this.renderRepeatDatesChips(mode);
            return;
        }
        if (untilValue <= startValue) {
            this.setRepeatDates(mode, []);
            this.renderRepeatDatesChips(mode);
            this.showToast('Ngày kết thúc lặp phải sau ngày học chính.', 'error');
            return;
        }

        const parse = value => new Date(`${value}T00:00:00Z`);
        const format = date => date.toISOString().slice(0, 10);
        const start = parse(startValue);
        const until = parse(untilValue);
        const dates = new Set();
        const addDate = date => {
            if (date > start && date <= until && dates.size < 366) dates.add(format(date));
        };

        if (frequency === 'daily') {
            const cursor = new Date(start);
            while (dates.size < 366) {
                cursor.setUTCDate(cursor.getUTCDate() + 1);
                if (cursor > until) break;
                addDate(new Date(cursor));
            }
        } else if (frequency === 'weekly') {
            const selectedDays = new Set(this.getRepeatSelectedWeekdays(mode));
            const cursor = new Date(start);
            while (dates.size < 366) {
                cursor.setUTCDate(cursor.getUTCDate() + 1);
                if (cursor > until) break;
                if (selectedDays.has(cursor.getUTCDay())) addDate(new Date(cursor));
            }
        } else if (frequency === 'monthly') {
            const selectedDays = this.getRepeatSelectedWeekdays(mode);
            const nthWeekdayOfMonth = (year, month, weekday, ordinal) => {
                const first = new Date(Date.UTC(year, month, 1));
                const firstMatch = 1 + ((weekday - first.getUTCDay() + 7) % 7);
                const day = firstMatch + (ordinal - 1) * 7;
                const candidate = new Date(Date.UTC(year, month, day));
                if (candidate.getUTCMonth() === month) return candidate;
                const last = new Date(Date.UTC(year, month + 1, 0));
                last.setUTCDate(last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7));
                return last;
            };
            selectedDays.forEach(weekday => {
                const anchor = new Date(start);
                anchor.setUTCDate(anchor.getUTCDate() + ((weekday - start.getUTCDay() + 7) % 7));
                addDate(new Date(anchor));
                const ordinal = Math.floor((anchor.getUTCDate() - 1) / 7) + 1;
                for (let monthOffset = 1; monthOffset <= 600 && dates.size < 366; monthOffset++) {
                    const first = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + monthOffset, 1));
                    const candidate = nthWeekdayOfMonth(first.getUTCFullYear(), first.getUTCMonth(), weekday, ordinal);
                    if (candidate > until) break;
                    addDate(candidate);
                }
            });
        }

        this.setRepeatDates(mode, [...dates]);
        this.renderRepeatDatesChips(mode);
    },

    renderRepeatDatesChips(mode = 'create') {
        const config = this.getRepeatFormConfig(mode);
        const list = document.getElementById(config.listId);
        if (!list) return;
        list.innerHTML = '';
        this.getRepeatDates(mode).forEach(dateStr => {
            const chip = document.createElement('span');
            chip.className = 'repeat-date-chip';
            const label = document.createElement('span');
            const weekdayLabels = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
            const weekday = weekdayLabels[new Date(`${dateStr}T00:00:00Z`).getUTCDay()];
            label.innerText = `${weekday} · ${this.formatDateVN(dateStr)}`;
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.setAttribute('aria-label', 'Xoá ngày lặp lại này');
            removeBtn.innerText = '✕';
            removeBtn.addEventListener('click', () => {
                this.setRepeatDates(mode, this.getRepeatDates(mode).filter(date => date !== dateStr));
                this.renderRepeatDatesChips(mode);
            });
            chip.appendChild(label);
            chip.appendChild(removeBtn);
            list.appendChild(chip);
        });
    },

    // Lấy buổi đang chọn và toàn bộ các buổi phía sau trong cùng chuỗi lặp.
    getFollowingRecurringSessions(session) {
        if (!session?.recurrenceGroupId || session.recurrenceSequence === null || session.recurrenceSequence === undefined) return [];
        return this.sessions
            .filter(item => item.recurrenceGroupId === session.recurrenceGroupId
                && Number(item.recurrenceSequence) >= Number(session.recurrenceSequence))
            .sort((a, b) => Number(a.recurrenceSequence) - Number(b.recurrenceSequence));
    },

    requestRecurrenceScope(session, actionLabel) {
        const following = this.getFollowingRecurringSessions(session);
        if (following.length <= 1) return Promise.resolve('single');
        if (this._recurrenceScopeResolver) {
            this._recurrenceScopeResolver(null);
            this._recurrenceScopeResolver = null;
        }

        const title = document.getElementById('recurrenceScopeTitle');
        const message = document.getElementById('recurrenceScopeMessage');
        const followingButton = document.getElementById('recurrenceScopeFollowingBtn');
        if (title) title.innerText = `${actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)} lịch lặp lại`;
        if (message) message.innerText = `Buổi này thuộc một chuỗi lặp. Bạn muốn ${actionLabel} riêng buổi này hay áp dụng cho buổi này và các buổi lặp lại phía sau?`
            + (actionLabel === 'xóa' ? ' Sau khi chọn, bạn vẫn có 7 giây để hoàn tác.' : '');
        if (followingButton) followingButton.innerText = `Buổi này và ${following.length - 1} buổi sau`;
        this.openModal('recurrenceScopeModal');

        return new Promise(resolve => {
            this._recurrenceScopeResolver = resolve;
        });
    },

    resolveRecurrenceScope(scope) {
        this.closeModal('recurrenceScopeModal');
        const resolve = this._recurrenceScopeResolver;
        this._recurrenceScopeResolver = null;
        if (resolve) resolve(scope === 'following' || scope === 'single' ? scope : null);
    },

    async createRepeatedSessions(baseSession, extraDates) {
        // Server kiểm tra trùng lịch và lưu toàn bộ chuỗi trong một giao dịch.
        // Chỉ cần một ngày bị trùng thì không buổi nào trong chuỗi được tạo.
        const response = await this.authFetch(`${API_BASE_URL}/api/sessions/batch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ baseSession, repeatDates: extraDates })
        });
        return this.requireApiSuccess(response, 'Không thể tạo chuỗi lịch lặp.');
    },

    prepareEditRepeatForm(session) {
        this.setRepeatDates('edit', []);
        this.renderRepeatDatesChips('edit');
        const toggle = document.getElementById('editSessionRepeatToggle');
        const toggleText = document.getElementById('editSessionRepeatToggleText');
        const panel = document.getElementById('editRepeatDatesPanel');
        const existingHint = document.getElementById('editRepeatExistingHint');
        const frequency = document.getElementById('editRepeatFrequency');
        const until = document.getElementById('editRepeatUntilDate');
        const isRecurring = !!session?.recurrenceGroupId;
        if (toggle) {
            toggle.checked = isRecurring;
            toggle.disabled = isRecurring;
        }
        if (toggleText) toggleText.innerText = isRecurring ? 'Buổi này đang thuộc lịch lặp' : 'Lặp lại buổi học này';
        if (existingHint) existingHint.hidden = !isRecurring;
        if (panel) panel.style.display = 'none';
        if (frequency) frequency.value = 'weekly';
        if (until) until.value = '';
        this.syncRepeatBaseWeekday('edit', true);
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
                const absoluteMinutes = Math.min((HOUR_START * 60) + mins, (24 * 60) - 1);
                const h = Math.floor(absoluteMinutes / 60);
                const m = absoluteMinutes % 60;
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
        this.resetSessionLoggerForm();
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
        const type = checkedBoxes.length > 1 ? 'chung' : 'riêng';
        document.getElementById('sessionType').value = type;

        const overlap = this.findOverlappingSession(date, startTime, endTime);
        if (overlap) {
            this.showToast(this.formatSessionConflictMessage(date, startTime, endTime, overlap), 'error');
            return;
        }

        const studentIds = [];
        checkedBoxes.forEach(cb => studentIds.push(cb.value));

        // Học chung: tổng thu = đơn giá/học sinh x SỐ HỌC SINH CÓ ĐÓNG HỌC PHÍ
        // (loại trừ học sinh học phí cơ bản = 0đ khỏi phép nhân). Học riêng:
        // giữ nguyên đơn giá đã nhập (đã tự = 0 nếu học sinh đó học phí 0đ).
        // Chốt số tiền từng học sinh ngay khi tạo buổi. BasePrice chỉ quyết định
        // buổi MỚI có thu hay miễn phí, không được dùng để tính lại buổi cũ.
        const studentDetails = {};
        studentIds.forEach(stId => {
            const student = this.students.find(s => s.id === stId);
            const feeAmount = student && Number(student.basePrice) > 0 ? unitPrice : 0;
            studentDetails[stId] = {
                homework: null,
                attitude: "",
                individualComment: "",
                note: "",
                feeAmount,
                paid: feeAmount <= 0
            };
        });
        const price = Object.values(studentDetails).reduce((sum, detail) => sum + Number(detail.feeAmount || 0), 0);

        const repeatToggleEl = document.getElementById('sessionRepeatToggle');
        if (repeatToggleEl?.checked && this.repeatExtraDates.length === 0) {
            const frequency = document.getElementById('repeatFrequency')?.value;
            this.showToast(frequency === 'custom'
                ? 'Hãy thêm ít nhất một ngày lặp lại tùy chỉnh.'
                : 'Hãy chọn ngày kết thúc và ít nhất một ngày lặp lại.', 'error');
            return;
        }
        if (repeatToggleEl?.checked) {
            for (const repeatDate of this.repeatExtraDates) {
                const repeatOverlap = this.findOverlappingSession(repeatDate, startTime, endTime);
                if (repeatOverlap) {
                    this.showToast(this.formatSessionConflictMessage(repeatDate, startTime, endTime, repeatOverlap), 'error');
                    return;
                }
            }
        }
        const recurrenceGroupId = repeatToggleEl?.checked && this.repeatExtraDates.length > 0
            ? "rec_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8)
            : null;

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
            studentDetails,
            recurrenceGroupId,
            recurrenceSequence: recurrenceGroupId ? 0 : null
        };

        const isRecurring = !!(repeatToggleEl?.checked && this.repeatExtraDates.length > 0);
        let createdCount = 1;
        this.setBtnLoading('saveSessionBtn', true, 'Đang lưu...');
        try {
            if (isRecurring) {
                const result = await this.createRepeatedSessions(newSession, this.repeatExtraDates);
                createdCount = Number(result?.createdCount || (this.repeatExtraDates.length + 1));
            } else {
                const response = await this.authFetch(`${API_BASE_URL}/api/sessions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newSession)
                });
                await this.requireApiSuccess(response, 'Không thể tạo buổi học mới.');
            }
            await this.loadData();
        } catch (err) {
            this.showToast(err.message || 'Không thể tạo buổi học mới.', 'error');
            return;
        } finally {
            this.setBtnLoading('saveSessionBtn', false);
        }

        this.resetSessionLoggerForm();
        this.closeModal('createSessionModal');
        this.showToast(isRecurring ? `Đã tạo ${createdCount} buổi trong lịch lặp.` : 'Đã ghi nhận buổi học mới thành công!', 'success');
    },

    // Đưa form "Ghi Buổi Học Mới" về trạng thái mặc định ban đầu (ngày = hôm
    // nay, giá tiền mặc định, bỏ chọn học sinh, xoá danh sách ngày lặp lại...).
    // Dùng chung sau khi lưu thành công VÀ khi mở modal thủ công bằng nút
    // "+ Ghi buổi học mới" để luôn bắt đầu từ 1 form sạch.
    resetSessionLoggerForm() {
        document.getElementById('sessionLoggerForm').reset();
        this.syncSessionTypeChoice('session');
        delete document.getElementById('sessionPrice').dataset.userEdited;
        const today = this.toISODateOnly(new Date());
        document.getElementById('sessionDate').value = today;
        this.syncRepeatBaseWeekday('create', true);
        this.renderStudentSelectionGrid('studentsCheckboxGrid');

        // Reset trạng thái "Lặp lại buổi học"
        this.repeatExtraDates = [];
        this.renderRepeatDatesChips();
        const repeatToggleEl = document.getElementById('sessionRepeatToggle');
        if (repeatToggleEl) repeatToggleEl.checked = false;
        const repeatPanelEl = document.getElementById('repeatDatesPanel');
        if (repeatPanelEl) repeatPanelEl.style.display = 'none';
        const repeatFrequencyEl = document.getElementById('repeatFrequency');
        if (repeatFrequencyEl) repeatFrequencyEl.value = 'weekly';
        const repeatUntilEl = document.getElementById('repeatUntilDate');
        if (repeatUntilEl) repeatUntilEl.value = '';
    },

    // 3. Edit Session Modal triggers
    openEditSessionModal(sessionId) {
        const sess = this.sessions.find(x => x.id === sessionId);
        if (!sess) return;

        document.getElementById('editSessionId').value = sess.id;
        document.getElementById('editSessionType').value = sess.type;
        this.syncSessionTypeChoice('editSession');
        document.getElementById('editSessionName').value = sess.sessionName || '';
        document.getElementById('editSessionDate').value = sess.date;
        document.getElementById('editSessionStartTime').value = sess.startTime;
        document.getElementById('editSessionEndTime').value = sess.endTime;
        document.getElementById('editSessionHours').value = sess.duration;
        // sess.price được lưu là TỔNG thu của buổi học (đã loại trừ học sinh 0đ);
        // với học chung cần chia lại theo SỐ HỌC SINH CÓ ĐÓNG HỌC PHÍ để ra đúng
        // đơn giá/học sinh hiển thị trong ô nhập liệu.
        const editPriceEl = document.getElementById('editSessionPrice');
        const snapshottedFee = Object.values(sess.studentDetails || {})
            .map(detail => Number(detail.feeAmount))
            .find(amount => Number.isFinite(amount) && amount > 0);
        const payingCount = Math.max(this.getPayingStudentIds(sess).length, 1);
        this.setPriceSelectValue(editPriceEl, snapshottedFee || (sess.type === 'chung' ? Math.round(sess.price / payingCount) : sess.price));
        editPriceEl.dataset.originalUnitPrice = String(this.parsePriceValue(editPriceEl.value));
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
        this.prepareEditRepeatForm(sess);
        this.openModal('editSessionModal');
    },

    async handleEditSession() {
        const id = document.getElementById('editSessionId').value;
        const sess = this.sessions.find(x => x.id === id);
        if (!sess) return;

        const sessionName = document.getElementById('editSessionName').value.trim();
        const date = document.getElementById('editSessionDate').value;
        const startTime = document.getElementById('editSessionStartTime').value;
        const endTime = document.getElementById('editSessionEndTime').value;
        const duration = parseFloat(document.getElementById('editSessionHours').value) || 2.0;
        const unitPrice = this.parsePriceValue(document.getElementById('editSessionPrice').value);
        const originalUnitPrice = Number(document.getElementById('editSessionPrice').dataset.originalUnitPrice);
        const priceWasChanged = Number.isFinite(originalUnitPrice) && unitPrice !== originalUnitPrice;
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
        const type = checkedBoxes.length > 1 ? 'chung' : 'riêng';
        document.getElementById('editSessionType').value = type;

        const editRepeatToggle = document.getElementById('editSessionRepeatToggle');
        const createRepeatDates = !sess.recurrenceGroupId && editRepeatToggle?.checked
            ? [...this.getRepeatDates('edit')]
            : [];
        if (!sess.recurrenceGroupId && editRepeatToggle?.checked && createRepeatDates.length === 0) {
            const frequency = document.getElementById('editRepeatFrequency')?.value;
            this.showToast(frequency === 'custom'
                ? 'Hãy thêm ít nhất một ngày lặp lại tùy chỉnh.'
                : 'Hãy chọn ngày kết thúc và ít nhất một ngày lặp lại.', 'error');
            return;
        }

        const updateScope = await this.requestRecurrenceScope(sess, 'sửa');
        if (!updateScope) return;

        // Khi sửa cả chuỗi, một vị trí mới có thể đang trùng với chính buổi kế
        // tiếp trong chuỗi ở vị trí cũ. Server sẽ dịch cả chuỗi trong một giao
        // dịch nên bỏ qua trường hợp đó; mọi xung đột bên ngoài vẫn bị chặn.
        const overlap = this.findOverlappingSession(date, startTime, endTime, id);
        const overlapMovesTogether = updateScope === 'following'
            && overlap?.recurrenceGroupId === sess.recurrenceGroupId
            && Number(overlap.recurrenceSequence) >= Number(sess.recurrenceSequence);
        if (overlap && !overlapMovesTogether) {
            this.showToast(this.formatSessionConflictMessage(date, startTime, endTime, overlap), 'error');
            return;
        }
        for (const repeatDate of createRepeatDates) {
            const repeatOverlap = this.findOverlappingSession(repeatDate, startTime, endTime, id);
            if (repeatOverlap) {
                this.showToast(this.formatSessionConflictMessage(repeatDate, startTime, endTime, repeatOverlap), 'error');
                return;
            }
        }

        const studentIds = [];
        checkedBoxes.forEach(cb => studentIds.push(cb.value));
        const originalStudentIds = [...(sess.studentIds || [])].sort();
        const editedStudentIds = [...studentIds].sort();
        const rosterWasChanged = originalStudentIds.length !== editedStudentIds.length
            || originalStudentIds.some((studentId, index) => studentId !== editedStudentIds[index]);
        const pricingChanged = priceWasChanged || rosterWasChanged || type !== sess.type;

        // Học chung: tổng thu = đơn giá/học sinh x SỐ HỌC SINH CÓ ĐÓNG HỌC PHÍ
        // (loại trừ học sinh học phí cơ bản = 0đ khỏi phép nhân), giống lúc tạo mới.
        // Sửa một buổi học chỉ cập nhật tiền của các khoản CHƯA thu. Khoản đã thu
        // giữ nguyên snapshot để khớp với chứng từ thanh toán đã tạo.
        const newStudentDetails = {};
        studentIds.forEach(stId => {
            const oldDetail = sess.studentDetails[stId] || {};
            const student = this.students.find(s => s.id === stId);
            const oldFee = Number(oldDetail.feeAmount);
            const feeAmount = Number.isFinite(oldFee) && (oldDetail.paid || !priceWasChanged)
                ? oldFee
                : (student && Number(student.basePrice) > 0 ? unitPrice : 0);
            newStudentDetails[stId] = {
                homework: oldDetail.homework ?? null,
                attitude: oldDetail.attitude || "",
                individualComment: oldDetail.individualComment || "",
                note: oldDetail.note || "",
                paid: feeAmount <= 0 || !!oldDetail.paid,
                feeAmount
            };
        });
        const price = Object.values(newStudentDetails).reduce((sum, detail) => sum + Number(detail.feeAmount || 0), 0);

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
            pricingChanged,
            repriceExistingFees: priceWasChanged,
            updateScope,
            createRepeatDates,
            studentDetails: newStudentDetails
        };

        let editResult = null;
        this.setBtnLoading('saveEditSessionBtn', true, 'Đang lưu...');
        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/sessions/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedSession)
            });
            editResult = await this.requireApiSuccess(res, 'Không thể sửa buổi học.');
            await this.loadData();
        } catch (err) {
            this.showToast(err.message || 'Không thể sửa buổi học.', 'error');
            return;
        } finally {
            this.setBtnLoading('saveEditSessionBtn', false);
        }

        this.closeModal('editSessionModal');
        const createdCount = Number(editResult?.createdCount || 0);
        this.showToast(createdCount > 0 ? `Đã sửa buổi học và tạo thêm ${createdCount} buổi lặp.` : 'Đã sửa lịch học thành công!', 'success');
    },

    async deleteSession(id) {
        if (this.currentRole !== 'teacher') {
            this.showToast("Chỉ Giáo viên mới có quyền xóa buổi học!", "error");
            return;
        }
        const session = this.sessions.find(item => item.id === id);
        if (!session) return;

        let deleteScope = 'single';
        const following = this.getFollowingRecurringSessions(session);
        if (following.length > 1) {
            deleteScope = await this.requestRecurrenceScope(session, 'xóa');
            if (!deleteScope) return;
        } else if (!confirm('Xóa buổi học này? Bạn có 7 giây để hoàn tác.')) {
            return;
        }

        const deletionCount = deleteScope === 'following' ? following.length : 1;
        const label = deletionCount > 1 ? `${deletionCount} buổi học lặp lại` : 'Buổi học';
        this.queueDeletion(label, () => this.commitDeleteSession(id, deleteScope));
    },

    async commitDeleteSession(id, deleteScope = 'single') {
        const query = deleteScope === 'following' ? '?scope=following' : '';
        const res = await this.authFetch(`${API_BASE_URL}/api/sessions/${id}${query}`, { method: 'DELETE' });
        const result = await this.requireApiSuccess(res, 'Không thể xóa buổi học.');
        await this.runDeletionRefresh(() => this.loadData());
        this.showToast(result?.message || "Đã xóa buổi học thành công.", "success");
    },

    // Chuyển trạng thái học phí (Đã thanh toán <-> Chưa thanh toán) cho TẤT CẢ
    // buổi học của 1 học sinh. Hoàn toàn tách biệt với trạng thái "đã dạy" —
    // dùng field Paid riêng, không còn dùng chung với Completed nữa.
    openMonthlyPaymentModal(studentId) {
        if (this.currentRole !== 'teacher' || !this.currentMonthFilter) {
            this.showToast('Hãy chọn đúng tháng học phí trước khi thanh toán.', 'error');
            return;
        }
        const student = this.students.find(s => s.id === studentId);
        if (!student) return;
        const dueAmount = this.getTuitionPeriodBreakdown(this.sessions, studentId).unpaidTuition;
        if (dueAmount <= 0) {
            this.showToast('Đến kỳ này không còn học phí cần thu.', 'info');
            return;
        }
        const [year, month] = this.currentMonthFilter.split('-');
        const period = `${year}-${String(month).padStart(2, '0')}`;
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        document.getElementById('monthlyPaymentStudentId').value = studentId;
        document.getElementById('monthlyPaymentMonth').value = period;
        document.getElementById('monthlyPaymentAmountRaw').value = String(Math.round(dueAmount));
        document.getElementById('monthlyPaymentStudentName').innerText = `${student.name} — tháng ${Number(month)}/${year}`;
        document.getElementById('monthlyPaymentAmount').innerText = this.formatVND(dueAmount);
        document.getElementById('monthlyPaymentDate').value = today;
        document.getElementById('monthlyPaymentMethod').value = 'Tiền mặt';
        document.getElementById('monthlyPaymentNote').value = '';
        this.openModal('monthlyPaymentModal');
    },

    async submitMonthlyPayment() {
        const studentId = document.getElementById('monthlyPaymentStudentId').value;
        const month = document.getElementById('monthlyPaymentMonth').value;
        const amount = Number(document.getElementById('monthlyPaymentAmountRaw').value);
        const paymentDate = document.getElementById('monthlyPaymentDate').value;
        const method = document.getElementById('monthlyPaymentMethod').value;
        const note = document.getElementById('monthlyPaymentNote').value.trim();
        if (!studentId || !month || !paymentDate || !Number.isFinite(amount) || amount <= 0) {
            this.showToast('Thiếu thông tin thanh toán.', 'error');
            return;
        }
        this.setBtnLoading('monthlyPaymentSubmitBtn', true, 'Đang lưu...');
        try {
            const res = await this.authFetch(`${API_BASE_URL}/api/students/${studentId}/monthly-payments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month, amount, paymentDate, method, note })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Không thể lưu thanh toán.');
            this.closeModal('monthlyPaymentModal');
            await this.loadData();
            this.showToast(`Đã ghi nhận ${this.formatVND(data.amount || amount)} cho tháng ${month}.`, 'success');
        } catch (err) {
            this.showToast(err.message || 'Không thể lưu thanh toán.', 'error');
        } finally {
            this.setBtnLoading('monthlyPaymentSubmitBtn', false);
        }
    },

    async setStudentPaidStatus(studentId, paid) {
        if (this.currentRole !== 'teacher') {
            this.showToast("Chỉ Giáo viên mới có quyền cập nhật học phí!", "error");
            this.renderTuitionOverview();
            return;
        }

        // Không còn cho phép cập nhật hàng loạt tất cả tháng. Dropdown cũ chỉ
        // là lối vào tương thích: chọn "Đã thanh toán" sẽ mở phiếu thu của kỳ
        // đang lọc; chọn ngược lại không xóa chứng từ đã tạo.
        if (!this.currentMonthFilter) {
            this.showToast('Hãy chọn một tháng học phí trước khi thanh toán.', 'error');
            this.renderTuitionOverview();
            return;
        }
        if (paid) {
            this.openMonthlyPaymentModal(studentId);
        } else {
            this.showToast('Không thể bỏ trạng thái bằng thao tác nhanh vì cần giữ lịch sử đối soát.', 'info');
        }
        this.renderTuitionOverview();
        return;
    }
});

// ================================================================
// STUDENT-PICKERS.JS — Lưới chọn học sinh, quy tắc loại buổi học & học phí
// ================================================================
Object.assign(PinkyClassApp.prototype, {
    populateStudentPickers() {
        const globalPicker = document.getElementById('globalStudentPicker');
        const scoreFilterStudent = document.getElementById('scoreFilterStudent');
        const previousScoreFilter = scoreFilterStudent?.value || '';
        globalPicker.innerHTML = '';
        if (scoreFilterStudent) {
            scoreFilterStudent.innerHTML = this.currentRole === 'student'
                ? ''
                : '<option value="">Tất cả học sinh</option>';
        }

        this.students.forEach(st => {
            const opt = document.createElement('option');
            opt.value = st.id;
            opt.innerText = `${st.name} (${st.class})`;
            globalPicker.appendChild(opt);

            if (scoreFilterStudent) scoreFilterStudent.appendChild(opt.cloneNode(true));
        });

        if (this.students.length > 0) {
            // Restore selection if exists
            if (this.students.find(s => s.id === this.currentStudentId)) {
                globalPicker.value = this.currentStudentId;
            } else {
                this.currentStudentId = this.students[0].id;
                globalPicker.value = this.currentStudentId;
            }
            if (scoreFilterStudent) {
                const desiredScoreFilter = this.currentRole === 'student'
                    ? this.currentStudentId
                    : previousScoreFilter;
                scoreFilterStudent.value = [...scoreFilterStudent.options].some(option => option.value === desiredScoreFilter)
                    ? desiredScoreFilter
                    : '';
            }
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
    // preselectedIds: mảng id học sinh cần tick sẵn (chỉ dùng khi mở modal Sửa
    // buổi học); để null/không truyền thì form tạo mới không chọn sẵn học sinh nào.
    renderStudentSelectionGrid(containerId, preselectedIds = null) {
        const prefix = containerId === 'studentsCheckboxGrid' ? 'session' : 'editSession';
        const grid = document.getElementById(containerId);
        if (!grid) return;
        grid.innerHTML = '';

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

                const shouldCheck = Array.isArray(preselectedIds) && preselectedIds.includes(st.id);
                if (shouldCheck) {
                    checkbox.checked = true;
                    anyCheckedInGroup = true;
                }

                checkbox.addEventListener('change', () => {
                    // Học sinh vừa đổi -> cho phép gợi ý lại học phí cơ bản của
                    // học sinh MỚI (xóa cờ "người dùng đã tự sửa" của lần chọn trước).
                    const priceInputId = prefix === 'session' ? 'sessionPrice' : 'editSessionPrice';
                    const priceEl = document.getElementById(priceInputId);
                    if (priceEl) delete priceEl.dataset.userEdited;
                    selectAllCheckbox.checked = Array.from(body.querySelectorAll('input[type="checkbox"]')).every(cb => cb.checked);
                    this.syncSessionTypeFromSelection(prefix);
                    this.updateSessionNameFromSelectedClasses(prefix);
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
                body.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = selectAllCheckbox.checked; });
                const priceInputId = prefix === 'session' ? 'sessionPrice' : 'editSessionPrice';
                const priceEl = document.getElementById(priceInputId);
                if (priceEl) delete priceEl.dataset.userEdited;
                this.syncSessionTypeFromSelection(prefix);
                this.updateSessionNameFromSelectedClasses(prefix);
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

        this.syncSessionTypeFromSelection(prefix);
        this.updateSessionNameFromSelectedClasses(prefix);
    },

    // Khi giáo viên tick đủ học sinh của một lớp, gợi ý tên ca theo môn + khối
    // (ví dụ "Toán 6"). Không ghi đè tên mà giáo viên đã tự nhập.
    updateSessionNameFromSelectedClasses(prefix) {
        const gridId = prefix === 'session' ? 'studentsCheckboxGrid' : 'editStudentsCheckboxGrid';
        const inputId = prefix === 'session' ? 'sessionName' : 'editSessionName';
        const grid = document.getElementById(gridId);
        const input = document.getElementById(inputId);
        if (!grid || !input) return;

        const fullClasses = Array.from(grid.querySelectorAll('.student-class-group')).map(group => {
            const checkboxes = Array.from(group.querySelectorAll('.student-check-item input[type="checkbox"]'));
            if (!checkboxes.length || !checkboxes.every(checkbox => checkbox.checked)) return null;
            const className = group.querySelector('.student-class-name')?.textContent.trim() || '';
            const classNumber = className.replace(/^lớp\s*/i, '').trim();
            const classStudents = this.students.filter(student => String(student.class || '').trim() === className);
            const subject = classStudents.map(student => String(student.subject || '').trim()).find(Boolean) || 'Toán';
            return `${subject} ${classNumber}`.trim();
        }).filter(Boolean);

        const suggestion = fullClasses.join(', ');
        const currentValue = input.value.trim();
        const previousSuggestion = input.dataset.autoClassName || '';
        if (!currentValue || currentValue === previousSuggestion) input.value = suggestion;
        input.dataset.autoClassName = suggestion;
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

    // Tự xác định loại buổi theo số học sinh: 1 em là học riêng, từ 2 em là
    // học chung. Giá trị này vẫn được lưu để tương thích dữ liệu cũ.
    syncSessionTypeFromSelection(prefix) {
        const typeSelectId = prefix === 'session' ? 'sessionType' : 'editSessionType';
        const gridName = prefix === 'session' ? 'sessionStudents' : 'editSessionStudents';
        const typeEl = document.getElementById(typeSelectId);
        if (!typeEl) return;
        const checkedCount = document.querySelectorAll(`input[name="${gridName}"]:checked`).length;
        typeEl.value = checkedCount > 1 ? 'chung' : 'riêng';
        this.applySessionTypeRules(prefix);
    },

    syncSessionTypeChoice(prefix) {
        const selectId = prefix === 'session' ? 'sessionType' : 'editSessionType';
        const choiceName = prefix === 'session' ? 'sessionTypeChoice' : 'editSessionTypeChoice';
        const selected = document.querySelector(`input[name="${choiceName}"][value="${document.getElementById(selectId).value}"]`);
        document.querySelectorAll(`input[name="${choiceName}"]`).forEach(radio => {
            radio.checked = radio === selected;
        });
    },

    applySessionTypeRules(prefix) {
        const typeSelectId = prefix === 'session' ? 'sessionType' : 'editSessionType';
        const gridId = prefix === 'session' ? 'studentsCheckboxGrid' : 'editStudentsCheckboxGrid';
        const priceLabelId = prefix === 'session' ? 'sessionPriceLabel' : 'editSessionPriceLabel';
        const isGroup = document.getElementById(typeSelectId).value === 'chung';

        const priceLabel = document.getElementById(priceLabelId);
        if (priceLabel) {
            priceLabel.innerText = isGroup ? 'Đơn giá buổi học (VNĐ/học sinh)' : 'Học phí buổi học (VNĐ)';
        }

        document.querySelectorAll(`#${gridId} .select-all-class-checkbox`).forEach(cb => {
            cb.disabled = false;
        });

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
