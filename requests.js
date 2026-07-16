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
            const checkbox = event.target.closest('.request-complete-checkbox');
            if (!checkbox) return;
            this.updateRequestStatus(checkbox.dataset.requestId, checkbox.checked, checkbox);
        });
    },

    async selectRequestImage(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        await this.setRequestImageFile(file);
    },

    async pasteRequestImage(event) {
        const items = Array.from(event.clipboardData?.items || []);
        const imageItem = items.find(item => item.kind === 'file' && item.type.startsWith('image/'));
        if (!imageItem) return;
        const file = imageItem.getAsFile();
        if (!file) return;
        event.preventDefault();
        await this.setRequestImageFile(file, `anh-dan-${Date.now()}.${(file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, true);
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
            this.showToast('Ảnh đính kèm không được vượt quá 3 MB.', 'error');
            const input = document.getElementById('requestImageInput');
            if (input) input.value = '';
            return;
        }

        try {
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () => reject(new Error('Không thể đọc ảnh đã chọn.'));
                reader.readAsDataURL(file);
            });
            this.requestImageDraft = { dataUrl, name: file.name || fallbackName || 'anh-dinh-kem' };
            document.getElementById('requestImagePreviewImg').src = dataUrl;
            document.getElementById('requestImagePreview').hidden = false;
            if (pasted) this.showToast('Đã dán ảnh từ bộ nhớ tạm.', 'success');
        } catch (err) {
            this.showToast(err.message, 'error');
            this.clearRequestImage();
        }
    },

    clearRequestImage() {
        this.requestImageDraft = null;
        const input = document.getElementById('requestImageInput');
        const preview = document.getElementById('requestImagePreview');
        const image = document.getElementById('requestImagePreviewImg');
        if (input) input.value = '';
        if (image) image.removeAttribute('src');
        if (preview) preview.hidden = true;
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
        const text = textInput.value.trim();
        if (!text && !this.requestImageDraft) {
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
                    imageData: this.requestImageDraft?.dataUrl || null,
                    imageName: this.requestImageDraft?.name || null
                })
            });
            const created = await this.requireApiSuccess(response, 'Không thể lưu yêu cầu.');
            this.requests.unshift(created);
            this.requestFilter = 'pending';
            textInput.value = '';
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
        const pendingCount = this.requests.filter(item => !item.completed).length;
        const completedCount = this.requests.length - pendingCount;
        document.getElementById('requestPendingCount').innerText = pendingCount;
        document.getElementById('requestCompletedCount').innerText = completedCount;

        document.querySelectorAll('[data-request-filter]').forEach(button => {
            const active = button.dataset.requestFilter === this.requestFilter;
            button.classList.toggle('active', active);
            button.setAttribute('aria-selected', String(active));
        });

        const showCompleted = this.requestFilter === 'completed';
        const visibleItems = this.requests.filter(item => Boolean(item.completed) === showCompleted);
        if (!visibleItems.length) {
            list.innerHTML = `<div class="request-empty">${showCompleted ? 'Chưa có yêu cầu nào đã hoàn thành.' : 'Chưa có yêu cầu nào. Hãy tạo yêu cầu đầu tiên.'}</div>`;
            return;
        }

        list.innerHTML = visibleItems.map(item => {
            const createdLabel = this.formatRequestDate(item.createdAt);
            const textHtml = item.text
                ? `<div class="request-item-text">${this.escapeHtml(item.text).replace(/\n/g, '<br>')}</div>`
                : '';
            const imageHtml = item.imageData
                ? `<a class="request-item-image" href="${this.escapeHtmlAttr(item.imageData)}" target="_blank" rel="noopener" title="Mở ảnh đầy đủ">
                       <img src="${this.escapeHtmlAttr(item.imageData)}" alt="${this.escapeHtmlAttr(item.imageName || 'Ảnh yêu cầu')}">
                   </a>`
                : '';
            return `
                <article class="request-item ${item.completed ? 'is-completed' : ''}">
                    <div class="request-item-content">
                        ${textHtml}
                        ${imageHtml}
                        <div class="request-item-meta">${createdLabel}</div>
                    </div>
                    <label class="request-status-control" title="${item.completed ? 'Chuyển về chưa hoàn thành' : 'Đánh dấu đã hoàn thành'}">
                        <input type="checkbox" class="request-complete-checkbox"
                            data-request-id="${this.escapeHtmlAttr(item.id)}" ${item.completed ? 'checked' : ''}>
                        <span class="request-checkmark" aria-hidden="true"></span>
                        <span>${item.completed ? 'Đã hoàn thành' : 'Hoàn thành'}</span>
                    </label>
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
