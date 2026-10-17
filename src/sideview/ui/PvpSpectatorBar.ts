/**
 * Colosseum spectator controls.
 *
 * The camera used to be a fixed director cut with nothing to touch. This is
 * the bar that gives a downed player the controls a spectator expects: pick
 * who to follow, take the camera manually, zoom in or out, and - in a practice
 * bout, where pausing is honest - freeze the match to look around.
 *
 * It sits above the canvas strip that names the fighter on screen, low and
 * centred so it clears both thumbs. All art is the project's Kenney RPG UI
 * set; nothing here invents a new visual language for one screen.
 */
import { audio } from '../engine/AudioManager';

const STYLE_ID = 'pvp-spectator-style';

export interface SpectatorBarState {
  targetName: string;
  targetTeam: 'red' | 'blue';
  mode: 'auto' | 'free';
  zoom: number;
  canPause: boolean;
  paused: boolean;
}

export interface SpectatorBarCallbacks {
  onPrev: () => void;
  onNext: () => void;
  onToggleFollow: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onTogglePause: () => void;
}

const CSS = `
.pvp-spec-bar {
  position: fixed;
  left: 50%;
  bottom: max(34px, calc(env(safe-area-inset-bottom) + 30px));
  transform: translateX(-50%) translateY(6px);
  z-index: 60;
  display: none;
  align-items: center;
  gap: 5px;
  padding: 5px 7px;
  max-width: calc(100vw - 16px);
  color: #f6e7c8;
  background: url('/assets/kenney-rpg-ui/panel_brown.png') repeat;
  border: 2px solid #3a2415;
  border-radius: 4px;
  box-shadow:
    0 0 0 1px rgba(255, 222, 168, 0.2) inset,
    0 8px 22px rgba(0, 0, 0, 0.55);
  image-rendering: pixelated;
  font-family: 'Outfit', 'Inter', sans-serif;
  pointer-events: auto;
  opacity: 0;
  transition: opacity 140ms ease-out, transform 140ms ease-out;
}
.pvp-spec-bar.is-open {
  display: flex;
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}
.pvp-spec-btn {
  appearance: none;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border: 0;
  padding: 0;
  cursor: pointer;
  color: #fdf3dd;
  font-family: inherit;
  font-size: 13px;
  font-weight: 800;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: url('/assets/kenney-rpg-ui/buttonSquare_brown.png') no-repeat center / 100% 100%;
  image-rendering: pixelated;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.6);
}
.pvp-spec-btn.wide {
  width: auto;
  min-width: 54px;
  padding: 0 8px;
  font-size: 9px;
  letter-spacing: 0.5px;
  background-image: url('/assets/kenney-rpg-ui/buttonLong_brown.png');
}
.pvp-spec-btn:hover:not(:disabled) { filter: brightness(1.18); }
.pvp-spec-btn:active:not(:disabled) { transform: translateY(1px); }
.pvp-spec-btn:focus-visible { outline: 2px solid #ffe08a; outline-offset: 2px; }
.pvp-spec-btn:disabled { opacity: 0.45; cursor: default; }
.pvp-spec-btn.is-on { background-image: url('/assets/kenney-rpg-ui/buttonSquare_blue.png'); }
.pvp-spec-btn.wide.is-on { background-image: url('/assets/kenney-rpg-ui/buttonLong_blue.png'); }

.pvp-spec-target {
  flex: 1 1 auto;
  min-width: 78px;
  max-width: 168px;
  padding: 0 4px;
  text-align: center;
  line-height: 1.1;
  overflow: hidden;
}
.pvp-spec-target b {
  display: block;
  font-family: 'Cinzel', Georgia, serif;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.3px;
  color: #ffe6ae;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pvp-spec-target span {
  display: block;
  font-size: 7.5px;
  letter-spacing: 0.9px;
  text-transform: uppercase;
  color: #c6a97f;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pvp-spec-target span.red { color: #f19a8d; }
.pvp-spec-target span.blue { color: #9dbbef; }
.pvp-spec-sep {
  flex: 0 0 auto;
  width: 1px;
  height: 22px;
  margin: 0 1px;
  background: rgba(240, 213, 155, 0.24);
}

@media (max-width: 480px) {
  /* Clears the thumb controls: a phone keeps its joystick bottom-left and
     skills bottom-right, and the bar is a toolbar, not an overlay for them. */
  .pvp-spec-bar { gap: 4px; padding: 4px 5px; bottom: max(112px, calc(env(safe-area-inset-bottom) + 106px)); }
  .pvp-spec-btn { width: 32px; height: 32px; font-size: 12px; }
  .pvp-spec-btn.wide { min-width: 46px; padding: 0 6px; font-size: 8px; }
  .pvp-spec-target { min-width: 60px; max-width: 104px; }
  .pvp-spec-target b { font-size: 9px; }
}
@media (max-width: 350px) {
  .pvp-spec-sep { display: none; }
  .pvp-spec-target span { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .pvp-spec-bar { transition: none; }
}
`;

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement('style');
  tag.id = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

