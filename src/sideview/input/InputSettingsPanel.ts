import { INPUT_ACTIONS, InputAction, InputDevice } from './InputActions';
import { InputController, RemapCaptureResult } from './InputController';
import { InputAccessibilityPreferences } from './InputPreferences';
import { applyRpgUiPreferences } from '../ui/RpgUiTheme';

const STYLE_ID = 'input-settings-panel-styles';

const ACTION_LABELS: Record<InputAction, string> = {
  moveLeft: 'Move left',
  moveRight: 'Move right',
  moveDown: 'Crouch / drop through',
  jump: 'Jump',
  dash: 'Dash',
  basicAttack: 'Basic attack',
  interact: 'Interact / revive',
  quickHeal: 'Quick heal',
  skill1: 'Skill 1',
  skill2: 'Skill 2',
  skill3: 'Skill 3',
  skill4: 'Skill 4',
  skill5: 'Skill 5',
  skill6: 'Ultimate',
  questLog: 'Quest log',
  worldMap: 'World map',
  returnTown: 'Return to town',
  menuToggle: 'Open menu',
  menuConfirm: 'Menu confirm',
  menuCancel: 'Menu back',
  menuUp: 'Menu up',
  menuDown: 'Menu down',
  menuLeft: 'Menu left',
  menuRight: 'Menu right',
  chatToggle: 'Quick chat',
  chatSubmit: 'Send chat',
  chatCancel: 'Close chat',
};

const ACTION_GROUPS: Array<{ title: string; actions: InputAction[] }> = [
  { title: 'Movement', actions: ['moveLeft', 'moveRight', 'moveDown', 'jump', 'dash'] },
  { title: 'Combat', actions: ['basicAttack', 'interact', 'quickHeal', 'skill1', 'skill2', 'skill3', 'skill4', 'skill5', 'skill6'] },
  { title: 'Adventure', actions: ['questLog', 'worldMap', 'returnTown', 'menuToggle', 'chatToggle'] },
  { title: 'Menus & Chat', actions: ['menuConfirm', 'menuCancel', 'menuUp', 'menuDown', 'menuLeft', 'menuRight', 'chatSubmit', 'chatCancel'] },
];

export interface InputSettingsPanelOptions {
  onBindingsChanged?: () => void;
  onPreferencesChanged?: (preferences: InputAccessibilityPreferences) => void;
}

/** Compact user-facing remap and accessibility surface for the pause menu. */
export class InputSettingsPanel {
  private root: HTMLDivElement;
  private device: InputDevice = 'keyboard';
  private cancelCapture: (() => void) | null = null;
  private pendingConflict: RemapCaptureResult | null = null;
  private suppressCancelledRender = false;
  private returnFocus: HTMLElement | null = null;

  constructor(
    private readonly parent: HTMLElement,
    private readonly input: InputController,
    private readonly options: InputSettingsPanelOptions = {},
  ) {
    this.injectStyles();
    this.root = document.createElement('div');
    this.root.className = 'rpg-screen input-settings-back';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Controls and accessibility');
    this.root.addEventListener('pointerdown', event => {
      if (event.target === this.root) this.close();
    });
    this.root.addEventListener('keydown', event => this.trapFocus(event));
    this.parent.appendChild(this.root);
    applyRpgUiPreferences(this.input.preferences.snapshot());
    this.render();
  }

  public get isOpen(): boolean {
    return this.root.classList.contains('is-open');
  }

  public open(): void {
    if (this.isOpen) return;
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.root.classList.add('is-open');
    this.render();
    queueMicrotask(() => this.root.querySelector<HTMLElement>('.input-settings-close')?.focus());
  }

  public close(restoreFocus = true): void {
    const wasOpen = this.isOpen;
    const focusTarget = this.returnFocus;
    this.stopCaptureSilently();
    this.pendingConflict = null;
    this.root.classList.remove('is-open');
    if (wasOpen && restoreFocus) queueMicrotask(() => focusTarget?.focus());
    this.returnFocus = null;
  }

  public destroy(): void {
    this.close(false);
    this.root.remove();
  }

