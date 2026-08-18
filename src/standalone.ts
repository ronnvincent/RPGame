import { SideViewGame } from './sideview/SideViewGame';
import { installMobileStyles } from './sideview/ui/MobileUI';

function generateShortId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function showLoginScreen(mountPoint: HTMLElement) {
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const API_URL = isLocal ? 'http://localhost:3001/api' : 'https://rpgame-production-3453.up.railway.app/api';

  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.overflowY = 'auto';
  overlay.style.padding = '12px';
  overlay.style.zIndex = '99999';
  overlay.style.fontFamily = "'Cinzel', 'Outfit', sans-serif";

  const box = document.createElement('div');
  box.style.background = "url('/assets/kenney-rpg-ui/panel_brown.png') repeat";
  box.style.backgroundSize = "100% 100%";
  box.style.padding = 'clamp(18px, 6vw, 40px)';
  box.style.border = '4px solid #4a2c11';
  box.style.borderRadius = '8px';
  box.style.textAlign = 'center';
  box.style.color = '#fef08a';
  box.style.width = 'min(350px, 92vw)';
  box.style.maxHeight = '92dvh';
  box.style.overflowY = 'auto';

  const title = document.createElement('h2');
  title.innerText = 'AETHELGARD LOGIN';
  title.style.margin = '0 0 20px 0';
  title.style.textShadow = '2px 2px 4px #000';

  const userIn = document.createElement('input');
  userIn.type = 'text';
  userIn.placeholder = 'Username / Adventurer Name';
  userIn.style.width = '100%';
  userIn.style.padding = '10px';
  userIn.style.marginBottom = '10px';
  userIn.style.fontSize = '14px';
  userIn.style.border = '2px solid #2e1a0b';
  userIn.style.borderRadius = '4px';
  userIn.style.background = '#000';
  userIn.style.color = '#fff';
  userIn.style.outline = 'none';
  userIn.maxLength = 16;

  const passIn = document.createElement('input');
  passIn.type = 'password';
  passIn.placeholder = 'Password (Leave blank for Guest)';
  passIn.style.width = '100%';
  passIn.style.padding = '10px';
  passIn.style.marginBottom = '20px';
  passIn.style.fontSize = '14px';
  passIn.style.border = '2px solid #2e1a0b';
  passIn.style.borderRadius = '4px';
  passIn.style.background = '#000';
  passIn.style.color = '#fff';
  passIn.style.outline = 'none';

  const loginBtn = document.createElement('button');
  loginBtn.innerText = 'LOGIN';
  loginBtn.style.background = "url('/assets/kenney-rpg-ui/buttonRound_blue.png') no-repeat center center";
  loginBtn.style.backgroundSize = "100% 100%";
  loginBtn.style.border = 'none';
  loginBtn.style.padding = '12px 24px';
  loginBtn.style.fontSize = '16px';
  loginBtn.style.color = '#fff';
  loginBtn.style.cursor = 'pointer';
  loginBtn.style.fontWeight = 'bold';
  loginBtn.style.width = '100%';
  loginBtn.style.marginBottom = '10px';

  const guestBtn = document.createElement('button');
  guestBtn.innerText = 'PLAY AS GUEST';
  guestBtn.style.background = '#4a2c11';
  guestBtn.style.border = '2px solid #fff';
  guestBtn.style.padding = '10px 24px';
  guestBtn.style.fontSize = '14px';
  guestBtn.style.color = '#fff';
  guestBtn.style.cursor = 'pointer';
  guestBtn.style.fontWeight = 'bold';
  guestBtn.style.width = '100%';

  const errorText = document.createElement('p');
  errorText.style.color = '#ff6b6b';
  errorText.style.fontSize = '12px';
  errorText.style.marginTop = '10px';
  errorText.style.fontFamily = "'Outfit', sans-serif";

  loginBtn.onclick = async () => {
    const username = userIn.value.trim();
    const password = passIn.value.trim();
    if (!username || !password) {
      errorText.innerText = "Please enter both username and password.";
      return;
    }
    
    loginBtn.innerText = 'Logging in...';
    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('playerName', data.name);
        localStorage.setItem('playerUUID', data.uuid);
        localStorage.setItem('playerShortId', data.shortId);
        document.body.removeChild(overlay);
        startGame(mountPoint);
      } else {
        errorText.innerText = data.error || 'Invalid credentials';
      }
    } catch (err) {
      errorText.innerText = 'Failed to connect to server.';
    }
    loginBtn.innerText = 'LOGIN';
  };

  guestBtn.onclick = async () => {
    const username = userIn.value.trim();
    if (username.length < 3) {
      errorText.innerText = "Name must be at least 3 characters.";
      return;
    }

    guestBtn.innerText = 'Creating account...';
    try {
      const uuid = generateUUID();
      const shortId = generateShortId();
      
      const res = await fetch(`${API_URL}/register_guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, shortId, uuid })
      });
      const data = await res.json();

      if (data.success) {
        localStorage.setItem('playerName', username);
        localStorage.setItem('playerUUID', uuid);
        localStorage.setItem('playerShortId', shortId);

        // Show credentials overlay
        box.innerHTML = '';
        box.style.width = 'min(400px, 92vw)';
        const okTitle = document.createElement('h2');
        okTitle.innerText = 'ACCOUNT CREATED!';
        okTitle.style.color = '#4ade80';
        okTitle.style.marginBottom = '20px';

        const okMsg = document.createElement('p');
        okMsg.innerHTML = `Your account was successfully registered.<br/><br/>
        <strong style="color:#fff">Username:</strong> <span style="color:#ffd700">${username}</span><br/>
        <strong style="color:#fff">Password:</strong> <span style="color:#ffd700">${data.password}</span><br/><br/>
        <span style="color:#ef4444; font-size: 14px;">Screenshot this! You will need this password to login on other devices.</span>`;
        okMsg.style.fontFamily = "'Outfit', sans-serif";
        okMsg.style.marginBottom = '20px';
        okMsg.style.lineHeight = '1.5';

        const okBtn = document.createElement('button');
        okBtn.innerText = 'I HAVE SAVED IT ➔';
        okBtn.style.background = "url('/assets/kenney-rpg-ui/buttonRound_blue.png') no-repeat center center";
        okBtn.style.backgroundSize = "100% 100%";
        okBtn.style.border = 'none';
        okBtn.style.padding = '12px 24px';
        okBtn.style.color = '#fff';
        okBtn.style.cursor = 'pointer';
        okBtn.style.fontWeight = 'bold';
        okBtn.onclick = () => {
          document.body.removeChild(overlay);
          startGame(mountPoint);
        };

        box.appendChild(okTitle);
        box.appendChild(okMsg);
        box.appendChild(okBtn);
      } else {
        errorText.innerText = data.error || 'Failed to create guest account.';
      }
    } catch (err) {
      errorText.innerText = 'Failed to connect to server.';
    }
    guestBtn.innerText = 'PLAY AS GUEST';
  };

  box.appendChild(title);
  box.appendChild(userIn);
  box.appendChild(passIn);
  box.appendChild(loginBtn);
  box.appendChild(guestBtn);
  box.appendChild(errorText);
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
  // Applies to the login screen as well, not just the game UI.
  installMobileStyles();
  const mountPoint = document.getElementById('rpg') || document.body;
  if (!mountPoint) return;
  
  const existingName = localStorage.getItem('playerName');
  const existingUUID = localStorage.getItem('playerUUID');

  const existingShortId = localStorage.getItem('playerShortId');
  if (!existingName || !existingUUID || !existingShortId) {
    showLoginScreen(mountPoint);
  } else {
    startGame(mountPoint);
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initGame);
} else {
  initGame();
}