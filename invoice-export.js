// ==========================================================================
// invoice-export.js
// --------------------------------------------------------------------------
// Toàn bộ logic liên quan tới "Xuất phiếu học phí" được tách riêng ra khỏi
// app.js để dễ sửa/đọc hơn (trước đây nằm lẫn trong class PinkyClassApp).
//
// Cách hoạt động: file này gắn thêm các phương thức bên dưới vào
// PinkyClassApp.prototype bằng Object.assign, nên bên trong các hàm `this`
// vẫn chính là instance `app` như khi code còn nằm trong app.js — không cần
// sửa gì thêm ở những chỗ gọi this.openInvoiceModal(...), this.exportInvoice()...
//
// LƯU Ý: file này PHẢI được nạp (thẻ <script>) SAU app.js (để class
// PinkyClassApp đã tồn tại) và TRƯỚC dòng `const app = new PinkyClassApp();`
// không bắt buộc nữa vì Object.assign chỉ đụng vào prototype — chỉ cần nạp
// sau khi class PinkyClassApp được định nghĩa xong.
//
// Các hàm dùng chung với phần khác (vd. ensureHtml2Canvas dùng chung với xuất
// ảnh Nhật ký học tập) vẫn để nguyên trong app.js, ở đây chỉ gọi lại qua
// this.ensureHtml2Canvas(...).
// ==========================================================================

