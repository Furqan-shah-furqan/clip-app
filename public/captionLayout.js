import { createLayout, stagger } from './vendor/animejs/anime.esm.min.js';

const root = document.getElementById('controlsWorkspace');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const compact = matchMedia('(max-width: 520px)');
const layout = createLayout(root, { children: '.item' });
let timer;
let animation;
let stopped = false;
function animateLayout() {
  if (stopped) return;
  // Keep controls still while someone edits, and respect reduced motion.
  if (document.hidden || reducedMotion.matches || compact.matches ||
      root.matches(':hover, :focus-within') || !root.getClientRects().length) {
    timer = setTimeout(animateLayout, 1000);
    return;
  }
  animation = layout.update(({ root }) => {
    root.dataset.grid = String(Number(root.dataset.grid) % 4 + 1);
  }, { duration: 1000, delay: stagger(150), onComplete() {
    timer = setTimeout(animateLayout, 2000);
  } });
}
timer = setTimeout(animateLayout, 2000);
addEventListener('pagehide', () => { stopped = true; clearTimeout(timer); animation?.pause(); });
addEventListener('pageshow', () => { if (stopped) { stopped = false; animateLayout(); } });
