/**
 * Fullscreen and landscape-only presentation for the side-scroller.
 *
 * Browsers deliberately reject fullscreen requests made on page load. iPhone
 * Safari also does not expose element fullscreen or Screen Orientation lock.
 * The controller therefore blocks mobile portrait with an honest rotate gate,
 * waits for an explicit player action before requesting immersive APIs, and
 * releases the gate only after the viewport is actually landscape.
 */

export const LANDSCAPE_READY_EVENT = 'aethelgard:landscape-ready';

const GESTURE_EVENTS = ['pointerdown', 'touchend', 'click', 'keydown'] as const;
const GATE_INPUT_EVENTS = ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'click', 'keydown', 'keyup', 'wheel', 'contextmenu'] as const;

type FullscreenRoot = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

type OrientationApi = ScreenOrientation & {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
};

export interface ImmersiveModeResult {
  fullscreen: boolean;
  landscapeLocked: boolean;
  fullscreenSupported: boolean;
  orientationLockSupported: boolean;
}

export interface LandscapeModeController {
  isBlocked(): boolean;
  refresh(): boolean;
  requestFromUserAction(): Promise<ImmersiveModeResult>;
  destroy(): void;
}

let activeController: LandscapeModeController | null = null;

function orientationApi(): OrientationApi | undefined {
  return typeof screen !== 'undefined' ? screen.orientation as OrientationApi | undefined : undefined;
}

function fullscreenRequest(): (() => Promise<void> | void) | undefined {
  if (typeof document === 'undefined') return undefined;
  const root = document.documentElement as FullscreenRoot;
  const request = root.requestFullscreen || root.webkitRequestFullscreen || root.msRequestFullscreen;
  return request ? request.bind(root) : undefined;
}

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const desktopModeIpad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  const coarsePointer = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  const shortViewportSide = Math.min(window.innerWidth || Infinity, window.innerHeight || Infinity);
  const compactTouchDevice = navigator.maxTouchPoints > 1 && coarsePointer && shortViewportSide <= 1100;
  return mobileUa || desktopModeIpad || compactTouchDevice;
}

export function isPortraitViewport(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia === 'function') {
    try { return window.matchMedia('(orientation: portrait)').matches; }
    catch { /* use dimensions below */ }
  }
  return window.innerHeight > window.innerWidth;
}

export function isFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  return Boolean(document.fullscreenElement || (document as any).webkitFullscreenElement);
}

/** Must be called from a genuine user activation when fullscreen is needed. */
export async function requestImmersiveMode(): Promise<ImmersiveModeResult> {
  const request = fullscreenRequest();
  const orientation = orientationApi();
  let fullscreen = isFullscreen();
  let landscapeLocked = false;

  if (!fullscreen && request) {
    try {
      await request();
      fullscreen = true;
    } catch {
      // A browser may reject during a transition. The controller retains its
      // gesture listeners so a later explicit player action can retry.
    }
  }

  if (orientation?.lock) {
    try {
      await orientation.lock('landscape');
      landscapeLocked = true;
    } catch {
      // Unsupported on iOS Safari and commonly refused outside fullscreen.
      // Physical rotation remains the truthful fallback.
    }
  }

  return {
    fullscreen,
    landscapeLocked,
    fullscreenSupported: Boolean(request),
    orientationLockSupported: Boolean(orientation?.lock),
  };
}

/** Backwards-compatible fullscreen button helper. */
export async function enterFullscreen(): Promise<boolean> {
  return (await requestImmersiveMode()).fullscreen;
}

function noopController(): LandscapeModeController {
  const unsupported: ImmersiveModeResult = {
    fullscreen: false,
    landscapeLocked: false,
    fullscreenSupported: false,
    orientationLockSupported: false,
  };
  return {
    isBlocked: () => false,
    refresh: () => false,
    requestFromUserAction: async () => unsupported,
    destroy: () => undefined,
  };
}

/**
 * Installs the portrait gate and first-action immersive request.
 *
 * The returned controller owns every listener it creates. `destroy()` removes
 * them, releases inert state, and unlocks an orientation lock acquired here.
 */
