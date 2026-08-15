import { SideViewGame } from './sideview/SideViewGame';

function initGame() {
  const mountPoint = document.getElementById('rpg') || document.body;
  if (!mountPoint) return;
  
  // Yield to main thread to allow browser to paint initial HTML (reduces LCP render delay)
  requestAnimationFrame(() => {
    setTimeout(() => {
      new SideViewGame(mountPoint);
    }, 0);
  });
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initGame);
} else {
  initGame();
}