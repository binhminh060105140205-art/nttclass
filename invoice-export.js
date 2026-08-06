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

    getInvoiceSetupFieldLabels() {
        return {
            teacherName: 'Tên giáo viên',
            teacherPhone: 'Số điện thoại',
            bankAccountNumber: 'Số tài khoản',
            bankAccountHolder: 'Chủ tài khoản',
            qrDataUrl: 'Ảnh QR thanh toán'
        };
    },

    getMissingInvoiceSetupFields(setup = this._invoiceSetup) {
        return Object.keys(this.getInvoiceSetupFieldLabels()).filter(field => !String(setup?.[field] || '').trim());
    },

    isInvoiceSetupComplete(setup = this._invoiceSetup) {
        return this.getMissingInvoiceSetupFields(setup).length === 0;
    },

    async loadInvoiceSetup({ force = false } = {}) {
        if (!['teacher', 'assistant'].includes(this.currentRole)) return null;
        if (!force && this._invoiceSetupLoaded) return this._invoiceSetup;
        if (!force && this._invoiceSetupLoadPromise) return this._invoiceSetupLoadPromise;

        this._invoiceSetupLoadPromise = (async () => {
            const response = await this.authFetch(`${API_BASE_URL}/api/account/invoice-setup`, { cache: 'no-store' });
            const data = await this.requireApiSuccess(response, 'Không thể tải setup phiếu học phí.');
            this._invoiceSetup = data?.setup || null;
            this._invoiceSetupLoaded = true;
            this._invoiceQrDataUrl = this._invoiceSetup?.qrDataUrl || null;
            this.applyInvoiceSetupToSettings(this._invoiceSetup);
            this.updateInvoiceSetupGate();
            return this._invoiceSetup;
        })();

        try {
            return await this._invoiceSetupLoadPromise;
        } finally {
            this._invoiceSetupLoadPromise = null;
        }
    },

    applyInvoiceSetupToSettings(setup = this._invoiceSetup) {
        const values = {
            teacherName: setup?.teacherName || this.currentUser?.name || '',
            teacherPhone: setup?.teacherPhone || '',
            bankAccountNumber: setup?.bankAccountNumber || '',
            bankAccountHolder: setup?.bankAccountHolder || ''
        };
        Object.entries(values).forEach(([field, value]) => {
            const input = document.getElementById(`settingsInvoice${field.charAt(0).toUpperCase()}${field.slice(1)}`);
            if (input) input.value = value;
        });
        this.setInvoiceSetupQrImage(setup?.qrDataUrl || null, { updateSavedSetup: false });
        this.updateInvoiceSetupDraftStatus();
    },

    setInvoiceSetupQrImage(dataUrl, { updateSavedSetup = false } = {}) {
        this._invoiceSetupDraftQrDataUrl = dataUrl || null;
        if (updateSavedSetup && this._invoiceSetup) this._invoiceSetup.qrDataUrl = dataUrl || '';

        const previewWrap = document.getElementById('settingsInvoiceQrPreviewWrap');
        const preview = document.getElementById('settingsInvoiceQrPreview');
        const label = document.getElementById('settingsInvoiceQrLabel');
        const input = document.getElementById('settingsInvoiceQrInput');
        if (previewWrap && preview && label) {
            if (this._invoiceSetupDraftQrDataUrl) {
                preview.src = this._invoiceSetupDraftQrDataUrl;
                previewWrap.hidden = false;
                label.hidden = true;
            } else {
                preview.removeAttribute('src');
                previewWrap.hidden = true;
                label.hidden = false;
                if (input) input.value = '';
            }
        }
        this.updateInvoiceSetupDraftStatus();
    },

    readInvoiceSetupSettingsForm() {
        return {
            teacherName: String(document.getElementById('settingsInvoiceTeacherName')?.value || '').normalize('NFC').trim(),
            teacherPhone: String(document.getElementById('settingsInvoiceTeacherPhone')?.value || '').normalize('NFC').trim(),
            bankAccountNumber: String(document.getElementById('settingsInvoiceBankAccountNumber')?.value || '').normalize('NFC').trim(),
            bankAccountHolder: String(document.getElementById('settingsInvoiceBankAccountHolder')?.value || '').normalize('NFC').trim(),
            qrDataUrl: this._invoiceSetupDraftQrDataUrl || ''
        };
    },

    updateInvoiceSetupDraftStatus() {
        const status = document.getElementById('invoiceSetupStatus');
        if (!status || !document.getElementById('settingsInvoiceTeacherName')) return;
        const draft = this.readInvoiceSetupSettingsForm();
        const missingFields = this.getMissingInvoiceSetupFields(draft);
        const labels = this.getInvoiceSetupFieldLabels();
        status.classList.toggle('is-complete', missingFields.length === 0);
        status.classList.toggle('is-incomplete', missingFields.length > 0);
        status.textContent = missingFields.length === 0
            ? 'Đã nhập đủ. Bấm lưu để dùng tự động cho mọi phiếu.'
            : `Chưa đủ: ${missingFields.map(field => labels[field]).join(', ')}.`;
    },

    async saveInvoiceSetup() {
        const setup = this.readInvoiceSetupSettingsForm();
        const missingFields = this.getMissingInvoiceSetupFields(setup);
        const labels = this.getInvoiceSetupFieldLabels();
        if (missingFields.length > 0) {
            this.showToast(`Vui lòng nhập đủ: ${missingFields.map(field => labels[field]).join(', ')}.`, 'error');
            return false;
        }
        if (!/^[0-9+()\-\s]{8,20}$/.test(setup.teacherPhone)) {
            this.showToast('Số điện thoại trên phiếu không hợp lệ.', 'error');
            return false;
        }

        this.setBtnLoading('btnSaveInvoiceSetup', true, 'Đang lưu setup...');
        try {
            const response = await this.authFetch(`${API_BASE_URL}/api/account/invoice-setup`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ setup })
            });
            const data = await this.requireApiSuccess(response, 'Không thể lưu setup phiếu học phí.');
            this._invoiceSetup = data?.setup || setup;
            this._invoiceSetupLoaded = true;
            this._invoiceQrDataUrl = this._invoiceSetup.qrDataUrl || null;
            this.applyInvoiceSetupToSettings(this._invoiceSetup);
            this.updateInvoiceSetupGate();
            this.showToast('Đã lưu Setup phiếu học phí cho tài khoản này.', 'success');

            const pendingStudentId = this._pendingInvoiceStudentId;
            this._pendingInvoiceStudentId = null;
            if (pendingStudentId) {
                this.closeModal('accountSettingsModal');
                await this.openInvoiceModal(pendingStudentId);
            } else if (document.getElementById('invoiceModal')?.classList.contains('show')) {
                this.scheduleInvoiceLivePreview(0);
            }
            return true;
        } catch (error) {
            this.showToast(error.message || 'Không thể lưu setup phiếu học phí.', 'error');
            return false;
        } finally {
            this.setBtnLoading('btnSaveInvoiceSetup', false);
        }
    },

    async openInvoiceSetupFromInvoice() {
        this._pendingInvoiceStudentId = String(document.getElementById('invoiceStudentId')?.value || this._invoiceStudentId || '');
        this.closeModal('invoiceModal');
        await this.openSettingsModal({ focusInvoiceSetup: true });
    },

    updateInvoiceSetupGate() {
        const complete = this.isInvoiceSetupComplete();
        const banner = document.getElementById('invoiceSetupRequiredBanner');
        const summary = document.getElementById('invoiceSetupSummary');
        const exportImageButton = document.getElementById('btnExportInvoice');
        const exportPdfButton = document.getElementById('btnExportInvoicePdf');
        if (banner) banner.hidden = complete;
        if (exportImageButton) exportImageButton.disabled = !complete;
        if (exportPdfButton) exportPdfButton.disabled = !complete;
        if (summary) {
            summary.textContent = complete
                ? `${this._invoiceSetup.teacherName} · STK ${this._invoiceSetup.bankAccountNumber}`
                : 'Chưa có Setup phiếu học phí đầy đủ.';
        }
        return complete;
    },

    getInvoiceTemplateFields() {
        return {
            overview: 'invoiceOverview',
            algebraLabel: 'invoiceAlgebraLabel',
            algebra: 'invoiceAlgebra',
            geometryLabel: 'invoiceGeometryLabel',
            geometry: 'invoiceGeometry',
            roadmap: 'invoiceRoadmap',
            schedule: 'invoiceSchedule',
            tuitionNote: 'invoiceTuitionNote',
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
        this.syncInvoiceCommentLabels();
        this.scheduleInvoiceLivePreview();
    },

    getInvoiceCommentLabelConfig(field) {
        return {
            algebra: {
                inputId: 'invoiceAlgebraLabel',
                textId: 'invoiceAlgebraLabelText',
                textareaId: 'invoiceAlgebra',
                fallback: 'Đại số'
            },
            geometry: {
                inputId: 'invoiceGeometryLabel',
                textId: 'invoiceGeometryLabelText',
                textareaId: 'invoiceGeometry',
                fallback: 'Hình học'
            }
        }[field] || null;
    },

    normalizeInvoiceCommentLabel(value, fallback) {
        return String(value || '')
            .normalize('NFC')
            .replace(/[\r\n:]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 80) || fallback;
    },

    getInvoiceCommentLabel(field) {
        const config = this.getInvoiceCommentLabelConfig(field);
        if (!config) return '';
        return this.normalizeInvoiceCommentLabel(document.getElementById(config.inputId)?.value, config.fallback);
    },

    syncInvoiceCommentLabels() {
        ['algebra', 'geometry'].forEach(field => {
            const config = this.getInvoiceCommentLabelConfig(field);
            const label = this.getInvoiceCommentLabel(field);
            const input = document.getElementById(config.inputId);
            const text = document.getElementById(config.textId);
            const textarea = document.getElementById(config.textareaId);
            const button = text?.closest('.invoice-editable-label-row')?.querySelector('.invoice-label-edit-btn');
            if (input) input.value = label;
            if (text) text.textContent = label;
            if (textarea) textarea.placeholder = 'Nhận xét phần ' + label + '...';
            if (button) {
                button.title = 'Đổi tên mục nhận xét ' + label;
                button.setAttribute('aria-label', 'Đổi tên mục nhận xét ' + label);
            }
        });
    },

    editInvoiceCommentLabel(field) {
        const config = this.getInvoiceCommentLabelConfig(field);
        if (!config) return;
        const currentLabel = this.getInvoiceCommentLabel(field);
        const nextLabel = window.prompt(
            'Nhập tên phần nhận xét mới (ví dụ: Số học). Để trống để dùng lại tên mặc định.',
            currentLabel
        );
        if (nextLabel === null) return;
        const input = document.getElementById(config.inputId);
        if (input) input.value = this.normalizeInvoiceCommentLabel(nextLabel, config.fallback);
        this.syncInvoiceCommentLabels();
        this.scheduleInvoiceLivePreview();
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
        try {
            await this.loadInvoiceSetup();
        } catch (error) {
            this._invoiceSetup = null;
            this._invoiceSetupLoaded = false;
            this.showToast(error.message || 'Không thể tải setup phiếu học phí.', 'error');
        }
        this._invoiceQrDataUrl = this._invoiceSetup?.qrDataUrl || null;

        // Lưu TOÀN BỘ buổi học của học sinh này (không giới hạn theo bộ lọc
        // tháng/năm toàn cục) để người dùng có thể tự do chọn khoảng "Từ ngày
        // - Đến ngày" rộng hơn hoặc hẹp hơn tháng đang xem. Việc tính toán số
        // buổi/học phí/giờ học thực tế sẽ luôn dựa trên khoảng ngày này thông
        // qua recomputeInvoiceTotals(), CHỨ KHÔNG cố định tại thời điểm mở modal
        // (trước đây "Từ ngày/Đến ngày" chỉ hiển thị cho có, sửa không có tác
        // dụng gì tới số liệu thực tế xuất ra).
        this._invoiceStudentId = studentId;
        this._invoiceAllSessions = this.filterByMonth(this.sessions)
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

        document.getElementById('invoiceOverview').value = '';
        document.getElementById('invoiceAlgebraLabel').value = 'Đại số';
        document.getElementById('invoiceAlgebra').value = '';
        document.getElementById('invoiceGeometryLabel').value = 'Hình học';
        document.getElementById('invoiceGeometry').value = '';
        document.getElementById('invoiceRoadmap').value = '';
        document.getElementById('invoiceSchedule').value = '';
        document.getElementById('invoiceTuitionNote').value = '';
        document.getElementById('invoiceNote').value = 'Phụ huynh vui lòng kiểm tra thông tin học phí và lịch học trong tháng.';
        this.syncInvoiceCommentLabels();

        this.recomputeInvoiceTotals();
        this.openModal('invoiceModal');
        this.updateInvoiceSetupGate();
        this.scheduleInvoiceLivePreview(0);

        const loadToken = `${studentId}:${Date.now()}`;
        this._invoiceTemplateLoadToken = loadToken;
        const initialTemplateState = JSON.stringify(this.readInvoiceTemplateForm());
        try {
            const template = await this.loadInvoiceTemplate(studentId);
            if (this._invoiceTemplateLoadToken !== loadToken || this._invoiceStudentId !== studentId) return;
            if (JSON.stringify(this.readInvoiceTemplateForm()) !== initialTemplateState) return;
            this.applyInvoiceTemplate(template);
            this.scheduleInvoiceLivePreview(0);
        } catch (error) {
            console.warn('[loadInvoiceTemplate]', error.message);
        }
    },

    setInvoiceLivePreviewState(message, state = 'loading') {
        const status = document.getElementById('invoiceLivePreviewStatus');
        if (!status) return;
        status.textContent = message || '';
        status.classList.toggle('is-ready', state === 'ready');
        status.classList.toggle('is-error', state === 'error');
    },

    scheduleInvoiceLivePreview(delay = 260) {
        if (!document.getElementById('invoiceModal')?.classList.contains('show')) return;
        clearTimeout(this._invoiceLivePreviewTimer);
        const renderToken = (this._invoiceLiveRenderToken || 0) + 1;
        this._invoiceLiveRenderToken = renderToken;
        this.setInvoiceLivePreviewState('Đang cập nhật phiếu...');
        this._invoiceLivePreviewTimer = window.setTimeout(() => {
            this.exportInvoice({ livePreview: true, renderToken });
        }, Math.max(0, delay));
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

    getInvoiceExportColors() {
        const isPinkTheme = this.normalizeAppTheme(this.appTheme) === 'pink';
        return isPinkTheme ? {
            pageBackground: '#f8edf2',
            canvasBackground: '#f8edf2',
            card: '#fffdfd',
            cardSoft: '#fff9fb',
            border: '#eccad8',
            soft: '#f7dce7',
            primary: '#96375f',
            text: '#5d3546',
            muted: '#927180',
            meta: '#75495b',
            accent: '#d36f98',
            empty: '#d6a4b8',
            pageNumber: '#b28b9b'
        } : {
            pageBackground: '#eef6ff',
            canvasBackground: '#eff6ff',
            card: '#ffffff',
            cardSoft: '#f8fbff',
            border: '#bfdbfe',
            soft: '#dbeafe',
            primary: '#0b438f',
            text: '#17345f',
            muted: '#64748b',
            meta: '#334155',
            accent: '#2563eb',
            empty: '#93c5fd',
            pageNumber: '#94a3b8'
        };
    },

    // Tạo cấu trúc PDF A4 riêng biệt. Hàm này chỉ dựng dữ liệu/bố cục để có thể
    // kiểm tra độc lập; exportInvoicePdf() phía dưới đảm nhiệm tải file.
    buildInvoicePdfDefinition() {
        const studentId = document.getElementById('invoiceStudentId').value;
        const st = this.students.find(s => s.id === studentId);
        if (!st) return null;
        const colors = this.getInvoiceExportColors();

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
        const setup = this._invoiceSetup || {};
        const teacherName = nfc(setup.teacherName) || 'Chưa setup tên giáo viên';
        const teacherPhone = nfc(setup.teacherPhone) || '-';
        const bankAccountNumber = nfc(setup.bankAccountNumber) || '-';
        const bankAccountHolder = nfc(setup.bankAccountHolder) || '-';
        const overview = nfc(document.getElementById('invoiceOverview').value);
        const algebraLabel = nfc(document.getElementById('invoiceAlgebraLabel').value) || 'Đại số';
        const algebra = nfc(document.getElementById('invoiceAlgebra').value);
        const geometryLabel = nfc(document.getElementById('invoiceGeometryLabel').value) || 'Hình học';
        const geometry = nfc(document.getElementById('invoiceGeometry').value);
        const roadmap = nfc(document.getElementById('invoiceRoadmap').value);
        const schedule = nfc(document.getElementById('invoiceSchedule').value);
        const customTuition = nfc(document.getElementById('invoiceTuitionNote').value);
        const note = nfc(document.getElementById('invoiceNote').value);
        const dateParts = sessions.map(sess => {
            const [year, month, day] = String(sess.date || '').split('-');
            return day && month && year ? `${day}/${month}` : String(sess.date || '');
        }).filter(Boolean);
        const dates = dateParts.length
            ? Array.from({ length: Math.ceil(dateParts.length / 3) }, (_, index) => dateParts.slice(index * 3, index * 3 + 3).join(', ')).join('\n')
            : '-';

        const datesPerRow = 4;
        const fourColumnDateRows = [];
        for (let index = 0; index < dateParts.length; index += datesPerRow) {
            const rowDates = dateParts.slice(index, index + datesPerRow);
            fourColumnDateRows.push(rowDates.join(', '));
        }
        const fourColumnDates = fourColumnDateRows.length
            ? fourColumnDateRows.join(String.fromCharCode(10))
            : dates;
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
        const roundedCard = (stack, width, height, fillColor = colors.card, options = {}) => {
            const radius = options.radius || 8;
            const borderColor = options.borderColor || colors.border;
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
                    canvas: [{ type: 'rect', x: 0, y: 0, w: 4, h: 18, r: 2, color: colors.accent }]
                },
                { width: '*', text, style: 'sectionTitle', margin: [5, 1, 0, 0] }
            ],
            columnGap: 0
        });
        const sectionUnderline = {
            canvas: [{ type: 'line', x1: 10, y1: 0, x2: pdfContentWidth, y2: 0, lineWidth: 0.8, lineColor: colors.border }],
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
            if (lines.length === 0) return [];
            return lines.map((line, index) => ({
                text: line,
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
                canvas: [{ type: 'line', x1: 0, y1: 0, x2: pdfStudentWidth - 28, y2: 0, lineWidth: 0.8, lineColor: colors.border }],
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
                        labelValue('Ngày học', fourColumnDates)
                    ]
                },
                layout: {
                    hLineWidth: index => index > 0 ? 0.7 : 0,
                    vLineWidth: () => 0,
                    hLineColor: () => colors.soft,
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
            tuitionStack.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 180, y2: 0, lineWidth: 1, lineColor: colors.border }], alignment: 'center', margin: [0, 0, 0, 7] });
            tuitionStack.push({
                text: [
                    { text: 'Số TK: ', style: 'label' }, { text: bankAccountNumber, style: 'value' }, '\n',
                    { text: 'Chủ TK: ', style: 'label' }, { text: bankAccountHolder, style: 'value' }
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
        const dateLineCount = Math.max(1, fourColumnDateRows.length);
        const studentNameLineCount = Math.max(1, estimateLines(`${nfc(st.name)} - ${nfc(st.class)}`, 20));
        const summaryHeight = Math.max(
            this._invoiceQrDataUrl ? 230 : 205,
            150 + dateLineCount * 14 + Math.max(0, studentNameLineCount - 1) * 14
        );
        const summaryTable = {
            columns: [
                {
                    width: pdfStudentWidth,
                    ...roundedCard(studentStack, pdfStudentWidth, summaryHeight, colors.cardSoft, {
                        paddingX: 14, paddingY: 13, radius: 11, verticalAlignment: 'middle'
                    })
                },
                {
                    width: pdfTuitionWidth,
                    ...roundedCard(tuitionStack, pdfTuitionWidth, summaryHeight, colors.cardSoft, {
                        paddingX: 14, paddingY: 13, radius: 11, verticalAlignment: 'middle'
                    })
                }
            ],
            columnGap: pdfColumnGap
        };

        const comments = [
            overview ? plainComment('Tổng quan', overview) : null,
            algebra ? plainComment(algebraLabel, algebra, true) : null,
            geometry ? plainComment(geometryLabel, geometry, true) : null
        ].filter(Boolean);

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
                    hLineColor: () => colors.soft,
                    paddingLeft: () => 0,
                    paddingRight: () => 0,
                    paddingTop: () => 0,
                    paddingBottom: () => 8
                }
            },
            { text: title, style: 'title', alignment: 'center', margin: [0, 13, 0, 2] },
            { text: 'BÁO CÁO HỌC TẬP VÀ HỌC PHÍ', style: 'subtitle', alignment: 'center', margin: [0, 0, 0, 17] },
            summaryTable,
            ...(comments.length ? plainSection('NHẬN XÉT HỌC TẬP', comments) : []),
            ...(roadmap ? plainSection('LỘ TRÌNH HỌC TẬP', bulletRows(roadmap)) : []),
            ...(schedule ? plainSection('LỊCH HỌC', bulletRows(schedule)) : []),
            ...(tuitionText ? plainSection('CHI TIẾT HỌC PHÍ', bulletRows(tuitionText)) : [])
        ];

        return {
            pageSize: 'A4',
            pageMargins: [52, 36, 52, 58],
            info: { title, author: teacherName, subject: 'Phiếu học phí học sinh' },
            background: (currentPage, pageSize) => ({
                canvas: [
                    { type: 'rect', x: 0, y: 0, w: pageSize.width, h: pageSize.height, color: colors.pageBackground },
                    { type: 'rect', x: 26, y: 22, w: pageSize.width - 52, h: pageSize.height - 44, r: 14, color: colors.card, lineColor: colors.border, lineWidth: 1.2 }
                ]
            }),
            content,
            defaultStyle: { font: 'BeVietnamPro', fontSize: 10, color: colors.text, lineHeight: 1.25 },
            styles: {
                brand: { fontSize: 14, color: colors.primary, bold: true },
                eyebrow: { fontSize: 8.5, color: colors.muted, bold: true, characterSpacing: 1.2 },
                meta: { fontSize: 9, color: colors.meta, bold: true },
                title: { fontSize: 22, color: colors.primary, bold: true },
                subtitle: { fontSize: 8.5, color: colors.muted, bold: true, characterSpacing: 1.1 },
                cardTitle: { fontSize: 11.5, color: colors.primary, bold: true },
                sectionTitle: { fontSize: 11.5, color: colors.primary, bold: true, characterSpacing: 0.35 },
                label: { fontSize: 9.5, color: colors.primary },
                value: { fontSize: 10, color: colors.text, bold: true },
                inlineLabel: { fontSize: 10, color: colors.primary, bold: true },
                bodyText: { fontSize: 10, color: colors.text },
                totalPrice: { fontSize: 25, color: colors.text, bold: true },
                summaryHint: { fontSize: 8.5, color: colors.muted },
                footerText: { fontSize: 9.5, color: colors.text, bold: true }
            },
            footer: (currentPage, pageCount) => ({
                margin: [52, 0, 52, 0],
                stack: [
                    ...(currentPage === pageCount && note ? [roundedCard(
                        [{ text: note, alignment: 'center', style: 'footerText' }],
                        pdfContentWidth,
                        28,
                        colors.soft,
                        { radius: 9, paddingX: 10, borderColor: colors.soft, centerContent: true, contentHeight: 12.5 }
                    )] : []),
                    {
                        text: `Trang ${currentPage}/${pageCount}`,
                        alignment: 'center',
                        color: colors.pageNumber,
                        fontSize: 8,
                        margin: [0, 7, 0, 0]
                    }
                ]
            })
        };
    },

    async exportInvoicePdf() {
        if (!this.updateInvoiceSetupGate()) {
            this.showToast('Hãy nhập đủ Setup phiếu học phí trước khi xuất PDF.', 'error');
            await this.openInvoiceSetupFromInvoice();
            return;
        }
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

    async downloadInvoiceCanvas(canvas, student) {
        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob(result => {
                if (result) resolve(result);
                else reject(new Error('Không thể tạo dữ liệu ảnh phiếu học phí.'));
            }, 'image/png');
        });
        const todayStr = this.toISODateOnly(new Date());
        const safeStudentName = String(student?.name || 'HocSinh').normalize('NFC').replace(/\s+/g, '');
        const filename = `PhieuHocPhi_${safeStudentName}_${todayStr}.png`;
        let downloadUrl = URL.createObjectURL(blob);
        try {
            const link = document.createElement('a');
            link.download = filename;
            link.href = downloadUrl;
            document.body.appendChild(link);
            link.click();
            link.remove();
            const downloadUrlToRevoke = downloadUrl;
            window.setTimeout(() => URL.revokeObjectURL(downloadUrlToRevoke), 30000);
            downloadUrl = '';
            await this.saveInvoiceTemplate();
            this.showToast('Đã xuất phiếu học phí dạng ảnh thành công!', 'success');
            this.closeModal('invoiceModal');
        } catch (err) {
            if (downloadUrl) URL.revokeObjectURL(downloadUrl);
            console.error('Lỗi tải ảnh phiếu học phí:', err);
            this.showToast(err.message || 'Không thể xuất ảnh phiếu học phí.', 'error');
        }
    },

    // Render phiếu học phí ra ảnh PNG. Cùng một luồng dựng ảnh được dùng cho
    // phần xem trực tiếp bên phải và cho file chất lượng cao khi bấm xuất.
    async exportInvoice(options = {}) {
        const isLivePreview = options.livePreview === true;
        const renderToken = options.renderToken || 0;
        if (!isLivePreview && !this.updateInvoiceSetupGate()) {
            this.showToast('Hãy nhập đủ Setup phiếu học phí trước khi xuất ảnh.', 'error');
            await this.openInvoiceSetupFromInvoice();
            return;
        }
        const studentId = document.getElementById('invoiceStudentId').value;
        const st = this.students.find(s => s.id === studentId);
        if (!st) return;
        const colors = this.getInvoiceExportColors();

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
        const setup = this._invoiceSetup || {};
        const teacherName = String(setup.teacherName || '').trim() || 'CHƯA SETUP TÊN GIÁO VIÊN';
        const teacherPhone = String(setup.teacherPhone || '').trim();
        const bankAccountNumber = String(setup.bankAccountNumber || '').trim() || '-';
        const bankAccountHolder = String(setup.bankAccountHolder || '').trim() || '-';
        const overview = document.getElementById('invoiceOverview').value.trim();
        const algebraLabel = this.getInvoiceCommentLabel('algebra');
        const algebra = document.getElementById('invoiceAlgebra').value.trim();
        const geometryLabel = this.getInvoiceCommentLabel('geometry');
        const geometry = document.getElementById('invoiceGeometry').value.trim();
        const roadmap = document.getElementById('invoiceRoadmap').value.trim();
        const schedule = document.getElementById('invoiceSchedule').value.trim();
        const note = document.getElementById('invoiceNote').value.trim();

        // Chuẩn hoá Unicode về NFC trước khi render để dấu tiếng Việt luôn gắn đúng
        // với ký tự gốc (đặc biệt với nội dung được dán từ Word/điện thoại).
        const esc = (s) => String(s || '').normalize('NFC').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const nl2br = (s) => esc(s).replace(/\n/g, '<br>');

        // Giữ nguyên các dòng người dùng nhập, không tự thêm dấu chấm đầu dòng.
        // Nếu dòng có dấu ":" thì in đậm phần trước dấu ":".
        const bulletListHTML = (text) => {
            const lines = esc(text).split('\n').map(line => line.trim()).filter(Boolean);
            if (lines.length === 0) return '';
            return lines.map(line => {
                const colonIndex = line.indexOf(':');
                const item = colonIndex > -1
                    ? `<strong>${line.slice(0, colonIndex + 1)}</strong>${line.slice(colonIndex + 1)}`
                    : line;
                return `<div class="list-item no-mark">${item}</div>`;
            }).join('');
        };

        const dateChips = sessions.map(s => {
            const [y, m, d] = String(s.date).split('-');
            return `<span class="date-chip"><span class="date-chip-text">${d}/${m}</span></span>`;
        }).join('');

        // Chỉ hiện phần học phí chi tiết khi giáo viên nhập nội dung riêng cho mục này.
        const customTuitionNote = document.getElementById('invoiceTuitionNote').value.trim();
        const feeNoteHTML = customTuitionNote ? bulletListHTML(customTuitionNote) : '';

        // Chỉ dựng những dòng nhận xét thực sự có nội dung; mục trống không để lại nhãn hoặc dấu "-".
        const bulletOrDashHTML = text => bulletListHTML(text);
        const quoteItemsHTML = [
            `<div class="plain-row"><strong>Tổng quan:</strong> ${overview ? nl2br(overview) : "-"}</div>`,
            `<div class="plain-row is-stacked"><strong>${esc(algebraLabel)}:</strong><div class="stacked-list">${bulletOrDashHTML(algebra)}</div></div>`,
            `<div class="plain-row is-stacked"><strong>${esc(geometryLabel)}:</strong><div class="stacked-list">${bulletOrDashHTML(geometry)}</div></div>`,
        ].join('');

        const scheduleHTML = bulletListHTML(schedule);
        const roadmapHTML = bulletListHTML(roadmap);

        // Ảnh QR thanh toán (tuỳ chọn) — chèn ngay dưới khối "Tổng học phí",
        // căn giữa, giữ nguyên tỉ lệ ảnh gốc (object-fit:contain). PHẢI là
        // ảnh QR thật (vuông, mã vạch 2 chiều) — không phải ảnh chân dung.
        const qrHTML = this._invoiceQrDataUrl
            ? `<img class="qr" src="${this._invoiceQrDataUrl}" alt="QR thanh toán">
               <div class="divider"></div>
               <div class="bank">Số TK: <b>${esc(bankAccountNumber)}</b><br>Chủ TK: <b>${esc(bankAccountHolder)}</b></div>`
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
            background: ${colors.canvasBackground};
            width: 600px;
            max-width: 600px;
            padding: 20px;
            color: ${colors.text};
            overflow-wrap: break-word;
            word-break: break-word;
            -webkit-font-smoothing: antialiased;
        }
        #invoiceExportSheet .card-main { background:${colors.card}; border-radius:22px; border:2px solid ${colors.border}; padding:18px; }

        /* ============ II. HEADER ============ */
        #invoiceExportSheet .header { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; row-gap:6px; }
        #invoiceExportSheet .badge { display:inline-flex; align-items:center; line-height:1.4; color:${colors.text}; font-size:13px; font-weight:500; border:none; padding:0; border-radius:0; gap:0; background:none; }
        #invoiceExportSheet .phone { font-size:13px; color:${colors.text}; }
        #invoiceExportSheet .title { text-align:center; font-size:26px; font-weight:800; color:${colors.primary}; margin:6px 0 22px; line-height:1.5; }

        /* ============ III. GRID 2 CỘT ============ */
        #invoiceExportSheet .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; align-items:stretch; }
        #invoiceExportSheet .card { border:1.5px solid ${colors.border}; border-radius:18px; padding:14px; background:${colors.card}; }
        #invoiceExportSheet .grid-2 > .card { min-width:0; }
        #invoiceExportSheet .grid-2 > .card:nth-child(2) { display:flex; flex-direction:column; align-items:center; justify-content:flex-start; padding-top:14px; }
        #invoiceExportSheet .student-info-card { padding-top:8px; }
        #invoiceExportSheet .student-info-card > .section-title { padding-bottom:5px; border-bottom:1px solid ${colors.border}; }
        #invoiceExportSheet .section-title { font-size:15px; font-weight:700; color:${colors.primary}; line-height:1.55; margin-bottom:6px; }

        /* ============ IV. THÔNG TIN HỌC SINH ============ */
        #invoiceExportSheet .row { display:grid; grid-template-columns:minmax(84px, 36%) minmax(0, 1fr); align-items:start; gap:8px; padding:5px 0; border-bottom:1px dashed ${colors.border}; }
        #invoiceExportSheet .row:last-of-type { border-bottom:none; }
        #invoiceExportSheet .label { font-size:12px; color:${colors.primary}; }
        #invoiceExportSheet .value { min-width:0; overflow-wrap:anywhere; font-size:13px; color:${colors.text}; font-weight:600; text-align:right; }
        #invoiceExportSheet .date-label { font-size:12px; color:${colors.primary}; margin:8px 0 6px; }
        /* Tránh flex + phần tử chữ lồng nhau để html2canvas không làm mất nét chữ. */
        #invoiceExportSheet .date-chip-list { display:flex; flex-wrap:wrap; justify-content:center; align-content:flex-start; gap:5px 6px; }
        #invoiceExportSheet .date-chip { display:inline-block; min-width:62px; height:29px; padding:0 10px; background:${colors.soft}; border-radius:999px; line-height:29px; text-align:center; box-sizing:border-box; }
        #invoiceExportSheet .date-chip-text { display:inline-block; line-height:1; position:relative; top:-7px; color:${colors.text}; font-family:inherit; font-size:12px; font-weight:800; }

        #invoiceExportSheet .date-chip { flex:0 0 48px; min-width:0; width:48px; height:26px; padding:0 4px; line-height:26px; }
        #invoiceExportSheet .date-chip-text { top:-6px; font-size:11px; }

        /* ============ V. TỔNG HỌC PHÍ ============ */
        #invoiceExportSheet .total-title { text-align:center; font-size:13px; color:${colors.primary}; }
        /* Khoảng cách TỔNG HỌC PHÍ -> 700.000đ: chỉnh số margin-top này (đang để 6px bằng với gap dưới) */
        #invoiceExportSheet .total-price { text-align:center; font-size:30px; font-weight:700; color:${colors.text}; margin-top:0px; }
        /* Khoảng cách 700.000đ -> ảnh QR: chỉnh số margin-top này (đang để 6px bằng với gap trên) */
        #invoiceExportSheet .qr { width:110px; height:110px; display:block; margin:16px auto 8px; object-fit:contain; border-radius:10px; border:2px solid ${colors.border}; background:${colors.card}; }
        #invoiceExportSheet .divider { border-top:1px solid ${colors.border}; margin:8px 0; }
        #invoiceExportSheet .bank { text-align:center; font-size:13px; color:${colors.primary}; line-height:1.4; }
        #invoiceExportSheet .bank b { color:${colors.text}; }

        /* ============ VI. NỘI DUNG MỘT CỘT ============ */
        #invoiceExportSheet .plain-section { margin-top:12px; padding:0 2px 10px; text-align:left; }
        #invoiceExportSheet .plain-section .section-title { margin-bottom:7px; padding-bottom:5px; border-bottom:1px solid ${colors.border}; text-transform:uppercase; }
        #invoiceExportSheet .plain-row { color:${colors.text}; font-size:13px; line-height:1.55; margin-bottom:6px; text-align:left; }
        #invoiceExportSheet .plain-row:last-child { margin-bottom:0; }
        #invoiceExportSheet .plain-row strong { color:${colors.primary}; }
        #invoiceExportSheet .plain-row.is-stacked > strong { display:block; }
        #invoiceExportSheet .plain-row.is-stacked .stacked-list { margin-top:2px; }
        #invoiceExportSheet .list-item { display:flex; align-items:flex-start; gap:6px; font-size:13px; line-height:1.5; margin-bottom:5px; }
        #invoiceExportSheet .list-item:last-child { margin-bottom:0; }
        #invoiceExportSheet .list-item .mark { color:${colors.accent}; font-weight:700; flex-shrink:0; }
        #invoiceExportSheet .list-item .list-text { min-width:0; }
        #invoiceExportSheet .list-item strong { color:${colors.primary}; }
        #invoiceExportSheet .list-item.no-mark { display:block; }
        #invoiceExportSheet .empty-hint { font-size:13px; color:${colors.empty}; }

        /* ============ VII. FOOTER ============ */
        #invoiceExportSheet .footer { background:${colors.soft}; border-radius:12px; height:28px; padding:0 8px; display:flex; align-items:center; justify-content:center; text-align:center; font-size:12px; font-weight:600; color:${colors.text}; }
        #invoiceExportSheet .footer-text { line-height:14px; position:relative; top:-5px; }
        #invoiceExportSheet .footer.section-block { margin-top:9px; }
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

        ${roadmapHTML ? `<div class="plain-section"><div class="section-title">Lộ trình</div>${roadmapHTML}</div>` : ''}

        ${scheduleHTML ? `<div class="plain-section">
            <div class="section-title">Lịch học</div>
            ${scheduleHTML}
        </div>` : ''}

        ${feeNoteHTML ? `<div class="plain-section"><div class="section-title">Học phí</div>${feeNoteHTML}</div>` : ''}

        <div class="footer section-block"><span class="footer-text">${note ? nl2br(note) : '-'}</span></div>
    </div>
