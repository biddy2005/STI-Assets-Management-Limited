(() => {
  'use strict';


  const feedback =
    document.querySelector(
      '[data-newsletter-feedback]'
    );


  if (!feedback) {
    return;
  }


  const closeButtons =
    feedback.querySelectorAll(
      '[data-newsletter-feedback-close]'
    );


  let isClosing =
    false;


  /*
   * Remove newsletter status query parameters
   * after the message has been displayed.
   *
   * This prevents the popup from showing again
   * simply because the visitor refreshes.
   */
  const cleanUrl = () => {
    const url =
      new URL(
        window.location.href
      );


    url.searchParams.delete(
      'subscribed'
    );

    url.searchParams.delete(
      'newsletterError'
    );


    const cleanAddress =
      url.pathname +
      (
        url.search
          ? url.search
          : ''
      ) +
      (
        url.hash
          ? url.hash
          : ''
      );


    window.history.replaceState(
      {},
      '',
      cleanAddress
    );
  };


  const closeFeedback = () => {

    if (isClosing) {
      return;
    }


    isClosing =
      true;


    feedback.classList.add(
      'is-closing'
    );


    window.setTimeout(
      () => {
        feedback.remove();
      },
      230
    );
  };


  /*
   * Close buttons.
   */
  closeButtons.forEach(
    (button) => {
      button.addEventListener(
        'click',
        closeFeedback
      );
    }
  );


  /*
   * Clicking the dark backdrop closes it,
   * but clicking the modal itself does not.
   */
  feedback.addEventListener(
    'click',
    (event) => {

      if (
        event.target === feedback
      ) {
        closeFeedback();
      }

    }
  );


  /*
   * Escape key support.
   */
  document.addEventListener(
    'keydown',
    (event) => {

      if (
        event.key === 'Escape'
      ) {
        closeFeedback();
      }

    }
  );


  /*
   * Remove ?subscribed=1 from the visible URL.
   */
  cleanUrl();


  /*
   * Move keyboard focus into the dialog.
   */
  const firstButton =
    feedback.querySelector(
      '[data-newsletter-feedback-close]'
    );


  if (firstButton) {
    window.setTimeout(
      () => {
        firstButton.focus();
      },
      150
    );
  }

})();