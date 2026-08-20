import { InputAction, InputContext, InputDevice, InputSource } from './InputActions';
import { ConflictPolicy, InputBindingStore, RemapResult, StorageLike } from './InputBindings';
import { GamepadInput, GamepadLike } from './GamepadInput';
import { InputAccessibilityPreferences, InputPreferenceStore } from './InputPreferences';
import { InputActionEvent, InputActionListener, InputRouter } from './InputRouter';
import { PointerBindingOptions, PointerGestureGate, bindPointerAction } from './PointerInput';

export interface InputControllerOptions {
  storage?: StorageLike | null;
  context?: () => InputContext;
  onAction?: InputActionListener;
  reducedMotionDefault?: boolean;
  deadzone?: number;
}

export interface RemapCaptureResult {
  device: InputDevice;
  action: InputAction;
  binding: string | number | null;
  cancelled: boolean;
  result: RemapResult | null;
}

type RemapCapture = {
  device: InputDevice;
  action: InputAction;
  callback: (result: RemapCaptureResult) => void;
};

function isTextEntry(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName?.toLowerCase();
  if (tag === 'textarea' || element.isContentEditable) return true;
  if (tag !== 'input') return false;
  const type = ((element as HTMLInputElement).type || 'text').toLowerCase();
  return ['text', 'search', 'email', 'password', 'url', 'tel', 'number'].includes(type);
}

function isInteractiveElement(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element?.closest) return false;
  return Boolean(element.closest('button, a, input, textarea, select, [role="button"], [contenteditable="true"]'));
}

/** Browser-facing facade around the pure bindings/router/gamepad pieces. */
export class InputController {
  public readonly router = new InputRouter();
  public readonly bindings: InputBindingStore;
  public readonly preferences: InputPreferenceStore;
  public readonly gamepad: GamepadInput;
  public readonly pointerGate = new PointerGestureGate();

  private started = false;
  private eventTarget: Window | null = null;
  private readonly actionsByKey = new Map<string, InputAction[]>();
  private unsubscribeAction: (() => void) | null = null;
  private capture: RemapCapture | null = null;
  private captureGamepadBaseline = new Set<string>();
  private suppressedGamepadButtons = new Set<string>();
  private lastGamepads: readonly (GamepadLike | null | undefined)[] = [];

  constructor(private readonly options: InputControllerOptions = {}) {
    this.bindings = new InputBindingStore(options.storage);
    this.preferences = new InputPreferenceStore(options.storage, options.reducedMotionDefault);
    this.gamepad = new GamepadInput(
      this.router,
      this.bindings,
      options.deadzone ?? this.preferences.snapshot().gamepadDeadzone,
    );
    if (options.onAction) this.unsubscribeAction = this.router.subscribe(options.onAction);
  }

  public start(target: Window = window): void {
    if (this.started) return;
    this.started = true;
    this.eventTarget = target;
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
    target.addEventListener('focusin', this.onFocusChanged);
    target.addEventListener('focusout', this.onFocusChanged);
    target.addEventListener('gamepaddisconnected', this.onGamepadDisconnected);
    this.refreshContext();
  }

  public stop(): void {
    const target = this.eventTarget;
    if (target) {
      target.removeEventListener('keydown', this.onKeyDown);
      target.removeEventListener('keyup', this.onKeyUp);
      target.removeEventListener('blur', this.onBlur);
      target.removeEventListener('focusin', this.onFocusChanged);
      target.removeEventListener('focusout', this.onFocusChanged);
      target.removeEventListener('gamepaddisconnected', this.onGamepadDisconnected);
    }
    this.router.clear();
    this.gamepad.disconnect();
    this.cancelRemap();
    this.actionsByKey.clear();
    this.eventTarget = null;
    this.started = false;
  }

  public dispose(): void {
    this.stop();
    this.unsubscribeAction?.();
    this.unsubscribeAction = null;
  }

  public setContext(context: InputContext): void {
    this.router.setContext(context);
  }

