(function () {
    const dashPattern = /[\u2011\u2013\u2014\u2212]/g;
    const attributes = ['aria-label', 'alt', 'placeholder', 'title'];
    const normalize = value => String(value || '').replace(dashPattern, '-');
    const pendingRoots = new Set();
    let flushScheduled = false;

    function fixText(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest('script, style, input, textarea, [contenteditable="true"]')) return;
        const value = normalize(node.nodeValue);
        if (value !== node.nodeValue) node.nodeValue = value;
    }

    function fixElement(element) {
        if (!(element instanceof Element)) return;
        attributes.forEach(name => {
            if (!element.hasAttribute(name)) return;
            const value = element.getAttribute(name);
            const fixed = normalize(value);
            if (fixed !== value) element.setAttribute(name, fixed);
        });
    }

    function fixTree(root) {
        if (root.nodeType === Node.TEXT_NODE) return fixText(root);
        if (!(root instanceof Element)) return;
        fixElement(root);
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            if (node.nodeType === Node.TEXT_NODE) fixText(node);
            else fixElement(node);
        }
    }

    function flushPendingTrees() {
        flushScheduled = false;
        const roots = Array.from(pendingRoots).filter(node => node.isConnected);
        pendingRoots.clear();
        roots.forEach((root, index) => {
            const coveredByParent = roots.some((candidate, candidateIndex) => (
                candidateIndex !== index
                && candidate instanceof Element
                && candidate.contains(root)
            ));
            if (!coveredByParent) fixTree(root);
        });
    }

    function queueTree(root) {
        if (!root) return;
        pendingRoots.add(root);
        if (flushScheduled) return;
        flushScheduled = true;
        window.requestAnimationFrame(flushPendingTrees);
    }

    function start() {
        queueTree(document.body);
        new MutationObserver(mutations => mutations.forEach(mutation => {
            if (mutation.type === 'characterData' || mutation.type === 'attributes') {
                queueTree(mutation.target);
                return;
            }
            mutation.addedNodes.forEach(queueTree);
        })).observe(document.body, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: attributes
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
