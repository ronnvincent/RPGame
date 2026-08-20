import { InputAction } from './InputActions';
import { InputBindingStore } from './InputBindings';
import { InputRouter } from './InputRouter';

export interface GamepadButtonLike {
  pressed: boolean;
  value?: number;
}

export interface GamepadLike {
  index: number;
  connected: boolean;
  axes: readonly number[];
  buttons: readonly GamepadButtonLike[];
  id?: string;
}

export function applyDeadzone(value: number, deadzone = 0.2): number {
  if (!Number.isFinite(value)) return 0;
  const size = Math.max(0, Math.min(0.95, deadzone));
  const magnitude = Math.abs(value);
  if (magnitude <= size) return 0;
  return Math.sign(value) * Math.min(1, (magnitude - size) / (1 - size));
}

/** Transition-based polling adapter for the browser Gamepad API. */
export class GamepadInput {
  private activeIndex: number | null = null;
  private pressedButtons = new Map<number, InputAction[]>();

  constructor(
    private readonly router: InputRouter,
    private readonly bindings: InputBindingStore,
    private deadzone = 0.2,
  ) {}

  public get connectedIndex(): number | null {
    return this.activeIndex;
  }

  public setDeadzone(value: number): void {
    this.deadzone = Math.max(0, Math.min(0.95, value));
  }

  public update(gamepads: readonly (GamepadLike | null | undefined)[]): void {
    let pad = this.activeIndex === null ? null : gamepads[this.activeIndex];
    if (!pad?.connected) pad = gamepads.find(candidate => Boolean(candidate?.connected)) || null;

    if (!pad) {
      this.disconnect();
      return;
    }
    if (this.activeIndex !== pad.index) {
      this.disconnect();
      this.activeIndex = pad.index;
    }

    const prefix = `gamepad:${pad.index}`;
    this.router.setAxis(`${prefix}:axis0`, applyDeadzone(pad.axes[0] || 0, this.deadzone));

    const previouslySeenLength = Math.max(0, ...[...this.pressedButtons.keys()].map(button => button + 1));
    const maxButton = Math.max(pad.buttons.length, previouslySeenLength);
    for (let button = 0; button < maxButton; button++) {
      const state = pad.buttons[button];
      const pressed = Boolean(state?.pressed || (state?.value || 0) >= 0.5);
      const previousActions = this.pressedButtons.get(button);
      const token = `${prefix}:button${button}`;

      if (pressed && !previousActions) {
        const actions = this.bindings.actionsForGamepad(button, this.router.getContext());
        const accepted = actions.filter(action => this.router.press(action, 'gamepad', token));
        if (accepted.length) this.pressedButtons.set(button, accepted);
      } else if (!pressed && previousActions) {
        for (const action of previousActions) this.router.release(action, 'gamepad', token);
        this.pressedButtons.delete(button);
      }
    }
  }

  public disconnect(index?: number): void {
    if (index !== undefined && this.activeIndex !== index) return;
    if (this.activeIndex !== null) {
      const prefix = `gamepad:${this.activeIndex}`;
      for (const [button, actions] of this.pressedButtons) {
        const token = `${prefix}:button${button}`;
        for (const action of actions) this.router.release(action, 'gamepad', token);
      }
      this.router.releaseSource('gamepad', prefix);
    }
    this.pressedButtons.clear();
    this.activeIndex = null;
  }
}
