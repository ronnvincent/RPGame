const RPG_UI_THEME_ID = 'sideview-rpg-ui-theme';

/**
 * Shared fantasy UI language for every screen. Components keep semantic HTML;
 * these classes provide the reusable frame, hierarchy, focus and responsive
 * behavior without cloning hundreds of lines into each modal.
 */
export function installRpgUiTheme(): void {
  if (typeof document === 'undefined' || document.getElementById(RPG_UI_THEME_ID)) return;

  const style = document.createElement('style');
  style.id = RPG_UI_THEME_ID;
  style.textContent = `
    :root {
      --rpg-ink-950: #05060a;
      --rpg-ink-900: #0a0c13;
      --rpg-ink-850: #10131d;
      --rpg-ink-800: #171b28;
      --rpg-paper: #efe3c6;
      --rpg-muted: #a89a7e;
      --rpg-gold: #e0b64f;
      --rpg-gold-bright: #ffdd8f;
      --rpg-danger: #ef5b55;
      --rpg-health: #d4453f;
      --rpg-mana: #3d8ae6;
      --rpg-stamina: #42b978;
      --rpg-focus: #fff0a8;
      --rpg-shield: #a78bfa;
      --rpg-panel-image: url('/assets/runtime/ui/fantasy-borders/default-panel/panel-000.png');
      --rpg-panel-inset-image: url('/assets/runtime/ui/fantasy-borders/default-panel/panel-016.png');
      --rpg-divider-image: url('/assets/runtime/ui/fantasy-borders/default-divider/divider-000.png');
      --rpg-ui-scale: 1;
      --rpg-text-scale: 1;
    }

    .rpg-screen {
      position: fixed;
      inset: 0;
      z-index: 100;
      color: var(--rpg-paper);
      font-family: 'Outfit', 'Inter', system-ui, sans-serif;
      font-size: calc(15px * var(--rpg-text-scale));
      background:
        radial-gradient(ellipse at 50% -10%, rgba(124, 58, 237, .14), transparent 46%),
        radial-gradient(circle at 50% 50%, transparent 52%, rgba(0, 0, 0, .55) 100%),
        linear-gradient(160deg, rgba(4, 5, 9, .94), rgba(8, 10, 16, .98));
      padding: max(12px, env(safe-area-inset-top))
               max(12px, env(safe-area-inset-right))
               max(12px, env(safe-area-inset-bottom))
               max(12px, env(safe-area-inset-left));
      isolation: isolate;
    }

    .rpg-screen__backdrop {
      position: absolute;
      inset: 0;
      z-index: -1;
      background: rgba(3, 4, 7, .78);
      backdrop-filter: blur(4px);
    }

    .rpg-modal {
      display: grid;
      place-items: center;
      overflow: hidden;
    }

    .rpg-dialog {
      position: relative;
      display: flex;
      flex-direction: column;
      width: min(960px, 96vw);
      max-height: min(90dvh, 920px);
      min-height: 0;
      padding: clamp(10px, 2.2vw, 22px);
      overflow: hidden;
    }

    .rpg-dialog--compact { width: min(600px, 96vw); }
    .rpg-dialog--wide { width: min(1120px, 97vw); }
    .rpg-dialog__header,
    .rpg-dialog__footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex: 0 0 auto;
    }
    .rpg-dialog__header { padding-bottom: 8px; }
    .rpg-dialog__footer {
      justify-content: flex-end;
      padding-top: 10px;
      border-top: 1px solid rgba(231, 189, 85, .24);
    }
    .rpg-dialog__body {
      min-height: 0;
      overflow: auto;
      overscroll-behavior: contain;
      scrollbar-color: #9b7233 #090b10;
      scrollbar-width: thin;
    }

    .rpg-tabs {
      display: flex;
      gap: 6px;
      padding: 5px 0 10px;
      overflow-x: auto;
      border-bottom: 1px solid rgba(231, 189, 85, .25);
    }
    .rpg-tab {
      flex: 0 0 auto;
      padding: 9px 13px;
      cursor: pointer;
    }
    .rpg-tab[aria-selected='true'], .rpg-tab.is-active {
      color: var(--rpg-gold-bright);
      border-color: var(--rpg-gold);
      background: linear-gradient(#53452a, #282014 52%, #16130f 53%);
    }

    .rpg-badge {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 3px 8px;
      border: 1px solid rgba(231, 189, 85, .4);
      border-radius: 999px;
      color: var(--rpg-gold-bright);
      background: rgba(0, 0, 0, .38);
      font-size: .72rem;
      font-weight: 900;
      letter-spacing: .06em;
      text-transform: uppercase;
    }
    .rpg-badge--success { color: #89efac; border-color: rgba(80, 210, 126, .52); }
    .rpg-badge--danger { color: #ff9a94; border-color: rgba(239, 91, 85, .58); }
    .rpg-empty {
      display: grid;
      place-items: center;
      min-height: 150px;
      padding: 24px;
      color: var(--rpg-muted);
      text-align: center;
      line-height: 1.5;
    }
    .rpg-list { display: grid; gap: 9px; padding: 8px 2px; }
    .rpg-stat {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
    }
    .rpg-stat__value { color: var(--rpg-paper); font-weight: 900; font-variant-numeric: tabular-nums; }

    .rpg-key {
      display: inline-grid;
      place-items: center;
      min-width: 24px;
      min-height: 22px;
      padding: 2px 6px;
      border: 1px solid rgba(245, 233, 202, .42);
      border-radius: 3px;
      color: var(--rpg-paper);
      background: #0a0d12;
      box-shadow: inset 0 -2px rgba(255,255,255,.08);
      font-size: .7rem;
      font-weight: 900;
      line-height: 1;
    }

    .rpg-panel,
    .rpg-card,
    .rpg-tooltip {
      color: var(--rpg-paper);
      background: linear-gradient(rgba(12, 14, 22, .96), rgba(6, 8, 13, .98));
      border: 16px solid transparent;
      /* These Kenney frames are opaque-white masks. Filling the center paints
         a white sheet over the dark surface; use only their border slices. */
      border-image: var(--rpg-panel-image) 16 / 16px / 0 stretch;
      image-rendering: pixelated;
      filter: drop-shadow(0 12px 22px rgba(0, 0, 0, .52));
      box-shadow: inset 0 0 0 1px rgba(224, 182, 79, .18), inset 0 -10px 26px rgba(0, 0, 0, .5);
    }

    .rpg-card,
    .rpg-tooltip {
      border-image-source: var(--rpg-panel-inset-image);
      filter: drop-shadow(0 7px 14px rgba(0, 0, 0, .42));
    }

    .rpg-title,
    .rpg-heading {
      margin: 0;
      color: var(--rpg-gold-bright);
      font-family: 'Cinzel', Georgia, serif;
      font-weight: 900;
      line-height: 1.1;
      letter-spacing: .06em;
      text-wrap: balance;
      text-shadow: 0 2px 0 #000, 0 0 14px rgba(231, 189, 85, .2);
    }

    .rpg-title { font-size: clamp(1.2rem, 2.5vw, 1.9rem); }
    .rpg-heading { font-size: clamp(1rem, 1.8vw, 1.25rem); }

    .rpg-kicker,
    .rpg-label {
      color: var(--rpg-muted);
      font-size: .78rem;
      font-weight: 800;
      letter-spacing: .11em;
      line-height: 1.25;
      text-transform: uppercase;
    }

    .rpg-divider {
      width: min(100%, 288px);
      height: 18px;
      margin: 4px auto;
      background: var(--rpg-divider-image) center / 100% 100% no-repeat;
      image-rendering: pixelated;
      opacity: .9;
    }

    .rpg-button,
    .rpg-tab,
    .rpg-icon-button {
      min-height: 44px;
      border: 1px solid rgba(224, 182, 79, .55);
      border-radius: 3px;
      color: var(--rpg-paper);
      background: linear-gradient(#191d2b, #0e111b 52%, #0a0c13 53%);
      box-shadow: inset 0 0 0 1px rgba(224, 182, 79, .12), 0 3px 0 #05060a;
      font: 800 .86rem/1 'Outfit', 'Inter', sans-serif;
      letter-spacing: .05em;
      text-transform: uppercase;
      text-shadow: 0 1px 2px #000;
      touch-action: manipulation;
    }

    .rpg-button { padding: 10px 16px; }
    .rpg-icon-button { width: 46px; min-width: 46px; padding: 8px; }
    .rpg-button:hover:not(:disabled),
    .rpg-tab:hover:not(:disabled),
    .rpg-icon-button:hover:not(:disabled) {
      filter: brightness(1.25);
      border-color: var(--rpg-gold-bright);
      box-shadow: inset 0 0 0 1px rgba(255, 221, 143, .28), 0 3px 0 #05060a, 0 0 14px rgba(224, 182, 79, .18);
    }
    .rpg-button:active:not(:disabled),
    .rpg-tab:active:not(:disabled),
    .rpg-icon-button:active:not(:disabled) { transform: translateY(2px); box-shadow: inset 0 0 0 2px rgba(0, 0, 0, .5), 0 2px 0 #07080b; }
    .rpg-button:disabled,
    .rpg-tab:disabled,
    .rpg-icon-button:disabled { opacity: .42; cursor: not-allowed !important; }
    .rpg-button--primary { color: #171006; background: linear-gradient(#ffe39a, #d8a83b 52%, #b67b22 53%); text-shadow: 0 1px rgba(255,255,255,.25); }
    .rpg-button--danger { border-color: rgba(239, 91, 85, .72); background: linear-gradient(#713833, #3c1b1b); }

    .rpg-field {
      display: grid;
      gap: 6px;
      width: 100%;
      color: var(--rpg-muted);
      font-size: .76rem;
      font-weight: 800;
      letter-spacing: .06em;
      text-align: left;
      text-transform: uppercase;
    }
    .rpg-input,
    .rpg-select {
      width: 100%;
      min-height: 44px;
      padding: 9px 11px;
      border: 2px solid #07080b;
      border-radius: 3px;
      color: var(--rpg-paper);
      background: #0a0d12;
      box-shadow: inset 0 0 0 1px rgba(231, 189, 85, .34), inset 0 2px 8px rgba(0,0,0,.62);
      font: 700 1rem/1.2 'Outfit', 'Inter', sans-serif;
      text-transform: none;
    }
    .rpg-help { margin: 0; color: var(--rpg-muted); font-size: .82rem; line-height: 1.45; }
    .rpg-error { min-height: 1.3em; margin: 0; color: #ff918d; font-weight: 800; font-size: .84rem; line-height: 1.35; }

    .rpg-progress {
      --rpg-progress-value: 0%;
      position: relative;
      min-height: 10px;
      overflow: hidden;
      border: 2px solid #07080b;
      border-radius: 2px;
      background: #080a0f;
      box-shadow: inset 0 1px 4px #000, 0 0 0 1px rgba(231, 189, 85, .25);
    }
    .rpg-progress::after {
      content: '';
      position: absolute;
      inset: 0 auto 0 0;
      width: var(--rpg-progress-value);
      background: var(--rpg-progress-color, var(--rpg-health));
      box-shadow: inset 0 2px rgba(255,255,255,.2), 0 0 8px currentColor;
      transform-origin: left center;
    }

    .rpg-grid { display: grid; gap: 12px; }
    .rpg-cluster { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .rpg-stack { display: flex; flex-direction: column; gap: 10px; }

    .rpg-visually-hidden {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      padding: 0 !important;
      margin: -1px !important;
      overflow: hidden !important;
      clip: rect(0, 0, 0, 0) !important;
      white-space: nowrap !important;
      border: 0 !important;
    }

    :is(.rpg-screen, #game-hud-overlay) :is(button, a, input, select, textarea, [role='button'], [tabindex]):focus-visible {
      outline: 3px solid var(--rpg-focus);
      outline-offset: 3px;
      box-shadow: 0 0 0 5px rgba(0, 0, 0, .8), 0 0 18px rgba(255, 240, 168, .55);
    }

    @media (pointer: coarse) {
      :root { --rpg-ui-scale: 1.04; }
      .rpg-button, .rpg-tab, .rpg-icon-button { min-height: 48px; }
      .rpg-icon-button { width: 48px; min-width: 48px; }
    }

    @media (max-width: 700px), (max-height: 520px) {
      .rpg-screen { padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left)); }
      .rpg-panel, .rpg-card, .rpg-tooltip { border-width: 12px; border-image-width: 12px; }
      .rpg-grid { gap: 8px; }
      .rpg-dialog { width: 98vw; max-height: 96dvh; padding: 8px; }
      .rpg-dialog__header { align-items: flex-start; }
    }

    @media (prefers-reduced-motion: reduce) {
      .rpg-screen *, .rpg-screen *::before, .rpg-screen *::after,
      #game-hud-overlay *, #game-hud-overlay *::before, #game-hud-overlay *::after {
        animation-duration: .001ms !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
        transition-duration: .001ms !important;
      }
    }

    :root[data-rpg-reduced-motion='true'] .rpg-screen *,
    :root[data-rpg-reduced-motion='true'] #game-hud-overlay * { animation: none !important; transition-duration: .001ms !important; }
    :root[data-rpg-large-targets='true'] :is(.rpg-button, .rpg-tab, .rpg-icon-button, #game-hud-overlay button) { min-width: 52px; min-height: 52px; }
  `;
  document.head.appendChild(style);
}

export function applyRpgUiPreferences(preferences: {
  reducedMotion?: boolean;
  largeTouchTargets?: boolean;
  uiScale?: number;
  textScale?: number;
}): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.rpgReducedMotion = String(Boolean(preferences.reducedMotion));
  root.dataset.rpgLargeTargets = String(Boolean(preferences.largeTouchTargets));
  const uiScale = Math.max(.8, Math.min(1.5, Number(preferences.uiScale) || 1));
  const textScale = Math.max(.8, Math.min(1.5, Number(preferences.textScale) || 1));
  root.style.setProperty('--rpg-ui-scale', String(uiScale));
  root.style.setProperty('--rpg-text-scale', String(textScale));
}