  public refreshContext(activeElement?: Element | null): InputContext {
    const focused = activeElement ?? (typeof document !== 'undefined' ? document.activeElement : null);
    const context = isTextEntry(focused) ? 'chat' : (this.options.context?.() || 'gameplay');
    this.router.setContext(context);
    return context;
  }

  public pollGamepads(gamepads?: readonly (GamepadLike | null | undefined)[]): void {
    const snapshots = gamepads || (typeof navigator !== 'undefined' && navigator.getGamepads
      ? Array.from(navigator.getGamepads())
      : []);
    this.lastGamepads = snapshots;

    if (this.capture?.device === 'gamepad') {
      const currentlyPressed = this.pressedGamepadButtons(snapshots);
      for (const token of [...this.captureGamepadBaseline]) {
        if (!currentlyPressed.has(token)) this.captureGamepadBaseline.delete(token);
      }
      const candidate = [...currentlyPressed].find(token => !this.captureGamepadBaseline.has(token));
      if (candidate) {
        const button = Number(candidate.slice(candidate.lastIndexOf(':') + 1));
        this.suppressedGamepadButtons.add(candidate);
        this.finishCapture(button);
      }
      return;
    }

    this.gamepad.update(this.maskSuppressedButtons(snapshots));
  }

  public press(action: InputAction, source: InputSource, token: string): boolean {
    return this.router.press(action, source, token);
  }

  public release(action: InputAction, source: InputSource, token: string): boolean {
    return this.router.release(action, source, token);
  }

  public tap(action: InputAction, source: InputSource = 'ui', token = `ui:${action}:${Date.now()}`): boolean {
    return this.router.tap(action, source, token);
  }

  public bindElement(element: HTMLElement, action: InputAction, options: PointerBindingOptions = {}): () => void {
    return bindPointerAction(element, action, this.router, this.pointerGate, options, duration => this.vibrate(duration));
  }

  public remap(device: 'keyboard', action: InputAction, binding: string, policy?: ConflictPolicy): RemapResult;
  public remap(device: 'gamepad', action: InputAction, binding: number, policy?: ConflictPolicy): RemapResult;
  public remap(device: InputDevice, action: InputAction, binding: string | number, policy: ConflictPolicy = 'reject'): RemapResult {
    this.router.releaseSource(device);
    this.actionsByKey.clear();
    return device === 'keyboard'
      ? this.bindings.remap(device, action, binding as string, policy)
      : this.bindings.remap(device, action, binding as number, policy);
  }

  public resetBindings(device?: InputDevice): void {
    this.router.clear();
    this.gamepad.disconnect();
    this.actionsByKey.clear();
    this.bindings.reset(device);
  }

  /** Capture the next physical key/button without allowing it into gameplay. */
  public beginRemap(
    device: InputDevice,
    action: InputAction,
    callback: (result: RemapCaptureResult) => void,
  ): () => void {
    this.cancelRemap();
    const capture = { device, action, callback };
    this.capture = capture;
    if (device === 'keyboard') {
      this.router.releaseSource('keyboard');
      this.actionsByKey.clear();
    } else {
      this.gamepad.disconnect();
      this.captureGamepadBaseline = this.pressedGamepadButtons(this.lastGamepads);
    }
    return () => {
      if (this.capture === capture) this.cancelRemap();
    };
  }

  public cancelRemap(): void {
    const capture = this.capture;
    if (!capture) return;
    this.capture = null;
    this.captureGamepadBaseline.clear();
    capture.callback({
      device: capture.device,
      action: capture.action,
      binding: null,
      cancelled: true,
      result: null,
    });
  }

  public bindingLabel(action: InputAction, device: InputDevice = 'keyboard'): string {
    return this.bindings.label(action, device);
  }

  public setAccessibility(patch: Partial<InputAccessibilityPreferences>, root?: HTMLElement): InputAccessibilityPreferences {
    const value = this.preferences.update(patch);
    this.gamepad.setDeadzone(value.gamepadDeadzone);
    if (root) this.preferences.apply(root);
    return value;
  }

