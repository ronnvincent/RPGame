import { SideViewGame } from './sideview/SideViewGame';

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function showGuestLogin(mountPoint: HTMLElement) {
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.zIndex = '99999';
  overlay.style.fontFamily = "'Cinzel', 'Outfit', sans-serif";

  const box = document.createElement('div');
  box.style.background = "url('/assets/kenney-rpg-ui/panel_brown.png') repeat";
  box.style.backgroundSize = "100% 100%";
  box.style.padding = '40px';
  box.style.border = '4px solid #4a2c11';
  box.style.borderRadius = '8px';
  box.style.textAlign = 'center';
  box.style.color = '#fef08a';
  box.style.width = '300px';

  const title = document.createElement('h2');
  title.innerText = 'GUEST LOGIN';
  title.style.margin = '0 0 20px 0';
  title.style.textShadow = '2px 2px 4px #000';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Enter your name...';
  input.style.width = '100%';
  input.style.padding = '10px';
  input.style.marginBottom = '20px';
  input.style.fontSize = '16px';
  input.style.border = '2px solid #2e1a0b';
  input.style.borderRadius = '4px';
  input.style.background = '#000';
  input.style.color = '#fff';
  input.style.outline = 'none';
  input.maxLength = 16;

  const btn = document.createElement('button');
  btn.innerText = 'PLAY';
  btn.style.background = "url('/assets/kenney-rpg-ui/buttonRound_blue.png') no-repeat center center";
  btn.style.backgroundSize = "100% 100%";
  btn.style.border = 'none';
  btn.style.padding = '12px 24px';
  btn.style.fontSize = '18px';
  btn.style.color = '#fff';
  btn.style.cursor = 'pointer';
  btn.style.fontWeight = 'bold';
  btn.style.width = '100%';

  btn.onclick = () => {
    const name = input.value.trim();
    if (name.length < 3) {
      alert("Name must be at least 3 characters.");
      return;
    }
    localStorage.setItem('playerName', name);
    localStorage.setItem('playerUUID', generateUUID());
    document.body.removeChild(overlay);
    startGame(mountPoint);
  };

  box.appendChild(title);
  box.appendChild(input);
  box.appendChild(btn);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

function startGame(mountPoint: HTMLElement) {
  requestAnimationFrame(() => {
    setTimeout(() => {
      new SideViewGame(mountPoint);
    }, 0);
  });
}

function initGame() {
  const mountPoint = document.getElementById('rpg') || document.body;
  if (!mountPoint) return;
  
  const existingName = localStorage.getItem('playerName');
  const existingUUID = localStorage.getItem('playerUUID');

  if (!existingName || !existingUUID) {
    showGuestLogin(mountPoint);
  } else {
    startGame(mountPoint);
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initGame);
} else {
  initGame();
}