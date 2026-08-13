(() => {
  if (
    !window.lucide
  ) {
    console.error(
      'Lucide failed to load.'
    );

    return;
  }

  window.lucide.createIcons();
})();