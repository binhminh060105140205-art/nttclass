(function () {
    const VIDEO_URL = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4';

    window.openNttLoginPage = function openNttLoginPage() {
        window.__nttLoginRequested = true;
        document.getElementById('landingPage')?.classList.add('hidden');
        document.getElementById('loginPage')?.classList.remove('hidden');
        document.querySelector('.sidebar')?.classList.add('hidden');
        document.querySelector('.main-content')?.classList.add('hidden');
        const logoutButton = document.getElementById('logoutBtn');
        if (logoutButton) logoutButton.style.display = 'none';
        if (window.app) {
            window.app.currentUser = null;
            window.app.currentRole = null;
        }
        window.setTimeout(() => document.getElementById('loginUsername')?.focus(), 0);
    };

    if (new URLSearchParams(window.location.search).get('login') === '1') {
        window.setTimeout(() => window.openNttLoginPage(), 0);
    }

    window.renderVelorahLanding = function renderVelorahLanding() {
        const page = document.getElementById('landingPage');
        if (!page) return;

        page.className = 'velorah-page';
        page.innerHTML = `
            <section class="velorah-hero">
                <video class="velorah-video" autoplay loop muted playsinline preload="auto" aria-hidden="true">
                    <source src="${VIDEO_URL}" type="video/mp4">
                </video>
                <nav class="velorah-nav" aria-label="Điều hướng NttClass">
                    <a class="velorah-logo" href="#velorahHome">NttClass<sup>®</sup></a>
                    <div class="velorah-links velorah-liquid-glass">
                        <a class="is-active" href="#velorahHome">Trang chủ</a>
                        <a href="?login=1" data-open-login>Học sinh</a>
                        <a href="?login=1" data-open-login>Điểm số</a>
                        <a href="?login=1" data-open-login>Lịch dạy</a>
                        <a href="?login=1" data-open-login>Học phí</a>
                    </div>
                    <a href="?login=1" class="velorah-nav-cta velorah-liquid-glass" data-open-login>Đăng nhập</a>
                </nav>
                <div class="velorah-content" id="velorahHome">
                    <h1 class="velorah-fade-rise">Where <em>dreams</em> rise<br><em>through the silence.</em></h1>
                    <p class="velorah-subtext velorah-fade-rise-delay">NttClass kết nối hồ sơ học sinh, lịch dạy, điểm số và học phí trong một không gian tập trung, rõ ràng và nhẹ nhàng.</p>
                </div>
            </section>
        `;

        page.querySelectorAll('[data-open-login]').forEach((button) => {
            button.addEventListener('click', window.openNttLoginPage);
        });
        page.querySelector('.velorah-video')?.play().catch(() => {});
    };
})();
