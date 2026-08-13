document.addEventListener('DOMContentLoaded', function () {
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
});

document.addEventListener('DOMContentLoaded', function () {
  var carousel = document.querySelector('[data-home-insights-carousel]');
  if (!carousel) return;

  var track = carousel.querySelector('[data-home-insights-track]');
  var slides = Array.prototype.slice.call(carousel.querySelectorAll('[data-home-insights-slide]'));
  var prevBtn = carousel.querySelector('[data-home-insights-prev]');
  var nextBtn = carousel.querySelector('[data-home-insights-next]');
  var dotsWrap = carousel.querySelector('[data-home-insights-dots]');
  var dots = dotsWrap ? Array.prototype.slice.call(dotsWrap.querySelectorAll('[data-home-insights-dot]')) : [];

  var count = slides.length;
  if (count === 0 || !track) return;

  var current = 0;
  var timer = null;
  var AUTOPLAY_MS = 6000;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reducedMotion) {
    track.style.transition = 'none';
  }

  function goTo(index, silent) {
    current = (index + count) % count;
    track.style.transform = 'translateX(-' + (current * 100) + '%)';

    slides.forEach(function (slide, i) {
      var isActive = i === current;
      slide.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      var link = slide.querySelector('.home-insights-link');
      if (link) link.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    dots.forEach(function (dot, i) {
      dot.classList.toggle('is-active', i === current);
    });

    if (!silent) restartAutoplay();
  }

  function next() { goTo(current + 1); }
  function prev() { goTo(current - 1); }

  function startAutoplay() {
    if (count <= 1 || reducedMotion) return;
    stopAutoplay();
    timer = setInterval(function () { goTo(current + 1, true); }, AUTOPLAY_MS);
  }
  function stopAutoplay() {
    if (timer) { clearInterval(timer); timer = null; }
  }
  function restartAutoplay() {
    stopAutoplay();
    startAutoplay();
  }

  if (count > 1) {
    if (nextBtn) nextBtn.addEventListener('click', next);
    if (prevBtn) prevBtn.addEventListener('click', prev);

    dots.forEach(function (dot) {
      dot.addEventListener('click', function () {
        goTo(parseInt(dot.getAttribute('data-index'), 10));
      });
    });

    carousel.addEventListener('mouseenter', stopAutoplay);
    carousel.addEventListener('mouseleave', startAutoplay);
    carousel.addEventListener('focusin', stopAutoplay);
    carousel.addEventListener('focusout', function (e) {
      if (!carousel.contains(e.relatedTarget)) startAutoplay();
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') stopAutoplay();
      else startAutoplay();
    });

    var touchStartX = 0;
    var SWIPE_THRESHOLD = 45;
    track.addEventListener('touchstart', function (e) {
      touchStartX = e.changedTouches[0].screenX;
      stopAutoplay();
    }, { passive: true });
    track.addEventListener('touchend', function (e) {
      var diff = touchStartX - e.changedTouches[0].screenX;
      if (Math.abs(diff) > SWIPE_THRESHOLD) {
        diff > 0 ? next() : prev();
      } else {
        startAutoplay();
      }
    }, { passive: true });
  }

  goTo(0, true);
  startAutoplay();
});

document.addEventListener('DOMContentLoaded', function () {
  var statsCard = document.querySelector('.hero-v2-stats');
  if (!statsCard) return;

  var counters = Array.prototype.slice.call(statsCard.querySelectorAll('.counter'));
  if (counters.length === 0) return;

  var DURATION = 2000; // ms

  // Ease-out cubic: fast start, gentle slow-down toward the target
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function formatNumber(value, decimals) {
    var rounded = decimals > 0 ? value.toFixed(decimals) : Math.round(value).toString();

    // Insert thousands separators on the integer part only
    var parts = rounded.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  function animateCounter(el) {
    var target = parseFloat(el.getAttribute('data-target')) || 0;
    var decimals = parseInt(el.getAttribute('data-decimals'), 10) || 0;
    var prefix = el.getAttribute('data-prefix') || '';
    var suffix = el.getAttribute('data-suffix') || '';

    var startTime = null;

    function step(timestamp) {
      if (startTime === null) startTime = timestamp;
      var elapsed = timestamp - startTime;
      var progress = Math.min(elapsed / DURATION, 1);
      var eased = easeOutCubic(progress);
      var current = target * eased;

      el.textContent = prefix + formatNumber(current, decimals) + suffix;

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        // Snap to the exact target value to avoid rounding drift at the end
        el.textContent = prefix + formatNumber(target, decimals) + suffix;
      }
    }

    requestAnimationFrame(step);
  }

  // Respect reduced-motion preference: show final values immediately
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) {
    counters.forEach(function (el) {
      var target = parseFloat(el.getAttribute('data-target')) || 0;
      var decimals = parseInt(el.getAttribute('data-decimals'), 10) || 0;
      var prefix = el.getAttribute('data-prefix') || '';
      var suffix = el.getAttribute('data-suffix') || '';
      el.textContent = prefix + formatNumber(target, decimals) + suffix;
    });
    return;
  }

var observer = new IntersectionObserver(function (entries, obs) {
  entries.forEach(function (entry) {
    if (entry.isIntersecting) {
      counters.forEach(animateCounter); // animate all 4 stats together
      obs.unobserve(entry.target);
    }
  });
}, { threshold: 0.4 });

  observer.observe(statsCard);
});


function initialiseLucideIcons() {
  if (
    !window.lucide ||
    typeof window.lucide.createIcons !==
      'function'
  ) {
    console.warn(
      'Lucide icon library is unavailable.'
    );

    return;
  }

  window.lucide.createIcons();
}

if (
  document.readyState ===
  'loading'
) {
  document.addEventListener(
    'DOMContentLoaded',
    initialiseLucideIcons,
    {
      once: true
    }
  );
} else {
  initialiseLucideIcons();
}