document.addEventListener('DOMContentLoaded', () => {
  const headers = document.querySelectorAll('header.navbar, header.floating-navbar');
  headers.forEach((header) => {
    const nav = header.querySelector('nav');
    if (!nav) return;
    nav.classList.add('nav-collapsible');

    let toggle = header.querySelector('.nav-toggle');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'nav-toggle';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Toggle navigation');
      toggle.innerHTML = '<span></span><span></span><span></span>';
      header.insertBefore(toggle, nav);
    }

    toggle.addEventListener('click', () => {
      const open = header.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });
});
