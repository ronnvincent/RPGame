import {
  INPUT_ACTIONS,
  InputAction,
  InputContext,
  InputDevice,
  actionAllowed,
  actionsOverlap,
} from './InputActions';

export interface InputBindingMap {
  keyboard: Record<InputAction, string[]>;
  gamepad: Record<InputAction, number[]>;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export type ConflictPolicy = 'reject' | 'replace';

export interface RemapResult {
  ok: boolean;
  conflictWith: InputAction | null;
}

export const INPUT_BINDINGS_STORAGE_KEY = 'rpg.input.bindings.v1';
const REQUIRED_EXIT_ACTIONS: ReadonlySet<InputAction> = new Set(['menuToggle', 'menuCancel', 'chatCancel']);

function emptyKeyboard(): Record<InputAction, string[]> {
  return Object.fromEntries(INPUT_ACTIONS.map(action => [action, [] as string[]])) as unknown as Record<InputAction, string[]>;
}

function emptyGamepad(): Record<InputAction, number[]> {
  return Object.fromEntries(INPUT_ACTIONS.map(action => [action, [] as number[]])) as unknown as Record<InputAction, number[]>;
}

export function createDefaultBindings(): InputBindingMap {
  const keyboard = emptyKeyboard();
  Object.assign(keyboard, {
    moveLeft: ['KeyA', 'ArrowLeft'],
    moveRight: ['KeyD', 'ArrowRight'],
    moveDown: ['KeyS', 'ArrowDown'],
    jump: ['Space', 'KeyW', 'ArrowUp'],
    dash: ['ShiftLeft', 'ShiftRight', 'KeyC'],
    interact: ['KeyE'],
    quickHeal: ['KeyQ'],
    skill1: ['Digit1'],
    skill2: ['Digit2'],
    skill3: ['Digit3', 'KeyR'],
    skill4: ['Digit4', 'KeyF'],
    skill5: ['Digit5', 'KeyZ'],
    skill6: ['Digit6', 'KeyX'],
    questLog: ['KeyJ'],
    worldMap: ['KeyM'],
    returnTown: ['KeyT'],
    menuToggle: ['Escape'],
    menuConfirm: ['Enter', 'Space', 'KeyE'],
    menuCancel: ['Escape'],
    menuUp: ['ArrowUp', 'KeyW'],
    menuDown: ['ArrowDown', 'KeyS'],
    menuLeft: ['ArrowLeft', 'KeyA'],
    menuRight: ['ArrowRight', 'KeyD'],
    chatToggle: ['KeyY'],
    chatSubmit: ['Enter'],
    chatCancel: ['Escape'],
  } satisfies Partial<Record<InputAction, string[]>>);

  const gamepad = emptyGamepad();
  Object.assign(gamepad, {
    moveLeft: [14],
    moveRight: [15],
    moveDown: [13],
    jump: [0],
    dash: [1],
    basicAttack: [2],
    interact: [3],
    skill1: [4],
    skill2: [5],
    skill3: [6],
    skill4: [7],
    skill5: [10],
    skill6: [11],
    quickHeal: [12],
    menuToggle: [9],
    menuConfirm: [0],
    menuCancel: [1, 9],
    menuUp: [12],
    menuDown: [13],
    menuLeft: [14],
    menuRight: [15],
    chatSubmit: [0],
    chatCancel: [1],
  } satisfies Partial<Record<InputAction, number[]>>);

  return { keyboard, gamepad };
}

function cloneBindings(bindings: InputBindingMap): InputBindingMap {
  return {
    keyboard: Object.fromEntries(INPUT_ACTIONS.map(action => [action, [...bindings.keyboard[action]]])) as Record<InputAction, string[]>,
    gamepad: Object.fromEntries(INPUT_ACTIONS.map(action => [action, [...bindings.gamepad[action]]])) as Record<InputAction, number[]>,
  };
}

function isKeyboardBinding(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 32
    && /^[A-Za-z0-9]+$/.test(value)
    && /^(Key|Digit|Arrow|Numpad|F\d|Space|Enter|Escape|Shift|Control|Alt|Tab|Backspace|Delete|Home|End|Page|Bracket|Semicolon|Quote|Comma|Period|Slash|Backslash|Minus|Equal|Backquote)/.test(value);
}

function isGamepadBinding(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 31;
}

function mergePersisted(defaults: InputBindingMap, raw: unknown): InputBindingMap {
  const result = cloneBindings(defaults);
  if (!raw || typeof raw !== 'object') return result;
  const saved = raw as Partial<InputBindingMap>;

  for (const action of INPUT_ACTIONS) {
    const keys = saved.keyboard?.[action];
    if (Array.isArray(keys)) {
      const valid = [...new Set(keys.filter(isKeyboardBinding))];
      if (valid.length > 0 || (keys.length === 0 && !REQUIRED_EXIT_ACTIONS.has(action))) result.keyboard[action] = valid;
    }
    const buttons = saved.gamepad?.[action];
    if (Array.isArray(buttons)) {
      const valid = [...new Set(buttons.filter(isGamepadBinding))];
      if (valid.length > 0 || (buttons.length === 0 && !REQUIRED_EXIT_ACTIONS.has(action))) result.gamepad[action] = valid;
    }
  }
  return result;
}

/** Versioned, defensive local persistence for keyboard and gamepad mappings. */
export class InputBindingStore {
  private bindings: InputBindingMap;
  private readonly defaults: InputBindingMap;

