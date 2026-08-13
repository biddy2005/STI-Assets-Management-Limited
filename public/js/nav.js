document.addEventListener('DOMContentLoaded', () => {
  const toggle =
    document.getElementById('navToggle');

  const drawer =
    document.getElementById('mobileDrawer');

  const drawerClose =
    document.getElementById('drawerClose');

  const overlay =
    document.getElementById('navOverlay');

  if (
    !toggle ||
    !drawer ||
    !drawerClose ||
    !overlay
  ) {
    return;
  }


  // ============================================================
  // DRAWER HELPERS
  // ============================================================

  const getFocusableElements = () =>
    Array.from(
      drawer.querySelectorAll(
        [
          'a[href]',
          'button:not([disabled])',
          'input:not([disabled])',
          'select:not([disabled])',
          'textarea:not([disabled])',
          '[tabindex]:not([tabindex="-1"])'
        ].join(',')
      )
    ).filter(
      (element) =>
        element.offsetParent !== null
    );


  function openDrawer() {
    drawer.classList.add('open');
    overlay.classList.add('open');

    toggle.setAttribute(
      'aria-expanded',
      'true'
    );

    toggle.setAttribute(
      'aria-label',
      'Close navigation'
    );

    drawer.setAttribute(
      'aria-hidden',
      'false'
    );

    overlay.setAttribute(
      'aria-hidden',
      'false'
    );

    document.body.classList.add(
      'nav-open-lock'
    );

    /*
     * Move keyboard focus into the opened drawer.
     */
    window.requestAnimationFrame(() => {
      drawerClose.focus();
    });
  }


  function closeDrawer(
    returnFocus = true
  ) {
    const wasOpen =
      drawer.classList.contains('open');

    drawer.classList.remove('open');
    overlay.classList.remove('open');

    toggle.setAttribute(
      'aria-expanded',
      'false'
    );

    toggle.setAttribute(
      'aria-label',
      'Open navigation'
    );

    drawer.setAttribute(
      'aria-hidden',
      'true'
    );

    overlay.setAttribute(
      'aria-hidden',
      'true'
    );

    document.body.classList.remove(
      'nav-open-lock'
    );

    drawer
      .querySelectorAll(
        '.has-dropdown.open'
      )
      .forEach((item) => {
        item.classList.remove('open');

        const trigger =
          item.querySelector(':scope > a');

        if (trigger) {
          trigger.setAttribute(
            'aria-expanded',
            'false'
          );
        }
      });

    if (
      wasOpen &&
      returnFocus &&
      window.innerWidth < 1024
    ) {
      toggle.focus();
    }
  }


  // ============================================================
  // OPEN / CLOSE
  // ============================================================

  toggle.addEventListener(
    'click',
    () => {
      if (
        drawer.classList.contains('open')
      ) {
        closeDrawer();
      } else {
        openDrawer();
      }
    }
  );


  drawerClose.addEventListener(
    'click',
    () => {
      closeDrawer();
    }
  );


  overlay.addEventListener(
    'click',
    () => {
      closeDrawer();
    }
  );


  // ============================================================
  // KEYBOARD
  // ============================================================

  document.addEventListener(
    'keydown',
    (event) => {
      if (
        !drawer.classList.contains('open')
      ) {
        return;
      }


      /*
       * Escape closes the drawer and returns focus
       * to the hamburger button.
       */
      if (event.key === 'Escape') {
        event.preventDefault();

        closeDrawer();

        return;
      }


      /*
       * Keep keyboard focus inside the open drawer.
       */
      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements =
        getFocusableElements();

      if (!focusableElements.length) {
        return;
      }

      const firstElement =
        focusableElements[0];

      const lastElement =
        focusableElements[
          focusableElements.length - 1
        ];


      if (
        event.shiftKey &&
        document.activeElement ===
          firstElement
      ) {
        event.preventDefault();
        lastElement.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement ===
          lastElement
      ) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  );


  // ============================================================
  // MOBILE SUBMENU
  // ============================================================

  drawer
    .querySelectorAll(
      '.has-dropdown > a'
    )
    .forEach((link) => {
      link.addEventListener(
        'click',
        (event) => {
          event.preventDefault();

          const parent =
            link.parentElement;

          const isOpen =
            parent.classList.toggle(
              'open'
            );

          link.setAttribute(
            'aria-expanded',
            String(isOpen)
          );
        }
      );
    });


  // ============================================================
  // NORMAL NAVIGATION LINKS
  // ============================================================

drawer
  .querySelectorAll(
    '.mobile-drawer-nav > ul > li:not(.has-dropdown) > a, .dropdown a'
  )
  .forEach((link) => {
    link.addEventListener(
      'click',
      () => {
        closeDrawer(false);
      }
    );
  });


  // ============================================================
  // RESPONSIVE RESET
  // ============================================================

  window.addEventListener(
    'resize',
    () => {
      if (window.innerWidth >= 1024) {
        /*
         * Do not send focus to a hamburger
         * that is hidden on desktop.
         */
        closeDrawer(false);
      }
    }
  );


  // ============================================================
  // INITIAL ACCESSIBILITY STATE
  // ============================================================

  drawer.setAttribute(
    'aria-hidden',
    'true'
  );

  overlay.setAttribute(
    'aria-hidden',
    'true'
  );
});