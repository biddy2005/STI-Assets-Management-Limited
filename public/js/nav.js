document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('navToggle');
  const nav = document.getElementById('mainNav');

  toggle.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', isOpen);
  });

  // On mobile, tapping a "has-dropdown" link toggles its submenu
  // instead of navigating immediately (hover handles this on desktop via CSS).
  document.querySelectorAll('.has-dropdown > a').forEach((link) => {
    link.addEventListener('click', (e) => {
      if (window.innerWidth < 768) {
        e.preventDefault();
        link.parentElement.classList.toggle('open');
      }
    });
  });

  // A menu opened on mobile must not remain expanded after resizing to desktop.
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
      document.querySelectorAll('.has-dropdown.open').forEach((item) => item.classList.remove('open'));
    }
  });
});