</div>`;

        if (!isLivePreview) this.setBtnLoading('btnExportInvoice', true, 'Đang xuất ảnh...');

        // Dựng khung ẩn NGOÀI vùng nhìn thấy (không dùng display:none, vì
        // html2canvas cần layout thật để đo/vẽ đúng) để chụp ảnh.
        const holder = document.createElement('div');
        holder.style.position = 'fixed';
        holder.style.top = '0';
        holder.style.left = '-99999px';
        holder.style.zIndex = '-1';
        holder.innerHTML = sheetHTML;
        document.body.appendChild(holder);
        const captureEl = holder.querySelector('#invoiceExportSheet');
        const reviewSection = captureEl.querySelector('.plain-section');
        reviewSection.querySelectorAll('.plain-row').forEach(row => {
            const rowValue = row.textContent.split(':').slice(1).join(':').trim();
            if (!rowValue || rowValue === '-') row.remove();
        });
        if (!reviewSection.querySelector('.plain-row')) reviewSection.remove();
        if (!note) captureEl.querySelector('.footer')?.remove();

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
                scale: isLivePreview ? 1.35 : 3,
                backgroundColor: colors.canvasBackground,
                useCORS: true
            });

            if (isLivePreview) {
                if (renderToken !== this._invoiceLiveRenderToken) return;
                const previewImage = document.getElementById('invoiceLivePreview');
                if (previewImage) previewImage.src = canvas.toDataURL('image/png');
                this.setInvoiceLivePreviewState('', 'ready');
            } else {
                await this.downloadInvoiceCanvas(canvas, st);
            }
        } catch (err) {
            console.error('Lỗi tạo phiếu học phí:', err);
            if (isLivePreview) {
                if (renderToken === this._invoiceLiveRenderToken) {
                    this.setInvoiceLivePreviewState(err.message || 'Không thể cập nhật phiếu.', 'error');
                }
            } else {
                this.showToast(err.message || 'Không thể xuất ảnh phiếu học phí.', 'error');
            }
        } finally {
            holder.remove();
            if (!isLivePreview) this.setBtnLoading('btnExportInvoice', false);
        }
    }

});
