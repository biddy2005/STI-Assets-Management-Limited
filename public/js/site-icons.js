  /*
    Marks the document as motion-capable. Reveal styles are
    scoped to this class so a JS failure leaves content
    visible rather than permanently at opacity zero.
  */
  document.documentElement.classList.add('js-motion');
(() => {
  'use strict';

  /*
    Renders every [data-lucide] element on the page.

    Loaded site-wide from the footer so inner pages can use
    icons without each one wiring up its own initialiser.
    Icons are an enhancement: if Lucide fails, the page is
    unaffected because every icon sits beside a text label.
  */

  function renderIcons() {
    if (!window.lucide || typeof window.lucide.createIcons !== 'function') {
      return;
    }

    try {
      window.lucide.createIcons({
        attrs: {
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': 1.75,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round'
        }
      });
    } catch (error) {
      console.warn('Lucide icon initialisation skipped:', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderIcons, { once: true });
  } else {
    renderIcons();
  }
})();