export function installLandscapeMode(): LandscapeModeController {
  if (activeController) return activeController;
  if (typeof window === 'undefined' || typeof document === 'undefined') return noopController();

  const gate = document.getElementById('orientation-rotate-shield');
  const action = document.getElementById('orientation-enable-btn') as HTMLButtonElement | null;
  const status = document.getElementById('orientation-lock-status');
  const gameRoot = document.getElementById('rpg');
  const root = document.documentElement;
  if (!gate || !action || !gameRoot) return noopController();

  let blocked = false;
  let destroyed = false;
  let hasUserActivation = false;
  let lockWasAcquired = false;
  let previousFocus: HTMLElement | null = null;
  let activeRequest: Promise<ImmersiveModeResult> | null = null;

  const setStatus = (message: string) => {
    if (status) status.textContent = message;
  };

  const setBlocked = (next: boolean) => {
    if (destroyed || blocked === next) return;
    const wasBlocked = blocked;
    blocked = next;

    if (next) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      root.dataset.landscapeBlocked = 'true';
      gate.hidden = false;
      gate.setAttribute('aria-hidden', 'false');
      gameRoot.setAttribute('inert', '');
      gameRoot.setAttribute('aria-hidden', 'true');
      action.focus({ preventScroll: true });
      return;
    }

    delete root.dataset.landscapeBlocked;
    gate.hidden = true;
    gate.setAttribute('aria-hidden', 'true');
    gameRoot.removeAttribute('inert');
    gameRoot.removeAttribute('aria-hidden');
    if (wasBlocked) {
      window.dispatchEvent(new Event(LANDSCAPE_READY_EVENT));
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      previousFocus = null;
    }
  };

  const refresh = () => {
    const shouldBlock = isMobileDevice() && isPortraitViewport();
    setBlocked(shouldBlock);
    return shouldBlock;
  };

  const requestFromUserAction = () => {
    hasUserActivation = true;
    if (activeRequest) return activeRequest;
    setStatus('Requesting fullscreen and landscape mode...');
    activeRequest = requestImmersiveMode().then(result => {
      lockWasAcquired ||= result.landscapeLocked;
      refresh();
      if (blocked) {
        if (!result.fullscreenSupported && !result.orientationLockSupported) {
          setStatus('Automatic rotation is unavailable in this browser. Turn off Portrait Orientation Lock, then rotate the device manually.');
        } else if (result.landscapeLocked) {
          setStatus('Landscape was requested. Rotate the device if it does not turn automatically.');
        } else {
          setStatus('The browser refused automatic rotation. Turn off Portrait Orientation Lock, then rotate manually.');
        }
      }
      return result;
    }).finally(() => { activeRequest = null; });
    return activeRequest;
  };

  const retryLandscapeLock = async () => {
    if (!hasUserActivation || document.visibilityState === 'hidden') return;
    const orientation = orientationApi();
    if (!orientation?.lock) return;
    try {
      await orientation.lock('landscape');
      lockWasAcquired = true;
    } catch { /* physical rotation remains available */ }
  };

  const removeGestureListeners = () => {
    GESTURE_EVENTS.forEach(eventName => document.removeEventListener(eventName, onFirstGesture));
  };

  const onFirstGesture = (event: Event) => {
    if (destroyed || blocked) return;
    if (event instanceof KeyboardEvent && (event.repeat || event.key === 'Tab' || event.key.startsWith('Shift'))) return;
    void requestFromUserAction().then(result => {
      if (result.fullscreen || result.landscapeLocked || (!result.fullscreenSupported && !result.orientationLockSupported)) {
        removeGestureListeners();
      }
    });
  };

  const onGateAction = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    void requestFromUserAction();
  };

  const stopGateInput = (event: Event) => {
    // Events inside the modal must never reach game-wide input listeners. The
    // action button's target handler has already run before this bubble handler.
    event.stopPropagation();
    if (event.target !== action) event.preventDefault();
  };

  const onStateChange = () => {
    refresh();
    void retryLandscapeLock();
  };

  const portraitQuery = typeof window.matchMedia === 'function'
    ? window.matchMedia('(orientation: portrait)')
    : null;
  const orientation = orientationApi();

  GESTURE_EVENTS.forEach(eventName => document.addEventListener(eventName, onFirstGesture, { passive: eventName !== 'keydown' }));
  GATE_INPUT_EVENTS.forEach(eventName => gate.addEventListener(eventName, stopGateInput, { passive: false }));
  action.addEventListener('click', onGateAction);
  window.addEventListener('resize', onStateChange);
  window.addEventListener('orientationchange', onStateChange);
  document.addEventListener('visibilitychange', onStateChange);
  document.addEventListener('fullscreenchange', onStateChange);
  document.addEventListener('webkitfullscreenchange', onStateChange as EventListener);
  portraitQuery?.addEventListener?.('change', onStateChange);
  orientation?.addEventListener?.('change', onStateChange);

  const destroy = () => {
    if (destroyed) return;
    removeGestureListeners();
    GATE_INPUT_EVENTS.forEach(eventName => gate.removeEventListener(eventName, stopGateInput));
    action.removeEventListener('click', onGateAction);
    window.removeEventListener('resize', onStateChange);
    window.removeEventListener('orientationchange', onStateChange);
    document.removeEventListener('visibilitychange', onStateChange);
    document.removeEventListener('fullscreenchange', onStateChange);
    document.removeEventListener('webkitfullscreenchange', onStateChange as EventListener);
    portraitQuery?.removeEventListener?.('change', onStateChange);
    orientation?.removeEventListener?.('change', onStateChange);
    window.removeEventListener('pagehide', destroy);
    if (lockWasAcquired) {
      try { orientation?.unlock?.(); } catch { /* navigation will release it */ }
    }
    setBlocked(false);
    destroyed = true;
    if (activeController === controller) activeController = null;
  };

  const controller: LandscapeModeController = {
    isBlocked: () => blocked,
    refresh,
    requestFromUserAction,
    destroy,
  };
  activeController = controller;
  window.addEventListener('pagehide', destroy, { once: true });
  refresh();
  return controller;
}

/** Compatibility alias retained for older call sites. */
export function installAutoFullscreen(): LandscapeModeController {
  return installLandscapeMode();
}
