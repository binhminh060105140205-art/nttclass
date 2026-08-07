// ================================================================
// STUDENT-IMPORT.JS — Nhập nhiều học sinh từ Excel/CSV hoặc bảng Word.
// File nguồn được đọc hoàn toàn trong trình duyệt; server chỉ nhận các dòng
// đã chuẩn hóa sau khi giáo viên xem trước và xác nhận.
// ================================================================
Object.assign(PinkyClassApp.prototype, {
    initStudentImportEvents() {
        if (this._studentImportEventsBound) return;
        this._studentImportEventsBound = true;

        const openButton = document.getElementById('importStudentsBtn');
        const fileInput = document.getElementById('studentImportFile');
        const dropzone = document.getElementById('studentImportDropzone');
        const mappingIds = [
            'studentImportNameColumn',
            'studentImportClassColumn',
            'studentImportDobColumn',
            'studentImportSubjectColumn',
            'studentImportFeeColumn'
        ];

        openButton?.addEventListener('click', () => this.openStudentImportModal());
        document.getElementById('studentImportCloseBtn')?.addEventListener('click', () => this.closeModal('studentImportModal'));
        document.getElementById('studentImportCancelBtn')?.addEventListener('click', () => this.closeModal('studentImportModal'));
        document.getElementById('studentImportConfirmBtn')?.addEventListener('click', () => this.submitStudentImport());
        document.getElementById('studentImportTemplateBtn')?.addEventListener('click', () => this.downloadStudentImportTemplate());
        document.getElementById('studentImportResetBtn')?.addEventListener('click', () => {
            this.resetStudentImport();
            fileInput?.click();
        });

        fileInput?.addEventListener('change', () => {
            const file = fileInput.files?.[0];
            if (file) this.handleStudentImportFile(file);
        });
        dropzone?.addEventListener('click', () => fileInput?.click());
        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone?.addEventListener(eventName, event => {
                event.preventDefault();
                dropzone.classList.add('is-dragging');
            });
        });
        ['dragleave', 'drop'].forEach(eventName => {
            dropzone?.addEventListener(eventName, event => {
                event.preventDefault();
                dropzone.classList.remove('is-dragging');
            });
        });
        dropzone?.addEventListener('drop', event => {
            const file = event.dataTransfer?.files?.[0];
            if (file) this.handleStudentImportFile(file);
        });

        mappingIds.forEach(id => {
            document.getElementById(id)?.addEventListener('change', () => this.renderStudentImportPreview());
        });
        document.getElementById('studentImportDefaultSubject')?.addEventListener('input', () => this.renderStudentImportPreview());
        document.getElementById('studentImportDefaultFee')?.addEventListener('input', () => this.renderStudentImportPreview());
        document.getElementById('studentImportDuplicateMode')?.addEventListener('change', () => this.renderStudentImportPreview());
    },

    openStudentImportModal() {
        this.resetStudentImport();
        this.openModal('studentImportModal');
    },

    resetStudentImport() {
        this.studentImportState = null;
        const fileInput = document.getElementById('studentImportFile');
        if (fileInput) fileInput.value = '';
        document.getElementById('studentImportDropzone')?.removeAttribute('hidden');
        document.getElementById('studentImportFileSummary')?.setAttribute('hidden', '');
        document.getElementById('studentImportMappingSection')?.setAttribute('hidden', '');
        document.getElementById('studentImportPreviewSection')?.setAttribute('hidden', '');
        const defaultSubject = document.getElementById('studentImportDefaultSubject');
        const defaultFee = document.getElementById('studentImportDefaultFee');
        const duplicateMode = document.getElementById('studentImportDuplicateMode');
        if (defaultSubject) defaultSubject.value = '';
        if (defaultFee) defaultFee.value = '';
        if (duplicateMode) duplicateMode.value = 'skip';
        const confirmButton = document.getElementById('studentImportConfirmBtn');
        if (confirmButton) {
            delete confirmButton.dataset.originalText;
            confirmButton.disabled = true;
            confirmButton.textContent = 'Nhập học sinh';
        }
        const footerHint = document.getElementById('studentImportFooterHint');
        if (footerHint) footerHint.textContent = 'Chọn file để bắt đầu.';
        this.setStudentImportStatus('');
    },

    setStudentImportStatus(message, type = '') {
        const status = document.getElementById('studentImportStatus');
        if (!status) return;
        status.textContent = message;
        status.className = `student-import-status${type ? ` is-${type}` : ''}`;
    },

    async loadStudentImportLibrary(src, globalName) {
        if (window[globalName]) return window[globalName];
        this._studentImportLibraryPromises = this._studentImportLibraryPromises || {};
        if (!this._studentImportLibraryPromises[src]) {
            this._studentImportLibraryPromises[src] = new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
                script.async = true;
                script.dataset.studentImportLibrary = globalName;
                script.onload = () => window[globalName]
                    ? resolve(window[globalName])
                    : reject(new Error(`Không khởi tạo được thư viện ${globalName}.`));
                script.onerror = () => reject(new Error('Không tải được bộ đọc file. Vui lòng kiểm tra mạng và thử lại.'));
                document.head.appendChild(script);
            }).catch(error => {
                delete this._studentImportLibraryPromises[src];
                throw error;
            });
        }
        return this._studentImportLibraryPromises[src];
    },

    async handleStudentImportFile(file) {
        const extension = String(file.name || '').split('.').pop().toLowerCase();
        if (!['xlsx', 'xls', 'csv', 'docx'].includes(extension)) {
            this.setStudentImportStatus('Chỉ hỗ trợ file .xlsx, .xls, .csv hoặc .docx.', 'error');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            this.setStudentImportStatus('File vượt quá 10 MB. Vui lòng rút gọn danh sách.', 'error');
            return;
        }

        this.studentImportState = null;
        document.getElementById('studentImportMappingSection')?.setAttribute('hidden', '');
        document.getElementById('studentImportPreviewSection')?.setAttribute('hidden', '');
        document.getElementById('studentImportConfirmBtn').disabled = true;
        this.setStudentImportStatus('Đang đọc và phân tích file...', 'loading');

        try {
            const arrayBuffer = await file.arrayBuffer();
            const parsed = extension === 'docx'
                ? await this.parseStudentImportDocx(arrayBuffer)
                : await this.parseStudentImportSpreadsheet(arrayBuffer, extension);
            if (!parsed.headers.length) throw new Error('Không tìm thấy dòng tiêu đề trong file.');
            if (!parsed.rows.length) throw new Error('Không tìm thấy học sinh nào dưới dòng tiêu đề.');
            if (parsed.rows.length > 500) throw new Error('File có quá 500 dòng học sinh. Hãy chia thành nhiều lần nhập.');

            this.studentImportState = {
                fileName: file.name,
                headers: parsed.headers,
                rows: parsed.rows,
                mapping: this.detectStudentImportMapping(parsed.headers),
                previewRows: []
            };
            document.getElementById('studentImportDropzone')?.setAttribute('hidden', '');
            document.getElementById('studentImportFileSummary')?.removeAttribute('hidden');
            document.getElementById('studentImportMappingSection')?.removeAttribute('hidden');
            document.getElementById('studentImportPreviewSection')?.removeAttribute('hidden');
            document.getElementById('studentImportFileName').textContent = file.name;
            document.getElementById('studentImportFileMeta').textContent = `${parsed.rows.length} dòng dữ liệu · ${parsed.headers.length} cột`;
            this.populateStudentImportMappingControls();
            this.renderStudentImportPreview();
            this.setStudentImportStatus('Đã đọc file. Kiểm tra phần ghép cột và bản xem trước bên dưới.', 'success');
        } catch (error) {
            console.error('[student import parse]', error);
            this.setStudentImportStatus(error.message || 'Không đọc được file này.', 'error');
        }
    },

    async parseStudentImportSpreadsheet(arrayBuffer, extension) {
        const XLSX = await this.loadStudentImportLibrary('/vendor/xlsx.full.min.js?v=0.20.3', 'XLSX');
        const workbook = XLSX.read(arrayBuffer, {
            type: 'array',
            cellDates: true,
            codepage: extension === 'csv' ? 65001 : undefined
        });
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) throw new Error('File không có trang tính nào.');
        const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
            header: 1,
            defval: '',
            raw: true,
            blankrows: false
        });
        return this.prepareStudentImportMatrix(matrix);
    },

    async parseStudentImportDocx(arrayBuffer) {
        const mammoth = await this.loadStudentImportLibrary('/vendor/mammoth.browser.min.js?v=1.12.0', 'mammoth');
        const result = await mammoth.convertToHtml({ arrayBuffer });
        const documentNode = new DOMParser().parseFromString(result.value || '', 'text/html');
        const tables = Array.from(documentNode.querySelectorAll('table'));
        if (!tables.length) {
            throw new Error('File Word chưa có bảng. Hãy đưa danh sách học sinh vào một bảng rồi thử lại.');
        }
        const table = tables.sort((left, right) => right.rows.length - left.rows.length)[0];
        const matrix = Array.from(table.rows).map(row => Array.from(row.cells).map(cell =>
            String(cell.textContent || '').replace(/\u00a0/g, ' ').trim().replace(/\s+/g, ' ')
        ));
        return this.prepareStudentImportMatrix(matrix);
    },

    prepareStudentImportMatrix(matrix) {
        const firstContentIndex = matrix.findIndex(row => Array.isArray(row) && row.some(value => this.hasStudentImportValue(value)));
        if (firstContentIndex < 0) return { headers: [], rows: [] };
        const rawHeaders = matrix[firstContentIndex];
        const width = Math.max(rawHeaders.length, ...matrix.slice(firstContentIndex + 1).map(row => row.length));
        const headers = Array.from({ length: width }, (_, index) => {
            const label = String(rawHeaders[index] ?? '').trim().replace(/\s+/g, ' ');
            return label || `Cột ${index + 1}`;
        });
        const rows = matrix.slice(firstContentIndex + 1)
            .map((values, index) => ({
                sourceRow: firstContentIndex + index + 2,
                values: Array.from({ length: width }, (_, columnIndex) => values[columnIndex] ?? '')
            }))
            .filter(row => row.values.some(value => this.hasStudentImportValue(value)));
        return { headers, rows };
    },

    hasStudentImportValue(value) {
        if (value === 0) return true;
        if (value instanceof Date) return !Number.isNaN(value.getTime());
        return value !== null && value !== undefined && String(value).trim() !== '';
    },

    normalizeStudentImportHeader(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim()
            .replace(/\s+/g, ' ');
    },

    detectStudentImportMapping(headers) {
        const aliases = {
            name: ['họ tên', 'họ và tên', 'tên học sinh', 'họ tên học sinh', 'họ và tên học sinh', 'name', 'student name'],
            class: ['lớp', 'khối', 'lớp học', 'class', 'grade'],
            dateOfBirth: ['ngày sinh', 'sinh ngày', 'dob', 'date of birth', 'birthday'],
            subject: ['môn', 'môn học', 'subject'],
            basePrice: ['học phí', 'học phí buổi', 'học phí mỗi buổi', 'đơn giá', 'fee', 'base price']
        };
        const normalizedHeaders = headers.map(header => this.normalizeStudentImportHeader(header));
        const usedColumns = new Set();
        const mapping = {};
        Object.entries(aliases).forEach(([field, fieldAliases]) => {
            const normalizedAliases = fieldAliases.map(alias => this.normalizeStudentImportHeader(alias));
            let bestIndex = null;
            let bestScore = 0;
            normalizedHeaders.forEach((header, index) => {
                if (!header || usedColumns.has(index)) return;
                normalizedAliases.forEach(alias => {
                    let score = 0;
                    if (header === alias) score = 100;
                    else if (header.startsWith(alias) || header.endsWith(alias)) score = 80;
                    else if (header.includes(alias)) score = 60;
                    if (score > bestScore) {
                        bestScore = score;
                        bestIndex = index;
                    }
                });
            });
            mapping[field] = bestIndex;
            if (bestIndex !== null) usedColumns.add(bestIndex);
        });
        return mapping;
    },

    populateStudentImportMappingControls() {
        const state = this.studentImportState;
        if (!state) return;
        const controls = {
            name: 'studentImportNameColumn',
            class: 'studentImportClassColumn',
            dateOfBirth: 'studentImportDobColumn',
            subject: 'studentImportSubjectColumn',
            basePrice: 'studentImportFeeColumn'
        };
        Object.entries(controls).forEach(([field, controlId]) => {
            const select = document.getElementById(controlId);
            if (!select) return;
            select.innerHTML = '<option value="">— Không có cột —</option>' + state.headers.map((header, index) =>
                `<option value="${index}">${index + 1}. ${this.escapeHtml(header)}</option>`
            ).join('');
            select.value = state.mapping[field] === null || state.mapping[field] === undefined
                ? ''
                : String(state.mapping[field]);
        });
    },

    getStudentImportMapping() {
        const readColumn = id => {
            const value = document.getElementById(id)?.value;
            return value === '' || value === undefined ? null : Number(value);
        };
        return {
            name: readColumn('studentImportNameColumn'),
            class: readColumn('studentImportClassColumn'),
            dateOfBirth: readColumn('studentImportDobColumn'),
            subject: readColumn('studentImportSubjectColumn'),
            basePrice: readColumn('studentImportFeeColumn')
        };
    },

    normalizeStudentImportClass(value) {
        const input = String(value || '').trim().replace(/\s+/g, ' ');
        if (!input) return { class: '', gradeLevel: null };
        const withoutPrefix = input.replace(/^lớp\s*/i, '');
        const match = withoutPrefix.match(/^(1[0-2]|[1-9])/);
        const candidate = match ? Number(match[1]) : null;
        const nextCharacter = match ? withoutPrefix.charAt(match[1].length) : '';
        const gradeLevel = candidate && !/\d/.test(nextCharacter) ? candidate : null;
        const gradeOnly = gradeLevel !== null && withoutPrefix === String(gradeLevel);
        return {
            class: gradeOnly ? `Lớp ${gradeLevel}` : input,
            gradeLevel
        };
    },

    parseStudentImportDate(value) {
        if (!this.hasStudentImportValue(value)) return { value: null, missing: true };
        let year;
        let month;
        let day;

        if (value instanceof Date && !Number.isNaN(value.getTime())) {
            year = value.getFullYear();
            month = value.getMonth() + 1;
            day = value.getDate();
        } else if (typeof value === 'number' && window.XLSX?.SSF?.parse_date_code) {
            const parsed = window.XLSX.SSF.parse_date_code(value);
            if (parsed) ({ y: year, m: month, d: day } = parsed);
        } else {
            const text = String(value).trim();
            if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
                [year, month, day] = text.split('-').map(Number);
            } else if (/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}$/.test(text)) {
                [day, month, year] = text.split(/[\/.\-]/).map(Number);
            } else if (/^\d{4}[\/.]\d{1,2}[\/.]\d{1,2}$/.test(text)) {
                [year, month, day] = text.split(/[\/.]/).map(Number);
            } else if (/^\d{4,5}$/.test(text) && window.XLSX?.SSF?.parse_date_code) {
                const parsed = window.XLSX.SSF.parse_date_code(Number(text));
                if (parsed) ({ y: year, m: month, d: day } = parsed);
            }
        }

        if (!year || !month || !day) return { value: null, error: 'Ngày sinh không đúng định dạng.' };
        const date = new Date(year, month - 1, day);
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
            return { value: null, error: 'Ngày sinh không tồn tại.' };
        }
        const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return { value: iso, missing: false };
    },

    parseStudentImportFee(value) {
        if (!this.hasStudentImportValue(value)) return { value: null, missing: true };
        if (typeof value === 'number') {
            return Number.isInteger(value) && value >= 0
                ? { value, missing: false }
                : { value: null, error: 'Học phí phải là số nguyên không âm.' };
        }
        const text = String(value).trim().toLowerCase().replace(/vnd|vnđ|₫|đ/g, '').replace(/\s+/g, '');
        let normalized = text;
        if (/^\d{1,3}([.,]\d{3})+$/.test(text)) normalized = text.replace(/[.,]/g, '');
        if (!/^\d+$/.test(normalized)) return { value: null, error: 'Học phí không hợp lệ.' };
        const fee = Number(normalized);
        return Number.isSafeInteger(fee) && fee >= 0
            ? { value: fee, missing: false }
            : { value: null, error: 'Học phí không hợp lệ.' };
    },

    getStudentImportDuplicateKey(student) {
        const normalize = value => String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .trim()
            .replace(/\s+/g, ' ')
            .toLowerCase();
        return [student.name, student.class, student.subject].map(normalize).join('|');
    },

    renderStudentImportPreview() {
        const state = this.studentImportState;
        if (!state) return;
        const mapping = this.getStudentImportMapping();
        state.mapping = mapping;
        const selectedColumns = Object.values(mapping).filter(value => value !== null);
        const hasRepeatedMapping = new Set(selectedColumns).size !== selectedColumns.length;
        const defaultSubject = String(document.getElementById('studentImportDefaultSubject')?.value || '').trim().replace(/\s+/g, ' ');
        const defaultFeeInput = document.getElementById('studentImportDefaultFee')?.value ?? '';
        const defaultFee = this.parseStudentImportFee(defaultFeeInput);
        const duplicateMode = document.getElementById('studentImportDuplicateMode')?.value || 'skip';

        const previewRows = state.rows.map(row => {
            const read = field => mapping[field] === null ? '' : row.values[mapping[field]];
            const errors = [];
            const warnings = [];
            const name = String(read('name') ?? '').trim().replace(/\s+/g, ' ');
            const classInfo = this.normalizeStudentImportClass(read('class'));
            const dateInfo = this.parseStudentImportDate(read('dateOfBirth'));
            const fileSubject = String(read('subject') ?? '').trim().replace(/\s+/g, ' ');
            const subject = fileSubject || defaultSubject;
            const fileFee = this.parseStudentImportFee(read('basePrice'));
            const feeInfo = fileFee.missing ? defaultFee : fileFee;

            if (!name) errors.push('Thiếu họ tên.');
            if (name.length > 200) errors.push('Họ tên vượt quá 200 ký tự.');
            if (!subject) errors.push('Thiếu môn học và chưa có giá trị mặc định.');
            if (subject.length > 200) errors.push('Môn học vượt quá 200 ký tự.');
            if (classInfo.class.length > 100) errors.push('Tên lớp vượt quá 100 ký tự.');
            if (dateInfo.error) errors.push(dateInfo.error);
            if (feeInfo.missing) errors.push('Thiếu học phí và chưa có giá trị mặc định.');
            if (feeInfo.error) errors.push(feeInfo.error);
            if (hasRepeatedMapping) errors.push('Một cột đang được ghép cho nhiều trường.');

            return {
                sourceRow: row.sourceRow,
                name,
                class: classInfo.class,
                gradeLevel: classInfo.gradeLevel,
                dateOfBirth: dateInfo.value,
                rawDateOfBirth: read('dateOfBirth'),
                subject,
                basePrice: feeInfo.value,
                errors,
                warnings,
                duplicate: false
            };
        });

        const existingKeys = new Set((this.students || []).map(student => this.getStudentImportDuplicateKey(student)));
        const fileKeyCounts = new Map();
        previewRows.forEach(row => {
            if (!row.name || !row.subject) return;
            const key = this.getStudentImportDuplicateKey(row);
            fileKeyCounts.set(key, (fileKeyCounts.get(key) || 0) + 1);
        });
        previewRows.forEach(row => {
            if (!row.name || !row.subject) return;
            const key = this.getStudentImportDuplicateKey(row);
            const duplicatesExisting = existingKeys.has(key);
            const duplicatesInFile = (fileKeyCounts.get(key) || 0) > 1;
            if (duplicatesExisting || duplicatesInFile) {
                row.duplicate = true;
                const location = duplicatesExisting && duplicatesInFile
                    ? 'trong hệ thống và trong file'
                    : (duplicatesExisting ? 'trong hệ thống' : 'trong file');
                row.warnings.push(`Trùng học sinh ${location}; sẽ ${duplicateMode === 'skip' ? 'bỏ qua' : duplicateMode === 'update' ? 'cập nhật' : 'tạo thêm'}.`);
            }
        });
        state.previewRows = previewRows;

        const usedColumns = new Set(selectedColumns);
        const ignoredHeaders = state.headers.filter((_, index) => !usedColumns.has(index));
        const ignored = document.getElementById('studentImportIgnoredColumns');
        if (ignored) {
            if (ignoredHeaders.length) {
                ignored.removeAttribute('hidden');
                ignored.innerHTML = `<strong>Cột được bỏ qua:</strong> ${ignoredHeaders.map(header => `<span>${this.escapeHtml(header)}</span>`).join('')}`;
            } else {
                ignored.setAttribute('hidden', '');
                ignored.innerHTML = '';
            }
        }

        const previewBody = document.getElementById('studentImportPreviewBody');
        if (previewBody) {
            previewBody.innerHTML = previewRows.map(row => {
                const status = row.errors.length ? 'error' : row.warnings.length ? 'warning' : 'valid';
                const statusText = status === 'error' ? 'Lỗi' : status === 'warning' ? 'Cảnh báo' : 'Hợp lệ';
                const messages = [...row.errors, ...row.warnings];
                const dateLabel = row.dateOfBirth
                    ? row.dateOfBirth.split('-').reverse().join('/')
                    : (this.hasStudentImportValue(row.rawDateOfBirth) ? String(row.rawDateOfBirth) : '-');
                const feeLabel = Number.isInteger(row.basePrice) ? this.formatVND(row.basePrice) : '-';
                return `
                    <tr class="student-import-row-${status}">
                        <td><span class="student-import-status-badge is-${status}">${statusText}</span></td>
                        <td>${row.sourceRow}</td>
                        <td>${this.escapeHtml(row.name || '-')}</td>
                        <td>${this.escapeHtml(row.class || '-')}</td>
                        <td>${this.escapeHtml(dateLabel)}</td>
                        <td>${this.escapeHtml(row.subject || '-')}</td>
                        <td>${this.escapeHtml(feeLabel)}</td>
                        <td class="student-import-message-cell">${messages.length ? messages.map(message => this.escapeHtml(message)).join('<br>') : 'Sẵn sàng nhập'}</td>
                    </tr>
                `;
            }).join('');
        }

        const errorCount = previewRows.filter(row => row.errors.length).length;
        const warningCount = previewRows.filter(row => !row.errors.length && row.warnings.length).length;
        const validCount = previewRows.length - errorCount - warningCount;
        const duplicateCount = previewRows.filter(row => row.duplicate).length;
        const importableCount = previewRows.length - errorCount;
        const stats = document.getElementById('studentImportStats');
        if (stats) {
            stats.innerHTML = `
                <span class="is-valid">${validCount} hợp lệ</span>
                <span class="is-warning">${warningCount} cảnh báo</span>
                <span class="is-error">${errorCount} lỗi</span>
                ${duplicateCount ? `<span>${duplicateCount} trùng</span>` : ''}
            `;
        }
        const confirmButton = document.getElementById('studentImportConfirmBtn');
        if (confirmButton) {
            confirmButton.disabled = importableCount === 0;
            confirmButton.textContent = importableCount ? `Nhập ${importableCount} học sinh` : 'Không có dòng hợp lệ';
        }
        const footerHint = document.getElementById('studentImportFooterHint');
        if (footerHint) {
            footerHint.textContent = errorCount
                ? `${errorCount} dòng lỗi sẽ được bỏ qua; ${importableCount} dòng sẵn sàng gửi.`
                : `${importableCount} dòng sẵn sàng gửi. Dữ liệu chỉ được lưu sau khi bấm xác nhận.`;
        }
    },

    async downloadStudentImportTemplate() {
        const button = document.getElementById('studentImportTemplateBtn');
        if (button) button.disabled = true;
        try {
            const XLSX = await this.loadStudentImportLibrary('/vendor/xlsx.full.min.js?v=0.20.3', 'XLSX');
            const rows = [
                ['Họ và tên học sinh', 'Lớp', 'Ngày sinh', 'Môn học', 'Học phí/buổi'],
                ['Nguyễn Văn An', 'Lớp 6', '04/08/2012', 'Toán', 250000],
                ['Trần Minh Anh', '', '', 'Tiếng Anh', 0]
            ];
            const worksheet = XLSX.utils.aoa_to_sheet(rows);
            worksheet['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 18 }];
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Danh sách học sinh');
            XLSX.writeFile(workbook, 'mau-nhap-hoc-sinh-nttclass.xlsx');
            this.showToast('Đã tải file Excel mẫu.', 'success');
        } catch (error) {
            this.showToast(error.message || 'Không tải được file mẫu.', 'error');
        } finally {
            if (button) button.disabled = false;
        }
    },

    async submitStudentImport() {
        const state = this.studentImportState;
        if (!state) return;
        let completed = false;
        const rows = state.previewRows.filter(row => row.errors.length === 0).map(row => ({
            sourceRow: row.sourceRow,
            name: row.name,
            class: row.class,
            gradeLevel: row.gradeLevel,
            dateOfBirth: row.dateOfBirth,
            subject: row.subject,
            basePrice: row.basePrice
        }));
        if (!rows.length) {
            this.showToast('Không có dòng hợp lệ để nhập.', 'error');
            return;
        }

        const duplicateMode = document.getElementById('studentImportDuplicateMode')?.value || 'skip';
        this.setBtnLoading('studentImportConfirmBtn', true, 'Đang nhập...');
        try {
            const response = await this.authFetch(`${API_BASE_URL}/api/students/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rows, duplicateMode })
            });
            const result = await this.requireApiSuccess(response, 'Không thể nhập danh sách học sinh.');
            await this.loadData();
            this.populateStudentPickers();
            this.renderStudentList();
            this.closeModal('studentImportModal');
            const summary = [
                result.created ? `tạo mới ${result.created}` : '',
                result.updated ? `cập nhật ${result.updated}` : '',
                result.skipped ? `bỏ qua ${result.skipped}` : ''
            ].filter(Boolean).join(', ');
            this.showToast(`Đã nhập xong${summary ? `: ${summary}` : '.'}`, 'success');
            this.resetStudentImport();
            completed = true;
        } catch (error) {
            this.showToast(error.message || 'Không thể nhập danh sách học sinh.', 'error');
        } finally {
            if (!completed) {
                this.setBtnLoading('studentImportConfirmBtn', false);
                if (this.studentImportState) this.renderStudentImportPreview();
            }
        }
    }
});