  private render(): void {
    const preferences = this.input.preferences.snapshot();
    this.root.innerHTML = `
      <section class="rpg-panel input-settings-panel" aria-labelledby="input-settings-title">
        <header class="input-settings-head">
          <div>
            <div class="rpg-kicker input-settings-kicker">System</div>
            <h2 class="rpg-title" id="input-settings-title">Controls and Accessibility</h2>
          </div>
          <button class="rpg-button input-settings-close" type="button" aria-label="Close controls">Close</button>
        </header>

        <div class="input-settings-tabs" role="tablist" aria-label="Input device">
          <button type="button" role="tab" data-device="keyboard" aria-selected="${this.device === 'keyboard'}" class="${this.device === 'keyboard' ? 'is-on' : ''}">Keyboard</button>
          <button type="button" role="tab" data-device="gamepad" aria-selected="${this.device === 'gamepad'}" class="${this.device === 'gamepad' ? 'is-on' : ''}">Gamepad</button>
        </div>

        <div class="input-settings-body">
          <section class="input-bindings" aria-label="${this.device} bindings">
            <div class="input-section-title">BINDINGS</div>
            <p class="input-settings-help">Choose an action, then press the new ${this.device === 'keyboard' ? 'key' : 'gamepad button'}. Escape cancels capture.</p>
            ${ACTION_GROUPS.map(group => `
              <div class="input-binding-group">
                <h3>${group.title}</h3>
                ${group.actions.map(action => `
                  <div class="input-binding-row">
                    <span>${ACTION_LABELS[action]}</span>
                    <button class="input-bind-btn" type="button" data-action="${action}">${this.input.bindingLabel(action, this.device)}</button>
                  </div>
                `).join('')}
              </div>
            `).join('')}
          </section>

          <section class="input-accessibility" aria-label="Accessibility preferences">
            <div class="input-section-title">ACCESSIBILITY</div>
            ${this.toggleRow('Reduced motion', 'reducedMotion', preferences.reducedMotion, 'Shortens HUD animation and transitions.')}
            ${this.toggleRow('Screen shake', 'screenShake', preferences.screenShake, 'Disables camera shake without muting combat feedback.')}
            ${this.toggleRow('Screen flashes', 'screenFlashes', preferences.screenFlashes, 'Removes full-screen combat flashes.')}
            ${this.toggleRow('Vibration', 'vibration', preferences.vibration, 'Controls supported phone haptics.')}
            ${this.toggleRow('Large touch targets', 'largeTouchTargets', preferences.largeTouchTargets, 'Raises important controls to at least 56px.')}

            <label class="input-select-row">
              <span><b>Touch controls</b><small>Auto supports hybrid laptops; Always and Never override detection.</small></span>
              <select id="input-touch-mode">
                <option value="auto" ${preferences.touchControls === 'auto' ? 'selected' : ''}>Auto</option>
                <option value="always" ${preferences.touchControls === 'always' ? 'selected' : ''}>Always</option>
                <option value="never" ${preferences.touchControls === 'never' ? 'selected' : ''}>Never</option>
              </select>
            </label>

            <label class="input-range-row">
              <span><b>Gamepad deadzone</b><small>Raise this if a stick drifts while untouched.</small></span>
              <span class="input-range-control">
                <input id="input-deadzone" type="range" min="0.05" max="0.50" step="0.05" value="${preferences.gamepadDeadzone}" />
                <output id="input-deadzone-value">${preferences.gamepadDeadzone.toFixed(2)}</output>
              </span>
            </label>
          </section>
        </div>

        <footer class="input-settings-foot">
          <div class="input-settings-status" role="status" aria-live="polite">Bindings save automatically on this device.</div>
          <button class="rpg-button input-conflict-replace" type="button" style="display:none">Swap Binding</button>
          <button class="rpg-button input-reset-bindings" type="button">Reset ${this.device}</button>
        </footer>
      </section>`;

    this.bindEvents();
  }

  private toggleRow(
    label: string,
    key: keyof Pick<InputAccessibilityPreferences, 'reducedMotion' | 'screenShake' | 'screenFlashes' | 'vibration' | 'largeTouchTargets'>,
    value: boolean,
    description: string,
  ): string {
    return `<label class="input-toggle-row">
      <span><b>${label}</b><small>${description}</small></span>
      <input type="checkbox" data-preference="${key}" ${value ? 'checked' : ''} />
    </label>`;
  }

