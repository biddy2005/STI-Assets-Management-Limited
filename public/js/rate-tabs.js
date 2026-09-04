(() => {
  'use strict';

  /*
    Rate table tabs.

    Progressive enhancement: without JavaScript every table
    renders stacked and readable. This only collapses them into
    a tabbed view once the script confirms it can manage the
    interaction, so a failure leaves the rates visible rather
    than hiding two thirds of them behind dead buttons.
  */

  const root =
    document.querySelector('[data-rate-tabs]');

  if (!root) return;

  const tabs =
    Array.from(
      root.querySelectorAll('[data-rate-tab]')
    );

  const panels =
    Array.from(
      root.querySelectorAll('[data-rate-panel]')
    );

  if (tabs.length < 2 || !panels.length) return;

  /*
    Only now are the panels allowed to hide. The class gates
    the display rule in CSS.
  */
  root.classList.add('rate-tabs-ready');

  function activate(key, setFocus) {
    tabs.forEach((tab) => {
      const isActive =
        tab.dataset.rateTab === key;

      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', String(isActive));

      /*
        Only the selected tab stays in the tab order. Arrow
        keys move between them, which is the expected pattern
        for a tablist.
      */
      tab.setAttribute('tabindex', isActive ? '0' : '-1');

      if (isActive && setFocus) {
        tab.focus();
      }
    });

    panels.forEach((panel) => {
      const isActive =
        panel.dataset.ratePanel === key;

      panel.hidden = !isActive;
    });
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      activate(tab.dataset.rateTab, false);
    });

    tab.addEventListener('keydown', (event) => {
      const previous = ['ArrowLeft', 'ArrowUp'];
      const next = ['ArrowRight', 'ArrowDown'];

      let target = index;

      if (previous.includes(event.key)) {
        target = (index - 1 + tabs.length) % tabs.length;
      } else if (next.includes(event.key)) {
        target = (index + 1) % tabs.length;
      } else if (event.key === 'Home') {
        target = 0;
      } else if (event.key === 'End') {
        target = tabs.length - 1;
      } else {
        return;
      }

      event.preventDefault();
      activate(tabs[target].dataset.rateTab, true);
    });
  });

  activate(tabs[0].dataset.rateTab, false);
})();
