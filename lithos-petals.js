(function initializeLithosPetalFall() {
    const containerId = 'lithosPetalFall';
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const delayedSpawnTimers = new Set();
    let scheduleTimer = 0;

    const randomBetween = (minimum, maximum) => minimum + Math.random() * (maximum - minimum);
    const randomSigned = (minimum, maximum) => (Math.random() < 0.5 ? -1 : 1) * randomBetween(minimum, maximum);

    const getContainer = () => {
        let container = document.getElementById(containerId);
        if (container || !document.body) return container;
        container = document.createElement('div');
        container.id = containerId;
        container.className = 'lithos-petal-fall';
        container.setAttribute('aria-hidden', 'true');
        container.hidden = true;
        document.body.appendChild(container);
        return container;
    };

    const isEnabled = () => (
        document.documentElement.getAttribute('data-app-theme') === 'lithos'
        && !document.hidden
    );

    const clearDelayedSpawns = () => {
        delayedSpawnTimers.forEach(timerId => window.clearTimeout(timerId));
        delayedSpawnTimers.clear();
    };

    const stopPetals = () => {
        window.clearTimeout(scheduleTimer);
        scheduleTimer = 0;
        clearDelayedSpawns();
        const container = getContainer();
        if (!container) return;
        container.hidden = true;
        container.replaceChildren();
    };

    const chooseHorizontalPosition = () => {
        const zones = mobileQuery.matches
            ? [[6, 22], [78, 94]]
            : [[4, 18], [27, 40], [60, 73], [82, 96]];
        const zone = zones[Math.floor(Math.random() * zones.length)];
        return randomBetween(zone[0], zone[1]);
    };

    const spawnBlossom = (forceWholeFlower = false) => {
        if (!isEnabled()) return;
        const container = getContainer();
        if (!container) return;
        const maximumVisible = reducedMotionQuery.matches ? 3 : (mobileQuery.matches ? 4 : 7);
        if (container.childElementCount >= maximumVisible) return;

        const isWholeFlower = forceWholeFlower || Math.random() < 0.72;
        const blossom = document.createElement('span');
        const sprite = document.createElement('span');
        blossom.className = 'lithos-falling-blossom '
            + (isWholeFlower ? 'is-flower' : 'is-petal')
            + (reducedMotionQuery.matches ? ' is-reduced-motion' : '');
        sprite.className = 'lithos-falling-blossom__sprite';
        blossom.appendChild(sprite);

        const baseSize = isWholeFlower
            ? randomBetween(mobileQuery.matches ? 15 : 18, mobileQuery.matches ? 22 : 27)
            : randomBetween(mobileQuery.matches ? 9 : 12, mobileQuery.matches ? 14 : 18);
        const directionLimit = mobileQuery.matches ? 64 : 112;
        const direction = reducedMotionQuery.matches
            ? randomSigned(18, directionLimit * .45)
            : randomSigned(32, directionLimit);
        const swayOne = direction * randomBetween(.28, .52);
        const swayTwo = -direction * randomBetween(.2, .48);
        const startRotation = randomBetween(-70, 70);
        const rotationTravel = reducedMotionQuery.matches
            ? randomSigned(45, 120)
            : randomSigned(300, 680);
        const fallDuration = reducedMotionQuery.matches
            ? randomBetween(13.5, 17.5)
            : randomBetween(9.2, 13.4);

        blossom.style.setProperty('--flower-x', chooseHorizontalPosition().toFixed(2) + 'vw');
        blossom.style.setProperty('--flower-size', baseSize.toFixed(1) + 'px');
        blossom.style.setProperty('--fall-duration', fallDuration.toFixed(2) + 's');
        blossom.style.setProperty('--flutter-duration', randomBetween(1.05, 2.1).toFixed(2) + 's');
        blossom.style.setProperty('--flower-opacity', randomBetween(.82, .98).toFixed(2));
        blossom.style.setProperty('--sway-one', swayOne.toFixed(1) + 'px');
        blossom.style.setProperty('--sway-two', swayTwo.toFixed(1) + 'px');
        blossom.style.setProperty('--drift-end', direction.toFixed(1) + 'px');
        blossom.style.setProperty('--rotate-start', startRotation.toFixed(1) + 'deg');
        blossom.style.setProperty('--rotate-one', (startRotation + rotationTravel * .32).toFixed(1) + 'deg');
        blossom.style.setProperty('--rotate-two', (startRotation + rotationTravel * .68).toFixed(1) + 'deg');
        blossom.style.setProperty('--rotate-end', (startRotation + rotationTravel).toFixed(1) + 'deg');

        const removeBlossom = () => blossom.remove();
        blossom.addEventListener('animationend', removeBlossom, { once: true });
        window.setTimeout(removeBlossom, 18500);
        container.appendChild(blossom);
    };

    const spawnBurst = (isInitialBurst = false) => {
        if (!isEnabled()) return;
        const randomValue = Math.random();
        const blossomCount = isInitialBurst
            ? (mobileQuery.matches ? 1 : 2)
            : reducedMotionQuery.matches
                ? 1
                : mobileQuery.matches
                    ? (randomValue < .34 ? 2 : 1)
                    : (randomValue < .18 ? 3 : randomValue < .7 ? 2 : 1);

        for (let blossomIndex = 0; blossomIndex < blossomCount; blossomIndex += 1) {
            const timerId = window.setTimeout(() => {
                delayedSpawnTimers.delete(timerId);
                spawnBlossom(isInitialBurst && blossomIndex === 0);
            }, blossomIndex * randomBetween(150, 420));
            delayedSpawnTimers.add(timerId);
        }
    };

    const scheduleNextBurst = (isInitialBurst = false) => {
        window.clearTimeout(scheduleTimer);
        const container = getContainer();
        if (!container) return;
        if (!isEnabled()) {
            stopPetals();
            return;
        }

        container.hidden = false;
        const delay = isInitialBurst
            ? randomBetween(450, 900)
            : reducedMotionQuery.matches
                ? randomBetween(7200, 10500)
                : mobileQuery.matches
                    ? randomBetween(4500, 7600)
                    : randomBetween(3500, 6500);
        scheduleTimer = window.setTimeout(() => {
            spawnBurst(isInitialBurst);
            scheduleNextBurst(false);
        }, delay);
    };

    const refreshPetalState = () => {
        if (isEnabled()) scheduleNextBurst(true);
        else stopPetals();
    };

    window.refreshLithosPetals = refreshPetalState;

    const themeObserver = new MutationObserver(refreshPetalState);
    themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-app-theme']
    });
    document.addEventListener('visibilitychange', refreshPetalState);
    reducedMotionQuery.addEventListener?.('change', refreshPetalState);
    mobileQuery.addEventListener?.('change', refreshPetalState);
    window.addEventListener('pagehide', stopPetals);
    window.addEventListener('pageshow', refreshPetalState);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', refreshPetalState, { once: true });
    } else {
        refreshPetalState();
    }
})();
