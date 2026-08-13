(() => {
  const tabs = Array.from(
    document.querySelectorAll('.faqs-tab')
  );

  const panels = Array.from(
    document.querySelectorAll('.faqs-panel')
  );

  const questions = Array.from(
    document.querySelectorAll('.faq-question')
  );


  // ============================================================
  // HELPERS
  // ============================================================

  function closeFaq(item) {
    const question =
      item.querySelector('.faq-question');

    const answer =
      item.querySelector('.faq-answer');

    item.classList.remove('open');

    question.setAttribute(
      'aria-expanded',
      'false'
    );

    answer.setAttribute(
      'aria-hidden',
      'true'
    );

    answer.style.maxHeight = null;
  }


  function openFaq(item) {
    const question =
      item.querySelector('.faq-question');

    const answer =
      item.querySelector('.faq-answer');

    item.classList.add('open');

    question.setAttribute(
      'aria-expanded',
      'true'
    );

    answer.setAttribute(
      'aria-hidden',
      'false'
    );

    answer.style.maxHeight =
      `${answer.scrollHeight}px`;
  }


  // ============================================================
  // INITIALISE FAQ TABS
  // ============================================================

  tabs.forEach((tab, index) => {
    const target =
      tab.getAttribute('data-tab');

    const panel =
      panels.find(
        (item) =>
          item.getAttribute(
            'data-panel'
          ) === target
      );

    if (!panel) return;

    const tabId =
      `faq-tab-${target}`;

    const panelId =
      `faq-panel-${target}`;

    tab.id = tabId;

    tab.setAttribute(
      'aria-controls',
      panelId
    );

    tab.setAttribute(
      'tabindex',
      tab.classList.contains('active')
        ? '0'
        : '-1'
    );

    panel.id = panelId;

    panel.setAttribute(
      'role',
      'tabpanel'
    );

    panel.setAttribute(
      'aria-labelledby',
      tabId
    );

    panel.hidden =
      !panel.classList.contains('active');

    tab.addEventListener(
      'click',
      () => {
        activateTab(index);
      }
    );

    tab.addEventListener(
      'keydown',
      (event) => {
        handleTabKeyboard(
          event,
          index
        );
      }
    );
  });


  // ============================================================
  // ACTIVATE CATEGORY
  // ============================================================

  function activateTab(index) {
    const selectedTab =
      tabs[index];

    if (!selectedTab) return;

    const target =
      selectedTab.getAttribute(
        'data-tab'
      );

    tabs.forEach((tab) => {
      const isActive =
        tab === selectedTab;

      tab.classList.toggle(
        'active',
        isActive
      );

      tab.setAttribute(
        'aria-selected',
        String(isActive)
      );

      tab.setAttribute(
        'tabindex',
        isActive ? '0' : '-1'
      );
    });

    panels.forEach((panel) => {
      const isActive =
        panel.getAttribute(
          'data-panel'
        ) === target;

      panel.classList.toggle(
        'active',
        isActive
      );

      panel.hidden = !isActive;
    });
  }


  // ============================================================
  // KEYBOARD CATEGORY NAVIGATION
  // ============================================================

  function handleTabKeyboard(
    event,
    currentIndex
  ) {
    let nextIndex = null;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex =
          (currentIndex + 1) %
          tabs.length;
        break;

      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex =
          (
            currentIndex -
            1 +
            tabs.length
          ) % tabs.length;
        break;

      case 'Home':
        nextIndex = 0;
        break;

      case 'End':
        nextIndex =
          tabs.length - 1;
        break;

      default:
        return;
    }

    event.preventDefault();

    activateTab(nextIndex);

    tabs[nextIndex].focus();
  }


  // ============================================================
  // INITIALISE FAQ QUESTIONS
  // ============================================================

  questions.forEach(
    (question, index) => {
      const item =
        question.closest('.faq-item');

      const answer =
        item?.querySelector(
          '.faq-answer'
        );

      if (!item || !answer) return;

      const questionId =
        `faq-question-${index + 1}`;

      const answerId =
        `faq-answer-${index + 1}`;

      question.id = questionId;

      question.setAttribute(
        'aria-controls',
        answerId
      );

      question.setAttribute(
        'aria-expanded',
        'false'
      );

      answer.id = answerId;

      answer.setAttribute(
        'role',
        'region'
      );

      answer.setAttribute(
        'aria-labelledby',
        questionId
      );

      answer.setAttribute(
        'aria-hidden',
        'true'
      );

      question.addEventListener(
        'click',
        () => {
          const isOpen =
            item.classList.contains(
              'open'
            );

          const parentPanel =
            item.closest(
              '.faqs-panel'
            );

          if (parentPanel) {
            parentPanel
              .querySelectorAll(
                '.faq-item.open'
              )
              .forEach(
                (openItem) => {
                  if (
                    openItem !== item
                  ) {
                    closeFaq(
                      openItem
                    );
                  }
                }
              );
          }

          if (isOpen) {
            closeFaq(item);
          } else {
            openFaq(item);
          }
        }
      );
    }
  );


  // ============================================================
  // KEEP OPEN ANSWER HEIGHT CORRECT
  // ============================================================

  window.addEventListener(
    'resize',
    () => {
      document
        .querySelectorAll(
          '.faq-item.open'
        )
        .forEach((item) => {
          const answer =
            item.querySelector(
              '.faq-answer'
            );

          if (!answer) return;

          answer.style.maxHeight =
            `${answer.scrollHeight}px`;
        });
    },
    { passive: true }
  );
})();