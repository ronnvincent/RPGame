import {
  CONTINUOUS_ACTIONS,
  GAMEPLAY_ACTIONS,
  InputAction,
  InputContext,
  InputSource,
  REPEATABLE_ACTIONS,
  actionAllowed,
} from './InputActions';

export type InputPhase = 'pressed' | 'released';

export interface InputActionEvent {
  action: InputAction;
  phase: InputPhase;
  source: InputSource;
  token: string;
  context: InputContext;
  repeat: boolean;
}

export type InputActionListener = (event: InputActionEvent) => void;

/**
 * State and context gate shared by every physical input source.
 * A token identifies one physical control, so releasing A cannot cancel a
 * still-held ArrowLeft (both happen to mean moveLeft).
 */
export class InputRouter {
  private context: InputContext = 'gameplay';
  private held = new Map<InputAction, Map<string, InputSource>>();
  private axes = new Map<string, number>();
  private listeners = new Set<InputActionListener>();

  public getContext(): InputContext {
    return this.context;
  }

  public setContext(context: InputContext): void {
    if (context === this.context) return;
    this.context = context;
    this.releaseBlockedState();
  }

  public subscribe(listener: InputActionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public accepts(action: InputAction, context = this.context): boolean {
    return actionAllowed(action, context);
  }

  public press(
    action: InputAction,
    source: InputSource,
    token: string,
    repeat = false,
  ): boolean {
    if (!this.accepts(action)) return false;
    let tokens = this.held.get(action);
    if (!tokens) {
      tokens = new Map();
      this.held.set(action, tokens);
    }
    const alreadyHeld = tokens.has(token);
    if (alreadyHeld && !(repeat && REPEATABLE_ACTIONS.has(action))) return false;
    if (!alreadyHeld) tokens.set(token, source);
    this.emit({ action, phase: 'pressed', source, token, context: this.context, repeat: alreadyHeld || repeat });
    return true;
  }

  public release(action: InputAction, source: InputSource, token: string): boolean {
    const tokens = this.held.get(action);
    if (!tokens?.delete(token)) return false;
    if (tokens.size === 0) this.held.delete(action);
    this.emit({ action, phase: 'released', source, token, context: this.context, repeat: false });
    return true;
  }

  public tap(action: InputAction, source: InputSource, token: string): boolean {
    if (!this.press(action, source, token)) return false;
    this.release(action, source, token);
    return true;
  }

  public isHeld(action: InputAction): boolean {
    return Boolean(this.held.get(action)?.size);
  }

  public setAxis(sourceToken: string, value: number): void {
    const next = this.context === 'gameplay'
      ? Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0))
      : 0;
    if (Math.abs(next) < 0.001) this.axes.delete(sourceToken);
    else this.axes.set(sourceToken, next);
  }

  public moveAxis(): number {
    if (this.context !== 'gameplay') return 0;
    let value = 0;
    for (const axis of this.axes.values()) value += axis;
    if (this.isHeld('moveLeft')) value -= 1;
    if (this.isHeld('moveRight')) value += 1;
    return Math.max(-1, Math.min(1, value));
  }

  public releaseSource(source: InputSource, tokenPrefix?: string): void {
    for (const [action, tokens] of [...this.held]) {
      for (const [token, tokenSource] of [...tokens]) {
        if (tokenSource === source && (!tokenPrefix || token.startsWith(tokenPrefix))) {
          this.release(action, tokenSource, token);
        }
      }
    }
    const axisPrefix = tokenPrefix || `${source}:`;
    for (const token of [...this.axes.keys()]) {
      if (token.startsWith(axisPrefix)) this.axes.delete(token);
    }
  }

  public clear(): void {
    for (const [action, tokens] of [...this.held]) {
      for (const [token, source] of [...tokens]) this.release(action, source, token);
    }
    this.axes.clear();
  }

  private releaseBlockedState(): void {
    for (const [action, tokens] of [...this.held]) {
      if (actionAllowed(action, this.context)) continue;
      for (const [token, source] of [...tokens]) this.release(action, source, token);
    }
    if (this.context !== 'gameplay') this.axes.clear();
  }

  private emit(event: InputActionEvent): void {
    // Releases are observable even after a context switch, which lets held UI
    // affordances clean themselves up. Presses have already passed the gate.
    if (event.phase === 'pressed' && !actionAllowed(event.action, event.context)) return;
    for (const listener of this.listeners) listener(event);
  }
}

export function isContinuousAction(action: InputAction): boolean {
  return CONTINUOUS_ACTIONS.has(action);
}

export function isGameplayAction(action: InputAction): boolean {
  return GAMEPLAY_ACTIONS.has(action);
}