  private bindEvents(): void {
    this.root.querySelector('.input-settings-close')?.addEventListener('click', () => this.close());
    this.root.querySelectorAll<HTMLElement>('[data-device]').forEach(button => {
      button.addEventListener('click', () => {
        this.device = button.dataset.device === 'gamepad' ? 'gamepad' : 'keyboard';
        this.stopCaptureSilently();
        this.pendingConflict = null;
        this.render();
      });
    });

    this.root.querySelectorAll<HTMLElement>('.input-bind-btn').forEach(button => {
      button.addEventListener('click', () => {
        const action = button.dataset.action as InputAction;
        if (!INPUT_ACTIONS.includes(action)) return;
        this.stopCaptureSilently();
        this.pendingConflict = null;
        button.textContent = this.device === 'keyboard' ? 'PRESS A KEY...' : 'PRESS A BUTTON...';
        this.setStatus(`Waiting for a ${this.device === 'keyboard' ? 'key' : 'gamepad button'} for ${ACTION_LABELS[action]}.`);
        this.cancelCapture = this.input.beginRemap(this.device, action, result => this.finishRemap(result));
      });
    });

    this.root.querySelector('.input-conflict-replace')?.addEventListener('click', () => {
      const pending = this.pendingConflict;
      if (!pending || pending.binding === null) return;
      const result = pending.device === 'keyboard'
        ? this.input.remap('keyboard', pending.action, String(pending.binding), 'replace')
        : this.input.remap('gamepad', pending.action, Number(pending.binding), 'replace');
      this.pendingConflict = null;
      this.setStatus(result.ok ? 'Binding swapped and saved.' : 'That binding could not be changed.');
      this.options.onBindingsChanged?.();
      this.render();
    });

    this.root.querySelector('.input-reset-bindings')?.addEventListener('click', () => {
      this.input.resetBindings(this.device);
      this.pendingConflict = null;
      this.options.onBindingsChanged?.();
      this.render();
      this.setStatus(`${this.device === 'keyboard' ? 'Keyboard' : 'Gamepad'} defaults restored.`);
    });

    this.root.querySelectorAll<HTMLInputElement>('[data-preference]').forEach(control => {
      control.addEventListener('change', () => {
        const key = control.dataset.preference as 'reducedMotion' | 'screenShake' | 'screenFlashes' | 'vibration' | 'largeTouchTargets';
        this.updatePreferences({ [key]: control.checked });
      });
    });

    this.root.querySelector<HTMLSelectElement>('#input-touch-mode')?.addEventListener('change', event => {
      const value = (event.currentTarget as HTMLSelectElement).value as InputAccessibilityPreferences['touchControls'];
      this.updatePreferences({ touchControls: value });
    });

    this.root.querySelector<HTMLInputElement>('#input-deadzone')?.addEventListener('input', event => {
      const value = Number((event.currentTarget as HTMLInputElement).value);
      const output = this.root.querySelector<HTMLOutputElement>('#input-deadzone-value');
      if (output) output.value = value.toFixed(2);
      this.updatePreferences({ gamepadDeadzone: value });
    });
  }

  private finishRemap(capture: RemapCaptureResult): void {
    this.cancelCapture = null;
    if (capture.cancelled) {
      if (this.suppressCancelledRender) return;
      this.render();
      this.setStatus('Binding change cancelled.');
      return;
    }
    if (capture.result?.ok) {
      this.options.onBindingsChanged?.();
      this.render();
      this.setStatus(`${ACTION_LABELS[capture.action]} updated and saved.`);
      return;
    }
    this.pendingConflict = capture;
    this.render();
    const conflict = capture.result?.conflictWith;
    this.setStatus(`${this.bindingText(capture.binding)} is already used by ${conflict ? ACTION_LABELS[conflict] : 'another action'}. Swap the two bindings?`);
    const replace = this.root.querySelector<HTMLElement>('.input-conflict-replace');
    if (replace) replace.style.display = 'inline-flex';
  }

  private updatePreferences(patch: Partial<InputAccessibilityPreferences>): void {
    const value = this.input.setAccessibility(patch, this.parent);
    applyRpgUiPreferences(value);
    this.options.onPreferencesChanged?.(value);
  }

  private stopCaptureSilently(): void {
    const cancel = this.cancelCapture;
    this.cancelCapture = null;
    if (!cancel) return;
    this.suppressCancelledRender = true;
    cancel();
    this.suppressCancelledRender = false;
  }

  private setStatus(message: string): void {
    const status = this.root.querySelector('.input-settings-status');
    if (status) status.textContent = message;
  }

  private bindingText(binding: string | number | null): string {
    if (binding === null) return 'That input';
    return typeof binding === 'number' ? `Button ${binding}` : binding;
  }

