(() => {
  const gallery =
    document.querySelector(
      '[data-news-gallery]'
    );

  const lightbox =
    document.querySelector(
      '[data-news-lightbox]'
    );

  if (!gallery || !lightbox) {
    return;
  }


  const items =
    Array.from(
      gallery.querySelectorAll(
        '[data-gallery-item]'
      )
    );


  const image =
    lightbox.querySelector(
      '[data-lightbox-image]'
    );

  const caption =
    lightbox.querySelector(
      '[data-lightbox-caption]'
    );

  const counter =
    lightbox.querySelector(
      '[data-lightbox-counter]'
    );

  const previousButton =
    lightbox.querySelector(
      '[data-lightbox-prev]'
    );

  const nextButton =
    lightbox.querySelector(
      '[data-lightbox-next]'
    );

  const closeButtons =
    Array.from(
      lightbox.querySelectorAll(
        '[data-lightbox-close]'
      )
    );


  if (
    !items.length ||
    !image ||
    !caption ||
    !counter ||
    !previousButton ||
    !nextButton
  ) {
    return;
  }


  let currentIndex = 0;

  let previousFocus = null;


  function updateLightbox(index) {
    /*
     * Wrap around at either end
     * of the gallery.
     */
    currentIndex =
      (
        index +
        items.length
      ) %
      items.length;


    const currentItem =
      items[currentIndex];


    const source =
      currentItem.dataset.gallerySrc;

    const imageCaption =
      currentItem.dataset.galleryCaption ||
      'Gallery image';


    image.src =
      source;

    image.alt =
      imageCaption;


    caption.textContent =
      imageCaption;


    counter.textContent =
      `${currentIndex + 1} / ${items.length}`;


    /*
     * Previous and next controls are
     * unnecessary with one image.
     */
    const showNavigation =
      items.length > 1;

    previousButton.hidden =
      !showNavigation;

    nextButton.hidden =
      !showNavigation;
  }


  function openLightbox(index) {
    previousFocus =
      document.activeElement;


    updateLightbox(index);


    lightbox.hidden =
      false;


    document.body.classList.add(
      'news-lightbox-open'
    );


    const closeButton =
      lightbox.querySelector(
        '.news-lightbox-close'
      );

    closeButton?.focus();
  }


  function closeLightbox() {
    if (lightbox.hidden) {
      return;
    }


    lightbox.hidden =
      true;


    document.body.classList.remove(
      'news-lightbox-open'
    );


    /*
     * Remove the enlarged image
     * when the viewer closes.
     */
    image.src =
      '';


    if (
      previousFocus &&
      typeof previousFocus.focus ===
        'function'
    ) {
      previousFocus.focus();
    }
  }


  function previousImage() {
    updateLightbox(
      currentIndex - 1
    );
  }


  function nextImage() {
    updateLightbox(
      currentIndex + 1
    );
  }


  items.forEach(
    (item, index) => {

      item.addEventListener(
        'click',
        () => {
          openLightbox(index);
        }
      );

    }
  );


  previousButton.addEventListener(
    'click',
    previousImage
  );


  nextButton.addEventListener(
    'click',
    nextImage
  );


  closeButtons.forEach(
    (button) => {

      button.addEventListener(
        'click',
        closeLightbox
      );

    }
  );


  /*
   * Touch navigation.
   *
   * Arrow buttons are small targets on a phone, and swiping is
   * what people try first in an image viewer. Tracked manually
   * rather than with a library: two coordinates and a
   * threshold is the whole requirement.
   */
  let touchStartX = 0;
  let touchStartY = 0;
  let touchTracking = false;

  /*
   * A swipe must travel this far horizontally to count, and
   * stay within this much vertical drift. Without the vertical
   * check, an ordinary scroll gesture would flip the image.
   */
  const SWIPE_THRESHOLD = 55;
  const SWIPE_MAX_DRIFT = 70;

  lightbox.addEventListener(
    'touchstart',
    (event) => {
      if (
        lightbox.hidden ||
        event.touches.length !== 1
      ) {
        touchTracking = false;
        return;
      }

      touchStartX = event.touches[0].clientX;
      touchStartY = event.touches[0].clientY;
      touchTracking = true;
    },
    { passive: true }
  );

  lightbox.addEventListener(
    'touchend',
    (event) => {
      if (
        !touchTracking ||
        lightbox.hidden ||
        !event.changedTouches.length
      ) {
        return;
      }

      touchTracking = false;

      const deltaX =
        event.changedTouches[0].clientX - touchStartX;

      const deltaY =
        event.changedTouches[0].clientY - touchStartY;

      /*
       * A mostly-vertical gesture is a scroll attempt, not a
       * swipe, so it is ignored.
       */
      if (Math.abs(deltaY) > SWIPE_MAX_DRIFT) {
        return;
      }

      if (deltaX <= -SWIPE_THRESHOLD) {
        nextImage();
        return;
      }

      if (deltaX >= SWIPE_THRESHOLD) {
        previousImage();
      }
    },
    { passive: true }
  );

  lightbox.addEventListener(
    'touchcancel',
    () => {
      touchTracking = false;
    },
    { passive: true }
  );


  document.addEventListener(
    'keydown',
    (event) => {

      if (lightbox.hidden) {
        return;
      }


      if (event.key === 'Escape') {
        closeLightbox();
        return;
      }


      if (event.key === 'ArrowLeft') {
        previousImage();
        return;
      }


      if (event.key === 'ArrowRight') {
        nextImage();
      }

    }
  );
})();