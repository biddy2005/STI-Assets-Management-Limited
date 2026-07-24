document.addEventListener('DOMContentLoaded', () => {
  const header = document.getElementById('siteHeader');
  const toggle = document.getElementById('navToggle');
  const drawer = document.getElementById('mobileDrawer');
  const drawerClose = document.getElementById('drawerClose');
  const overlay = document.getElementById('navOverlay');

  // Sticky header shadow on scroll
  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      header.classList.add('is-scrolling');
    } else {
      header.classList.remove('is-scrolling');
    }
  });

  function openDrawer() {
    drawer.classList.add('open');
    overlay.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('nav-open-lock');
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('nav-open-lock');
    drawer.querySelectorAll('.has-dropdown.open').forEach((item) => item.classList.remove('open'));
  }

  toggle.addEventListener('click', openDrawer);
  drawerClose.addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) {
      closeDrawer();
    }
  });

  // Inside the drawer, tapping a "has-dropdown" link expands its submenu
  drawer.querySelectorAll('.has-dropdown > a').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      link.parentElement.classList.toggle('open');
    });
  });

  // Tapping a plain drawer link closes the drawer so navigation feels immediate
  drawer.querySelectorAll('.mobile-drawer-nav > ul > li:not(.has-dropdown) > a, .dropdown a').forEach((link) => {
    link.addEventListener('click', closeDrawer);
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) {
      closeDrawer();
    }
  });
});