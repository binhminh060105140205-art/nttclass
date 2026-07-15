// ================================================================
// TUITION-EXPORT.JS — Trang "Báo cáo học phí" + xuất Nhật ký học tập
// ra ảnh PNG / file Excel-CSV.
// ================================================================
Object.assign(PinkyClassApp.prototype, {
    renderTuitionOverview() {
        const tbody = document.getElementById('tuitionOverviewTableBody');
        tbody.innerHTML = '';

        let paidSum = 0;
        let unpaidSum = 0;

        // If student role, only calculate and show theirs
        let studentsList = [...this.students];
        if (this.currentRole === 'student') {
            studentsList = studentsList.filter(s => s.id === this.currentStudentId);
        }

        studentsList.forEach(st => {
            // CHỈ tính các buổi học ĐÃ THỰC SỰ DIỄN RA (đã qua giờ kết thúc so
            // với hiện tại) vào báo cáo học phí — buổi học nằm trong tương lai
            // (kể cả ngày mai, tuần sau) sẽ KHÔNG được cộng vào số buổi/số giờ/
            // tiền học phí ở đây nữa, dù đã có mặt trên lịch dạy.
            const studentSessions = this.filterByMonth(this.sessions).filter(sess => sess.studentIds.includes(st.id) && this.isSessionCompleted(sess));
            
            const totalSessionsCount = studentSessions.length;
            const totalHours = studentSessions.reduce((acc, curr) => acc + parseFloat(curr.duration), 0);

            // Calculate money details
            let totalTuitionEarned = 0;
            let paidTuition = 0;
            let unpaidTuition = 0;

            studentSessions.forEach(sess => {
                // Học sinh học phí 0đ không đóng góp gì vào tổng thu/đã đóng/chưa
                // đóng của chính mình — bỏ qua buổi này hoàn toàn cho em đó.
                const sessionPricePortion = this.getStudentSessionFee(sess, st.id);
                if (sessionPricePortion <= 0) return;
                // Nếu là buổi học chung, chia đều theo SỐ HỌC SINH THỰC SỰ ĐÓNG
                // HỌC PHÍ trong buổi (không tính các bạn học phí 0đ vào mẫu số).
                totalTuitionEarned += sessionPricePortion;
                // Dùng field Paid RIÊNG của chính học sinh này trong buổi học đó
                // (sess.studentDetails[st.id].paid) — KHÔNG dùng cờ paid cấp cả
                // buổi, vì với buổi học chung, trạng thái đóng tiền của mỗi học
                // sinh phải độc lập với các bạn học cùng buổi.
                const detail = sess.studentDetails && sess.studentDetails[st.id];
                if (detail && detail.paid) {
                    paidTuition += sessionPricePortion;
                } else {
                    unpaidTuition += sessionPricePortion;
                }
            });

            paidSum += paidTuition;
            unpaidSum += unpaidTuition;

            const tr = document.createElement('tr');

            // Trạng thái học phí: dropdown đơn giản 2 lựa chọn (Đã thanh toán /
            // Chưa thanh toán) áp dụng cho TẤT CẢ buổi học của học sinh này.
            const isFullyPaid = totalSessionsCount > 0 && unpaidTuition === 0;
            const statusSelect = `
                <select class="tuition-status-select ${isFullyPaid ? 'status-paid' : 'status-unpaid'}"
                        data-student="${st.id}"
                        ${totalSessionsCount === 0 || this.currentRole === 'student' ? 'disabled' : ''}>
                    <option value="unpaid" ${!isFullyPaid ? 'selected' : ''}>Chưa thanh toán</option>
                    <option value="paid" ${isFullyPaid ? 'selected' : ''}>Đã thanh toán</option>
                </select>
            `;

            tr.innerHTML = `
                <td><strong>${st.name}</strong></td>
                <td>${st.class} - ${st.subject}</td>
                <td style="text-align:center; font-weight:600;">${totalSessionsCount}</td>
                <td style="text-align:center; font-weight:600; color:var(--primary);">${totalHours.toFixed(1)}</td>
                
                <td class="role-restricted admin-only" style="text-align:right; font-weight:600;">${this.formatVND(totalTuitionEarned)}</td>
                <td class="role-restricted admin-only" style="text-align:right; color:#16a34a; font-weight:600;">${this.formatVND(paidTuition)}</td>
                <td class="role-restricted admin-only" style="text-align:right; color:#dc2626; font-weight:600;">${this.formatVND(unpaidTuition)}</td>
                
                <td style="text-align:center;">${statusSelect}</td>
                <td class="role-restricted admin-only" style="text-align:center;">
                    <button type="button" class="btn btn-secondary btn-sm" style="padding:6px 14px;"
                            ${totalSessionsCount === 0 ? 'disabled' : ''}
                            onclick="app.openInvoiceModal('${st.id}')">Xuất phiếu</button>
                </td>
            `;

            tbody.appendChild(tr);
        });

        // Set top dashboard level sums
        document.getElementById('tuition-paid-sum').innerText = this.formatVND(paidSum);
        document.getElementById('tuition-unpaid-sum').innerText = this.formatVND(unpaidSum);
        document.getElementById('tuition-total-sum').innerText = this.formatVND(paidSum + unpaidSum);

        // Hook up 2-state tuition toggle change events
        document.querySelectorAll('.tuition-status-select').forEach(sel => {
            sel.addEventListener('change', (e) => {
                const studentId = sel.getAttribute('data-student');
                const paid = e.target.value === 'paid';
                this.setStudentPaidStatus(studentId, paid);
            });
        });
    },

    // (Đã tách sang file invoice-export.js: openInvoiceModal, setInvoiceQrImage,
    // recomputeInvoiceTotals, exportInvoice — gắn vào prototype khi invoice-export.js được nạp)


    // --- VIEW 5: STUDENT MANAGEMENT ---
    async ensureHtml2Canvas() {
        if (window.html2canvas) return window.html2canvas;
        if (!this._html2canvasLoadingPromise) {
            this._html2canvasLoadingPromise = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
                script.onload = () => resolve(window.html2canvas);
                script.onerror = () => reject(new Error('Không tải được thư viện xuất ảnh (kiểm tra kết nối mạng).'));
                document.head.appendChild(script);
            });
        }
        return this._html2canvasLoadingPromise;
    },

    // Chụp khung Nhật ký học tập (#logExportCapture) ra 1 file ảnh PNG — ẩn tạm
    // cột "Thao tác" trong lúc chụp (class .log-export-hide, xem style.css)
    // để ảnh gửi phụ huynh không có nút bấm thao tác trên web.
    async exportStudentLogToImage() {
        const studentId = this.currentStudentId;
        const studentName = this.getStudentName(studentId);

        const studentSessions = this.filterByMonth(this.sessions)
            .filter(sess => sess.studentIds.includes(studentId));

        if (studentSessions.length === 0) {
            this.showToast("Không có dữ liệu nhật ký để xuất!", "error");
            return;
        }

        const captureEl = document.getElementById('logExportCapture');
        const tableWrapperEl = captureEl.querySelector('.table-wrapper');

        this.setBtnLoading('btnExportLogImage', true, 'Đang tạo ảnh...');
        captureEl.classList.add('is-exporting');

        // FIX: trước đây khi màn hình không đủ rộng để hiển thị hết bảng
        // (bảng phải cuộn ngang trong .table-wrapper, hoặc trang đang cuộn
        // dọc dở), html2canvas chỉ chụp đúng phần đang HIỂN THỊ trên màn
        // hình (theo scroll hiện tại) => ảnh xuất ra bị cắt/thiếu y hệt
        // những gì đang bị che trên UI. Cách khắc phục: tạm thời ép khung
        // chụp hiển thị TOÀN BỘ nội dung (không giới hạn theo viewport hay
        // vị trí cuộn), chụp xong thì khôi phục lại giao diện như cũ.
        const prevWrapperStyleAttr = tableWrapperEl ? tableWrapperEl.getAttribute('style') : null;
        const prevWrapperScrollLeft = tableWrapperEl ? tableWrapperEl.scrollLeft : 0;
        const prevWindowScrollX = window.scrollX;
        const prevWindowScrollY = window.scrollY;

        // FIX (màn hình nhỏ / điện thoại): CSS có "body { overflow-x: hidden }"
        // để trang không bị kéo ngang khi lướt web bình thường. Nhưng khi bảng
        // Nhật ký học tập phải giãn rộng hơn màn hình (nhiều cột: STT...Ghi
        // chú), chính overflow-x:hidden của <body> sẽ CẮT MẤT phần bảng vượt
        // ra ngoài màn hình trước khi html2canvas kịp chụp — dù .table-wrapper
        // đã được mở overflow ở trên. Nên phải tạm gỡ luôn overflow của
        // <html> và <body> trong lúc chụp, rồi khôi phục lại ngay sau đó.
        const htmlEl = document.documentElement;
        const prevHtmlOverflow = htmlEl.style.overflow;
        const prevBodyOverflow = document.body.style.overflow;
        htmlEl.style.overflow = 'visible';
        document.body.style.overflow = 'visible';

        // FIX (nguyên nhân còn sót lại): không chỉ <html>/<body> mới cắt nội
        // dung. Nhật ký học tập thường nằm trong modal/card có overflow-y:auto
        // + max-height theo viewport (để cuộn được trên màn hình nhỏ) — CHÍNH
        // các thẻ cha đó (chứ không phải #logExportCapture hay .table-wrapper)
        // mới là nơi đang "giam" phần nội dung vượt khung nhìn, nên khi thu
        // nhỏ màn hình, phần bị che theo overflow của modal sẽ KHÔNG có mặt
        // trong ảnh xuất ra dù .table-wrapper đã mở overflow. Cách khắc phục:
        // duyệt ngược TẤT CẢ các phần tử cha từ #logExportCapture lên tới
        // <body>, lưu lại style cũ của từng cha, rồi tạm gỡ overflow/max-height
        // của toàn bộ chuỗi cha đó trong lúc chụp — chụp xong khôi phục lại
        // y nguyên như trước.
        const ancestors = [];
        for (let el = captureEl.parentElement; el && el !== document.documentElement; el = el.parentElement) {
            ancestors.push(el);
        }
        const prevAncestorStyleAttrs = ancestors.map(el => el.getAttribute('style'));
        ancestors.forEach(el => {
            el.style.overflow = 'visible';
            el.style.overflowX = 'visible';
            el.style.overflowY = 'visible';
            el.style.maxHeight = 'none';
            el.style.maxWidth = 'none';
        });

        if (tableWrapperEl) {
            tableWrapperEl.scrollLeft = 0;
            tableWrapperEl.style.overflow = 'visible';
            tableWrapperEl.style.width = 'max-content';
            tableWrapperEl.style.maxWidth = 'none';
        }
        // Cuộn trang về đầu để html2canvas không lấy nhầm gốc tọa độ theo
        // vị trí cuộn dọc hiện tại của trang.
        window.scrollTo(0, 0);

        try {
            const html2canvas = await this.ensureHtml2Canvas();

            // Đo lại kích thước ĐẦY ĐỦ của khung sau khi đã bỏ giới hạn cuộn,
            // rồi truyền thẳng cho html2canvas để nó render đúng toàn bộ nội
            // dung (không cắt theo clientWidth/clientHeight của khung).
            const fullWidth = Math.ceil(captureEl.scrollWidth);
            const fullHeight = Math.ceil(captureEl.scrollHeight);

            const canvas = await html2canvas(captureEl, {
                scale: 2,
                backgroundColor: '#ffffff',
                useCORS: true,
                width: fullWidth,
                height: fullHeight,
                windowWidth: fullWidth,
                windowHeight: fullHeight,
                scrollX: 0,
                scrollY: 0
            });

            const todayStr = this.toISODateOnly(new Date());
            const link = document.createElement('a');
            link.download = `NhatKyHocTap_${studentName.replace(/\s+/g, '')}_${todayStr}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();

            this.showToast("Đã xuất ảnh nhật ký học tập thành công!", "success");
        } catch (err) {
            console.error('Lỗi xuất ảnh:', err);
            this.showToast(err.message || "Xuất ảnh thất bại, vui lòng thử lại.", "error");
        } finally {
            // Khôi phục lại giao diện cuộn ngang/dọc như trước khi chụp.
            if (tableWrapperEl) {
                if (prevWrapperStyleAttr === null) {
                    tableWrapperEl.removeAttribute('style');
                } else {
                    tableWrapperEl.setAttribute('style', prevWrapperStyleAttr);
                }
                tableWrapperEl.scrollLeft = prevWrapperScrollLeft;
            }
            // Khôi phục lại overflow gốc của <html>/<body> (đã tạm gỡ ở trên
            // để chụp đủ ảnh trên màn hình nhỏ).
            htmlEl.style.overflow = prevHtmlOverflow;
            document.body.style.overflow = prevBodyOverflow;
            // Khôi phục lại style gốc của toàn bộ chuỗi thẻ cha (modal/card...)
            // đã tạm gỡ overflow/max-height ở trên.
            ancestors.forEach((el, i) => {
                const prevAttr = prevAncestorStyleAttrs[i];
                if (prevAttr === null) {
                    el.removeAttribute('style');
                } else {
                    el.setAttribute('style', prevAttr);
                }
            });
            window.scrollTo(prevWindowScrollX, prevWindowScrollY);
            captureEl.classList.remove('is-exporting');
            this.setBtnLoading('btnExportLogImage', false);
        }
    },

    // Export log to Excel
    // Tự động tải thư viện SheetJS (xlsx) từ CDN (chỉ tải 1 lần, dùng lại cho
    // các lần xuất Excel sau) — dùng để tạo file .xlsx trực tiếp trên trình duyệt.
    async ensureXLSX() {
        if (window.XLSX) return window.XLSX;
        if (!this._xlsxLoadingPromise) {
            this._xlsxLoadingPromise = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
                script.onload = () => resolve(window.XLSX);
                script.onerror = () => reject(new Error('Không tải được thư viện xuất Excel (kiểm tra kết nối mạng).'));
                document.head.appendChild(script);
            });
        }
        return this._xlsxLoadingPromise;
    },

    // Xuất bảng Nhật ký học tập (banner tên học sinh + bảng buổi học) ra 1
    // file Excel (.xlsx) — thay cho xuất ảnh trước đây, giúp dễ chỉnh sửa,
    // lọc, hoặc nhập tiếp vào các file quản lý khác.
    async exportStudentLogToCSV() {
        const studentId = this.currentStudentId;
        const studentName = this.getStudentName(studentId);
        const studentClass = this.getStudentClass(studentId);
        const studentSubject = this.getStudentSubject(studentId);

        // Dùng đúng danh sách đang hiển thị trên bảng (đã lọc theo Kỳ đang chọn)
        // để số liệu xuất ra khớp 100% với những gì giáo viên đang xem.
        const studentSessions = this.filterByMonth(this.sessions)
            .filter(sess => sess.studentIds.includes(studentId))
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        if (studentSessions.length === 0) {
            this.showToast("Không có dữ liệu nhật ký để xuất!", "error");
            return;
        }

        this.setBtnLoading('btnExportLog', true, 'Đang tạo file Excel...');
        try {
            const XLSX = await this.ensureXLSX();

            const header = ['STT', 'Ngày', 'Giờ học', 'Nội dung buổi học', 'Bài tập về nhà', 'Ý thức', 'Nhận xét của giáo viên', 'Ghi chú'];
            const rows = studentSessions.map((sess, idx) => {
                const detail = sess.studentDetails[studentId] || { homework: 'Chưa làm', attitude: 'Tốt', individualComment: '', note: '' };
                const d = this.parseLocalDate(sess.date);
                const days = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
                const dateLabel = d ? `${days[d.getDay()]}, ${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}` : sess.date;

                const contentParts = [];
                if (sess.sessionName) contentParts.push(sess.sessionName);
                contentParts.push(sess.content && sess.content.trim() ? sess.content.trim() : 'Chưa có nội dung.');

                return [
                    `Buổi ${idx + 1}`,
                    dateLabel,
                    `${sess.startTime} - ${sess.endTime}`,
                    contentParts.join('\n'),
                    this.getHomeworkLabel(detail.homework),
                    detail.attitude || 'Tốt',
                    detail.individualComment && detail.individualComment.trim() ? detail.individualComment.trim() : 'Chưa nhận xét.',
                    detail.note || ''
                ];
            });

            const titleRow = [`NHẬT KÝ HỌC TẬP - ${studentName.toUpperCase()} ${studentSubject} ${studentClass}`.trim()];
            const wsData = [titleRow, [], header, ...rows];

            const ws = XLSX.utils.aoa_to_sheet(wsData);
            ws['!cols'] = [
                { wch: 10 }, // STT
                { wch: 20 }, // Ngày
                { wch: 14 }, // Giờ học
                { wch: 40 }, // Nội dung
                { wch: 16 }, // Bài tập
                { wch: 14 }, // Ý thức
                { wch: 40 }, // Nhận xét
                { wch: 20 }  // Ghi chú
            ];
            // Gộp ô tiêu đề trên cùng cho đẹp (trải hết chiều rộng bảng)
            ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: header.length - 1 } }];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Nhat ky hoc tap');

            const todayStr = this.toISODateOnly(new Date());
            XLSX.writeFile(wb, `NhatKyHocTap_${studentName.replace(/\s+/g, '')}_${todayStr}.xlsx`);

            this.showToast("Đã xuất file Excel nhật ký học tập thành công!", "success");
        } catch (err) {
            console.error('Lỗi xuất Excel:', err);
            this.showToast(err.message || "Xuất file Excel thất bại, vui lòng thử lại.", "error");
        } finally {
            this.setBtnLoading('btnExportLog', false);
        }
    }

    // --- USER MANAGEMENT (Admin only) ---

});
