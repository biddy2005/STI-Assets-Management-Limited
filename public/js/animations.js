document.addEventListener('DOMContentLoaded', () => {

  // ---- Sticky glass header ----
  const header = document.querySelector('.site-header');
  if (header) {
    const toggleSticky = () => {
      header.classList.toggle('is-sticky', window.scrollY > 50);
    };
    toggleSticky();
    window.addEventListener('scroll', toggleSticky, { passive: true });
  }

  // ---- Scroll reveal ----
  const revealEls = document.querySelectorAll('.reveal-on-scroll');
  if (revealEls.length && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    revealEls.forEach((el) => observer.observe(el));
  } else {
    // No IntersectionObserver support: show everything immediately
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

});