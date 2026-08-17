document.addEventListener('DOMContentLoaded', () => {
  const slides = document.querySelectorAll('.slide');
  const prevButton = document.getElementById('prevSlide');
  const nextButton = document.getElementById('nextSlide');
  let currentIndex = 0;

  if (!slides.length) {
    return;
  }

  function showSlide(index) {
    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === index;
      slide.classList.toggle('active', active);
      slide.style.transform = active ? 'translateX(0)' : 'translateX(100%)';
      slide.style.opacity = active ? '1' : '0';
    });
  }

  function changeSlide(delta) {
    currentIndex = (currentIndex + delta + slides.length) % slides.length;
    showSlide(currentIndex);
  }

  if (prevButton) {
    prevButton.addEventListener('click', () => changeSlide(-1));
  }

  if (nextButton) {
    nextButton.addEventListener('click', () => changeSlide(1));
  }

  showSlide(currentIndex);
  setInterval(() => changeSlide(1), 5000);
});
