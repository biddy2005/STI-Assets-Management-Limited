document.addEventListener('submit', (event) => {
  const form = event.target.closest(
    'form[data-confirm]'
  );

  if (!form) {
    return;
  }

  const message =
    form.dataset.confirm ||
    'Are you sure you want to continue?';

  if (!window.confirm(message)) {
    event.preventDefault();
  }
});

document.addEventListener('change', (event) => {
  const select = event.target.closest(
    'select[data-auto-submit]'
  );

  if (!select || !select.form) {
    return;
  }

  select.form.submit();
});