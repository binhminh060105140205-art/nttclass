(function () {
    const dashPattern = /[\u2011\u2013\u2014\u2212]/g;
    const attributes = ['aria-label', 'alt', 'placeholder', 'title'];
    const normalize = value => String(value || '').replace(dashPattern, '-');

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

    function start() {
        fixTree(document.body);
        new MutationObserver(mutations => mutations.forEach(mutation => {
            if (mutation.type === 'characterData') return fixText(mutation.target);
            if (mutation.type === 'attributes') return fixElement(mutation.target);
            mutation.addedNodes.forEach(fixTree);
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
