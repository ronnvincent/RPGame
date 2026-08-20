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
const DEFAULT_PRODUCTION_SERVER_ORIGIN = 'https://rpgame-production-3453.up.railway.app';

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

  const isLocal = window.location.hostname === 'localhost'
    || window.location.hostname === '127.0.0.1';
  return isLocal ? LOCAL_SERVER_ORIGIN : DEFAULT_PRODUCTION_SERVER_ORIGIN;
}

export function getGameApiBase(): string {
  return `${getGameServerOrigin()}/api`;
}
