var originalFetch = fetch.bind(window);

if (!localStorage.pinky_current_user) {
    fetch = function (input, options) {
        var requestOptions = options || {};
        var pathname = new URL(typeof input === 'string' ? input : input.url, location).pathname;
        var headers = requestOptions.headers || {};
        var authorization = headers.Authorization || headers.authorization;

        if (!authorization && (pathname === '/api/students' || pathname === '/api/sessions' || pathname === '/api/scores')) {
            return Promise.resolve(new Response('[]'));
        }

        return originalFetch(input, requestOptions);
    };
}

(function initializeAetheraLanding() {
    var landingPage = document.getElementById('landingPage');

    if (!landingPage) return;

    landingPage.className = 'aethera-page';
    landingPage.innerHTML = `
        <div class='aethera-video-layer' aria-hidden='true'>
            <video
                id='aetheraBackgroundVideo'
                class='aethera-video'
                src='https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_083109_283f3553-e28f-428b-a723-d639c617eb2b.mp4'
                autoplay
                muted
                playsinline
                preload='auto'
            ></video>
        </div>
        <div class='aethera-video-gradient' aria-hidden='true'></div>

        <header class='aethera-nav'>
            <a class='aethera-logo' href='#landingPage' aria-label='Aethera home'>Aethera<sup aria-hidden='true'>®</sup></a>

            <nav class='aethera-nav-menu' aria-label='Primary navigation'>
                <a class='aethera-nav-link is-active' href='#landingPage'>Home</a>
                <a class='aethera-nav-link' href='#landingPage'>Studio</a>
                <a class='aethera-nav-link' href='#landingPage'>About</a>
                <a class='aethera-nav-link' href='#landingPage'>Journal</a>
                <a class='aethera-nav-link' href='#landingPage'>Reach Us</a>
            </nav>

            <button type='button' class='aethera-button aethera-nav-button' data-open-login>Begin Journey</button>
        </header>

        <main class='aethera-hero'>
            <h1 class='aethera-headline animate-fade-rise'>Beyond <em>silence,</em> we build <em>the eternal.</em></h1>
            <p class='aethera-description animate-fade-rise-delay'>Building platforms for brilliant minds, fearless makers, and thoughtful souls. Through the noise, we craft digital havens for deep work and pure flows.</p>
            <div class='aethera-hero-action animate-fade-rise-delay-2'>
                <button type='button' class='aethera-button aethera-hero-button' data-open-login>Begin Journey</button>
            </div>
        </main>
    `;

    var video = document.getElementById('aetheraBackgroundVideo');

    if (!video) return;

    var fadeDuration = 0.5;
    var animationFrame = 0;
    var restartTimer = 0;
    var isRestarting = false;

    function setVideoOpacity() {
        var duration = video.duration;
        var currentTime = video.currentTime;

        if (!Number.isFinite(duration) || duration <= 0) {
            video.style.opacity = '0';
        } else {
            var fadeInOpacity = Math.min(Math.max(currentTime / fadeDuration, 0), 1);
            var fadeOutOpacity = Math.min(Math.max((duration - currentTime) / fadeDuration, 0), 1);
            video.style.opacity = String(Math.min(fadeInOpacity, fadeOutOpacity));
        }

        animationFrame = requestAnimationFrame(setVideoOpacity);
    }

    function startMonitoring() {
        if (!animationFrame) animationFrame = requestAnimationFrame(setVideoOpacity);
    }

    function stopMonitoring() {
        if (!animationFrame) return;
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
    }

    function playVideo() {
        var playPromise = video.play();
        if (playPromise && typeof playPromise.catch === 'function') playPromise.catch(function () {});
    }

    function restartVideo() {
        if (isRestarting) return;

        isRestarting = true;
        video.style.opacity = '0';
        window.clearTimeout(restartTimer);
        restartTimer = window.setTimeout(function () {
            video.currentTime = 0;
            playVideo();
            isRestarting = false;
        }, 100);
    }

    video.addEventListener('loadedmetadata', function () {
        video.style.opacity = '0';
    });
    video.addEventListener('playing', startMonitoring);
    video.addEventListener('pause', stopMonitoring);
    video.addEventListener('ended', restartVideo);

    var landingVisibilityObserver = new MutationObserver(function () {
        if (landingPage.classList.contains('hidden')) {
            video.pause();
        } else {
            playVideo();
        }
    });

    landingVisibilityObserver.observe(landingPage, { attributes: true, attributeFilter: ['class'] });
    startMonitoring();
    playVideo();

    window.addEventListener('beforeunload', function () {
        stopMonitoring();
        window.clearTimeout(restartTimer);
        landingVisibilityObserver.disconnect();
    }, { once: true });
})();
