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