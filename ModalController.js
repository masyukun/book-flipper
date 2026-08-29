import gsap from 'gsap';

export class ModalController {
  constructor(overlayId = 'shelf-modal-overlay') {
    this.overlay = document.getElementById(overlayId);
    this.loadingView = document.getElementById('modal-loading-view');
    this.errorView = document.getElementById('modal-error-view');
    this.errorMessage = document.getElementById('modal-error-message');
    this.retryBtn = document.getElementById('modal-retry-btn');

    this.timeline = null;
    this.initTimeline();
  }

  initTimeline() {
    const books = [0, 1, 2, 3, 4, 5].map(i => document.getElementById(`dbook-${i}`));
    const pedestalY = 130; // Pixel landing floor
    const bookThickness = 14;

    this.timeline = gsap.timeline({ repeat: -1, repeatDelay: 0.2 });

    // 1. Initial State
    this.timeline.set(books, {
      y: -80,
      opacity: 0,
      rotation: 0,
      x: 0
    });

    // 2. Sequential drops with landing squashes
    books.forEach((book, i) => {
      const targetY = pedestalY - (i + 1) * bookThickness;
      const dropRot = (i % 2 === 0 ? 1 : -1) * (1.5 + Math.random() * 2);

      this.timeline.to(book, {
        y: targetY,
        opacity: 1,
        rotation: dropRot,
        duration: 0.35,
        ease: 'power2.in'
      }, i * 0.18);

      // Bounce & settle
      this.timeline.to(book, {
        y: targetY - 3,
        duration: 0.08,
        ease: 'power1.out'
      }, `>`);
      this.timeline.to(book, {
        y: targetY,
        duration: 0.08,
        ease: 'power1.in'
      }, `>`);
    });

    // Small pause to admire the stack
    this.timeline.to({}, { duration: 0.4 });

    // 3. Books slide off randomly to the left and right
    books.slice().reverse().forEach((book, i) => {
      const slideDir = Math.random() > 0.5 ? 1 : -1;
      const slideX = slideDir * (120 + Math.random() * 60);
      const slideRot = slideDir * (25 + Math.random() * 35);

      this.timeline.to(book, {
        x: slideX,
        y: `+=${15 + Math.random() * 25}`,
        rotation: slideRot,
        opacity: 0,
        duration: 0.45,
        ease: 'power2.in'
      }, `<+0.07`);
    });
  }

  showLoading() {
    this.errorView.style.display = 'none';
    this.loadingView.style.display = 'flex';
    this.overlay.classList.remove('hidden');
    if (this.timeline) this.timeline.play(0);
  }

  hide() {
    this.overlay.classList.add('hidden');
    if (this.timeline) this.timeline.pause();
  }

  showError(errorText, onRetry) {
    if (this.timeline) this.timeline.pause();
    this.loadingView.style.display = 'none';
    this.errorView.style.display = 'flex';
    this.errorMessage.textContent = errorText || 'Unknown error occurred.';

    if (onRetry) {
      this.retryBtn.onclick = () => {
        this.showLoading();
        onRetry();
      };
    }

    this.overlay.classList.remove('hidden');
  }
}