  constructor(
    private readonly storage?: StorageLike | null,
    private readonly storageKey = INPUT_BINDINGS_STORAGE_KEY,
  ) {
    this.defaults = createDefaultBindings();
    this.bindings = this.load();
  }

  private load(): InputBindingMap {
    if (!this.storage) return cloneBindings(this.defaults);
    try {
      const value = this.storage.getItem(this.storageKey);
      if (!value) return cloneBindings(this.defaults);
      const parsed = JSON.parse(value) as { version?: number; bindings?: unknown };
      if (parsed?.version !== 1) return cloneBindings(this.defaults);
      return mergePersisted(this.defaults, parsed.bindings);
    } catch {
      return cloneBindings(this.defaults);
    }
  }

  private persist(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(this.storageKey, JSON.stringify({ version: 1, bindings: this.bindings }));
    } catch {
      // Storage can be unavailable in private mode. Controls still work for
      // this session, so persistence failure must never stop the game.
    }
  }

  public snapshot(): InputBindingMap {
    return cloneBindings(this.bindings);
  }

  public bindingsFor(device: 'keyboard', action: InputAction): string[];
  public bindingsFor(device: 'gamepad', action: InputAction): number[];
  public bindingsFor(device: InputDevice, action: InputAction): Array<string | number> {
    return [...this.bindings[device][action]];
  }

  public actionsForKeyboard(code: string, context: InputContext): InputAction[] {
    return INPUT_ACTIONS.filter(action => actionAllowed(action, context) && this.bindings.keyboard[action].includes(code));
  }

  public actionsForGamepad(button: number, context: InputContext): InputAction[] {
    return INPUT_ACTIONS.filter(action => actionAllowed(action, context) && this.bindings.gamepad[action].includes(button));
  }

  public remap(device: 'keyboard', action: InputAction, binding: string, policy?: ConflictPolicy): RemapResult;
  public remap(device: 'gamepad', action: InputAction, binding: number, policy?: ConflictPolicy): RemapResult;
  public remap(
    device: InputDevice,
    action: InputAction,
    binding: string | number,
    policy: ConflictPolicy = 'reject',
  ): RemapResult {
    const valid = device === 'keyboard' ? isKeyboardBinding(binding) : isGamepadBinding(binding);
    if (!valid) return { ok: false, conflictWith: null };

    const conflict = INPUT_ACTIONS.find(other => other !== action
      && actionsOverlap(action, other)
      && (this.bindings[device][other] as Array<string | number>).includes(binding));
    if (conflict && policy === 'reject') return { ok: false, conflictWith: conflict };

    if (conflict) {
      const previous = this.bindings[device][action] as Array<string | number>;
      this.bindings[device][conflict] = previous.filter(value => value !== binding) as never;
    }
    this.bindings[device][action] = [binding] as never;
    this.persist();
    return { ok: true, conflictWith: conflict || null };
  }

  public reset(device?: InputDevice): void {
    if (device) {
      this.bindings[device] = cloneBindings(this.defaults)[device] as never;
    } else {
      this.bindings = cloneBindings(this.defaults);
    }
    this.persist();
  }

  public label(action: InputAction, device: InputDevice = 'keyboard'): string {
    if (device === 'gamepad') {
      const button = this.bindings.gamepad[action][0];
      return button === undefined ? 'Unbound' : gamepadButtonLabel(button);
    }
    const code = this.bindings.keyboard[action][0];
    return code ? keyboardCodeLabel(code) : 'Unbound';
  }
}

export function keyboardCodeLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return code.slice(5);
  return ({ Space: 'SPACE', Enter: 'ENTER', Escape: 'ESC', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT' } as Record<string, string>)[code] || code;
}

export function gamepadButtonLabel(button: number): string {
  return ({
    0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
    8: 'BACK', 9: 'START', 10: 'LS', 11: 'RS', 12: 'D-UP', 13: 'D-DOWN',
    14: 'D-LEFT', 15: 'D-RIGHT', 16: 'HOME',
  } as Record<number, string>)[button] || `B${button}`;
}
