/**
 * Small escaping helpers for UI templates that intentionally use innerHTML.
 *
 * Most interface copy is static, but player names, lobby messages, quest
 * progress, and leaderboard rows can cross a network or persistence boundary.
 * Keeping the escaping rule in one place prevents a visually harmless label
 * from becoming executable markup when a legacy save predates server-side
 * display-name validation.
 */

const HTML_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
});

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, character => HTML_ENTITIES[character]);
}

/** Attribute values use the same entity set because templates always quote them. */
export const escapeHtmlAttribute = escapeHtml;

/**
 * Restrict runtime art to local public assets. CSS/HTML callers may safely
 * fall back instead of accepting javascript:, data:, protocol-relative, or
 * remote tracking URLs from a save/network payload.
 */
export function safeLocalAssetPath(value: unknown, fallback: string = ''): string {
  if (typeof value !== 'string') return fallback;
  if (!value.startsWith('/assets/') || value.includes('\\') || value.includes('\0')) return fallback;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.split('/').includes('..')) return fallback;
  } catch {
    return fallback;
  }
  return value;
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface ModalFocusOptions {
  onEscape?: () => void;
  initialFocus?: HTMLElement | null;
  returnFocus?: HTMLElement | null;
}

/**
 * Gives every RPG dialog the same keyboard contract: focus enters the dialog,
 * Tab cannot leak into the game underneath it, Escape follows the dialog's
 * close route, and the triggering control gets focus back when it closes.
 */
export function installModalFocusTrap(
  dialog: HTMLElement,
  options: ModalFocusOptions = {},
): () => void {
  const returnFocus = options.returnFocus
    ?? (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null);

  const focusable = (): HTMLElement[] => Array.from(
    dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true');

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && options.onEscape) {
      event.preventDefault();
      event.stopPropagation();
      options.onEscape();
      return;
    }
    if (event.key !== 'Tab') return;

    const items = focusable();
    if (!items.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  dialog.addEventListener('keydown', onKeyDown);
  requestAnimationFrame(() => {
    const target = options.initialFocus ?? focusable()[0] ?? dialog;
    if (dialog.isConnected) target.focus({ preventScroll: true });
  });

  return () => {
    dialog.removeEventListener('keydown', onKeyDown);
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  };
}

/** Avoids repeating number hardening at every network-backed UI boundary. */
export function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
