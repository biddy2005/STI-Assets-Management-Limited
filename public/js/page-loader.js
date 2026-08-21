(() => {
  'use strict';

  const loader =
    document.getElementById(
      'siteLoader'
    );

  if (!loader) {
    return;
  }


  /*
   * Hide the loader once the current page
   * and its important resources are ready.
   */
  const hideLoader = () => {
    loader.classList.add(
      'is-hidden'
    );

    loader.setAttribute(
      'aria-hidden',
      'true'
    );
  };


  /*
   * Show it immediately before navigating
   * to another internal page.
   */
  const showLoader = () => {
    loader.classList.remove(
      'is-hidden'
    );

    loader.setAttribute(
      'aria-hidden',
      'false'
    );
  };


  /*
   * ============================================================
   * INITIAL PAGE LOAD
   * ============================================================
   */

  if (
    document.readyState ===
    'complete'
  ) {
    requestAnimationFrame(
      hideLoader
    );
  } else {
    window.addEventListener(
      'load',
      () => {
        requestAnimationFrame(
          hideLoader
        );
      },
      {
        once: true
      }
    );
  }


  /*
   * Safety fallback.
   *
   * A third-party resource should never be
   * allowed to leave the entire site hidden
   * behind the loader indefinitely.
   */
  window.setTimeout(
    hideLoader,
    2500
  );


  /*
   * ============================================================
   * BACK/FORWARD CACHE
   * ============================================================
   *
   * Browsers can restore an old page without
   * fully reloading it. Make sure the loader
   * is hidden when that happens.
   */
  window.addEventListener(
    'pageshow',
    () => {
      hideLoader();
    }
  );


  /*
   * ============================================================
   * INTERNAL PAGE NAVIGATION
   * ============================================================
   */

  document.addEventListener(
    'click',
    (event) => {

      /*
       * Ignore clicks already handled by
       * another script.
       */
      if (
        event.defaultPrevented
      ) {
        return;
      }


      /*
       * Only normal left-click navigation.
       */
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }


      const link =
        event.target.closest(
          'a[href]'
        );


      if (!link) {
        return;
      }


      /*
       * Do not interfere with new tabs or
       * downloadable files.
       */
      if (
        link.target === '_blank' ||
        link.hasAttribute(
          'download'
        )
      ) {
        return;
      }


      const href =
        link.getAttribute(
          'href'
        );


      if (!href) {
        return;
      }


      /*
       * Ignore anchors and special protocols.
       */
      if (
        href.startsWith('#') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        href.startsWith('javascript:')
      ) {
        return;
      }


      let destination;

      try {
        destination =
          new URL(
            link.href,
            window.location.href
          );
      } catch {
        return;
      }


      /*
       * Do not apply our page transition to
       * external websites.
       */
      if (
        destination.origin !==
        window.location.origin
      ) {
        return;
      }


      /*
       * Same-page anchor navigation should
       * remain immediate.
       */
      const samePage =
        destination.pathname ===
          window.location.pathname &&
        destination.search ===
          window.location.search;


      if (
        samePage &&
        destination.hash
      ) {
        return;
      }


      /*
       * Take control of the navigation for
       * one browser frame so the loader can
       * actually be painted before leaving.
       */
      event.preventDefault();

      showLoader();


      requestAnimationFrame(
        () => {
          requestAnimationFrame(
            () => {
              window.location.assign(
                destination.href
              );
            }
          );
        }
      );
    }
  );

})();