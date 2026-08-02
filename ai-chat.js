// ================================================================
// AI-CHAT.JS — Trang "Trợ lý AI"
// ================================================================
Object.assign(PinkyClassApp.prototype, {
    appendAiChatBubble(role, text, extraClass = '') {
        const wrap = document.getElementById('aiChatMessages');
        const msgEl = document.createElement('div');
        msgEl.className = `ai-chat-msg ${role === 'user' ? 'ai-chat-msg-user' : 'ai-chat-msg-bot'}`;
        const bubbleEl = document.createElement('div');
        bubbleEl.className = `ai-chat-bubble ${extraClass}`.trim();
        bubbleEl.innerText = text;
        msgEl.appendChild(bubbleEl);
        wrap.appendChild(msgEl);
        wrap.scrollTop = wrap.scrollHeight;
        return bubbleEl;
    },

    // Gửi câu hỏi tới /api/ai-chat kèm lịch sử hội thoại gần nhất — server sẽ
    // tự lấy đúng dữ liệu (lịch dạy/điểm số/học sinh) của giáo viên hiệu lực
    // ứng với tài khoản đang đăng nhập rồi mới hỏi AI, nên trợ lý luôn trả
    // lời trong đúng phạm vi dữ liệu được phép xem.
    async sendAiChatMessage() {
        const input = document.getElementById('aiChatInput');
        const sendBtn = document.getElementById('aiChatSendBtn');
        const message = input.value.trim();
        if (!message) return;

        const historyForRequest = this.aiChatHistory.slice(-10);
        this.appendAiChatBubble('user', message);
        this.aiChatHistory.push({ role: 'user', content: message });
        input.value = '';
        input.disabled = true;
        sendBtn.disabled = true;

        const loadingBubble = this.appendAiChatBubble('bot', 'Đang trả lời...', 'ai-chat-loading');

        try {
            const currentView = document.querySelector('.view-section.active-view')?.id || null;
            const contextView = currentView === 'view-ai-chat'
                ? this.lastVisitedFeatureViewId
                : currentView;
            const res = await this.authFetch(`${API_BASE_URL}/api/ai-chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message,
                    history: historyForRequest,
                    currentView,
                    contextView
                })
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload.error || 'Trợ lý AI hiện không phản hồi được.');

            loadingBubble.innerText = payload.reply;
            loadingBubble.classList.remove('ai-chat-loading');
            this.aiChatHistory.push({ role: 'assistant', content: payload.reply });
            this.applyAiChatAction(payload.action);
        } catch (err) {
            loadingBubble.innerText = err.message || 'Có lỗi xảy ra, vui lòng thử lại.';
            loadingBubble.classList.remove('ai-chat-loading');
            loadingBubble.classList.add('ai-chat-error');
            // Bỏ câu hỏi vừa hỏi khỏi lịch sử vì chưa có câu trả lời hợp lệ
            // tương ứng, tránh gửi lịch sử lệch nhịp ở lần hỏi tiếp theo.
            this.aiChatHistory.pop();
        } finally {
            input.disabled = false;
            sendBtn.disabled = false;
            input.focus();
        }
    },

    applyAiChatAction(action) {
        if (action?.type !== 'request_created' || !action.request || !this.requestsLoaded) return;
        if (this.requests.some(item => String(item.id) === String(action.request.id))) return;
        this.requests.unshift(action.request);
        if (document.getElementById('view-requests')?.classList.contains('active-view')) {
            this.renderRequests();
        }
    },

    // Xoá toàn bộ hội thoại Trợ lý AI hiện tại (chỉ ở phía client) và quay
    // lại lời chào ban đầu.
    clearAiChat() {
        this.aiChatHistory = [];
        const wrap = document.getElementById('aiChatMessages');
        wrap.innerHTML = `
            <div class="ai-chat-msg ai-chat-msg-bot">
                <div class="ai-chat-bubble">Xin chào! Mình là trợ lý AI của NttClass. Mình có thể hướng dẫn giao diện, giải thích chức năng, góp ý cách sử dụng, tra cứu dữ liệu trong phạm vi tài khoản và tạo mục Yêu cầu khi bạn nói rõ nội dung cần thêm.</div>
            </div>
        `;
    }

    // Lưu bảng nhập nhanh: MỖI học sinh được lưu nhận xét RIÊNG của mình (đọc
    // trực tiếp từ thẻ tương ứng), rồi đồng bộ luôn về trang Nhật ký học tập
    // (studentDetails dùng chung nguồn dữ liệu với renderStudentLogs()).
});
