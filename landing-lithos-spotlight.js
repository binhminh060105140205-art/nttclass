(function initializeLithosSpotlight() {
    const page = document.getElementById('landingPage');
    const hero = document.querySelector('.lithos-hero');
    if (!page || !hero) return;

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
        hero.style.setProperty('--spot-x', `${smooth.x}px`);
        hero.style.setProperty('--spot-y', `${smooth.y}px`);

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

    const pageObserver = new MutationObserver(syncVisibility);
    pageObserver.observe(page, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', syncVisibility);
})();