  private trapFocus(event: KeyboardEvent): void {
    if (!this.isOpen || event.code !== 'Tab') return;
    const focusable = [...this.root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]',
    )].filter(element => element.offsetParent !== null);
    if (!focusable.length) return;
    const current = focusable.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey
      ? (current <= 0 ? focusable.length - 1 : current - 1)
      : (current < 0 || current === focusable.length - 1 ? 0 : current + 1);
    event.preventDefault();
    focusable[next].focus();
  }

  private injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .input-settings-back {
        position: fixed; inset: 0; z-index: 190; display: none;
        align-items: center; justify-content: center; padding: 16px;
        background: rgba(5, 4, 10, .88); color: #f7ecd1;
        font-family: 'Outfit', 'Inter', sans-serif; pointer-events: auto;
      }
      .input-settings-back.is-open { display: flex; }
      .input-settings-panel {
        width: min(900px, 96vw); max-height: min(90dvh, 760px); overflow: hidden;
        display: flex; flex-direction: column;
        background: linear-gradient(rgba(16,21,29,.96),rgba(8,11,16,.99));
        border: 16px solid transparent;
        border-image: url('/assets/runtime/ui/fantasy-borders/default-panel/panel-000.png') 16 / 16px / 0 stretch;
        image-rendering: pixelated; box-shadow: 0 20px 70px #000;
      }
      .input-settings-head { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 12px; border-bottom:1px solid rgba(231,189,85,.25); }
      .input-settings-head h2 { margin:0; }
      .input-settings-kicker, .input-section-title { color:var(--rpg-gold); font-size:10px; font-weight:900; letter-spacing:1.8px; }
      .input-settings-close, .input-settings-tabs button, .input-bind-btn, .input-reset-bindings, .input-conflict-replace {
        min-height:44px; border:1px solid #8c6533; border-radius:5px; padding:8px 12px;
        background:linear-gradient(#34303a,#181821); color:var(--rpg-paper); font-weight:900; cursor:pointer;
      }
      .input-settings-tabs { display:flex; gap:8px; padding:10px 18px 0; }
      .input-settings-tabs button { flex:1; }
      .input-settings-tabs button.is-on { background:rgba(231,189,85,.16); border-color:var(--rpg-gold); color:var(--rpg-gold-bright); }
      .input-settings-body { display:grid; grid-template-columns:minmax(300px,1.1fr) minmax(280px,.9fr); gap:14px; padding:14px 18px; min-height:0; overflow:auto; }
      .input-bindings, .input-accessibility { min-width:0; }
      .input-settings-help { margin:5px 0 12px; color:#bda987; font-size:12px; }
      .input-binding-group { margin:10px 0; padding:8px; background:rgba(0,0,0,.28); border:1px solid rgba(231,189,85,.12); border-radius:5px; }
      .input-binding-group h3 { margin:0 0 5px; color:#d6c39c; font-size:11px; text-transform:uppercase; letter-spacing:1px; }
      .input-binding-row, .input-toggle-row, .input-select-row, .input-range-row { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:48px; border-top:1px solid rgba(255,255,255,.07); }
      .input-binding-row:first-of-type { border-top:0; }
      .input-bind-btn { min-width:108px; min-height:36px; padding:5px 9px; color:#ffe089; }
      .input-toggle-row small, .input-select-row small, .input-range-row small { display:block; max-width:280px; margin-top:2px; color:#a99a80; font-size:10.5px; font-weight:400; }
      .input-toggle-row input { width:22px; height:22px; accent-color:#d99a38; }
      .input-select-row select { min-height:44px; background:#090c11; color:var(--rpg-paper); border:1px solid rgba(231,189,85,.4); border-radius:4px; padding:6px; }
      .input-range-control { display:flex; align-items:center; gap:8px; }
      .input-range-control input { width:120px; accent-color:#d99a38; }
      .input-range-control output { min-width:34px; color:#ffe089; font-weight:900; }
      .input-settings-foot { display:flex; align-items:center; gap:10px; padding:11px 18px; border-top:1px solid #7e5c2f; }
      .input-settings-status { flex:1; min-width:0; color:#c8b48d; font-size:11px; }
      .input-conflict-replace { border-color:#e8b04d; color:#ffe089; }
      .input-settings-panel :focus-visible { outline:3px solid #fff09b; outline-offset:2px; }
      .input-reduced-motion .input-settings-panel * { animation-duration:.001ms !important; transition-duration:.001ms !important; }
      @media (pointer:coarse) {
        .input-settings-close, .input-settings-tabs button, .input-bind-btn, .input-reset-bindings, .input-conflict-replace, .input-select-row select { min-height:48px; }
      }
      @media (max-width:720px) {
        .input-settings-back { padding:6px; }
        .input-settings-panel { max-height:96dvh; }
        .input-settings-body { grid-template-columns:1fr; padding:10px; }
        .input-settings-head { padding:10px; }
        .input-settings-tabs { padding:8px 10px 0; }
        .input-settings-foot { flex-wrap:wrap; padding:9px 10px; }
        .input-settings-status { flex-basis:100%; }
      }
    `;
    document.head.appendChild(style);
  }
}
