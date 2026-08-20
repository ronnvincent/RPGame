/**
 * Device-independent actions understood by the side-view game.
 *
 * Physical keys, gamepad buttons, pointer gestures and touch controls are
 * translated into these names before gameplay sees them. Keeping the list in
 * one place prevents every UI surface from inventing a second control scheme.
 */
export const INPUT_ACTIONS = [
  'moveLeft',
  'moveRight',
  'moveDown',
  'jump',
  'dash',
  'basicAttack',
  'interact',
  'quickHeal',
  'skill1',
  'skill2',
  'skill3',
  'skill4',
  'skill5',
  'skill6',
  'questLog',
  'worldMap',
  'returnTown',
  'menuToggle',
  'menuConfirm',
  'menuCancel',
  'menuUp',
  'menuDown',
  'menuLeft',
  'menuRight',
  'chatToggle',
  'chatSubmit',
  'chatCancel',
] as const;

export type InputAction = typeof INPUT_ACTIONS[number];
export type InputContext = 'gameplay' | 'menu' | 'chat';
export type InputDevice = 'keyboard' | 'gamepad';
export type InputSource = 'keyboard' | 'gamepad' | 'pointer' | 'touch' | 'ui';

export const GAMEPLAY_ACTIONS: ReadonlySet<InputAction> = new Set([
  'moveLeft', 'moveRight', 'moveDown', 'jump', 'dash', 'basicAttack',
  'interact', 'quickHeal', 'skill1', 'skill2', 'skill3', 'skill4',
  'skill5', 'skill6', 'questLog', 'worldMap', 'returnTown',
  'menuToggle', 'chatToggle',
]);

export const MENU_ACTIONS: ReadonlySet<InputAction> = new Set([
  'menuConfirm', 'menuCancel', 'menuUp', 'menuDown', 'menuLeft', 'menuRight',
  // J and M remain true toggles when their own panels are open.
  'questLog', 'worldMap', 'chatToggle',
]);

export const CHAT_ACTIONS: ReadonlySet<InputAction> = new Set([
  // Escape is the universal exit, while Y can close the surface it opened.
  'chatToggle', 'chatSubmit', 'chatCancel',
]);

/** Actions whose pressed state is sampled every frame. */
export const CONTINUOUS_ACTIONS: ReadonlySet<InputAction> = new Set([
  'moveLeft', 'moveRight', 'moveDown', 'interact',
]);

/** Menu navigation may use the operating system's deliberate key repeat. */
export const REPEATABLE_ACTIONS: ReadonlySet<InputAction> = new Set([
  'menuUp', 'menuDown', 'menuLeft', 'menuRight',
]);

export function actionsForContext(context: InputContext): ReadonlySet<InputAction> {
  if (context === 'menu') return MENU_ACTIONS;
  if (context === 'chat') return CHAT_ACTIONS;
  return GAMEPLAY_ACTIONS;
}

export function actionAllowed(action: InputAction, context: InputContext): boolean {
  return actionsForContext(context).has(action);
}

/** Two actions only conflict when at least one input context can receive both. */
export function actionsOverlap(a: InputAction, b: InputAction): boolean {
  return (GAMEPLAY_ACTIONS.has(a) && GAMEPLAY_ACTIONS.has(b))
    || (MENU_ACTIONS.has(a) && MENU_ACTIONS.has(b))
    || (CHAT_ACTIONS.has(a) && CHAT_ACTIONS.has(b));
}

export function skillAction(index: number): InputAction | null {
  return index >= 0 && index < 6 ? (`skill${index + 1}` as InputAction) : null;
}

export function skillIndexForAction(action: InputAction): number | null {
  const match = /^skill([1-6])$/.exec(action);
  return match ? Number(match[1]) - 1 : null;
}
