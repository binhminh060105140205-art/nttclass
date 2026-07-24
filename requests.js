// ================================================================
// REQUESTS.JS — Bảng yêu cầu cá nhân, nội dung + ảnh được lưu trên server.
// ================================================================
Object.assign(PinkyClassApp.prototype, {
    initRequestsFeature() {
        const form = document.getElementById('requestCreateForm');
        const imageInput = document.getElementById('requestImageInput');
        const removeImageBtn = document.getElementById('requestRemoveImageBtn');
        const textInput = document.getElementById('requestTextInput');
        const list = document.getElementById('requestList');
        if (!form || form.dataset.bound === 'true') return;
        form.dataset.bound = 'true';

        form.addEventListener('submit', (event) => {
            event.preventDefault();
            this.submitRequest();
        });

        imageInput.addEventListener('change', (event) => this.selectRequestImage(event));
        removeImageBtn.addEventListener('click', () => this.clearRequestImage());
        textInput.addEventListener('paste', (event) => this.pasteRequestImage(event));

        document.querySelectorAll('[data-request-filter]').forEach(button => {
            button.addEventListener('click', () => {
                this.requestFilter = button.dataset.requestFilter;
                this.renderRequests();
            });
        });

        list.addEventListener('change', (event) => {
            const completeCheckbox = event.target.closest('.request-complete-checkbox');
            if (!completeCheckbox) return;
            this.updateRequestStatus(completeCheckbox.dataset.requestId, completeCheckbox.checked, completeCheckbox);
        });

        list.addEventListener('click', (event) => {
            const imageButton = event.target.closest('.request-item-image');
            if (!imageButton) return;
            this.openRequestImage(imageButton.dataset.requestId, imageButton.dataset.imageIndex);
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') this.closeRequestImage();
        });
    },

    async selectRequestImage(event) {
        const files = Array.from(event.target.files || []);
        for (const file of files) await this.setRequestImageFile(file);
        event.target.value = '';
    },

    async pasteRequestImage(event) {
        const files = Array.from(event.clipboardData?.items || [])
            .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
            .map(item => item.getAsFile())
            .filter(Boolean);
        if (!files.length) return;
        event.preventDefault();
        for (const file of files) {
            await this.setRequestImageFile(
                file,
                `anh-dan-${Date.now()}.${(file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`,
                true
            );
        }
    },

    async setRequestImageFile(file, fallbackName = '', pasted = false) {
        const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
        if (!allowedTypes.includes(file.type)) {
            this.showToast('Chỉ hỗ trợ ảnh PNG, JPG, WEBP hoặc GIF.', 'error');
            const input = document.getElementById('requestImageInput');
            if (input) input.value = '';
            return;
        }
        if (file.size > 3 * 1024 * 1024) {
            this.showToast('Mỗi ảnh đính kèm không được vượt quá 3 MB.', 'error');
            return;
        }
        if (this.requestImageDraft.length >= 10) {
            this.showToast('Tối đa 10 ảnh cho mỗi yêu cầu.', 'error');
            return;
        }
        const totalBytes = this.requestImageDraft.reduce((sum, image) => sum + Number(image.size || 0), 0);
        if (totalBytes + file.size > 12 * 1024 * 1024) {
            this.showToast('Tổng dung lượng ảnh không được vượt quá 12 MB.', 'error');
            return;
        }

        try {
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('Không thể đọc ảnh đã chọn.'));
                reader.readAsDataURL(file);
            });
            if (this.requestImageDraft.some(image => image.dataUrl === dataUrl)) return;
            this.requestImageDraft.push({
                dataUrl,
                name: file.name || fallbackName || `anh-dinh-kem-${this.requestImageDraft.length + 1}`,
                size: file.size
            });
            this.renderRequestImagePreviews();
            if (pasted) this.showToast('Đã dán ảnh từ bộ nhớ tạm.', 'success');
        } catch (err) {
            this.showToast(err.message, 'error');
        }
    },

    renderRequestImagePreviews() {
        const preview = document.getElementById('requestImagePreview');
        const grid = document.getElementById('requestImagePreviewGrid');
        if (!preview || !grid) return;
        grid.innerHTML = this.requestImageDraft.map((image, index) => `
            <div class="request-image-preview-item">
                <img src="${this.escapeHtmlAttr(image.dataUrl)}" alt="${this.escapeHtmlAttr(image.name || `Ảnh ${index + 1}`)}">
                <button type="button" class="request-image-remove-one" data-image-index="${index}" aria-label="Bỏ ảnh ${index + 1}">&times;</button>
            </div>
        `).join('');
        preview.hidden = this.requestImageDraft.length === 0;
        grid.querySelectorAll('.request-image-remove-one').forEach(button => {
            button.addEventListener('click', () => {
                this.requestImageDraft.splice(Number(button.dataset.imageIndex), 1);
                this.renderRequestImagePreviews();
            });
        });
    },

    clearRequestImage() {
        this.requestImageDraft = [];
        const input = document.getElementById('requestImageInput');
        if (input) input.value = '';
        this.renderRequestImagePreviews();
    },

    getRequestImages(item) {
        if (Array.isArray(item?.images) && item.images.length) return item.images;
        return item?.imageData
            ? [{ dataUrl: item.imageData, name: item.imageName || 'Ảnh yêu cầu' }]
            : [];
    },

    openRequestImage(requestId, imageIndex = 0) {
        const item = this.requests.find(request => String(request.id) === String(requestId));
        const selectedImage = this.getRequestImages(item)[Number(imageIndex) || 0];
        if (!selectedImage?.dataUrl) return;
        let viewer = document.getElementById('requestImageViewer');
        if (!viewer) {
            viewer = document.createElement('div');
            viewer.id = 'requestImageViewer';
            viewer.className = 'request-image-viewer';
            viewer.hidden = true;
            viewer.innerHTML = `
                <div class="request-image-viewer-dialog" role="dialog" aria-modal="true" aria-label="Xem ảnh yêu cầu">
                    <button type="button" class="request-image-viewer-close" aria-label="Đóng ảnh">&times;</button>
                    <img alt="Ảnh yêu cầu phóng to">
                    <div class="request-image-viewer-name"></div>
                </div>`;
            viewer.addEventListener('click', event => {
                if (event.target === viewer || event.target.closest('.request-image-viewer-close')) this.closeRequestImage();
            });
            document.body.appendChild(viewer);
        }
        const image = viewer.querySelector('img');
        image.src = selectedImage.dataUrl;
        image.alt = selectedImage.name || 'Ảnh yêu cầu';
        viewer.querySelector('.request-image-viewer-name').textContent = selectedImage.name || 'Ảnh đính kèm';
        viewer.hidden = false;
        document.body.classList.add('request-image-viewer-open');
        viewer.querySelector('.request-image-viewer-close').focus();
    },

    closeRequestImage() {
        const viewer = document.getElementById('requestImageViewer');
        if (!viewer || viewer.hidden) return;
        viewer.hidden = true;
        viewer.querySelector('img').removeAttribute('src');
        document.body.classList.remove('request-image-viewer-open');
    },

    async loadRequests() {
        if (!this.currentUser) return;
        const list = document.getElementById('requestList');
        if (list && !this.requestsLoaded) {
            list.innerHTML = '<div class="request-empty">Đang tải yêu cầu...</div>';
        }
        try {
            const response = await this.authFetch(`${API_BASE_URL}/api/requests`);
            this.requests = await this.requireApiSuccess(response, 'Không thể tải danh sách yêu cầu.');
            this.requestsLoaded = true;
            this.renderRequests();
        } catch (err) {
            if (list) list.innerHTML = `<div class="request-empty request-error">${this.escapeHtml(err.message)}</div>`;
        }
    },

    async submitRequest() {
        const textInput = document.getElementById('requestTextInput');
        const priorityInput = document.getElementById('requestPriorityInput');
        const text = textInput.value.trim();
        const priority = Boolean(priorityInput?.checked);
        if (!text && this.requestImageDraft.length === 0) {
            this.showToast('Hãy nhập nội dung hoặc chọn một ảnh.', 'error');
            return;
        }

        this.setBtnLoading('requestSubmitBtn', true, 'Đang gửi...');
        try {
            const response = await this.authFetch(`${API_BASE_URL}/api/requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text,
                    images: this.requestImageDraft.map(image => ({
                        dataUrl: image.dataUrl,
                        name: image.name
                    })),
                    priority
                })
            });
            const created = await this.requireApiSuccess(response, 'Không thể lưu yêu cầu.');
            this.requests.unshift(created);
            this.requestFilter = priority ? 'priority' : 'pending';
            textInput.value = '';
            if (priorityInput) priorityInput.checked = false;
            this.clearRequestImage();
            this.renderRequests();
            this.showToast('Đã lưu yêu cầu.', 'success');
        } catch (err) {
            this.showToast(err.message || 'Không thể lưu yêu cầu.', 'error');
        } finally {
            this.setBtnLoading('requestSubmitBtn', false);
        }
    },

    async updateRequestStatus(id, completed, checkbox) {
        if (!id) return;
        checkbox.disabled = true;
        try {
            const response = await this.authFetch(`${API_BASE_URL}/api/requests/${encodeURIComponent(id)}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed })
            });
            const updated = await this.requireApiSuccess(response, 'Không thể cập nhật trạng thái yêu cầu.');
            const index = this.requests.findIndex(item => item.id === id);
            if (index >= 0) this.requests[index] = updated;
            this.renderRequests();
            this.showToast(completed ? 'Đã chuyển sang mục hoàn thành.' : 'Đã chuyển về mục chưa hoàn thành.', 'success');
        } catch (err) {
            checkbox.checked = !completed;
            checkbox.disabled = false;
            this.showToast(err.message || 'Không thể cập nhật trạng thái.', 'error');
        }
    },

    renderRequests() {
        const list = document.getElementById('requestList');
        if (!list) return;
        const priorityCount = this.requests.filter(item => item.priority && !item.completed).length;
        const pendingCount = this.requests.filter(item => !item.priority && !item.completed).length;
        const completedCount = this.requests.filter(item => item.completed).length;
        document.getElementById('requestPendingCount').innerText = pendingCount;
        document.getElementById('requestCompletedCount').innerText = completedCount;
        document.getElementById('requestPriorityCount').innerText = priorityCount;

        document.querySelectorAll('[data-request-filter]').forEach(button => {
            const active = button.dataset.requestFilter === this.requestFilter;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', String(active));
        });

        const showCompleted = this.requestFilter === 'completed';
        const showPriority = this.requestFilter === 'priority';
        const visibleItems = this.requests.filter(item => {
            if (showPriority) return Boolean(item.priority) && !item.completed;
            if (showCompleted) return Boolean(item.completed);
            return !item.priority && !item.completed;
        });
        if (!visibleItems.length) {
            const emptyMessage = showPriority
                ? 'Chưa có yêu cầu ưu tiên. Hãy tích “Ưu tiên” khi tạo yêu cầu.'
                : showCompleted
                    ? 'Chưa có yêu cầu nào đã hoàn thành.'
                    : 'Chưa có yêu cầu nào. Hãy tạo yêu cầu đầu tiên.';
            list.innerHTML = `<div class="request-empty">${emptyMessage}</div>`;
            return;
        }

        list.innerHTML = visibleItems.map((item, index) => {
            const createdLabel = this.formatRequestDate(item.createdAt);
            const textHtml = item.text
                ? `<div class="request-item-text">${this.escapeHtml(item.text).replace(/\n/g, '<br>')}</div>`
                : '';
            const imageHtml = this.getRequestImages(item).length
                ? `<div class="request-item-images">${this.getRequestImages(item).map((image, imageIndex) => `
                       <button type="button" class="request-item-image" data-request-id="${this.escapeHtmlAttr(item.id)}" data-image-index="${imageIndex}" title="Phóng to ảnh">
                           <img src="${this.escapeHtmlAttr(image.dataUrl)}" alt="${this.escapeHtmlAttr(image.name || 'Ảnh yêu cầu')}">
                       </button>`).join('')}</div>`
                : '';
            return `
                <article class="request-item ${item.completed ? 'is-completed' : ''} ${item.priority ? 'is-priority' : ''}">
                    <span class="request-sequence" aria-label="Yêu cầu số ${index + 1}">${index + 1}</span>
                    <div class="request-item-content">
                        ${item.priority ? '<div class="request-priority-label">Ưu tiên cao</div>' : ''}
                        ${textHtml}
                        ${imageHtml}
                        <div class="request-item-meta">${createdLabel}</div>
                    </div>
                    <div class="request-item-actions">
                        <label class="request-status-control" title="${item.completed ? 'Chuyển về chưa hoàn thành' : 'Đánh dấu đã hoàn thành'}">
                            <input type="checkbox" class="request-complete-checkbox"
                                data-request-id="${this.escapeHtmlAttr(item.id)}" ${item.completed ? 'checked' : ''}>
                            <span class="request-checkmark" aria-hidden="true"></span>
                            <span>${item.completed ? 'Đã hoàn thành' : 'Hoàn thành'}</span>
                        </label>
                    </div>
                </article>`;
        }).join('');
    },

    formatRequestDate(value) {
        if (!value) return '';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleString('vi-VN', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }
});
document.write('\x3cscript src=requests-edit.js\x3e\x3c/script\x3e');
