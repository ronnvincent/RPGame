/**
 * Global mobile adaptation.
 *
 * Two jobs:
 *  1. Decide whether a touchmove should scroll something or be swallowed by the
 *     game. This used to be an allowlist of modal class names, which meant any
 *     new scrollable panel silently lost the ability to scroll until someone
 *     remembered to add it. It now asks the DOM whether the element is actually
 *     scrollable, so it is correct for panels that do not exist yet.
 *  2. Inject one stylesheet that enforces readable text and finger-sized
 *     targets across every panel, rather than each panel guessing.
 */

const STYLE_ID = 'mobile-ui-style';

/** Walks up from the touch target looking for something that can actually scroll. */
export function findScrollable(start: EventTarget | null): HTMLElement | null {
  let el = start as HTMLElement | null;
  while (el && el !== document.body) {
    const style = window.getComputedStyle(el);
    const canScrollY = /(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1;
    const canScrollX = /(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 1;
    if (canScrollY || canScrollX) return el;
    el = el.parentElement;
  }
  return null;
}

export function installMobileStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement('style');
  st.id = STYLE_ID;
  st.textContent = `
    /* ---- Readability floors -------------------------------------------
       The UI is littered with 9-11px text that is fine on a monitor and
       unreadable on a phone. Scale the floor with the viewport instead of
       hard-coding a second set of sizes. */
    @media (pointer: coarse) {
      .dialogue-box-frame, .inventory-modal, .world-map-modal,
      .quest-log-modal, #coop-lobby, .details-area, .showcase-area {
        font-size: clamp(13px, 3.4vw, 16px);
      }
      .dialogue-box-frame *, .inventory-modal *, .world-map-modal *,
      .quest-log-modal *, #coop-lobby *, .details-area * {
        font-size: max(1em, 12px);
        line-height: 1.35;
      }

      /* ---- Finger-sized targets ---- */
      button, .btn, [role="button"], select, input[type="button"] {
        min-height: 44px !important;
        min-width: 44px;
        touch-action: manipulation;
      }
      /* 16px stops iOS zooming the page when a field takes focus.
         !important is required, not sloppiness: several screens set
         element.style.fontSize directly, and an inline style outranks any
         stylesheet rule. Verified at 375x812 - without it the login fields
         stayed at 14px and iOS would zoom on focus. */
      input[type="text"], input[type="password"], input[type="number"], textarea, select {
        font-size: max(16px, 1em) !important;
        min-height: 44px !important;
      }
    }

    /* ---- Scrollable panels --------------------------------------------- */
    .dialogue-box-frame, .inventory-modal, .world-map-modal,
    .quest-log-modal, #coop-lobby, .details-area, .showcase-area {
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
    }

    /* ---- Notches and rounded corners ------------------------------------ */
    .dialogue-modal-backdrop, .prologue-overlay {
      padding-left: env(safe-area-inset-left);
      padding-right: env(safe-area-inset-right);
      padding-top: env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
    }

    /* ---- Short landscape phones ----------------------------------------
       Height, not width, is the binding constraint when a phone is held
       sideways - the case width-only breakpoints miss entirely. */
    @media (max-height: 560px) {
      .dialogue-box-frame, .inventory-modal, .world-map-modal,
      .quest-log-modal, #coop-lobby {
        max-height: 94dvh !important;
        padding: 10px 12px !important;
      }
      .dialogue-header-row { margin-bottom: 8px !important; padding-bottom: 6px !important; }
    }

    /* Never let a panel force the page sideways. */
    .dialogue-box-frame, .inventory-modal, .world-map-modal,
    .quest-log-modal, #coop-lobby { max-width: 96vw; }

    /* Any full-screen centred overlay must be able to scroll, or content that
       does not fit a short landscape phone becomes unreachable. */
    .dialogue-modal-backdrop, .prologue-overlay {
      overflow-y: auto;
    }

    /* Tables and wide rows scroll inside themselves instead of stretching. */
    .dialogue-box-frame table, .inventory-modal table { display: block; overflow-x: auto; }
  `;
  document.head.appendChild(st);
}