  public applyAccessibility(root: HTMLElement): void {
    this.preferences.apply(root);
  }

  public vibrate(duration = 8): void {
    if (!this.preferences.snapshot().vibration) return;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(duration);
    } catch {
      // Haptics are optional and frequently disabled by the browser/OS.
    }
  }

  private onKeyDown = (event: KeyboardEvent) => {
    this.refreshContext(event.target as Element | null);

    if (this.capture?.device === 'keyboard') {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.code === 'Escape') this.cancelRemap();
      else this.finishCapture(event.code);
      return;
    }

    // Enter/Space already activate native and semantic buttons. Other keys,
    // especially Escape and menu arrows, must still reach the shared router.
    if (isInteractiveElement(event.target) && !isTextEntry(event.target)
      && (event.code === 'Enter' || event.code === 'Space')) return;

    const actions = this.bindings.actionsForKeyboard(event.code, this.router.getContext());
    if (!actions.length) return;
    if (!isTextEntry(event.target)) event.preventDefault();

    const accepted: InputAction[] = [];
    for (const action of actions) {
      if (this.router.press(action, 'keyboard', `keyboard:${event.code}`, event.repeat)) accepted.push(action);
    }
    if (accepted.length) this.actionsByKey.set(event.code, accepted);
  };

  private onKeyUp = (event: KeyboardEvent) => {
    const actions = this.actionsByKey.get(event.code) || [];
    for (const action of actions) this.router.release(action, 'keyboard', `keyboard:${event.code}`);
    this.actionsByKey.delete(event.code);
  };

  private onBlur = () => {
    this.router.releaseSource('keyboard');
    this.router.releaseSource('pointer');
    this.router.releaseSource('touch');
    this.actionsByKey.clear();
  };

  private onFocusChanged = (event: FocusEvent) => {
    // On focusin, relatedTarget is the element that LOST focus. Resolve the
    // post-event active element in a microtask or typing can cast/move.
    void event;
    queueMicrotask(() => this.refreshContext());
  };

  private onGamepadDisconnected = (event: GamepadEvent) => this.gamepad.disconnect(event.gamepad.index);

  private finishCapture(binding: string | number): void {
    const capture = this.capture;
    if (!capture) return;
    this.capture = null;
    this.captureGamepadBaseline.clear();
    const result = capture.device === 'keyboard'
      ? this.bindings.remap('keyboard', capture.action, String(binding), 'reject')
      : this.bindings.remap('gamepad', capture.action, Number(binding), 'reject');
    capture.callback({
      device: capture.device,
      action: capture.action,
      binding,
      cancelled: false,
      result,
    });
  }

  private pressedGamepadButtons(gamepads: readonly (GamepadLike | null | undefined)[]): Set<string> {
    const pressed = new Set<string>();
    for (const pad of gamepads) {
      if (!pad?.connected) continue;
      pad.buttons.forEach((button, index) => {
        if (button.pressed || (button.value || 0) >= 0.5) pressed.add(`${pad.index}:${index}`);
      });
    }
    return pressed;
  }

  private maskSuppressedButtons(
    gamepads: readonly (GamepadLike | null | undefined)[],
  ): readonly (GamepadLike | null | undefined)[] {
    if (!this.suppressedGamepadButtons.size) return gamepads;
    return gamepads.map(pad => {
      if (!pad?.connected) return pad;
      let changed = false;
      const buttons = pad.buttons.map((button, index) => {
        const token = `${pad.index}:${index}`;
        if (!this.suppressedGamepadButtons.has(token)) return button;
        if (!button.pressed && (button.value || 0) < 0.5) {
          this.suppressedGamepadButtons.delete(token);
          return button;
        }
        changed = true;
        return { pressed: false, value: 0 };
      });
      return changed ? { ...pad, buttons } : pad;
    });
  }
}

export type { InputActionEvent };
