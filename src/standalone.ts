import { SideViewGame } from './sideview/SideViewGame';
import { getGameApiBase } from './sideview/config/RuntimeConfig';
import { installMobileStyles } from './sideview/ui/MobileUI';
import { installLandscapeMode, LANDSCAPE_READY_EVENT } from './sideview/ui/Fullscreen';
import { installRpgUiTheme } from './sideview/ui/RpgUiTheme';

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
  const API_URL = getGameApiBase();

  const overlay = document.createElement('div');
  overlay.className = 'rpg-screen';
  overlay.setAttribute('role', 'main');
  overlay.setAttribute('aria-labelledby', 'login-title');
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
  box.className = 'rpg-panel rpg-stack';
  box.setAttribute('role', 'form');
  box.setAttribute('aria-describedby', 'login-error');
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
  title.id = 'login-title';
  title.className = 'rpg-title';
  title.innerText = 'AETHELGARD LOGIN';
  title.style.margin = '0 0 20px 0';
  title.style.textShadow = '2px 2px 4px #000';

  const userIn = document.createElement('input');
  userIn.id = 'login-username';
  userIn.className = 'rpg-input';
  userIn.type = 'text';
  userIn.autocomplete = 'username';
  userIn.setAttribute('aria-describedby', 'login-error');
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

  const userLabel = document.createElement('label');
  userLabel.className = 'rpg-field';
  userLabel.htmlFor = userIn.id;
  userLabel.textContent = 'Adventurer name';
  userLabel.appendChild(userIn);

  const passIn = document.createElement('input');
  passIn.id = 'login-password';
  passIn.className = 'rpg-input';
  passIn.type = 'password';
  passIn.autocomplete = 'current-password';
  passIn.setAttribute('aria-describedby', 'login-error');
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

  const passLabel = document.createElement('label');
  passLabel.className = 'rpg-field';
  passLabel.htmlFor = passIn.id;
  passLabel.textContent = 'Password';
  passLabel.appendChild(passIn);

  const loginBtn = document.createElement('button');
  loginBtn.className = 'rpg-button rpg-button--primary';
  loginBtn.type = 'button';
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
  guestBtn.className = 'rpg-button';
  guestBtn.type = 'button';
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
  errorText.id = 'login-error';
  errorText.className = 'rpg-error';
  errorText.setAttribute('role', 'status');
  errorText.setAttribute('aria-live', 'polite');
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
    loginBtn.disabled = true;
    guestBtn.disabled = true;
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
        if (data.token) localStorage.setItem('playerSessionToken', data.token);
        document.body.removeChild(overlay);
        startGame(mountPoint);
      } else {
        errorText.innerText = data.error || 'Invalid credentials';
      }
    } catch (err) {
      errorText.innerText = 'Failed to connect to server.';
    }
    loginBtn.innerText = 'LOGIN';
    loginBtn.disabled = false;
    guestBtn.disabled = false;
  };

  guestBtn.onclick = async () => {
    const username = userIn.value.trim();
    if (username.length < 3) {
      errorText.innerText = "Name must be at least 3 characters.";
      return;
    }

    guestBtn.innerText = 'Creating account...';
    loginBtn.disabled = true;
    guestBtn.disabled = true;
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
        localStorage.setItem('playerName', data.username || username);
        localStorage.setItem('playerUUID', data.uuid || uuid);
        localStorage.setItem('playerShortId', data.shortId || shortId);
        if (data.token) localStorage.setItem('playerSessionToken', data.token);

        // Show credentials overlay
        box.innerHTML = '';
        box.style.width = 'min(400px, 92vw)';
        const okTitle = document.createElement('h2');
        okTitle.className = 'rpg-title';
        okTitle.innerText = 'ACCOUNT CREATED';
        okTitle.style.color = '#4ade80';
        okTitle.style.marginBottom = '20px';

        const okMsg = document.createElement('div');
        okMsg.className = 'rpg-stack';
        const successCopy = document.createElement('p');
        successCopy.className = 'rpg-help';
        successCopy.textContent = 'Your adventurer account is ready. Save these credentials before continuing.';
        const credentials = document.createElement('dl');
        credentials.className = 'rpg-card';
        credentials.style.cssText = 'display:grid;grid-template-columns:auto 1fr;gap:8px 12px;padding:12px;text-align:left;';
        const addCredential = (label: string, value: unknown) => {
          const term = document.createElement('dt');
          const description = document.createElement('dd');
          term.className = 'rpg-label';
          term.textContent = label;
          description.style.cssText = 'margin:0;color:var(--rpg-gold-bright);font-weight:900;overflow-wrap:anywhere;user-select:text;';
          description.textContent = String(value ?? '');
          credentials.append(term, description);
        };
        addCredential('Username', data.username || username);
        addCredential('Password', data.password);
        const warning = document.createElement('p');
        warning.className = 'rpg-error';
        warning.textContent = 'Save or screenshot this password. It is required to sign in on another device.';
        okMsg.append(successCopy, credentials, warning);
        okMsg.style.fontFamily = "'Outfit', sans-serif";
        okMsg.style.marginBottom = '20px';
        okMsg.style.lineHeight = '1.5';

        const okBtn = document.createElement('button');
        okBtn.className = 'rpg-button rpg-button--primary';
        okBtn.type = 'button';
        okBtn.innerText = 'I Have Saved It';
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
    loginBtn.disabled = false;
    guestBtn.disabled = false;
  };

  [userIn, passIn].forEach(input => input.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    loginBtn.click();
  }));

  box.appendChild(title);
  box.appendChild(userLabel);
  box.appendChild(passLabel);
  box.appendChild(loginBtn);
  box.appendChild(guestBtn);
  box.appendChild(errorText);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  userIn.focus({ preventScroll: true });
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
  installRpgUiTheme();
  installMobileStyles();
  const mountPoint = document.getElementById('rpg') || document.body;
  if (!mountPoint) return;
  
  const existingName = localStorage.getItem('playerName');
  const existingUUID = localStorage.getItem('playerUUID');

  const existingShortId = localStorage.getItem('playerShortId');
  const existingSession = localStorage.getItem('playerSessionToken');
  // Accounts created before authenticated sessions must log in once so the
  // browser can receive a signed token; a bare UUID is no longer authority.
  if (!existingName || !existingUUID || !existingShortId || !existingSession) {
    showLoginScreen(mountPoint);
  } else {
    startGame(mountPoint);
  }
}

// Install the gate before booting any login/game UI. On mobile portrait this
// keeps the mount inert and defers construction, so no renderer or game input
// starts behind the rotate dialog. A physical rotation is the iOS fallback;
// supported browsers additionally request fullscreen + orientation lock from
// the first explicit player action.
const landscapeMode = installLandscapeMode();
let gameInitialized = false;
const initWhenLandscape = () => {
  if (gameInitialized || landscapeMode.isBlocked() || document.readyState === 'loading') return;
  gameInitialized = true;
  window.removeEventListener(LANDSCAPE_READY_EVENT, initWhenLandscape);
  initGame();
};

window.addEventListener(LANDSCAPE_READY_EVENT, initWhenLandscape);
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initWhenLandscape, { once: true });
} else {
  initWhenLandscape();
}
