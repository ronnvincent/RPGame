import type { StorageLike } from './InputBindings';

export interface InputAccessibilityPreferences {
  reducedMotion: boolean;
  vibration: boolean;
  largeTouchTargets: boolean;
  screenShake: boolean;
  screenFlashes: boolean;
  gamepadDeadzone: number;
  touchControls: 'auto' | 'always' | 'never';
}

export const INPUT_PREFERENCES_STORAGE_KEY = 'rpg.input.accessibility.v1';

export class InputPreferenceStore {
  private value: InputAccessibilityPreferences;

  constructor(
    private readonly storage?: StorageLike | null,
    reducedMotionDefault = false,
    private readonly storageKey = INPUT_PREFERENCES_STORAGE_KEY,
  ) {
    this.value = this.load(reducedMotionDefault);
  }

  private load(reducedMotionDefault: boolean): InputAccessibilityPreferences {
    const defaults: InputAccessibilityPreferences = {
      reducedMotion: reducedMotionDefault,
      vibration: true,
      largeTouchTargets: false,
      screenShake: true,
      screenFlashes: true,
      gamepadDeadzone: 0.2,
      touchControls: 'auto',
    };
    if (!this.storage) return defaults;
    try {
      const parsed = JSON.parse(this.storage.getItem(this.storageKey) || 'null') as Partial<InputAccessibilityPreferences> | null;
      if (!parsed || typeof parsed !== 'object') return defaults;
      return {
        reducedMotion: typeof parsed.reducedMotion === 'boolean' ? parsed.reducedMotion : defaults.reducedMotion,
        vibration: typeof parsed.vibration === 'boolean' ? parsed.vibration : defaults.vibration,
        largeTouchTargets: typeof parsed.largeTouchTargets === 'boolean' ? parsed.largeTouchTargets : defaults.largeTouchTargets,
        screenShake: typeof parsed.screenShake === 'boolean' ? parsed.screenShake : defaults.screenShake,
        screenFlashes: typeof parsed.screenFlashes === 'boolean' ? parsed.screenFlashes : defaults.screenFlashes,
        gamepadDeadzone: typeof parsed.gamepadDeadzone === 'number'
          ? Math.max(0.05, Math.min(0.5, parsed.gamepadDeadzone))
          : defaults.gamepadDeadzone,
        touchControls: parsed.touchControls === 'always' || parsed.touchControls === 'never'
          ? parsed.touchControls
          : defaults.touchControls,
      };
    } catch {
      return defaults;
    }
  }

  public snapshot(): InputAccessibilityPreferences {
    return { ...this.value };
  }

  public update(patch: Partial<InputAccessibilityPreferences>): InputAccessibilityPreferences {
    for (const key of ['reducedMotion', 'vibration', 'largeTouchTargets', 'screenShake', 'screenFlashes'] as const) {
      if (typeof patch[key] === 'boolean') this.value[key] = patch[key]!;
    }
    if (typeof patch.gamepadDeadzone === 'number' && Number.isFinite(patch.gamepadDeadzone)) {
      this.value.gamepadDeadzone = Math.max(0.05, Math.min(0.5, patch.gamepadDeadzone));
    }
    if (patch.touchControls === 'auto' || patch.touchControls === 'always' || patch.touchControls === 'never') {
      this.value.touchControls = patch.touchControls;
    }
    try { this.storage?.setItem(this.storageKey, JSON.stringify(this.value)); } catch { /* optional persistence */ }
    return this.snapshot();
  }

  public apply(root: HTMLElement): void {
    root.classList.toggle('input-reduced-motion', this.value.reducedMotion);
    root.classList.toggle('input-large-touch-targets', this.value.largeTouchTargets);
    root.classList.toggle('input-disable-shake', !this.value.screenShake);
    root.classList.toggle('input-disable-flashes', !this.value.screenFlashes);
    root.classList.toggle('input-touch-always', this.value.touchControls === 'always');
    root.classList.toggle('input-touch-never', this.value.touchControls === 'never');
    root.dataset.inputVibration = String(this.value.vibration);
    root.dataset.gamepadDeadzone = String(this.value.gamepadDeadzone);
    root.dataset.touchControls = this.value.touchControls;
  }
}
