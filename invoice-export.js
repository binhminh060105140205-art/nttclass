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

    // Nạp pdfMake và font Be Vietnam Pro từ chính máy chủ trước, tránh phụ thuộc CDN
    // khiến nút xuất PDF hỏng khi mạng yếu hoặc trình duyệt chặn tài nguyên ngoài.
    async ensurePdfMake() {
        const configureFonts = (pdfMake) => {
            const regularFontUrl = new URL('/assets/fonts/BeVietnamPro-Regular.ttf', window.location.href).href;
            const boldFontUrl = new URL('/assets/fonts/BeVietnamPro-Bold.ttf', window.location.href).href;
            pdfMake.fonts = {
                ...(pdfMake.fonts || {}),
                BeVietnamPro: {
                    normal: regularFontUrl,
                    bold: boldFontUrl,
                    italics: regularFontUrl,
                    bolditalics: boldFontUrl
                }
            };
            return pdfMake;
        };
        if (window.pdfMake && window.pdfMake.vfs) return configureFonts(window.pdfMake);
        if (!this._pdfMakeLoadingPromise) {
            const loadScript = (src) => new Promise((resolve, reject) => {
                const existing = document.querySelector(`script[src="${src}"]`);
                if (existing) {
                    if (existing.dataset.loaded === 'true') return resolve();
                    existing.addEventListener('load', resolve, { once: true });
                    existing.addEventListener('error', reject, { once: true });
                    return;
                }
                const script = document.createElement('script');
                script.src = src;
                script.onload = () => {
                    script.dataset.loaded = 'true';
                    resolve();
                };
                script.onerror = reject;
                document.head.appendChild(script);
            });

            const loadWithFallback = async (sources) => {
                let lastError;
                for (const source of sources) {
                    try {
                        await loadScript(source);
                        return;
                    } catch (err) {
                        lastError = err;
                    }
                }
                throw lastError || new Error('Không tải được thư viện PDF');
            };

            this._pdfMakeLoadingPromise = (async () => {
                await loadWithFallback([
                    '/node_modules/pdfmake/build/pdfmake.min.js',
                    'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.12/pdfmake.min.js'
                ]);
                await loadWithFallback([
                    '/node_modules/pdfmake/build/vfs_fonts.js',
                    'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.12/vfs_fonts.js'
                ]);
                if (!window.pdfMake?.vfs) throw new Error('Bộ font PDF chưa tải hoàn chỉnh');
                return configureFonts(window.pdfMake);
            })();
        }
        return this._pdfMakeLoadingPromise;
    },

    // Tạo cấu trúc PDF A4 riêng biệt. Hàm này chỉ dựng dữ liệu/bố cục để có thể
    // kiểm tra độc lập; exportInvoicePdf() phía dưới đảm nhiệm tải file.
    buildInvoicePdfDefinition() {
        const studentId = document.getElementById('invoiceStudentId').value;
        const st = this.students.find(s => s.id === studentId);
        if (!st) return null;

        const sessions = this.recomputeInvoiceTotals();
        let totalFee = 0, totalHours = 0;
        let privateCount = 0, privateSum = 0, groupCount = 0, groupSum = 0;
        sessions.forEach(sess => {
            totalHours += parseFloat(sess.duration) || 0;
            const portion = this.getStudentSessionFee(sess, studentId);
            if (portion <= 0) return;
            totalFee += portion;
            if (sess.type === 'chung') {
                groupCount += 1;
                groupSum += portion;
            } else {
                privateCount += 1;
                privateSum += portion;
            }
        });

        const privateUnit = privateCount > 0 ? Math.round(privateSum / privateCount) : 0;
        const groupUnit = groupCount > 0 ? Math.round(groupSum / groupCount) : 0;
        const nfc = value => String(value || '').normalize('NFC').trim();
        const title = nfc(document.getElementById('invoiceTitle').value) || 'PHIẾU HỌC PHÍ';
        const teacherName = nfc(document.getElementById('invoiceTeacherName').value) || nfc(this.currentUser && this.currentUser.name) || 'Giáo viên phụ trách';
        const teacherPhone = nfc(document.getElementById('invoiceTeacherPhone').value) || 'Dành cho phụ huynh';
        const overview = nfc(document.getElementById('invoiceOverview').value);
        const algebra = nfc(document.getElementById('invoiceAlgebra').value);
        const geometry = nfc(document.getElementById('invoiceGeometry').value);
        const roadmap = nfc(document.getElementById('invoiceRoadmap').value);
        const schedule = nfc(document.getElementById('invoiceSchedule').value);
        const customTuition = nfc(document.getElementById('invoiceTuitionNote').value);
        const note = nfc(document.getElementById('invoiceNote').value) || 'Phụ huynh vui lòng kiểm tra thông tin học phí và lịch học trong tháng.';
        const dateParts = sessions.map(sess => {
            const [year, month, day] = String(sess.date || '').split('-');
            return day && month && year ? `${day}/${month}` : String(sess.date || '');
        }).filter(Boolean);
        const dates = dateParts.length
            ? Array.from({ length: Math.ceil(dateParts.length / 5) }, (_, index) => dateParts.slice(index * 5, index * 5 + 5).join(', ')).join('\n')
            : 'Chưa có buổi học trong kỳ';

        const feeLines = [];
        if (privateCount > 0) feeLines.push(`${privateCount} buổi học riêng: ${this.formatVND(privateUnit)}/buổi`);
        if (groupCount > 0) feeLines.push(`${groupCount} buổi học chung: ${this.formatVND(groupUnit)}/buổi`);
        const tuitionText = customTuition || feeLines.join('\n') || 'Chưa có thông tin học phí.';

        const labelValue = (label, value) => [
            { text: label, style: 'label' },
            { text: nfc(value), style: 'value', alignment: 'right' }
        ];
        const pdfContentWidth = 491.28;
        const pdfColumnGap = 14;
        const pdfHalfWidth = (pdfContentWidth - pdfColumnGap) / 2;
        const pdfStudentWidth = (pdfContentWidth - pdfColumnGap) * 0.54;
        const pdfTuitionWidth = (pdfContentWidth - pdfColumnGap) * 0.46;
        const estimateLines = (value, charsPerLine) => String(value || '').split('\n').reduce((sum, line) => {
            return sum + Math.max(1, Math.ceil(line.length / charsPerLine));
        }, 0);
        const roundedCard = (stack, width, height, fillColor = '#ffffff', options = {}) => {
            const radius = options.radius || 8;
            const borderColor = options.borderColor || '#bfdbfe';
            const paddingX = options.paddingX ?? 13;
            const basePaddingY = options.paddingY ?? 10;
            const contentHeight = options.contentHeight || 0;
            const centeredPadding = options.centerContent && contentHeight > 0
                ? Math.max(0, (height - contentHeight) / 2)
                : basePaddingY;
            const paddingTop = centeredPadding;
            const paddingBottom = centeredPadding;
            return {
                stack: [
                    {
                        canvas: [{
                            type: 'rect', x: 0, y: 0, w: width, h: height, r: radius,
                            color: fillColor, lineColor: borderColor, lineWidth: 0.9
                        }],
                        margin: [0, 0, 0, -height]
                    },
                    {
                        table: {
                            widths: ['*'],
                            heights: () => Math.max(0, height - paddingTop - paddingBottom),
                            body: [[{ stack, verticalAlignment: options.centerContent ? 'top' : (options.verticalAlignment || 'middle') }]]
                        },
                        layout: {
                            hLineWidth: () => 0,
                            vLineWidth: () => 0,
                            paddingLeft: () => paddingX,
                            paddingRight: () => paddingX,
                            paddingTop: () => paddingTop,
                            paddingBottom: () => paddingBottom
                        }
                    }
                ]
            };
        };
        const sectionHeading = text => ({
            margin: [0, 16, 0, 9],
            columns: [
                {
                    width: 5,
                    canvas: [{ type: 'rect', x: 0, y: 0, w: 4, h: 18, r: 2, color: '#2563eb' }]
                },
                { width: '*', text, style: 'sectionTitle', margin: [5, 1, 0, 0] }
            ],
            columnGap: 0
        });
        const commentCard = (label, value) => {
            const lineCount = estimateLines(`${label}: ${value}`, 88);
            const contentHeight = Math.max(18, lineCount * 12.5);
            const height = Math.max(36, 18 + lineCount * 12.5);
            return {
                ...roundedCard([{
                    columns: [
                        {
                            width: 4,
                            canvas: [{ type: 'rect', x: 0, y: 0, w: 4, h: 18, r: 2, color: '#3b82f6' }]
                        },
                        {
                            width: '*',
                            text: [
                                { text: `${label}: `, style: 'inlineLabel' },
                                { text: value, style: 'bodyText' }
                            ],
                            margin: [5, 2.5, 0, 0]
                        }
                    ]
                }], pdfContentWidth, height, '#f2f7ff', {
                    paddingX: 10, radius: 8, centerContent: true, contentHeight
                }),
                margin: [0, 0, 0, 7]
            };
        };

        const studentStack = [
            { text: 'THÔNG TIN HỌC SINH', style: 'cardTitle', margin: [0, 0, 0, 9] },
            {
                table: {
                    widths: ['38%', '62%'],
                    body: [
                        labelValue('Họ và tên', `${nfc(st.name)} - ${nfc(st.class)}`),
                        labelValue('Học phí/buổi', privateCount > 0 ? this.formatVND(privateUnit) : this.formatVND(groupUnit)),
                        labelValue('Số buổi học', `${sessions.length} buổi`),
                        labelValue('Số giờ học', `${totalHours.toFixed(1)} giờ`),
                        labelValue('Ngày học', dates)
                    ]
                },
                layout: {
                    hLineWidth: index => index > 0 ? 0.7 : 0,
                    vLineWidth: () => 0,
                    hLineColor: () => '#dbeafe',
                    paddingLeft: () => 0,
                    paddingRight: () => 0,
                    paddingTop: () => 5.5,
                    paddingBottom: () => 5.5
                }
            }
        ];

        const tuitionStack = [
            { text: 'TỔNG HỌC PHÍ', style: 'cardTitle', alignment: 'center' },
            { text: this.formatVND(totalFee), style: 'totalPrice', alignment: 'center', margin: [0, 5, 0, 8] }
        ];
        if (this._invoiceQrDataUrl) {
            tuitionStack.push({ image: this._invoiceQrDataUrl, fit: [92, 92], alignment: 'center', margin: [0, 2, 0, 8] });
            tuitionStack.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 180, y2: 0, lineWidth: 1, lineColor: '#bfdbfe' }], alignment: 'center', margin: [0, 0, 0, 7] });
            tuitionStack.push({
                text: [
                    { text: 'Số TK: ', style: 'label' }, { text: '68688886669', style: 'value' }, '\n',
                    { text: 'Chủ TK: ', style: 'label' }, { text: 'Nguyễn Thanh Thúy', style: 'value' }
                ],
                alignment: 'center',
                lineHeight: 1.3
            });
        } else {
            tuitionStack.push({
                text: `${sessions.length} buổi học  |  ${totalHours.toFixed(1)} giờ`,
                style: 'summaryHint',
                alignment: 'center',
                margin: [0, 7, 0, 0]
            });
        }

        // Chiều cao phải đủ cho bảng thông tin + ngày học; nếu giữ số cố định,
        // dòng ngày dài sẽ tràn khỏi viền card và lệch với card học phí bên cạnh.
        const dateLineCount = Math.max(1, estimateLines(dates, 16));
        const studentNameLineCount = Math.max(1, estimateLines(`${nfc(st.name)} - ${nfc(st.class)}`, 20));
        const summaryHeight = Math.max(
            this._invoiceQrDataUrl ? 250 : 188,
            162 + dateLineCount * 15 + Math.max(0, studentNameLineCount - 1) * 14
        );
        const summaryTable = {
            columns: [
                {
                    width: pdfStudentWidth,
                    ...roundedCard(studentStack, pdfStudentWidth, summaryHeight, '#f8fbff', {
                        paddingX: 14, paddingY: 13, radius: 11, verticalAlignment: 'middle'
                    })
                },
                {
                    width: pdfTuitionWidth,
                    ...roundedCard(tuitionStack, pdfTuitionWidth, summaryHeight, '#f8fbff', {
                        paddingX: 14, paddingY: 13, radius: 11, verticalAlignment: 'middle'
                    })
                }
            ],
            columnGap: pdfColumnGap
        };

        const comments = [];
        if (overview) comments.push(commentCard('Tổng quan', overview));
        if (algebra) comments.push(commentCard('Đại số', algebra));
        if (geometry) comments.push(commentCard('Hình học', geometry));

        const roadmapHeight = Math.max(48, 24 + estimateLines(roadmap, 82) * 13);
        const scheduleText = schedule || 'Chưa có lịch học.';
        const lowerHeight = Math.max(
            46,
            24 + estimateLines(scheduleText, 34) * 13,
            24 + estimateLines(tuitionText, 34) * 13
        );

        const content = [
            {
                table: {
                    widths: ['*', 'auto'],
                    body: [[
                        { stack: [{ text: 'NttClass', style: 'brand' }, { text: teacherName, style: 'meta', margin: [0, 2, 0, 0] }] },
                        { stack: [{ text: 'PHIẾU HỌC PHÍ', style: 'eyebrow', alignment: 'right' }, { text: teacherPhone, style: 'meta', alignment: 'right', margin: [0, 2, 0, 0] }] }
                    ]]
                },
                layout: {
                    hLineWidth: index => index === 1 ? 1 : 0,
                    vLineWidth: () => 0,
                    hLineColor: () => '#dbeafe',
                    paddingLeft: () => 0,
                    paddingRight: () => 0,
                    paddingTop: () => 0,
                    paddingBottom: () => 8
                }
            },
            { text: title, style: 'title', alignment: 'center', margin: [0, 13, 0, 2] },
            { text: 'BÁO CÁO HỌC TẬP VÀ HỌC PHÍ', style: 'subtitle', alignment: 'center', margin: [0, 0, 0, 17] },
            summaryTable,
            ...(comments.length ? [sectionHeading('NHẬN XÉT HỌC TẬP'), ...comments] : []),
            ...(roadmap ? [
                sectionHeading('LỘ TRÌNH HỌC TẬP'),
                roundedCard([{ text: roadmap, style: 'bodyText' }], pdfContentWidth, roadmapHeight, '#fbfdff', {
                    radius: 9, centerContent: true, contentHeight: estimateLines(roadmap, 82) * 12.5
                })
            ] : []),
            {
                unbreakable: true,
                columns: [
                    {
                        width: pdfHalfWidth,
                        stack: [
                            sectionHeading('LỊCH HỌC'),
                            roundedCard([{ text: scheduleText, style: 'bodyText' }], pdfHalfWidth, lowerHeight, '#fbfdff', {
                                radius: 9, centerContent: true, contentHeight: estimateLines(scheduleText, 34) * 12.5
                            })
                        ]
                    },
                    {
                        width: pdfHalfWidth,
                        stack: [
                            sectionHeading('CHI TIẾT HỌC PHÍ'),
                            roundedCard([{ text: tuitionText, style: 'bodyText' }], pdfHalfWidth, lowerHeight, '#fbfdff', {
                                radius: 9, centerContent: true, contentHeight: estimateLines(tuitionText, 34) * 12.5
                            })
                        ]
                    }
                ],
                columnGap: pdfColumnGap,
                margin: [0, 0, 0, 4]
            }
        ];

        return {
            pageSize: 'A4',
            pageMargins: [52, 42, 52, 68],
            info: { title, author: teacherName, subject: 'Phiếu học phí học sinh' },
            background: (currentPage, pageSize) => ({
                canvas: [
                    { type: 'rect', x: 0, y: 0, w: pageSize.width, h: pageSize.height, color: '#eef6ff' },
                    { type: 'rect', x: 26, y: 22, w: pageSize.width - 52, h: pageSize.height - 44, r: 14, color: '#ffffff', lineColor: '#bfdbfe', lineWidth: 1.2 }
                ]
            }),
            content,
            defaultStyle: { font: 'BeVietnamPro', fontSize: 10, color: '#17345f', lineHeight: 1.25 },
            styles: {
                brand: { fontSize: 14, color: '#0b438f', bold: true },
                eyebrow: { fontSize: 8.5, color: '#64748b', bold: true, characterSpacing: 1.2 },
                meta: { fontSize: 9, color: '#334155', bold: true },
                title: { fontSize: 22, color: '#0b438f', bold: true },
                subtitle: { fontSize: 8.5, color: '#64748b', bold: true, characterSpacing: 1.1 },
                cardTitle: { fontSize: 11.5, color: '#0b438f', bold: true },
                sectionTitle: { fontSize: 11.5, color: '#0b438f', bold: true, characterSpacing: 0.35 },
                label: { fontSize: 9.5, color: '#0b438f' },
                value: { fontSize: 10, color: '#17345f', bold: true },
                inlineLabel: { fontSize: 10, color: '#0b438f', bold: true },
                bodyText: { fontSize: 10, color: '#17345f' },
                totalPrice: { fontSize: 25, color: '#17345f', bold: true },
                summaryHint: { fontSize: 8.5, color: '#64748b' },
                footerText: { fontSize: 9.5, color: '#17345f', bold: true }
            },
            footer: (currentPage, pageCount) => ({
                margin: [52, 0, 52, 0],
                stack: [
                    ...(currentPage === pageCount ? [roundedCard(
                        [{ text: note, alignment: 'center', style: 'footerText' }],
                        pdfContentWidth,
                        28,
                        '#dbeafe',
                        { radius: 9, paddingX: 10, borderColor: '#dbeafe', centerContent: true, contentHeight: 12.5 }
                    )] : []),
                    {
                        text: `Trang ${currentPage}/${pageCount}`,
                        alignment: 'center',
                        color: '#94a3b8',
                        fontSize: 8,
                        margin: [0, 7, 0, 0]
                    }
                ]
            })
        };
    },

    async exportInvoicePdf() {
        const definition = this.buildInvoicePdfDefinition();
        if (!definition) return;
        this.setBtnLoading('btnExportInvoicePdf', true, 'Đang tạo PDF...');
        try {
            const pdfMake = await this.ensurePdfMake();
            if (!pdfMake) throw new Error('Không tải được thư viện PDF');
            const studentId = document.getElementById('invoiceStudentId').value;
            const st = this.students.find(s => s.id === studentId);
            const todayStr = this.toISODateOnly(new Date());
            const safeName = String((st && st.name) || 'HocSinh').normalize('NFC').replace(/\s+/g, '');
            const pdfBlob = await new Promise((resolve, reject) => {
                try {
                    pdfMake.createPdf(definition).getBlob(resolve);
                } catch (err) {
                    reject(err);
                }
            });
            if (!(pdfBlob instanceof Blob) || pdfBlob.size < 100) throw new Error('File PDF tạo ra không hợp lệ');

            const header = await pdfBlob.slice(0, 5).text();
            if (header !== '%PDF-') throw new Error('File tải xuống không đúng định dạng PDF');

            const downloadUrl = URL.createObjectURL(pdfBlob);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = `PhieuHocPhi_${safeName}_${todayStr}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 30000);
            this.showToast('Đã xuất phiếu học phí dạng PDF thành công!', 'success');
        } catch (err) {
            console.error('Lỗi xuất phiếu học phí PDF:', err);
            this._pdfMakeLoadingPromise = null;
            this.showToast(err.message || 'Không thể xuất PDF, vui lòng thử lại.', 'error');
        } finally {
            this.setBtnLoading('btnExportInvoicePdf', false);
        }
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

        // Chuẩn hoá Unicode về NFC trước khi render để dấu tiếng Việt luôn gắn đúng
        // với ký tự gốc (đặc biệt với nội dung được dán từ Word/điện thoại).
        const esc = (s) => String(s || '').normalize('NFC').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const nl2br = (s) => esc(s).replace(/\n/g, '<br>');

        // Danh sách kiểu "checklist" (✓ đầu dòng) dùng cho khối LỊCH HỌC và GHI
        // CHÚ HỌC PHÍ, giống đúng bố cục trong mẫu phiếu. Nếu dòng có dấu ":"
        // thì in đậm phần trước dấu ":" (VD "16h–18h thứ 4:" in đậm).
        const plainListHTML = (text) => {
            const lines = esc(text).split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length === 0) return '';
            return lines.map(line => {
                const colonIdx = line.indexOf(':');
                const item = colonIdx > -1
                    ? `<strong>${line.slice(0, colonIdx + 1)}</strong>${line.slice(colonIdx + 1)}`
                    : line;
                return `<div class="list-item no-mark"><span class="list-text">${item}</span></div>`;
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
        if (privateCount > 0) feeNoteLines.push(`<strong>${privateCount} buổi học riêng:</strong> ${this.formatVND(privateUnit)}/buổi`);
        if (groupCount > 0) feeNoteLines.push(`<strong>${groupCount} buổi học chung:</strong> ${this.formatVND(groupUnit)}/buổi`);
        const feeNoteHTML = customTuitionNote
            ? plainListHTML(customTuitionNote)
            : feeNoteLines.map(l => `<div class="list-item no-mark"><span class="list-text">${l}</span></div>`).join('');

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

        const scheduleHTML = plainListHTML(schedule);
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
            font-family: 'Be Vietnam Pro', Arial, sans-serif;
            background: #eff6ff;
            width: 600px;
            max-width: 600px;
            padding: 20px;
            color: #17345f;
            overflow-wrap: break-word;
            word-break: break-word;
            -webkit-font-smoothing: antialiased;
        }
        #invoiceExportSheet .card-main { background:#fff; border-radius:22px; border:2px solid #bfdbfe; padding:18px; }

        /* ============ II. HEADER ============ */
        #invoiceExportSheet .header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; row-gap:6px; }
        #invoiceExportSheet .badge { display:inline-flex; align-items:center; line-height:1.4; color:#17345f; font-size:13px; font-weight:500; border:none; padding:0; border-radius:0; gap:0; background:none; }
        #invoiceExportSheet .phone { font-size:13px; color:#17345f; }
        #invoiceExportSheet .title { text-align:center; font-size:26px; font-weight:800; color:#0b438f; margin:6px 0 22px; line-height:1.5; }

        /* ============ III. GRID 2 CỘT ============ */
        #invoiceExportSheet .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; align-items:stretch; }
        #invoiceExportSheet .card { border:1.5px solid #bfdbfe; border-radius:18px; padding:14px; background:#fff; }
        #invoiceExportSheet .grid-2 > .card,
        #invoiceExportSheet .grid-bottom > .card { min-width:0; }
        #invoiceExportSheet .grid-2 > .card:nth-child(2) { display:flex; flex-direction:column; align-items:center; justify-content:flex-start; padding-top:14px; }
        #invoiceExportSheet .student-info-card { padding-top:8px; }
        /* Riêng padding trên của Lịch học/Lộ trình/Ghi chú học phí: chỉnh số đầu tiên (padding-top) này */
        #invoiceExportSheet .card.card-tight { padding:8px 14px 14px; }
        /* Khoảng cách tiêu đề "📝 Nhận xét học tập" -> ô comment-box đầu tiên: chỉnh margin-bottom này */
        #invoiceExportSheet .section-title { font-size:15px; font-weight:700; color:#0b438f; line-height:1.55; margin-bottom:6px; }
        /* Riêng khoảng cách tiêu đề "📝 Nhận xét học tập" -> ô đầu tiên: chỉnh margin-bottom này */
        #invoiceExportSheet .section-title.section-title-notes { margin-bottom:10px; }

        /* ============ IV. THÔNG TIN HỌC SINH ============ */
        #invoiceExportSheet .row { display:grid; grid-template-columns:minmax(84px, 36%) minmax(0, 1fr); align-items:start; gap:8px; padding:5px 0; border-bottom:1px dashed #bfdbfe; }
        #invoiceExportSheet .row:last-of-type { border-bottom:none; }
        #invoiceExportSheet .label { font-size:12px; color:#0b438f; }
        #invoiceExportSheet .value { min-width:0; overflow-wrap:anywhere; font-size:13px; color:#17345f; font-weight:600; text-align:right; }
        #invoiceExportSheet .date-label { font-size:12px; color:#0b438f; margin:8px 0 6px; }
        /* Tránh flex + phần tử chữ lồng nhau để html2canvas không làm mất nét chữ. */
        #invoiceExportSheet .date-chip-list { display:flex; flex-wrap:wrap; align-content:flex-start; gap:4px; }
        #invoiceExportSheet .date-chip { display:inline-flex; align-items:center; justify-content:center; min-height:30px; line-height:16px; background:#dbeafe; color:#17345f; font-weight:700; font-size:12px; white-space:nowrap; padding:7px 7px; border-radius:999px; margin:0; vertical-align:middle; text-align:center; }
        #invoiceExportSheet .date-chip-text { display:inline; line-height:16px; position:static; }

        /* ============ V. TỔNG HỌC PHÍ ============ */
        #invoiceExportSheet .total-title { text-align:center; font-size:13px; color:#0b438f; }
        /* Khoảng cách TỔNG HỌC PHÍ -> 700.000đ: chỉnh số margin-top này (đang để 6px bằng với gap dưới) */
        #invoiceExportSheet .total-price { text-align:center; font-size:30px; font-weight:700; color:#17345f; margin-top:0px; }
        /* Khoảng cách 700.000đ -> ảnh QR: chỉnh số margin-top này (đang để 6px bằng với gap trên) */
        #invoiceExportSheet .qr { width:110px; height:110px; display:block; margin:16px auto 8px; object-fit:contain; border-radius:10px; border:2px solid #bfdbfe; background:#fff; }
        #invoiceExportSheet .divider { border-top:1px solid #bfdbfe; margin:8px 0; }
        #invoiceExportSheet .bank { text-align:center; font-size:13px; color:#0b438f; line-height:1.4; }
        #invoiceExportSheet .bank b { color:#17345f; }

        /* ============ VI. NHẬN XÉT ============ */
        /* Padding bên trong mỗi ô "Tổng quan/Đại số/Hình học": chỉnh 4 số trong padding này */
        #invoiceExportSheet .comment-box { background:#eff6ff; border-radius:12px; padding:10px 10px 10px 14px; margin-bottom:10px; position:relative; overflow:visible; }
        /* Khoảng cách giữa các ô comment-box với nhau: chỉnh margin-bottom ở dòng trên (ô cuối luôn về 0, không cần sửa dòng dưới) */
        #invoiceExportSheet .comment-box:last-child { margin-bottom:0; }
        #invoiceExportSheet .comment-box::before { content:''; position:absolute; left:0; top:0; width:5px; height:100%; background:#3b82f6; border-radius:12px 0 0 12px; }
        /* Cùng quy ước với bảng thông tin phía trên: nhãn xanh, nội dung đen. */
        #invoiceExportSheet .comment-text { color:#17345f; font-size:13px; line-height:1.5; }
        #invoiceExportSheet .comment-text strong { color:#0b438f; }

        /* ============ VII. 2 CARD DƯỚI ============ */
        #invoiceExportSheet .grid-bottom { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:10px; }
        #invoiceExportSheet .list-item { display:flex; align-items:flex-start; gap:6px; font-size:13px; line-height:1.5; margin-bottom:5px; }
        #invoiceExportSheet .list-item:last-child { margin-bottom:0; }
        #invoiceExportSheet .list-item .mark { color:#3b82f6; font-weight:700; flex-shrink:0; }
        #invoiceExportSheet .list-item .list-text { min-width:0; }
        #invoiceExportSheet .list-item strong { color:#0b438f; }
        #invoiceExportSheet .list-item.no-mark { display:block; }
        #invoiceExportSheet .empty-hint { font-size:13px; color:#93c5fd; }

        /* ============ VIII. FOOTER ============ */
        #invoiceExportSheet .footer { background:#dbeafe; border-radius:12px; padding:9px 8px; display:flex; align-items:center; justify-content:center; text-align:center; font-size:12px; font-weight:600; color:#17345f; }
        #invoiceExportSheet .footer-text { line-height:1.5; }
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
                <div class="date-label">Ngày học</div>
                <div class="date-chip-list">${dateChips || '<span class="empty-hint">Chưa có buổi học trong kỳ</span>'}</div>
            </div>

            <div class="card" style="text-align:center;">
                <div class="total-title">TỔNG HỌC PHÍ</div>
                <div class="total-price">${this.formatVND(totalFee)}</div>
                ${qrHTML}
            </div>
        </div>

        ${quoteItemsHTML ? `<div class="section-block"><div class="section-title section-title-notes">📝 Nhận xét học tập</div>${quoteItemsHTML}</div>` : ''}

        ${roadmapHTML ? `<div class="card card-tight section-block"><div class="section-title">🎯 Lộ trình</div>${roadmapHTML}</div>` : ''}

        ${(scheduleHTML || feeNoteHTML) ? `
        <div class="grid-bottom">
            <div class="card card-tight">
                <div class="section-title">📅 Lịch học</div>
                ${scheduleHTML || '<span class="empty-hint">Chưa có lịch học.</span>'}
            </div>
            <div class="card card-tight">
                <div class="section-title">💡 Học phí</div>
                ${feeNoteHTML || '<span class="empty-hint">Chưa có học phí.</span>'}
            </div>
        </div>` : ''}

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
            // Đợi toàn bộ font của trang ổn định trước khi chụp để tránh chữ
            // có dấu hiển thị sai/vỡ khi ảnh được tạo quá sớm.
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
                backgroundColor: '#eff6ff',
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
