import { SideViewGame } from './sideview/SideViewGame';

// Mount Side-View Action RPG into DOM
window.addEventListener('DOMContentLoaded', () => {
  const mountPoint = document.getElementById('rpg') || document.body;
  new SideViewGame(mountPoint);
});