export class PvpSpectatorBar {
  private root: HTMLDivElement | null = null;
  private parent: HTMLElement;
  private callbacks: SpectatorBarCallbacks;
  private state: SpectatorBarState = {
    targetName: '',
    targetTeam: 'red',
    mode: 'auto',
    zoom: 1,
    canPause: false,
    paused: false,
  };

  constructor(parent: HTMLElement, callbacks: SpectatorBarCallbacks) {
    this.parent = parent;
    this.callbacks = callbacks;
  }

  public get isOpen(): boolean {
    return Boolean(this.root?.classList.contains('is-open'));
  }

  public open(): void {
    if (!this.root) {
      ensureStyles();
      this.build();
    }
    this.root?.classList.add('is-open');
  }

  public close(): void {
    this.root?.classList.remove('is-open');
  }

  public setState(patch: Partial<SpectatorBarState>): void {
    const next = { ...this.state, ...patch };
    const changed = (Object.keys(next) as Array<keyof SpectatorBarState>)
      .some(key => next[key] !== this.state[key]);
    this.state = next;
    if (!changed || !this.root) return;
    this.render();
  }

  private build(): void {
    const root = document.createElement('div');
    root.className = 'pvp-spec-bar';
    root.setAttribute('role', 'toolbar');
    root.setAttribute('aria-label', 'Spectator camera controls');
    root.innerHTML = `
      <button type="button" class="pvp-spec-btn" data-action="prev" aria-label="Previous fighter" title="Previous fighter">&#9664;</button>
      <div class="pvp-spec-target">
        <b data-role="name">Spectating</b>
        <span data-role="meta">AUTO</span>
      </div>
      <button type="button" class="pvp-spec-btn" data-action="next" aria-label="Next fighter" title="Next fighter">&#9654;</button>
      <span class="pvp-spec-sep" aria-hidden="true"></span>
      <button type="button" class="pvp-spec-btn wide" data-action="follow" aria-label="Toggle auto camera" title="Auto camera: the director cuts between teammates">MANUAL</button>
      <button type="button" class="pvp-spec-btn" data-action="zoom-out" aria-label="Zoom out" title="Zoom out">&#8722;</button>
      <button type="button" class="pvp-spec-btn" data-action="zoom-in" aria-label="Zoom in" title="Zoom in">+</button>
      <button type="button" class="pvp-spec-btn" data-action="pause" aria-label="Pause match" title="Pause match">&#10074;&#10074;</button>
    `;

    const bind = (action: string, handler: () => void) => {
      const button = root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
      button?.addEventListener('click', () => {
        if (button.disabled) return;
        audio.playClick();
        handler();
      });
    };
    bind('prev', () => this.callbacks.onPrev());
    bind('next', () => this.callbacks.onNext());
    bind('follow', () => this.callbacks.onToggleFollow());
    bind('zoom-in', () => this.callbacks.onZoomIn());
    bind('zoom-out', () => this.callbacks.onZoomOut());
    bind('pause', () => this.callbacks.onTogglePause());

    this.parent.appendChild(root);
    this.root = root;
    this.render();
  }

  private render(): void {
    const root = this.root;
    if (!root) return;
    const { targetName, targetTeam, mode, zoom, canPause, paused } = this.state;

    const name = root.querySelector<HTMLElement>('[data-role="name"]');
    if (name) name.textContent = targetName || 'Spectating';

    const meta = root.querySelector<HTMLElement>('[data-role="meta"]');
    if (meta) {
      const team = targetTeam === 'blue' ? 'Blue' : 'Red';
      meta.textContent = `${team} · ${mode === 'auto' ? 'AUTO' : 'FREE'} · ${zoom.toFixed(1)}×`;
      meta.className = targetTeam === 'blue' ? 'blue' : 'red';
    }

    const follow = root.querySelector<HTMLButtonElement>('[data-action="follow"]');
    if (follow) {
      follow.textContent = mode === 'auto' ? 'MANUAL' : 'AUTO';
      follow.classList.toggle('is-on', mode === 'auto');
      follow.setAttribute('aria-label', mode === 'auto' ? 'Take manual camera control' : 'Return to auto camera');
      follow.title = mode === 'auto'
        ? 'Take manual camera control'
        : 'Return to auto camera: the director cuts between teammates';
    }

    const pause = root.querySelector<HTMLButtonElement>('[data-action="pause"]');
    if (pause) {
      pause.disabled = !canPause;
      pause.classList.toggle('is-on', paused);
      pause.innerHTML = paused ? '&#9654;' : '&#10074;&#10074;';
      pause.setAttribute('aria-label', paused ? 'Resume match' : 'Pause match');
      pause.setAttribute('aria-pressed', String(paused));
      pause.title = canPause
        ? (paused ? 'Resume the match' : 'Pause the match and look around')
        : 'Pause is available in a practice bout; a live match keeps running for everyone';
    }
  }
}
