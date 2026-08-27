(() => {
  'use strict';


  /*
   * Avoid flashing the loader during very fast navigation.
   *
   * If the new page begins loading quickly enough, the browser
   * leaves this document before the loader is ever displayed.
   */
  const NAVIGATION_LOADER_DELAY_MS =
    150;


  /*
   * Defensive fallback.
   *
   * The loader should never be capable of leaving the website
   * inaccessible indefinitely.
   */
  const LOADER_FAILSAFE_MS =
    2500;


  const initialisePageLoader =
    () => {
      const loader =
        document.getElementById(
          'siteLoader'
        );


      if (!loader) {
        return;
      }


      let navigationLoaderTimer =
        null;


      let failsafeTimer =
        null;


      /*
       * Cancel a pending delayed navigation loader.
       */
      const cancelNavigationLoaderTimer =
        () => {
          if (
            navigationLoaderTimer ===
            null
          ) {
            return;
          }


          window.clearTimeout(
            navigationLoaderTimer
          );


          navigationLoaderTimer =
            null;
        };


      /*
       * Hide the loader and restore interaction with the page.
       */
      const hideLoader =
        () => {
          cancelNavigationLoaderTimer();


          loader.classList.add(
            'is-hidden'
          );


          loader.setAttribute(
            'aria-hidden',
            'true'
          );


          if (
            failsafeTimer !==
            null
          ) {
            window.clearTimeout(
              failsafeTimer
            );


            failsafeTimer =
              null;
          }
        };


      /*
       * Display the loader.
       */
      const showLoader =
        () => {
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
       *
       * The DOM is now ready for interaction.
       *
       * Do not wait for window.load because that would keep the
       * entire website covered while non-critical images and other
       * resources are still downloading.
       */
      const hideInitialLoader =
        () => {
          requestAnimationFrame(
            hideLoader
          );
        };


      if (
        document.readyState ===
        'loading'
      ) {
        document.addEventListener(
          'DOMContentLoaded',
          hideInitialLoader,
          {
            once: true
          }
        );
      } else {
        hideInitialLoader();
      }


      /*
       * Additional defensive failsafe.
       */
      failsafeTimer =
        window.setTimeout(
          hideLoader,
          LOADER_FAILSAFE_MS
        );


      /*
       * ============================================================
       * BACK/FORWARD CACHE
       * ============================================================
       *
       * Browsers may restore an old document directly from the
       * back/forward cache without performing a complete reload.
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
           * Ignore clicks that another script already handled.
           */
          if (
            event.defaultPrevented
          ) {
            return;
          }


          /*
           * Only intercept an ordinary left click.
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
           * New tabs and downloads retain normal browser behaviour.
           */
          if (
            link.target ===
              '_blank' ||
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
           * Anchors and non-navigation protocols should remain
           * immediate.
           */
          if (
            href.startsWith('#') ||
            href.startsWith(
              'mailto:'
            ) ||
            href.startsWith(
              'tel:'
            ) ||
            href.startsWith(
              'javascript:'
            )
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
           * External websites should not use the STI page loader.
           */
          if (
            destination.origin !==
            window.location.origin
          ) {
            return;
          }


          /*
           * Same-page anchor navigation should remain immediate.
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


          event.preventDefault();


          /*
           * Do not display the loader immediately.
           *
           * A 150ms delay prevents a distracting flash when the
           * next page begins loading very quickly.
           */
          cancelNavigationLoaderTimer();


          navigationLoaderTimer =
            window.setTimeout(
              () => {
                navigationLoaderTimer =
                  null;


                showLoader();
              },
              NAVIGATION_LOADER_DELAY_MS
            );


          /*
           * Start navigation immediately.
           *
           * We deliberately do not wait 150ms before navigating.
           * The delay applies only to the visual loader, not to
           * navigation itself.
           */
          window.location.assign(
            destination.href
          );
        }
      );


      /*
       * ============================================================
       * PROGRESSIVE ENHANCEMENT READY STATE
       * ============================================================
       *
       * The loader remains hidden in both HTML and CSS until every
       * path that can hide or reset it has been established.
       *
       * Keep this as the final initialisation step so an earlier
       * exception leaves the server-rendered page fully usable.
       */
      try {
        document.documentElement.classList.add(
          'page-loader-ready'
        );


        showLoader();
      } catch {
        document.documentElement.classList.remove(
          'page-loader-ready'
        );


        hideLoader();
      }
    };


  /*
   * The script is placed immediately after #siteLoader so the
   * element exists before synchronous initialisation begins.
   */
  initialisePageLoader();

})();
