  (function () {
    var tabs = document.querySelectorAll('.faqs-tab');
    var panels = document.querySelectorAll('.faqs-panel');

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var target = tab.getAttribute('data-tab');

        tabs.forEach(function (t) {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');

        panels.forEach(function (panel) {
          if (panel.getAttribute('data-panel') === target) {
            panel.classList.add('active');
          } else {
            panel.classList.remove('active');
          }
        });
      });
    });

    var questions = document.querySelectorAll('.faq-question');

    questions.forEach(function (question) {
      question.addEventListener('click', function () {
        var item = question.closest('.faq-item');
        var answer = item.querySelector('.faq-answer');
        var isOpen = item.classList.contains('open');

        item.parentElement.querySelectorAll('.faq-item.open').forEach(function (openItem) {
          if (openItem !== item) {
            openItem.classList.remove('open');
            openItem.querySelector('.faq-answer').style.maxHeight = null;
          }
        });

        if (isOpen) {
          item.classList.remove('open');
          answer.style.maxHeight = null;
        } else {
          item.classList.add('open');
          answer.style.maxHeight = answer.scrollHeight + 'px';
        }
      });
    });
  })();