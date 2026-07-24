document.addEventListener('DOMContentLoaded', () => {
  // ---- View switch (Board Members / Leadership Team) ----
  const switchBtns = document.querySelectorAll('.team-switch-btn');
  const views = {
    'board-view': document.getElementById('board-view'),
    'management-view': document.getElementById('management-view')
  };

  switchBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      Object.values(views).forEach(v => v.classList.add('hidden'));
      views[btn.dataset.target].classList.remove('hidden');
    });
  });

  // ---- Bio modal (shared across both views) ----
  const cards = document.querySelectorAll('.leadership-card');
  const modal = document.getElementById('leadership-modal');
  const modalName = document.getElementById('modal-name');
  const modalRole = document.getElementById('modal-role');
  const modalBio = document.getElementById('modal-bio');
  const closeBtn = document.querySelector('.bio-modal-close-btn');

  cards.forEach(card => {
    card.addEventListener('click', () => {
      const name = card.getAttribute('data-name');
      const role = card.getAttribute('data-role');
      const bio = card.getAttribute('data-bio');

      modalName.innerHTML = name;
      modalRole.innerHTML = role;
      modalBio.innerHTML = bio;

      modal.classList.add('active');
      document.body.style.overflow = 'hidden'; // Prevents background body window scrolling
    });
  });

  const closeModal = () => {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  };

  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) closeModal();
  });
});