const landingTitle = document.querySelector('.landing-hero h1');
if (landingTitle) landingTitle.innerHTML = 'Qu\u1ea3n l\u00fd l\u1edbp h\u1ecdc.<br><em>Nh\u1eb9 nh\u00e0ng h\u01a1n.</em>';
const landingText = (selector, value) => {
    const node = document.querySelector(selector);
    if (node) node.textContent = value;
};
const landingHtml = (selector, value) => {
    const node = document.querySelector(selector);
    if (node) node.innerHTML = value;
};
landingText('.landing-nav-links a:nth-child(1)', 'Trang ch\u1ee7');
landingText('.landing-nav-links a:nth-child(2)', 'T\u00ednh n\u0103ng');
landingText('.landing-nav-links a:nth-child(3)', 'C\u00e1ch ho\u1ea1t \u0111\u1ed9ng');
