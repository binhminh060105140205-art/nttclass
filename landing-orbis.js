(function () {
    function bindLoginButtons(page) {
        const loginPage = document.getElementById('loginPage');
        page.querySelectorAll('[data-open-login]').forEach(button => {
            button.addEventListener('click', () => {
                page.classList.add('hidden');
                loginPage.classList.remove('hidden');
                document.querySelector('.sidebar')?.classList.add('hidden');
                document.querySelector('.main-content')?.classList.add('hidden');
                const logoutButton = document.getElementById('logoutBtn');
                if (logoutButton) logoutButton.style.display = 'none';
                window.scrollTo(0, 0);
            });
        });
    }

    function initializeSpotlight(page, hero) {
        const mouse = { x: -999, y: -999 };
        const smooth = { x: -999, y: -999 };
        let animationFrameId = 0;
        const isActive = () => !document.hidden && !page.classList.contains('hidden');

        const requestFrame = () => {
            if (!animationFrameId && isActive()) {
                animationFrameId = window.requestAnimationFrame(renderFrame);
            }
        };

        const renderFrame = () => {
            animationFrameId = 0;
            if (!isActive()) return;
            smooth.x += (mouse.x - smooth.x) * 0.1;
            smooth.y += (mouse.y - smooth.y) * 0.1;
            hero.style.setProperty('--spot-x', smooth.x + 'px');
            hero.style.setProperty('--spot-y', smooth.y + 'px');
            if (Math.abs(mouse.x - smooth.x) > 0.1 || Math.abs(mouse.y - smooth.y) > 0.1) {
                requestFrame();
            }
        };

        window.addEventListener('pointermove', event => {
            mouse.x = event.clientX;
            mouse.y = event.clientY;
            requestFrame();
        }, { passive: true });
        hero.addEventListener('pointerleave', () => {
            mouse.x = -999;
            mouse.y = -999;
            requestFrame();
        });

        const syncVisibility = () => {
            if (isActive()) requestFrame();
            else if (animationFrameId) {
                window.cancelAnimationFrame(animationFrameId);
                animationFrameId = 0;
            }
        };
        new MutationObserver(syncVisibility).observe(page, { attributes: true, attributeFilter: ['class'] });
        document.addEventListener('visibilitychange', syncVisibility);
    }

    function renderLithosLanding() {
        const page = document.getElementById('landingPage');
        if (!page || page.dataset.landingTheme === 'lithos') return;
        page.dataset.landingTheme = 'lithos';
        page.className = 'lithos-page';
        page.innerHTML = [
            '<section class="lithos-hero" id="lithosHero">',
            '<div class="lithos-base" aria-hidden="true"></div>',
            '<div class="lithos-reveal" aria-hidden="true"></div>',
            '<nav class="lithos-nav">',
            '<a class="lithos-brand" href="#lithosHero" aria-label="NttClass"><svg viewBox="0 0 256 256" aria-hidden="true"><path d="M256,256H128L0,128H128ZM256,128H128L0,0H128Z"></path></svg><span class="lithos-wordmark">NttClass</span></a>',
            '<div class="lithos-menu"><button type="button" data-open-login>Tổng quan</button><button type="button" data-open-login>Lịch dạy</button><button type="button" data-open-login>Học sinh</button><button type="button" data-open-login>Điểm số</button><button type="button" data-open-login>Học phí</button></div>',
            '<button type="button" class="lithos-signup" data-open-login>Đăng nhập</button>',
            '<button type="button" class="lithos-mobile" data-open-login aria-label="Đăng nhập">☰</button>',
            '</nav>',
            '<div class="lithos-heading"><h1><span class="lithos-line-one lithos-anim lithos-reveal-anim" style="animation-delay:.25s">Dạy học nhẹ nhàng</span><span class="lithos-line-two lithos-anim lithos-reveal-anim" style="animation-delay:.42s">quản lý rõ ràng</span></h1></div>',
            '<div class="lithos-left lithos-anim lithos-fade" style="animation-delay:.7s"><p>Quản lý học sinh, lịch dạy và tiến độ học tập trong một nơi.</p></div>',
            '<div class="lithos-right lithos-anim lithos-fade" style="animation-delay:.85s"><p>Theo dõi điểm số, học phí và từng buổi học rõ ràng, nhanh chóng.</p><button type="button" class="lithos-start" data-open-login>Bắt đầu</button></div>',
            '</section>'
        ].join('');
        const hero = page.querySelector('.lithos-hero');
        bindLoginButtons(page);
        initializeSpotlight(page, hero);
    }

    window.renderLandingTheme = renderLithosLanding;
})();