Object.assign(PinkyClassApp.prototype, {

    // Bấm nút "Xuất phiếu" ở 1 dòng học sinh trong bảng Học phí -> tự động
    // truyền sẵn thông tin học sinh + số liệu học phí của chính em đó vào form,
    // giáo viên chỉ cần nhập thêm phần nhận xét rồi bấm "Xuất phiếu".
    openInvoiceModal(studentId) {
        const st = this.students.find(s => s.id === studentId);
        if (!st) return;

        // Lưu TOÀN BỘ buổi học của học sinh này (không giới hạn theo bộ lọc
        // tháng/năm toàn cục) để người dùng có thể tự do chọn khoảng "Từ ngày
        // - Đến ngày" rộng hơn hoặc hẹp hơn tháng đang xem. Việc tính toán số
        // buổi/học phí/giờ học thực tế sẽ luôn dựa trên khoảng ngày này thông
        // qua recomputeInvoiceTotals(), CHỨ KHÔNG cố định tại thời điểm mở modal
        // (trước đây "Từ ngày/Đến ngày" chỉ hiển thị cho có, sửa không có tác
        // dụng gì tới số liệu thực tế xuất ra).
        this._invoiceStudentId = studentId;
        this._invoiceAllSessions = this.sessions
            .filter(sess => sess.studentIds.includes(studentId))
            .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

        document.getElementById('invoiceStudentId').value = studentId;
        document.getElementById('invoiceStudentName').innerText = st.name;
        document.getElementById('invoiceStudentClass').innerText = `${st.class} - ${st.subject}`;

        // Điền sẵn khoảng ngày = ngày buổi đầu tiên -> buổi cuối cùng (toàn bộ
        // lịch sử); người dùng có thể thu hẹp lại tùy kỳ muốn xuất phiếu.
        if (this._invoiceAllSessions.length > 0) {
            document.getElementById('invoiceFromDate').value = this._invoiceAllSessions[0].date;
            document.getElementById('invoiceToDate').value = this._invoiceAllSessions[this._invoiceAllSessions.length - 1].date;
        } else {
            document.getElementById('invoiceFromDate').value = '';
            document.getElementById('invoiceToDate').value = '';
        }

        // Điền sẵn tiêu đề kỳ học dựa trên (các) tháng có buổi học, ví dụ "5+6/2026"
        const monthsSet = new Set();
        let sampleYear = new Date().getFullYear();
        this._invoiceAllSessions.forEach(sess => {
            const parts = String(sess.date).split('-'); // yyyy-mm-dd
            if (parts.length >= 2) {
                monthsSet.add(parseInt(parts[1]));
                sampleYear = parseInt(parts[0]);
            }
        });
        const monthsList = Array.from(monthsSet).sort((a, b) => a - b);
        const titleMonths = monthsList.length > 0 ? monthsList.join('+') : (new Date().getMonth() + 1);
        document.getElementById('invoiceTitle').value = `HỌC PHÍ THÁNG ${titleMonths}/${sampleYear}`;

        // Tên GV điền sẵn từ tài khoản đang đăng nhập, SĐT để trống tự nhập
        document.getElementById('invoiceTeacherName').value = (this.currentUser && this.currentUser.name) || '';
        document.getElementById('invoiceTeacherPhone').value = '';

        // Các trường nhận xét để trống, giáo viên tự viết cho từng kỳ
        document.getElementById('invoiceOverview').value = '';
        document.getElementById('invoiceAlgebra').value = '';
        document.getElementById('invoiceGeometry').value = '';
        document.getElementById('invoiceRoadmap').value = '';
        document.getElementById('invoiceSchedule').value = '';
        document.getElementById('invoiceTuitionNote').value = '';

        // Ảnh QR thanh toán: tự động điền lại ảnh QR đã dùng lần gần nhất (lưu
        // trong localStorage) để giáo viên KHÔNG phải tải lên lại mỗi lần xuất
        // phiếu — vẫn có thể đổi/xoá ảnh khác ngay trong form nếu cần.
        this.setInvoiceQrImage(localStorage.getItem('nttclass_invoice_qr') || null, { persist: false });

        this.recomputeInvoiceTotals();
        this.openModal('invoiceModal');
    },

    // Gán/xoá ảnh QR thanh toán đang dùng cho phiếu học phí + cập nhật khung
    // xem trước trong form. Mặc định lưu lại vào localStorage (persist=true)
    // để lần xuất phiếu tiếp theo tự điền sẵn, trừ khi gọi lúc mở modal (chỉ
    // đọc lại giá trị đã lưu, không ghi đè).
    setInvoiceQrImage(dataUrl, { persist = true } = {}) {
        this._invoiceQrDataUrl = dataUrl || null;

        const wrap = document.getElementById('qrUploadPreviewWrap');
        const preview = document.getElementById('qrUploadPreview');
        const label = document.getElementById('qrUploadLabel');
        const input = document.getElementById('invoiceQrInput');

        if (this._invoiceQrDataUrl) {
            preview.src = this._invoiceQrDataUrl;
            wrap.style.display = '';
            label.style.display = 'none';
        } else {
            preview.src = '';
            wrap.style.display = 'none';
            label.style.display = '';
            if (input) input.value = '';
        }

        if (persist) {
            if (this._invoiceQrDataUrl) {
                try { localStorage.setItem('nttclass_invoice_qr', this._invoiceQrDataUrl); }
                catch (err) { /* ảnh quá lớn cho localStorage, bỏ qua lưu tự động */ }
            } else {
                localStorage.removeItem('nttclass_invoice_qr');
            }
        }
    },

    // Lọc this._invoiceAllSessions theo đúng khoảng "Từ ngày - Đến ngày" hiện
    // đang nhập trong modal, rồi cập nhật lại các ô tổng học phí/đã đóng/còn
    // nợ/số buổi/số giờ NGAY LẬP TỨC — đảm bảo những gì hiển thị luôn khớp với
    // những gì sẽ được xuất ra phiếu (gọi lại đúng hàm này trong exportInvoice()).
    recomputeInvoiceTotals() {
        const studentId = this._invoiceStudentId;
        const fromVal = document.getElementById('invoiceFromDate').value;
        const toVal = document.getElementById('invoiceToDate').value;

        const sessions = (this._invoiceAllSessions || []).filter(sess => {
            if (fromVal && sess.date < fromVal) return false;
            if (toVal && sess.date > toVal) return false;
            // Chỉ tính các buổi ĐÃ THỰC SỰ DIỄN RA vào phiếu học phí — buổi
            // học lên lịch trong tương lai (dù nằm trong khoảng ngày đã chọn)
            // sẽ không được cộng vào số buổi/số giờ/tiền học phí của phiếu.
            if (!this.isSessionCompleted(sess)) return false;
            return true;
        });

        let totalFee = 0, paidFee = 0, totalHours = 0;
        sessions.forEach(sess => {
            totalHours += parseFloat(sess.duration) || 0;
            // Học sinh học phí 0đ không đóng góp gì vào tổng học phí của phiếu.
            const portion = this.getStudentSessionFee(sess, studentId);
            if (portion <= 0) return;
            totalFee += portion;
            const detail = sess.studentDetails && sess.studentDetails[studentId];
            if (detail && detail.paid) paidFee += portion;
        });
        const unpaidFee = totalFee - paidFee;

        document.getElementById('invoiceTotalFee').innerText = this.formatVND(totalFee);
        document.getElementById('invoicePaidFee').innerText = this.formatVND(paidFee);
        document.getElementById('invoiceUnpaidFee').innerText = this.formatVND(unpaidFee);
        document.getElementById('invoiceSessionCount').innerText = sessions.length;
        document.getElementById('invoiceTotalHours').innerText = `${totalHours.toFixed(1)} giờ`;

        // Cache lại danh sách ĐÃ LỌC để exportInvoice() dùng lại chính xác,
        // không cần lọc lại lần nữa (và không có nguy cơ lệch số liệu).
        this._invoiceSessionsCache = sessions;
        return sessions;
    },

    // Render phiếu học phí ra 1 file ẢNH (PNG) chất lượng cao, dựa trên dữ
    // liệu đã điền sẵn + phần nhận xét giáo viên vừa nhập thêm trong form.
    // Trước đây mở cửa sổ mới rồi gọi window.print() (xuất PDF qua hộp thoại
    // in của trình duyệt); nay dựng phiếu trong 1 khung ẩn ngay trên trang,
    // đợi font/ảnh QR tải xong rồi dùng html2canvas chụp lại thành ảnh và tải
    // xuống trực tiếp — không cần popup, không phụ thuộc máy in ảo.
    async exportInvoice() {
        const studentId = document.getElementById('invoiceStudentId').value;
        const st = this.students.find(s => s.id === studentId);
        if (!st) return;

        // Luôn tính lại theo đúng khoảng "Từ ngày - Đến ngày" đang hiển thị
        // ngay trước khi xuất, đảm bảo phiếu in ra khớp 100% với số liệu trên
        // màn hình — không dùng dữ liệu cache cũ từ lúc mở modal.
        const sessions = this.recomputeInvoiceTotals();
        let totalFee = 0, paidFee = 0, totalHours = 0;
        let privateCount = 0, privateSum = 0, groupCount = 0, groupSum = 0;
        sessions.forEach(sess => {
            totalHours += parseFloat(sess.duration) || 0;
            // Học sinh học phí 0đ không đóng góp gì vào tổng học phí của phiếu.
            const portion = this.getStudentSessionFee(sess, studentId);
            if (portion <= 0) return;
            totalFee += portion;
            const detail = sess.studentDetails && sess.studentDetails[studentId];
            if (detail && detail.paid) paidFee += portion;
            if (sess.type === 'chung') {
                groupCount += 1;
                groupSum += portion;
            } else {
                privateCount += 1;
                privateSum += portion;
            }
        });
        const unpaidFee = totalFee - paidFee;
        const privateUnit = privateCount > 0 ? Math.round(privateSum / privateCount) : 0;
        const groupUnit = groupCount > 0 ? Math.round(groupSum / groupCount) : 0;

        const title = document.getElementById('invoiceTitle').value.trim() || 'PHIẾU HỌC PHÍ';
        const teacherName = document.getElementById('invoiceTeacherName').value.trim() || (this.currentUser && this.currentUser.name) || 'Giáo viên phụ trách';
        const teacherPhone = document.getElementById('invoiceTeacherPhone').value.trim();
        const overview = document.getElementById('invoiceOverview').value.trim();
        const algebra = document.getElementById('invoiceAlgebra').value.trim();
        const geometry = document.getElementById('invoiceGeometry').value.trim();
        const roadmap = document.getElementById('invoiceRoadmap').value.trim();
        const schedule = document.getElementById('invoiceSchedule').value.trim();
        const note = document.getElementById('invoiceNote').value.trim();

        const esc = (s) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const nl2br = (s) => esc(s).replace(/\n/g, '<br>');

        // Danh sách kiểu "checklist" (✓ đầu dòng) dùng cho khối LỊCH HỌC và GHI
        // CHÚ HỌC PHÍ, giống đúng bố cục trong mẫu phiếu. Nếu dòng có dấu ":"
        // thì in đậm phần trước dấu ":" (VD "16h–18h thứ 4:" in đậm).
        const checklistHTML = (text) => {
            const lines = esc(text).split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length === 0) return '';
            return lines.map(line => {
                const colonIdx = line.indexOf(':');
                const item = colonIdx > -1
                    ? `<strong>${line.slice(0, colonIdx + 1)}</strong>${line.slice(colonIdx + 1)}`
                    : line;
                return `<div class="list-item"><span class="mark">✓</span><span class="list-text">${item}</span></div>`;
            }).join('');
        };

        const dateChips = sessions.map(s => {
            const [y, m, d] = String(s.date).split('-');
            return `<span class="date-chip"><span class="date-chip-text">${d}/${m}</span></span>`;
        }).join('');

        // Ghi chú học phí: liệt kê số buổi riêng/chung và đơn giá tương ứng,
        // theo đúng bố cục "GHI CHÚ HỌC PHÍ" trong mẫu phiếu (dạng checklist ✓).
        const customTuitionNote = document.getElementById('invoiceTuitionNote').value.trim();
        const feeNoteLines = [];
        if (privateCount > 0) feeNoteLines.push(`${privateCount} buổi học riêng: <strong>${this.formatVND(privateUnit)}/buổi</strong>`);
        if (groupCount > 0) feeNoteLines.push(`${groupCount} buổi học chung: <strong>${this.formatVND(groupUnit)}/buổi</strong>`);
        const feeNoteHTML = customTuitionNote
            ? checklistHTML(customTuitionNote)
            : feeNoteLines.map(l => `<div class="list-item"><span class="mark">✓</span><span class="list-text">${l}</span></div>`).join('');

        // Nhận xét học tập: gộp Tổng quan/Đại số/Hình học vào chung 1 khung,
        // mỗi mục là 1 "comment-box" (nền hồng nhạt + thanh dọc trái), xếp
        // chồng, giống hệt bố cục khung "NHẬN XÉT HỌC TẬP" trong mẫu phiếu.
        const quoteItemsHTML = [
            overview  ? `<div class="comment-box"><div class="comment-text"><strong>Tổng quan:</strong> ${nl2br(overview)}</div></div>`  : '',
            algebra   ? `<div class="comment-box"><div class="comment-text"><strong>Đại số:</strong> ${nl2br(algebra)}</div></div>`      : '',
            geometry  ? `<div class="comment-box"><div class="comment-text"><strong>Hình học:</strong> ${nl2br(geometry)}</div></div>`   : ''
        ].filter(Boolean).join('');

        // Lộ trình sắp tới: hiển thị dạng bullet "•" mỗi dòng 1 mục, giống bố
        // cục "LỘ TRÌNH SẮP TỚI" trong mẫu phiếu (khác LỊCH HỌC dùng dấu ✓).
        const bulletListHTML = (text) => {
            const lines = esc(text).split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length === 0) return '';
            return lines.map(line => `<div class="list-item"><span class="mark">•</span><span class="list-text">${line}</span></div>`).join('');
        };

        const scheduleHTML = checklistHTML(schedule);
        const roadmapHTML = bulletListHTML(roadmap);

        // Ảnh QR thanh toán (tuỳ chọn) — chèn ngay dưới khối "Tổng học phí",
        // căn giữa, giữ nguyên tỉ lệ ảnh gốc (object-fit:contain). PHẢI là
        // ảnh QR thật (vuông, mã vạch 2 chiều) — không phải ảnh chân dung.
        const qrHTML = this._invoiceQrDataUrl
            ? `<img class="qr" src="${this._invoiceQrDataUrl}" alt="QR thanh toán">
               <div class="divider"></div>
               <div class="bank">Số TK: <b>68688886669</b><br>Chủ TK: <b>Nguyễn Thanh Thuý</b></div>`
            : '';

        // Toàn bộ phiếu được dựng trong 1 khung ẩn (off-screen) ngay trên
        // trang hiện tại — dùng CHUNG font đã tải sẵn của trang thay vì phải
        // tải lại font trong 1 cửa sổ/tab mới, tránh tình trạng chữ có dấu bị
        // vỡ/font dự phòng do chưa kịp tải font khi chụp ảnh.
        const sheetHTML = `
<div class="container" id="invoiceExportSheet">
    <style>
        /* ============ 0. RESET ============ */
        #invoiceExportSheet, #invoiceExportSheet * { box-sizing: border-box; font-family: inherit; margin:0; padding:0; }

        /* ============ I. ROOT ============ */
        #invoiceExportSheet {
            font-family: 'Comfortaa', sans-serif;
            background: #f8e9ef;
            width: 600px;
            max-width: 600px;
            padding: 20px;
            color: #333;
            overflow-wrap: break-word;
            word-break: break-word;
            -webkit-font-smoothing: antialiased;
        }
        #invoiceExportSheet .card-main { background:#fff; border-radius:22px; border:2px solid #f3d6df; padding:18px; }

        /* ============ II. HEADER ============ */
        #invoiceExportSheet .header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; row-gap:6px; }
        #invoiceExportSheet .badge { display:inline-flex; align-items:center; line-height:1.4; color:#b83b6a; font-size:15px; font-weight:700; border:none; padding:0; border-radius:0; gap:0; background:none; }
        #invoiceExportSheet .phone { font-size:13px; color:#8a3a55; }
        #invoiceExportSheet .title { text-align:center; font-size:26px; font-weight:700; color:#8a1f4d; margin:6px 0 22px; line-height:1.5; }

        /* ============ III. GRID 2 CỘT ============ */
        #invoiceExportSheet .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
        #invoiceExportSheet .card { border:1.5px solid #f1cbd7; border-radius:18px; padding:14px; background:#fff; }
        #invoiceExportSheet .student-info-card { padding-top:8px; }
        /* Riêng padding trên của Lịch học/Lộ trình/Ghi chú học phí: chỉnh số đầu tiên (padding-top) này */
        #invoiceExportSheet .card.card-tight { padding:2px 14px 14px; }
        /* Khoảng cách tiêu đề "📝 Nhận xét học tập" -> ô comment-box đầu tiên: chỉnh margin-bottom này */
        #invoiceExportSheet .section-title { font-size:15px; font-weight:600; color:#8a1f4d; margin-bottom:6px; }
        /* Riêng khoảng cách tiêu đề "📝 Nhận xét học tập" -> ô đầu tiên: chỉnh margin-bottom này */
        #invoiceExportSheet .section-title.section-title-notes { margin-bottom:10px; }

        /* ============ IV. THÔNG TIN HỌC SINH ============ */
        #invoiceExportSheet .row { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:5px 0; border-bottom:1px dashed #f1cbd7; }
        #invoiceExportSheet .row:last-of-type { border-bottom:none; }
        #invoiceExportSheet .label { font-size:12px; color:#a35b73; }
        #invoiceExportSheet .value { font-size:13px; color:#8a1f4d; font-weight:500; text-align:right; }
        #invoiceExportSheet .date-label { font-size:12px; color:#a35b73; margin:8px 0 6px; }
        /* Tránh flex + phần tử chữ lồng nhau: html2canvas có thể làm mất chữ Comfortaa. */
        #invoiceExportSheet .date-chip { display:inline-table; height:30px; line-height:normal; background:#f7dce5; color:#c2185b; font-weight:700; font-size:12px; white-space:nowrap; padding:0 9px; border-radius:999px; margin:0 4px 4px 0; vertical-align:top; }
        #invoiceExportSheet .date-chip-text { display:table-cell; height:30px; text-align:center; vertical-align:middle; line-height:1; position:relative; top:-1px; }

        /* ============ V. TỔNG HỌC PHÍ ============ */
        #invoiceExportSheet .total-title { text-align:center; font-size:13px; color:#a35b73; }
        /* Khoảng cách TỔNG HỌC PHÍ -> 700.000đ: chỉnh số margin-top này (đang để 6px bằng với gap dưới) */
        #invoiceExportSheet .total-price { text-align:center; font-size:30px; font-weight:700; color:#8a1f4d; margin-top:0px; }
        /* Khoảng cách 700.000đ -> ảnh QR: chỉnh số margin-top này (đang để 6px bằng với gap trên) */
        #invoiceExportSheet .qr { width:110px; height:110px; display:block; margin:16px auto 8px; object-fit:contain; border-radius:10px; border:2px solid #f1cbd7; background:#fff; }
        #invoiceExportSheet .divider { border-top:1px solid #f1cbd7; margin:8px 0; }
        #invoiceExportSheet .bank { text-align:center; font-size:13px; color:#6e3b4f; line-height:1.4; }
        #invoiceExportSheet .bank b { color:#8a1f4d; }

        /* ============ VI. NHẬN XÉT ============ */
        /* Padding bên trong mỗi ô "Tổng quan/Đại số/Hình học": chỉnh 4 số trong padding này */
        #invoiceExportSheet .comment-box { background:#fdeff4; border-radius:12px; padding:10px 10px 10px 14px; margin-bottom:10px; position:relative; overflow:hidden; }
        /* Khoảng cách giữa các ô comment-box với nhau: chỉnh margin-bottom ở dòng trên (ô cuối luôn về 0, không cần sửa dòng dưới) */
        #invoiceExportSheet .comment-box:last-child { margin-bottom:0; }
        #invoiceExportSheet .comment-box::before { content:''; position:absolute; left:0; top:0; width:5px; height:100%; background:#d94f7a; border-radius:12px 0 0 12px; }
        #invoiceExportSheet .comment-text { font-size:13px; line-height:1.3; position:relative; top:-2px; }
        #invoiceExportSheet .comment-text strong { color:#8a1f4d; }

        /* ============ VII. 2 CARD DƯỚI ============ */
        #invoiceExportSheet .grid-bottom { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:10px; }
        #invoiceExportSheet .list-item { display:flex; align-items:flex-start; gap:6px; font-size:13px; line-height:1.4; margin-bottom:5px; position:relative; top:-2px; }
        #invoiceExportSheet .list-item:last-child { margin-bottom:0; }
        #invoiceExportSheet .list-item .mark { color:#d94f7a; font-weight:700; flex-shrink:0; }
        #invoiceExportSheet .list-item .list-text { min-width:0; }
        #invoiceExportSheet .empty-hint { font-size:13px; color:#c48ba6; }

        /* ============ VIII. FOOTER ============ */
        #invoiceExportSheet .footer { background:#f7dce5; border-radius:12px; padding:9px 8px; display:flex; align-items:center; justify-content:center; text-align:center; font-size:12px; font-weight:700; color:#8a3a55; }
        #invoiceExportSheet .footer-text { line-height:1.4; position:relative; top:-2px; }
        #invoiceExportSheet .section-block { margin-top:10px; }
    </style>
    <div class="card-main">
        <div class="header">
            <span class="badge">${esc(teacherName)}</span>
            <span class="phone">${teacherPhone ? esc(teacherPhone) : 'Dành cho phụ huynh'}</span>
        </div>
        <div class="title">${esc(title)}</div>

        <div class="grid-2">
            <div class="card student-info-card">
                <div class="section-title">🎓 Thông tin học sinh</div>
                <div class="row"><span class="label">Họ và tên</span><span class="value">${esc(st.name)} – ${esc(st.class)}</span></div>
                <div class="row"><span class="label">Học phí/buổi</span><span class="value">${privateCount > 0 ? this.formatVND(privateUnit) : this.formatVND(groupUnit)}</span></div>
                <div class="row"><span class="label">Số buổi học</span><span class="value">${sessions.length} buổi</span></div>
                <div class="row"><span class="label">Số giờ học</span><span class="value">${totalHours.toFixed(1)} giờ</span></div>
                <div class="date-label">Ngày học đăng ký</div>
                <div>${dateChips || '<span class="empty-hint">Chưa có buổi học trong kỳ</span>'}</div>
            </div>

            <div class="card" style="text-align:center;">
                <div class="total-title">TỔNG HỌC PHÍ</div>
                <div class="total-price">${this.formatVND(totalFee)}</div>
                ${qrHTML}
            </div>
        </div>

        ${quoteItemsHTML ? `<div class="section-block"><div class="section-title section-title-notes">📝 Nhận xét học tập</div>${quoteItemsHTML}</div>` : ''}

        ${(scheduleHTML || roadmapHTML) ? `
        <div class="grid-bottom">
            <div class="card card-tight">
                <div class="section-title">📅 Lịch học</div>
                ${scheduleHTML || '<span class="empty-hint">Chưa có lịch học.</span>'}
            </div>
            <div class="card card-tight">
                <div class="section-title">🎯 Lộ trình</div>
                ${roadmapHTML || '<span class="empty-hint">Chưa có lộ trình.</span>'}
            </div>
        </div>` : ''}

        ${feeNoteHTML ? `<div class="card card-tight section-block"><div class="section-title">💡 Ghi chú học phí</div>${feeNoteHTML}</div>` : ''}

        <div class="footer section-block"><span class="footer-text">${note ? nl2br(note) : 'Phụ huynh vui lòng kiểm tra thông tin học phí và lịch học trong tháng.'}</span></div>
    </div>
</div>`;

        this.setBtnLoading('btnExportInvoice', true, 'Đang tạo ảnh...');

        // Dựng khung ẩn NGOÀI vùng nhìn thấy (không dùng display:none, vì
        // html2canvas cần layout thật để đo/vẽ đúng) để chụp ảnh.
        const holder = document.createElement('div');
        holder.style.position = 'fixed';
        holder.style.top = '0';
        holder.style.left = '-99999px';
        holder.style.zIndex = '-1';
        holder.innerHTML = sheetHTML;
        document.body.appendChild(holder);
        const captureEl = document.getElementById('invoiceExportSheet');

        try {
            // Đợi font tiếng Việt Comfortaa
            // tải xong trước khi chụp — đây là nguyên nhân chính khiến chữ có
            // dấu đôi khi hiển thị sai/vỡ nếu chụp quá sớm lúc font chưa sẵn.
            if (document.fonts && document.fonts.ready) {
                await document.fonts.ready;
            }
            // Đợi ảnh QR (nếu có) tải xong hẳn để không bị chụp thiếu ảnh.
            const qrImg = captureEl.querySelector('img.qr');
            if (qrImg && !qrImg.complete) {
                await new Promise(resolve => {
                    qrImg.onload = resolve;
                    qrImg.onerror = resolve;
                });
            }

            const html2canvas = await this.ensureHtml2Canvas();
            const canvas = await html2canvas(captureEl, {
                scale: 3, // ảnh nét, độ phân giải cao
                backgroundColor: '#f8e9ef',
                useCORS: true
            });

            const todayStr = this.toISODateOnly(new Date());
            const link = document.createElement('a');
            link.download = `PhieuHocPhi_${st.name.replace(/\s+/g, '')}_${todayStr}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();

            this.showToast('Đã xuất phiếu học phí dạng ảnh thành công!', 'success');
            this.closeModal('invoiceModal');
        } catch (err) {
            console.error('Lỗi xuất phiếu học phí:', err);
            this.showToast(err.message || 'Xuất ảnh phiếu học phí thất bại, vui lòng thử lại.', 'error');
        } finally {
            document.body.removeChild(holder);
            this.setBtnLoading('btnExportInvoice', false);
        }
    }

});
