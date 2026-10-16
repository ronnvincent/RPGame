export interface SideViewRuntimeConfig {
  /** HTTP(S) origin for both the REST API and Socket.IO server. */
  serverOrigin?: string;
}

declare global {
  interface Window {
    __SIDEVIEW_CONFIG__?: SideViewRuntimeConfig;
  }
}

const LOCAL_SERVER_ORIGIN = 'http://localhost:3001';
const DEFAULT_PRODUCTION_SERVER_ORIGIN = 'https://rpgame-production.up.railway.app';

type ViteRuntimeEnvironment = ImportMeta & {
  env?: Record<string, string | boolean | undefined>;
};

function normalizeServerOrigin(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  const candidate = value.trim();
  if (candidate === 'same-origin') return window.location.origin;

  try {
    const url = new URL(candidate, window.location.origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;

    // Callers append either `/api` or let Socket.IO use the origin directly.
    // Accept a common accidental `/api` suffix without creating `/api/api`.
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    if (pathname !== '/' && pathname !== '/api') return null;
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function viteServerOrigin(): string | null {
  const environment = (import.meta as ViteRuntimeEnvironment).env;
  return normalizeServerOrigin(
    environment?.VITE_GAME_SERVER_ORIGIN ?? environment?.VITE_API_ORIGIN,
  );
}

/**
 * Resolve the backend once through a browser-safe, non-secret configuration
 * chain. Deployments can replace `/env.js` without rebuilding; Vite variables
 * remain a build-time fallback. No database credential belongs in either one.
 */
export function getGameServerOrigin(): string {
  const injected = normalizeServerOrigin(window.__SIDEVIEW_CONFIG__?.serverOrigin);
  if (injected) return injected;

  const fromVite = viteServerOrigin();
  if (fromVite) return fromVite;

  const hostname = window.location.hostname;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  if (isLocal) return LOCAL_SERVER_ORIGIN;

  // Support local Wi-Fi / LAN testing on mobile devices (192.168.x.x, 10.x.x.x, 172.16-31.x.x, .local)
  const isPrivateIp = /^192\.168\./.test(hostname)
    || /^10\./.test(hostname)
    || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    || hostname.endsWith('.local');
  if (isPrivateIp) {
    return `http://${hostname}:3001`;
  }

  return DEFAULT_PRODUCTION_SERVER_ORIGIN;
}

export function getGameApiBase(): string {
  return `${getGameServerOrigin()}/api`;
}
