import { SideViewGame } from './sideview/SideViewGame';

function initGame() {
  const mountPoint = document.getElementById('rpg') || document.body;
  if (!mountPoint) return;
  new SideViewGame(mountPoint);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initGame);
} else {
  initGame();
}