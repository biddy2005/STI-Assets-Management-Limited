(() => {
  'use strict';

  /* ============================================================
     STI HOMEPAGE INTERACTIONS
     ------------------------------------------------------------
     - Progressive enhancement: content remains visible if JS fails.
     - IntersectionObserver is used instead of scroll event loops.
     - Reduced-motion preference is respected.
  ============================================================ */

  const doc = document.documentElement;
  const reducedMotionQuery = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  );


  function initialiseLucideIcons() {
    if (
      window.lucide &&
      typeof window.lucide.createIcons === 'function'
    ) {
      window.lucide.createIcons({
        attrs: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': 1.75,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round'
        }
      });
    }
  }

  function initialiseReveals() {
    const revealElements = Array.from(
      document.querySelectorAll('[data-reveal]')
    );

    if (!revealElements.length) return;

    if (
      reducedMotionQuery.matches ||
      !('IntersectionObserver' in window)
    ) {
      revealElements.forEach((element) => {
        element.classList.add('is-visible');
      });
      return;
    }

    let observer;

    try {
      observer = new IntersectionObserver(
        (entries, revealObserver) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;

            entry.target.classList.add('is-visible');
            revealObserver.unobserve(entry.target);
          });
        },
        {
          threshold: 0.08,
          rootMargin: '0px 0px -3% 0px'
        }
      );
    } catch (error) {
      revealElements.forEach((element) => {
        element.classList.add('is-visible');
      });
      return;
    }

    revealElements.forEach((element, index) => {
      const delay = Math.min((index % 4) * 60, 180);
      element.style.setProperty('--home-reveal-delay', `${delay}ms`);

      /*
        Only hide an element after the observer exists and is ready
        to watch it. If JS fails before this point, content stays visible.
      */
      element.classList.add('home-reveal-ready');
      observer.observe(element);
    });
  }

  function formatNumber(value, decimals) {
    const rounded = decimals > 0
      ? value.toFixed(decimals)
      : Math.round(value).toString();

    const parts = rounded.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    return parts.join('.');
  }

  function setCounterFinalValue(element) {
    const target = parseFloat(element.dataset.target) || 0;
    const decimals = parseInt(element.dataset.decimals, 10) || 0;
    const prefix = element.dataset.prefix || '';
    const suffix = element.dataset.suffix || '';

    element.textContent =
      prefix + formatNumber(target, decimals) + suffix;
  }

  function animateCounter(element) {
    const target = parseFloat(element.dataset.target) || 0;
    const decimals = parseInt(element.dataset.decimals, 10) || 0;
    const prefix = element.dataset.prefix || '';
    const suffix = element.dataset.suffix || '';
    const duration = 1500;
    let startTime = null;

    function easeOutCubic(value) {
      return 1 - Math.pow(1 - value, 3);
    }

    function step(timestamp) {
      if (startTime === null) startTime = timestamp;

      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const value = target * easeOutCubic(progress);

      element.textContent =
        prefix + formatNumber(value, decimals) + suffix;

      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        setCounterFinalValue(element);
      }
    }

    window.requestAnimationFrame(step);
  }

  function initialiseCounters() {
    const proofSection = document.querySelector('.home-proof');
    const counters = Array.from(
      document.querySelectorAll('.home-proof .counter')
    );

    if (!proofSection || !counters.length) return;

    if (
      reducedMotionQuery.matches ||
      !('IntersectionObserver' in window)
    ) {
      counters.forEach(setCounterFinalValue);
      return;
    }

    const observer = new IntersectionObserver(
      (entries, counterObserver) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          counters.forEach(animateCounter);
          counterObserver.unobserve(entry.target);
        });
      },
      {
        threshold: 0.35
      }
    );

    observer.observe(proofSection);
  }

  function initialiseHomepage() {
    /*
      Content visibility must not depend on the icon library.
      Reveal/counter setup runs first; Lucide is enhancement only.
    */
    initialiseReveals();
    initialiseCounters();

    try {
      initialiseLucideIcons();
    } catch (error) {
      console.warn('Lucide icon initialisation skipped:', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      initialiseHomepage,
      { once: true }
    );
  } else {
    initialiseHomepage();
  }
})();
