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
        && !reducedMotionQuery.matches
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
            ? [[5, 20], [80, 95]]
            : [[3, 16], [24, 37], [63, 76], [84, 97]];
        const zone = zones[Math.floor(Math.random() * zones.length)];
        return randomBetween(zone[0], zone[1]);
    };

    const spawnBlossom = () => {
        if (!isEnabled()) return;
        const container = getContainer();
        if (!container) return;
        const maximumVisible = mobileQuery.matches ? 5 : 9;
        if (container.childElementCount >= maximumVisible) return;

        const isWholeFlower = Math.random() < 0.56;
        const blossom = document.createElement('span');
        const sprite = document.createElement('span');
        blossom.className = 'lithos-falling-blossom ' + (isWholeFlower ? 'is-flower' : 'is-petal');
        sprite.className = 'lithos-falling-blossom__sprite';
        blossom.appendChild(sprite);

        const baseSize = isWholeFlower
            ? randomBetween(mobileQuery.matches ? 11 : 13, mobileQuery.matches ? 17 : 21)
            : randomBetween(mobileQuery.matches ? 7 : 8, mobileQuery.matches ? 11 : 14);
        const direction = randomSigned(28, mobileQuery.matches ? 62 : 105);
        const swayOne = direction * randomBetween(.28, .52);
        const swayTwo = -direction * randomBetween(.2, .48);
        const startRotation = randomBetween(-80, 80);
        const rotationTravel = randomSigned(260, 620);

        blossom.style.setProperty('--flower-x', chooseHorizontalPosition().toFixed(2) + 'vw');
        blossom.style.setProperty('--flower-size', baseSize.toFixed(1) + 'px');
        blossom.style.setProperty('--fall-duration', randomBetween(8.8, 13.8).toFixed(2) + 's');
        blossom.style.setProperty('--flutter-duration', randomBetween(1.15, 2.4).toFixed(2) + 's');
        blossom.style.setProperty('--flower-opacity', randomBetween(.58, .86).toFixed(2));
        blossom.style.setProperty('--sway-one', swayOne.toFixed(1) + 'px');
        blossom.style.setProperty('--sway-two', swayTwo.toFixed(1) + 'px');
        blossom.style.setProperty('--drift-end', direction.toFixed(1) + 'px');
        blossom.style.setProperty('--rotate-start', startRotation.toFixed(1) + 'deg');
        blossom.style.setProperty('--rotate-one', (startRotation + rotationTravel * .32).toFixed(1) + 'deg');
        blossom.style.setProperty('--rotate-two', (startRotation + rotationTravel * .68).toFixed(1) + 'deg');
        blossom.style.setProperty('--rotate-end', (startRotation + rotationTravel).toFixed(1) + 'deg');

        const removeBlossom = () => blossom.remove();
        blossom.addEventListener('animationend', removeBlossom, { once: true });
        window.setTimeout(removeBlossom, 15000);
        container.appendChild(blossom);
    };

    const spawnBurst = () => {
        if (!isEnabled()) return;
        const randomValue = Math.random();
        const blossomCount = mobileQuery.matches
            ? (randomValue < .28 ? 2 : 1)
            : (randomValue < .12 ? 3 : randomValue < .48 ? 2 : 1);

        for (let blossomIndex = 0; blossomIndex < blossomCount; blossomIndex += 1) {
            const timerId = window.setTimeout(() => {
                delayedSpawnTimers.delete(timerId);
                spawnBlossom();
            }, blossomIndex * randomBetween(180, 520));
            delayedSpawnTimers.add(timerId);
        }
    };

    const scheduleNextBurst = () => {
        window.clearTimeout(scheduleTimer);
        const container = getContainer();
        if (!container) return;
        if (!isEnabled()) {
            stopPetals();
            return;
        }

        container.hidden = false;
        const delay = mobileQuery.matches
            ? randomBetween(4800, 9000)
            : randomBetween(3400, 7600);
        scheduleTimer = window.setTimeout(() => {
            spawnBurst();
            scheduleNextBurst();
        }, delay);
    };

    const refreshPetalState = () => {
        if (isEnabled()) scheduleNextBurst();
        else stopPetals();
    };

    const themeObserver = new MutationObserver(refreshPetalState);
    themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-app-theme']
    });
    document.addEventListener('visibilitychange', refreshPetalState);
    reducedMotionQuery.addEventListener?.('change', refreshPetalState);
    mobileQuery.addEventListener?.('change', refreshPetalState);
    window.addEventListener('pagehide', () => {
        stopPetals();
        themeObserver.disconnect();
    }, { once: true });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', refreshPetalState, { once: true });
    } else {
        refreshPetalState();
    }
})();
