document.addEventListener('DOMContentLoaded', () => {
  const switchButtons = Array.from(
    document.querySelectorAll('.team-switch-btn')
  );

  const teamViews = {
    'board-view': document.getElementById('board-view'),
    'management-view':
      document.getElementById('management-view')
  };

  const leadershipCards = Array.from(
    document.querySelectorAll('.leadership-card')
  );

  const modal =
    document.getElementById('leadership-modal');

  const modalContent =
    modal?.querySelector('.bio-modal-content');

  const modalName =
    document.getElementById('modal-name');

  const modalRole =
    document.getElementById('modal-role');

  const modalBio =
    document.getElementById('modal-bio');

  const closeButton =
    modal?.querySelector('.bio-modal-close-btn');

  let lastFocusedElement = null;

  // ============================================================
  // TEAM VIEW SWITCH
  // ============================================================

  function activateTeamView(targetId) {
    switchButtons.forEach((button) => {
      const isActive =
        button.dataset.target === targetId;

      button.classList.toggle(
        'active',
        isActive
      );

      button.setAttribute(
        'aria-selected',
        String(isActive)
      );
    });

    Object.entries(teamViews).forEach(
      ([viewId, view]) => {
        if (!view) return;

        const isActive = viewId === targetId;

        view.classList.toggle(
          'hidden',
          !isActive
        );

        view.setAttribute(
          'aria-hidden',
          String(!isActive)
        );
      }
    );
  }

  switchButtons.forEach((button, index) => {
    button.setAttribute('role', 'tab');

    button.setAttribute(
      'aria-selected',
      String(button.classList.contains('active'))
    );

    button.addEventListener('click', () => {
      activateTeamView(button.dataset.target);
    });

    button.addEventListener(
      'keydown',
      (event) => {
        const previousKeys = [
          'ArrowLeft',
          'ArrowUp'
        ];

        const nextKeys = [
          'ArrowRight',
          'ArrowDown'
        ];

        let newIndex = index;

        if (previousKeys.includes(event.key)) {
          newIndex =
            (index - 1 + switchButtons.length) %
            switchButtons.length;
        } else if (
          nextKeys.includes(event.key)
        ) {
          newIndex =
            (index + 1) %
            switchButtons.length;
        } else {
          return;
        }

        event.preventDefault();

        const nextButton =
          switchButtons[newIndex];

        nextButton.focus();
        nextButton.click();
      }
    );
  });

  const switchContainer =
    document.querySelector('.team-switch-pill');

  if (switchContainer) {
    switchContainer.setAttribute(
      'role',
      'tablist'
    );
  }

  Object.values(teamViews).forEach((view) => {
    if (!view) return;

    view.setAttribute(
      'role',
      'tabpanel'
    );
  });

  activateTeamView('board-view');

  // ============================================================
  // BIOGRAPHY MODAL
  // ============================================================

  function openModal(card) {
    if (
      !modal ||
      !modalContent ||
      !modalName ||
      !modalRole ||
      !modalBio
    ) {
      return;
    }

    const name =
      card.getAttribute('data-name') ||
      'Leadership Profile';

    const role =
      card.getAttribute('data-role') ||
      '';

    const biography =
      card.getAttribute('data-bio') ||
      '';

    modalName.textContent = name;
    modalRole.textContent = role;
    modalBio.textContent = biography;

    lastFocusedElement =
      document.activeElement;

    modal.classList.add('active');

    modal.setAttribute(
      'aria-hidden',
      'false'
    );

    document.body.classList.add(
      'team-modal-open'
    );

    requestAnimationFrame(() => {
      closeButton?.focus();
    });
  }

  function closeModal() {
    if (!modal) return;

    modal.classList.remove('active');

    modal.setAttribute(
      'aria-hidden',
      'true'
    );

    document.body.classList.remove(
      'team-modal-open'
    );

    if (
      lastFocusedElement instanceof HTMLElement
    ) {
      lastFocusedElement.focus();
    }
  }

  leadershipCards.forEach((card) => {
    const memberName =
      card.getAttribute('data-name') ||
      'team member';

    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    card.setAttribute(
      'aria-haspopup',
      'dialog'
    );

    card.setAttribute(
      'aria-controls',
      'leadership-modal'
    );

    card.setAttribute(
      'aria-label',
      `View profile for ${memberName}`
    );

    card.addEventListener('click', () => {
      openModal(card);
    });

    card.addEventListener(
      'keydown',
      (event) => {
        const isEnter =
          event.key === 'Enter';

        const isSpace =
          event.key === ' ' ||
          event.key === 'Spacebar';

        if (!isEnter && !isSpace) return;

        event.preventDefault();
        openModal(card);
      }
    );
  });

  closeButton?.addEventListener(
    'click',
    closeModal
  );

  modal?.addEventListener(
    'click',
    (event) => {
      if (event.target === modal) {
        closeModal();
      }
    }
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (
        event.key === 'Escape' &&
        modal?.classList.contains('active')
      ) {
        closeModal();
        return;
      }

      /*
        Keep keyboard focus inside the modal
        while it is open.
      */
      if (
        event.key !== 'Tab' ||
        !modal?.classList.contains('active')
      ) {
        return;
      }

      const focusableElements = Array.from(
        modal.querySelectorAll(
          'button:not([disabled]), ' +
          'a[href], ' +
          'input:not([disabled]), ' +
          'select:not([disabled]), ' +
          'textarea:not([disabled]), ' +
          '[tabindex]:not([tabindex="-1"])'
        )
      );

      if (!focusableElements.length) {
        event.preventDefault();
        modalContent?.focus();
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
        document.activeElement === firstElement
      ) {
        event.preventDefault();
        lastElement.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === lastElement
      ) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  );
});