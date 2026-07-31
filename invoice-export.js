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

    getInvoiceTemplateFields() {
        return {
            teacherName: 'invoiceTeacherName',
            teacherPhone: 'invoiceTeacherPhone',
            overview: 'invoiceOverview',
            algebra: 'invoiceAlgebra',
            geometry: 'invoiceGeometry',
            roadmap: 'invoiceRoadmap',
            schedule: 'invoiceSchedule',
            note: 'invoiceNote'
        };
    },

    readInvoiceTemplateForm() {
        return Object.fromEntries(Object.entries(this.getInvoiceTemplateFields()).map(([field, elementId]) => [
            field,
            String(document.getElementById(elementId)?.value || '').normalize('NFC').trim()
        ]));
    },

    applyInvoiceTemplate(template) {
        if (!template || typeof template !== 'object') return;
        Object.entries(this.getInvoiceTemplateFields()).forEach(([field, elementId]) => {
            if (!Object.prototype.hasOwnProperty.call(template, field)) return;
            const element = document.getElementById(elementId);
            if (element) element.value = String(template[field] || '');
        });
    },

    async loadInvoiceTemplate(studentId) {
        this._invoiceTemplateCache = this._invoiceTemplateCache || new Map();
        if (this._invoiceTemplateCache.has(studentId)) return this._invoiceTemplateCache.get(studentId);
        const response = await this.authFetch(`${API_BASE_URL}/api/invoice-templates/${encodeURIComponent(studentId)}`, { cache: 'no-store' });
        const data = await this.requireApiSuccess(response, 'Không thể tải mẫu phiếu học phí.');
        const template = data?.template || null;
        this._invoiceTemplateCache.set(studentId, template);
        return template;
    },

    async saveInvoiceTemplate() {
        const studentId = String(document.getElementById('invoiceStudentId')?.value || '').trim();
        if (!studentId) return false;
        const template = this.readInvoiceTemplateForm();
        try {
            const response = await this.authFetch(`${API_BASE_URL}/api/invoice-templates/${encodeURIComponent(studentId)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ template })
            });
            const saved = await this.requireApiSuccess(response, 'Không thể lưu mẫu phiếu học phí.');
            this._invoiceTemplateCache = this._invoiceTemplateCache || new Map();
            this._invoiceTemplateCache.set(studentId, saved?.template || template);
            return true;
        } catch (error) {
            console.error('[saveInvoiceTemplate]', error);
            this.showToast('Phiếu đã xuất nhưng chưa lưu được mẫu dùng cho tháng sau.', 'error');
            return false;
        }
    },

    // Bấm nút "Xuất phiếu" ở 1 dòng học sinh trong bảng Học phí -> tự động
    // truyền sẵn thông tin học sinh + số liệu học phí của chính em đó vào form,
    // giáo viên chỉ cần nhập thêm phần nhận xét rồi bấm "Xuất phiếu".
    async openInvoiceModal(studentId) {
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

        // Mỗi lần mở phiếu luôn lấy kỳ đang chọn trên bộ lọc tháng; không dùng lại
        // ngày, tiêu đề hay số liệu của lần xuất trước.
        const periodMatch = String(this.currentMonthFilter || '').match(/^(\d{4})-(\d{1,2})$/);
        let periodYear = null;
        let periodMonth = null;
        if (periodMatch) {
            periodYear = Number(periodMatch[1]);
            periodMonth = Number(periodMatch[2]);
            const monthText = String(periodMonth).padStart(2, '0');
            const lastDay = new Date(periodYear, periodMonth, 0).getDate();
            document.getElementById('invoiceFromDate').value = `${periodYear}-${monthText}-01`;
            document.getElementById('invoiceToDate').value = `${periodYear}-${monthText}-${String(lastDay).padStart(2, "0")}`;
        } else if (this._invoiceAllSessions.length > 0) {
            document.getElementById('invoiceFromDate').value = this._invoiceAllSessions[0].date;
            document.getElementById('invoiceToDate').value = this._invoiceAllSessions[this._invoiceAllSessions.length - 1].date;
        } else {
            document.getElementById('invoiceFromDate').value = '';
            document.getElementById('invoiceToDate').value = '';
        }

        if (periodYear && periodMonth) {
            document.getElementById('invoiceTitle').value = `HỌC PHÍ THÁNG ${periodMonth}/${periodYear}`;
        } else {
            const titleDate = this._invoiceAllSessions[0]?.date || this.toISODateOnly(new Date());
            const [titleYear, titleMonth] = String(titleDate).split('-');
            document.getElementById('invoiceTitle').value = `HỌC PHÍ THÁNG ${Number(titleMonth)}/${titleYear}`;
        }

        document.getElementById('invoiceTeacherName').value = (this.currentUser && this.currentUser.name) || '';
        document.getElementById('invoiceTeacherPhone').value = '';
        document.getElementById('invoiceOverview').value = '';
        document.getElementById('invoiceAlgebra').value = '';
        document.getElementById('invoiceGeometry').value = '';
        document.getElementById('invoiceRoadmap').value = '';
        document.getElementById('invoiceSchedule').value = '';
        document.getElementById('invoiceTuitionNote').value = '';
        document.getElementById('invoiceNote').value = 'Phụ huynh vui lòng kiểm tra thông tin học phí và lịch học trong tháng.';

        // QR và các số liệu theo tháng luôn lấy mới, không lưu trong mẫu.
        this.setInvoiceQrImage(null, { persist: false });

        this.recomputeInvoiceTotals();
        this.openModal('invoiceModal');

        const loadToken = `${studentId}:${Date.now()}`;
        this._invoiceTemplateLoadToken = loadToken;
        const initialTemplateState = JSON.stringify(this.readInvoiceTemplateForm());
        try {
            const template = await this.loadInvoiceTemplate(studentId);
            if (this._invoiceTemplateLoadToken !== loadToken || this._invoiceStudentId !== studentId) return;
            if (JSON.stringify(this.readInvoiceTemplateForm()) !== initialTemplateState) return;
            this.applyInvoiceTemplate(template);
        } catch (error) {
            console.warn('[loadInvoiceTemplate]', error.message);
        }
    },

    // Gán/xoá ảnh QR thanh toán đang dùng cho phiếu học phí và cập nhật khung
    // xem trước. Dữ liệu chỉ tồn tại trong bộ nhớ của tab hiện tại.
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
            const scriptIntegrity = Object.freeze({
                'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.12/pdfmake.min.js': 'sha512-axXaF5grZBaYl7qiM6OMHgsgVXdSLxqq0w7F4CQxuFyrcPmn0JfnqsOtYHUun80g6mRRdvJDrTCyL8LQqBOt/Q==',
                'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.12/vfs_fonts.js': 'sha512-nNkHPz+lD0Wf0eFGO0ZDxr+lWiFalFutgVeGkPdVgrG4eXDYUnhfEj9Zmg1QkrJFLC0tGs8ZExyU/1mjs4j93w=='
            });
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
                const integrity = scriptIntegrity[src];
                if (integrity) {
                    script.integrity = integrity;
                    script.crossOrigin = 'anonymous';
                    script.referrerPolicy = 'no-referrer';
                }
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
                    '/vendor/pdfmake.min.js',
                    'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.12/pdfmake.min.js'
                ]);
                await loadWithFallback([
                    '/vendor/vfs_fonts.js',
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
        const teacherPhone = nfc(document.getElementById('invoiceTeacherPhone').value) || '-';
        const overview = nfc(document.getElementById('invoiceOverview').value);
        const algebra = nfc(document.getElementById('invoiceAlgebra').value);
        const geometry = nfc(document.getElementById('invoiceGeometry').value);
        const roadmap = nfc(document.getElementById('invoiceRoadmap').value);
        const schedule = nfc(document.getElementById('invoiceSchedule').value);
        const customTuition = nfc(document.getElementById('invoiceTuitionNote').value);
        const note = nfc(document.getElementById('invoiceNote').value) || '-';
        const dateParts = sessions.map(sess => {
            const [year, month, day] = String(sess.date || '').split('-');
            return day && month && year ? `${day}/${month}` : String(sess.date || '');
        }).filter(Boolean);
        const dates = dateParts.length
            ? Array.from({ length: Math.ceil(dateParts.length / 3) }, (_, index) => dateParts.slice(index * 3, index * 3 + 3).join(', ')).join('\n')
            : '-';

        const tuitionText = customTuition;

        const labelValue = (label, value) => [
            { text: label, style: 'label' },
            { text: nfc(value), style: 'value', alignment: 'right' }
        ];
        const pdfContentWidth = 491.28;
        const pdfColumnGap = 14;
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
            margin: [0, 10, 0, 5],
            columns: [
                {
                    width: 5,
                    canvas: [{ type: 'rect', x: 0, y: 0, w: 4, h: 18, r: 2, color: '#2563eb' }]
                },
                { width: '*', text, style: 'sectionTitle', margin: [5, 1, 0, 0] }
            ],
            columnGap: 0
        });
        const sectionUnderline = {
            canvas: [{ type: 'line', x1: 10, y1: 0, x2: pdfContentWidth, y2: 0, lineWidth: 0.8, lineColor: '#bfdbfe' }],
            margin: [0, -2, 0, 6]
        };
        const plainSection = (heading, rows) => [
            sectionHeading(heading),
            sectionUnderline,
            ...rows
        ];
        const plainText = text => ({ text, style: 'bodyText', margin: [10, 0, 0, 5] });
        const bulletRows = (text, leftMargin = 10, topMargin = 0) => {
            const lines = nfc(text).split('\n').map(line => line.trim()).filter(Boolean);
            if (lines.length === 0) {
                return [{ text: '-', style: 'bodyText', margin: [leftMargin, topMargin, 0, 5] }];
            }
            return lines.map((line, index) => ({
                text: [
                    { text: '\u2022 ', bold: true, color: '#2563eb' },
                    { text: line }
                ],
                style: 'bodyText',
                margin: [leftMargin, index === 0 ? topMargin : 0, 0, 5]
            }));
        };
        const plainComment = (label, value, stacked = false) => stacked
            ? ({
                stack: [
                    { text: `${label}:`, style: 'inlineLabel' },
                    ...bulletRows(value, 0, 2)
                ],
                margin: [10, 0, 0, 6]
            })
            : ({
                text: [
                    { text: `${label}: `, style: 'inlineLabel' },
                    { text: nfc(value) || '-', style: 'bodyText' }
                ],
                margin: [10, 0, 0, 5]
            });

        const studentStack = [
            { text: 'THÔNG TIN HỌC SINH', style: 'cardTitle', margin: [0, 0, 0, 4] },
            {
                canvas: [{ type: 'line', x1: 0, y1: 0, x2: pdfStudentWidth - 28, y2: 0, lineWidth: 0.8, lineColor: '#bfdbfe' }],
                margin: [0, 0, 0, 6]
            },
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
                    { text: 'Số TK: ', style: 'label' }, { text: '0978783058', style: 'value' }, '\n',
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
        const dateLineCount = Math.max(1, dates.split('\n').length);
        const studentNameLineCount = Math.max(1, estimateLines(`${nfc(st.name)} - ${nfc(st.class)}`, 20));
        const summaryHeight = Math.max(
            this._invoiceQrDataUrl ? 230 : 205,
            150 + dateLineCount * 14 + Math.max(0, studentNameLineCount - 1) * 14
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

        const comments = [
            plainComment('Tổng quan', overview),
            plainComment('Đại số', algebra, true),
            plainComment('Hình học', geometry, true)
        ];

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
            ...plainSection('NHẬN XÉT HỌC TẬP', comments),
            ...plainSection('LỘ TRÌNH HỌC TẬP', bulletRows(roadmap)),
            ...plainSection('LỊCH HỌC', bulletRows(schedule)),
            ...(tuitionText ? plainSection('CHI TIẾT HỌC PHÍ', bulletRows(tuitionText)) : [])
        ];

        return {
            pageSize: 'A4',
            pageMargins: [52, 36, 52, 58],
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
            await this.saveInvoiceTemplate();
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

        // Dùng chung dấu chấm đầu dòng cho mọi nội dung dạng danh sách, trừ Tổng quan.
        // Nếu dòng có dấu ":" thì in đậm phần trước dấu ":".
        const bulletListHTML = (text) => {
            const lines = esc(text).split('\n').map(line => line.trim()).filter(Boolean);
            if (lines.length === 0) return '';
            return lines.map(line => {
                const colonIndex = line.indexOf(':');
                const item = colonIndex > -1
                    ? `<strong>${line.slice(0, colonIndex + 1)}</strong>${line.slice(colonIndex + 1)}`
                    : line;
                return `<div class="list-item"><span class="mark">&#8226;</span><span class="list-text">${item}</span></div>`;
            }).join('');
        };

        const dateChips = sessions.map(s => {
            const [y, m, d] = String(s.date).split('-');
            return `<span class="date-chip"><span class="date-chip-text">${d}/${m}</span></span>`;
        }).join('');

        // Chỉ hiện phần học phí chi tiết khi giáo viên nhập nội dung riêng cho mục này.
        const customTuitionNote = document.getElementById('invoiceTuitionNote').value.trim();
        const feeNoteHTML = customTuitionNote ? bulletListHTML(customTuitionNote) : '';

        // Tổng quan giữ nguyên; mỗi dòng Đại số và Hình học dùng cùng dấu chấm như Lộ trình.
        const bulletOrDashHTML = text => bulletListHTML(text) || '<span class="empty-hint">-</span>';
        const quoteItemsHTML = [
            `<div class="plain-row"><strong>Tổng quan:</strong> ${overview ? nl2br(overview) : "-"}</div>`,
            `<div class="plain-row is-stacked"><strong>Đại số:</strong><div class="stacked-list">${bulletOrDashHTML(algebra)}</div></div>`,
            `<div class="plain-row is-stacked"><strong>Hình học:</strong><div class="stacked-list">${bulletOrDashHTML(geometry)}</div></div>`,
        ].join('');

        const scheduleHTML = bulletListHTML(schedule);
        const roadmapHTML = bulletListHTML(roadmap);

        // Ảnh QR thanh toán (tuỳ chọn) — chèn ngay dưới khối "Tổng học phí",
        // căn giữa, giữ nguyên tỉ lệ ảnh gốc (object-fit:contain). PHẢI là
        // ảnh QR thật (vuông, mã vạch 2 chiều) — không phải ảnh chân dung.
        const qrHTML = this._invoiceQrDataUrl
            ? `<img class="qr" src="${this._invoiceQrDataUrl}" alt="QR thanh toán">
               <div class="divider"></div>
               <div class="bank">Số TK: <b>0978783058</b><br>Chủ TK: <b>Nguyễn Thanh Thuý</b></div>`
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
        #invoiceExportSheet .grid-2 > .card { min-width:0; }
        #invoiceExportSheet .grid-2 > .card:nth-child(2) { display:flex; flex-direction:column; align-items:center; justify-content:flex-start; padding-top:14px; }
        #invoiceExportSheet .student-info-card { padding-top:8px; }
        #invoiceExportSheet .student-info-card > .section-title { padding-bottom:5px; border-bottom:1px solid #bfdbfe; }
        #invoiceExportSheet .section-title { font-size:15px; font-weight:700; color:#0b438f; line-height:1.55; margin-bottom:6px; }

        /* ============ IV. THÔNG TIN HỌC SINH ============ */
        #invoiceExportSheet .row { display:grid; grid-template-columns:minmax(84px, 36%) minmax(0, 1fr); align-items:start; gap:8px; padding:5px 0; border-bottom:1px dashed #bfdbfe; }
        #invoiceExportSheet .row:last-of-type { border-bottom:none; }
        #invoiceExportSheet .label { font-size:12px; color:#0b438f; }
        #invoiceExportSheet .value { min-width:0; overflow-wrap:anywhere; font-size:13px; color:#17345f; font-weight:600; text-align:right; }
        #invoiceExportSheet .date-label { font-size:12px; color:#0b438f; margin:8px 0 6px; }
        /* Tránh flex + phần tử chữ lồng nhau để html2canvas không làm mất nét chữ. */
        #invoiceExportSheet .date-chip-list { display:flex; flex-wrap:wrap; align-content:flex-start; column-gap:12px; row-gap:5px; }
        #invoiceExportSheet .date-chip { display:inline; color:#17345f; font-weight:700; font-size:12px; white-space:nowrap; padding:0; margin:0; background:transparent; border-radius:0; }
        #invoiceExportSheet .date-chip-text { display:inline; line-height:1.5; position:static; }

        /* ============ V. TỔNG HỌC PHÍ ============ */
        #invoiceExportSheet .total-title { text-align:center; font-size:13px; color:#0b438f; }
        /* Khoảng cách TỔNG HỌC PHÍ -> 700.000đ: chỉnh số margin-top này (đang để 6px bằng với gap dưới) */
        #invoiceExportSheet .total-price { text-align:center; font-size:30px; font-weight:700; color:#17345f; margin-top:0px; }
        /* Khoảng cách 700.000đ -> ảnh QR: chỉnh số margin-top này (đang để 6px bằng với gap trên) */
        #invoiceExportSheet .qr { width:110px; height:110px; display:block; margin:16px auto 8px; object-fit:contain; border-radius:10px; border:2px solid #bfdbfe; background:#fff; }
        #invoiceExportSheet .divider { border-top:1px solid #bfdbfe; margin:8px 0; }
        #invoiceExportSheet .bank { text-align:center; font-size:13px; color:#0b438f; line-height:1.4; }
        #invoiceExportSheet .bank b { color:#17345f; }

        /* ============ VI. NỘI DUNG MỘT CỘT ============ */
        #invoiceExportSheet .plain-section { margin-top:12px; padding:0 2px 10px; text-align:left; }
        #invoiceExportSheet .plain-section .section-title { margin-bottom:7px; padding-bottom:5px; border-bottom:1px solid #bfdbfe; text-transform:uppercase; }
        #invoiceExportSheet .plain-row { color:#17345f; font-size:13px; line-height:1.55; margin-bottom:6px; text-align:left; }
        #invoiceExportSheet .plain-row:last-child { margin-bottom:0; }
        #invoiceExportSheet .plain-row strong { color:#0b438f; }
        #invoiceExportSheet .plain-row.is-stacked > strong { display:block; }
        #invoiceExportSheet .plain-row.is-stacked .stacked-list { margin-top:2px; }
        #invoiceExportSheet .list-item { display:flex; align-items:flex-start; gap:6px; font-size:13px; line-height:1.5; margin-bottom:5px; }
        #invoiceExportSheet .list-item:last-child { margin-bottom:0; }
        #invoiceExportSheet .list-item .mark { color:#3b82f6; font-weight:700; flex-shrink:0; }
        #invoiceExportSheet .list-item .list-text { min-width:0; }
        #invoiceExportSheet .list-item strong { color:#0b438f; }
        #invoiceExportSheet .list-item.no-mark { display:block; }
        #invoiceExportSheet .empty-hint { font-size:13px; color:#93c5fd; }

        /* ============ VII. FOOTER ============ */
        #invoiceExportSheet .footer { background:#dbeafe; border-radius:12px; padding:9px 8px; display:flex; align-items:center; justify-content:center; text-align:center; font-size:12px; font-weight:600; color:#17345f; }
        #invoiceExportSheet .footer-text { line-height:1.5; }
        #invoiceExportSheet .footer.section-block { margin-top:4px; }
    </style>
    <div class="card-main">
        <div class="header">
            <span class="badge">${esc(teacherName)}</span>
            <span class="phone">${teacherPhone ? esc(teacherPhone) : '-'}</span>
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
                <div class="date-chip-list">${dateChips || '<span class="empty-hint">-</span>'}</div>
            </div>

            <div class="card" style="text-align:center;">
                <div class="total-title">TỔNG HỌC PHÍ</div>
                <div class="total-price">${this.formatVND(totalFee)}</div>
                ${qrHTML}
            </div>
        </div>

        <div class="plain-section"><div class="section-title">Nhận xét học tập</div>${quoteItemsHTML}</div>

        <div class="plain-section"><div class="section-title">Lộ trình</div>${roadmapHTML || '<span class="empty-hint">-</span>'}</div>

        <div class="plain-section">
            <div class="section-title">Lịch học</div>
            ${scheduleHTML || '<span class="empty-hint">-</span>'}
        </div>

        ${feeNoteHTML ? `<div class="plain-section"><div class="section-title">Học phí</div>${feeNoteHTML}</div>` : ''}

        <div class="footer section-block"><span class="footer-text">${note ? nl2br(note) : '-'}</span></div>
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
            await this.saveInvoiceTemplate();

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
