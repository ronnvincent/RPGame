import { InputAction, InputSource } from './InputActions';
import { InputRouter } from './InputRouter';

/** Suppresses the compatibility click browsers emit after a pointer gesture. */
export class PointerGestureGate {
  private recent = new Map<InputAction, { pointerId: number; at: number }>();

  constructor(private readonly ghostClickWindowMs = 700) {}

  public pointerDown(action: InputAction, pointerId: number, now = Date.now()): boolean {
    const last = this.recent.get(action);
    if (last && last.pointerId === pointerId && now - last.at < 24) return false;
    this.recent.set(action, { pointerId, at: now });
    return true;
  }

  public click(action: InputAction, detail: number, now = Date.now()): boolean {
    // A keyboard-initiated HTMLElement.click has detail 0 and must remain
    // available to screen-reader and keyboard users.
    if (detail === 0) return true;
    const last = this.recent.get(action);
    return !last || now - last.at > this.ghostClickWindowMs;
  }

  public clear(): void {
    this.recent.clear();
  }
}

export interface PointerBindingOptions {
  hold?: boolean;
  pointerTypes?: Array<'mouse' | 'pen' | 'touch'>;
  mouseButton?: number;
  vibrateMs?: number;
  beforePress?: () => void;
}

/**
 * Touch controls are deliberately multi-pointer: one thumb can hold movement
 * while the other attacks. Browsers mark only the first active contact as the
 * primary pointer, so primary-only filtering is valid for mouse/pen but would
 * discard normal two-thumb touch input.
 */
export function isActionPointerStart(
  event: Pick<PointerEvent, 'isPrimary' | 'pointerType' | 'button'>,
  mouseButton = 0,
): boolean {
  if (event.pointerType === 'touch') return true;
  if (!event.isPrimary) return false;
  return event.pointerType !== 'mouse' || event.button === mouseButton;
}

/** DOM adapter kept separate from the pure gesture gate for fixture testing. */
export function bindPointerAction(
  element: HTMLElement,
  action: InputAction,
  router: InputRouter,
  gate: PointerGestureGate,
  options: PointerBindingOptions = {},
  vibrate?: (duration: number) => void,
): () => void {
  let activeToken: string | null = null;
  let activePointerId: number | null = null;
  let activeSource: InputSource = 'pointer';
  const allowedType = (type: string) => !options.pointerTypes || options.pointerTypes.includes(type as never);

  const releaseActive = () => {
    if (!activeToken) return;
    const pointerId = activePointerId;
    router.release(action, activeSource, activeToken);
    activeToken = null;
    activePointerId = null;
    if (pointerId !== null) {
      try { element.releasePointerCapture(pointerId); } catch { /* detached or already released */ }
    }
  };

  const down = (event: PointerEvent) => {
    if (!allowedType(event.pointerType) || !isActionPointerStart(event, options.mouseButton ?? 0)) return;
    // One element represents one action hold. A second contact on that same
    // element must not replace the pointer whose release owns the hold.
    if (activeToken) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!gate.pointerDown(action, event.pointerId)) return;
    event.preventDefault();
    event.stopPropagation();
    options.beforePress?.();
    activeSource = event.pointerType === 'touch' ? 'touch' : 'pointer';
    const token = `${activeSource}:${event.pointerId}:${action}`;
    if (!router.press(action, activeSource, token)) return;
    activeToken = token;
    activePointerId = event.pointerId;
    if (options.vibrateMs) vibrate?.(options.vibrateMs);
    try { element.setPointerCapture(event.pointerId); } catch { /* detached or unsupported */ }
  };

  const release = (event: PointerEvent) => {
    if (!activeToken || event.pointerId !== activePointerId) return;
    releaseActive();
  };

  const click = (event: MouseEvent) => {
    if (!gate.click(action, event.detail)) return;
    event.preventDefault();
    event.stopPropagation();
    options.beforePress?.();
    router.tap(action, 'ui', `ui:${action}:${Date.now()}`);
  };

  const keydown = (event: KeyboardEvent) => {
    // Native buttons synthesize their own detail=0 click. A semantic div does
    // not, so supply the equivalent activation without double-firing buttons.
    if (element.tagName.toLowerCase() === 'button' || element.tagName.toLowerCase() === 'a') return;
    if (event.code !== 'Enter' && event.code !== 'Space') return;
    event.preventDefault();
    event.stopPropagation();
    options.beforePress?.();
    router.tap(action, 'ui', `ui:${action}:key:${event.code}`);
  };

  element.addEventListener('pointerdown', down);
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
  if (options.hold) element.addEventListener('pointerleave', release);
  element.addEventListener('click', click);
  element.addEventListener('keydown', keydown);

  return () => {
    // A HUD re-render can detach this element before pointerup/pointercancel.
    // Releasing here prevents an orphaned token from holding an action forever.
    releaseActive();
    element.removeEventListener('pointerdown', down);
    element.removeEventListener('pointerup', release);
    element.removeEventListener('pointercancel', release);
    if (options.hold) element.removeEventListener('pointerleave', release);
    element.removeEventListener('click', click);
    element.removeEventListener('keydown', keydown);
  };
}
