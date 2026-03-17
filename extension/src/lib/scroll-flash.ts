/**
 * Polls for an element to appear in the DOM and be within the visible area
 * of its scroll container, then triggers a flash animation.
 * Handles virtualized lists where elements don't exist until scrolled into range.
 */
export function flashWhenStable(
  tabId: string,
  scrollContainer: HTMLElement | null,
  timeout = 3000,
): void {
  const deadline = Date.now() + timeout;
  let lastTop = -1;
  let stableFrames = 0;

  const check = () => {
    if (Date.now() > deadline) return;

    const el = document.querySelector(`[data-tab-id="${tabId}"]`);
    if (!el) {
      requestAnimationFrame(check);
      return;
    }

    const rect = el.getBoundingClientRect();
    const containerRect = scrollContainer
      ? scrollContainer.getBoundingClientRect()
      : { top: 0, bottom: window.innerHeight };

    const inView = rect.top >= containerRect.top - 20 && rect.bottom <= containerRect.bottom + 20;

    if (inView) {
      // Wait for position to stabilize (smooth scroll finished)
      if (Math.abs(rect.top - lastTop) < 2) {
        stableFrames++;
      } else {
        stableFrames = 0;
      }
      lastTop = rect.top;

      if (stableFrames >= 3) {
        el.classList.add('animate-flash-highlight');
        setTimeout(() => el.classList.remove('animate-flash-highlight'), 1500);
        return;
      }
    }

    requestAnimationFrame(check);
  };

  requestAnimationFrame(check);
}
