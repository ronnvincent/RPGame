/**
 * Colosseum career page.
 *
 * The lobby carried a one-line career chip and the results card showed the
 * purse for a single bout, but there was nowhere to read the whole story: how
 * far the rating has climbed, which titles are unlocked, and what the next
 * rung actually costs. This is that page: the same Kenney panels as the rest
 * of the arena UI, a real record table, the title ladder with progress, and
 * the purse rules printed from the same constants that pay out.
 */
import { audio } from '../engine/AudioManager';
import {
  describePvpRecord,
  PVP_REWARDS,
  pvpRating,
  pvpTitleFor,
  pvpTitleTiers,
  pvpWinRate,
  type PvpRecord,
} from '../pvp/PvpRecord';
import { escapeHtml, installModalFocusTrap } from './UiSafety';

const STYLE_ID = 'pvp-career-style';

export interface PvpCareerData {
  record: PvpRecord;
  playerName: string;
  className: string;
  /** Used only to pick the class icon; the name is what the page prints. */
  classId?: string;
  level: number;
}

const CLASS_ICONS: Record<string, string> = {
  warrior: '/assets/UI/skills/warrior/01_icon.png',
  mage: '/assets/UI/skills/mage/01_icon.png',
  archer: '/assets/UI/skills/archer/01_icon.png',
  rogue: '/assets/UI/skills/rogue/01_icon.png',
  cleric: '/assets/UI/skills/cleric/01_icon.png',
};

function gold(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString('en-US');
}

const CSS = `
.pvp-career-overlay {
  position: fixed;
  inset: 0;
  /* Above the Colosseum lobby (10000): the career page opens on top of it. */
  z-index: 10050;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(10px, env(safe-area-inset-top)) 10px max(10px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at 50% 28%, rgba(86, 54, 22, 0.32), rgba(8, 6, 4, 0.88) 72%),
    rgba(4, 3, 2, 0.74);
  font-family: 'Outfit', 'Inter', sans-serif;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.pvp-career-card {
  position: relative;
  width: min(720px, 100%);
  margin: auto;
  color: #f6e7c8;
  background: url('/assets/kenney-rpg-ui/panel_brown.png') repeat;
  border: 3px solid #3a2415;
  border-radius: 4px;
  box-shadow:
    0 0 0 1px rgba(255, 222, 168, 0.22) inset,
    0 18px 44px rgba(0, 0, 0, 0.65);
  image-rendering: pixelated;
  animation: pvp-career-in 200ms ease-out;
}
@keyframes pvp-career-in {
  from { opacity: 0; transform: translateY(8px) scale(0.99); }
  to { opacity: 1; transform: none; }
}
.pvp-career-card::before,
.pvp-career-card::after {
  content: '';
  position: absolute;
  width: 16px;
  height: 16px;
  border: 2px solid #f0d59b;
  opacity: 0.5;
  pointer-events: none;
}
.pvp-career-card::before { top: 5px; left: 5px; border-right: 0; border-bottom: 0; }
.pvp-career-card::after { bottom: 5px; right: 5px; border-left: 0; border-top: 0; }

.pvp-career-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px 10px;
  border-bottom: 2px solid rgba(28, 16, 8, 0.55);
}
.pvp-career-kicker {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1.6px;
  text-transform: uppercase;
  color: #d8b47c;
}
.pvp-career-name {
  font-family: 'Cinzel', Georgia, serif;
  font-weight: 900;
  font-size: clamp(20px, 4.6vw, 27px);
  line-height: 1.05;
  margin: 2px 0 3px;
  letter-spacing: 0.4px;
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  gap: 8px;
}
.pvp-career-name img { width: 24px; height: 24px; image-rendering: pixelated; }
.pvp-career-sub { font-size: 10px; color: #d6bd97; }
.pvp-career-rating {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  min-width: 108px;
  padding: 7px 12px;
  background: rgba(24, 15, 8, 0.55);
  border: 1px solid #a67c4a;
  border-radius: 4px;
  box-shadow: 0 0 0 1px rgba(255, 226, 168, 0.14) inset;
}
.pvp-career-rating b {
  font-family: 'Cinzel', Georgia, serif;
  font-size: 24px;
  line-height: 1;
  color: #ffd76e;
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.5);
}
.pvp-career-rating span {
  font-size: 8px;
  letter-spacing: 1.3px;
  text-transform: uppercase;
  color: #c9a878;
}

.pvp-career-body {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  gap: 12px;
  padding: 12px 16px;
}
.pvp-career-panel {
  background: rgba(22, 14, 8, 0.42);
  border: 1px solid rgba(240, 213, 155, 0.24);
  border-radius: 4px;
  padding: 9px 11px;
}
.pvp-career-panel h3 {
  margin: 0 0 7px;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: #e2c18d;
}
.pvp-career-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.pvp-career-stat {
  padding: 5px 6px;
  background: rgba(0, 0, 0, 0.24);
  border: 1px solid rgba(240, 213, 155, 0.14);
  border-radius: 3px;
}
.pvp-career-stat b {
  display: block;
  font-family: 'Cinzel', Georgia, serif;
  font-size: 15px;
  line-height: 1.1;
  color: #ffe6ae;
}
.pvp-career-stat span {
  display: block;
  font-size: 8px;
  letter-spacing: 0.7px;
  text-transform: uppercase;
  color: #bb9f7a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pvp-career-record-line {
  margin-top: 7px;
  font-size: 9.5px;
  color: #cdb08a;
}
.pvp-career-record-line b { color: #ffe6ae; }

.pvp-career-tier {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr) 34px;
  align-items: center;
  gap: 7px;
  padding: 3px 0;
}
.pvp-career-medal {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid #6f5233;
  background: rgba(0, 0, 0, 0.3);
}
.pvp-career-tier.earned .pvp-career-medal {
  background: radial-gradient(circle at 35% 35%, #ffe9a8, #b8860b 72%);
  border-color: #ffe08a;
  box-shadow: 0 0 5px rgba(255, 208, 110, 0.5);
}
.pvp-career-tier-name {
  font-size: 10px;
  font-weight: 700;
  color: #f2ddb8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pvp-career-tier.earned .pvp-career-tier-name { color: #ffe6ae; }
.pvp-career-tier-req {
  display: block;
  font-size: 8px;
  font-weight: 400;
  color: #a98f6d;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pvp-career-tier.current .pvp-career-tier-name::after {
  content: ' · NOW';
  font-size: 7.5px;
  letter-spacing: 0.8px;
  color: #ffd76e;
}
.pvp-career-bar {
  height: 5px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.45);
  box-shadow: 0 0 0 1px rgba(240, 213, 155, 0.18) inset;
  overflow: hidden;
}
.pvp-career-bar i {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #8a5a1e, #ffcf6b);
}
.pvp-career-tier.earned .pvp-career-bar i { background: linear-gradient(90deg, #b8860b, #ffe9a8); }
.pvp-career-pct { font-size: 8px; color: #bb9f7a; text-align: right; }

.pvp-career-purse { grid-column: 1 / -1; }
.pvp-career-purse-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 5px 14px;
}
.pvp-career-purse-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 9.5px;
  color: #d9c09b;
  border-bottom: 1px dashed rgba(240, 213, 155, 0.16);
  padding: 3px 0;
}
.pvp-career-purse-row b { color: #ffe6ae; font-family: 'Cinzel', Georgia, serif; font-size: 11px; }

.pvp-career-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 9px 16px 13px;
  border-top: 2px solid rgba(28, 16, 8, 0.55);
}
.pvp-career-hint { font-size: 9px; color: #b79c78; max-width: 380px; }
.pvp-career-btn {
  appearance: none;
  border: 0;
  padding: 9px 18px;
  min-height: 40px;
  cursor: pointer;
  color: #f7edd8;
  font-family: inherit;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  background: url('/assets/kenney-rpg-ui/buttonLong_blue.png') no-repeat center / 100% 100%;
  image-rendering: pixelated;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.55);
}
.pvp-career-btn:hover { filter: brightness(1.14); }
.pvp-career-btn:active { transform: translateY(1px); }
.pvp-career-btn:focus-visible { outline: 2px solid #ffe08a; outline-offset: 2px; }
.pvp-career-close {
  appearance: none;
  border: 1px solid #735134;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.4);
  color: #e8d2ac;
  width: 30px;
  height: 30px;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.pvp-career-close:hover { filter: brightness(1.25); }
.pvp-career-close:focus-visible { outline: 2px solid #ffe08a; outline-offset: 2px; }

@media (max-width: 640px) {
  .pvp-career-overlay { align-items: flex-start; }
  .pvp-career-head { padding: 10px 12px 8px; }
  .pvp-career-body { grid-template-columns: 1fr; gap: 10px; padding: 10px 12px; }
  .pvp-career-purse { grid-column: auto; }
  .pvp-career-foot { flex-direction: column; align-items: stretch; padding: 8px 12px 12px; }
  .pvp-career-btn { width: 100%; }
  .pvp-career-hint { max-width: none; text-align: center; }
}
@media (max-width: 380px) {
  .pvp-career-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pvp-career-rating { min-width: 92px; padding: 6px 9px; }
  .pvp-career-rating b { font-size: 21px; }
}
@media (prefers-reduced-motion: reduce) {
  .pvp-career-card { animation: none; }
}
`;

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement('style');
  tag.id = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

export class PvpCareerUI {
  private overlay: HTMLDivElement | null = null;
  private parent: HTMLElement;
  private data: PvpCareerData;
  private releaseFocus: (() => void) | null = null;

  constructor(parent: HTMLElement, data: PvpCareerData) {
    this.parent = parent;
    this.data = data;
  }

  public get isOpen(): boolean {
    return Boolean(this.overlay);
  }

  /** Swap the data while the page is open (a bout can finish behind it). */
  public setData(data: PvpCareerData): void {
    this.data = data;
    if (this.overlay) this.renderBody();
  }

  public open(): void {
    if (this.overlay) return;
    ensureStyles();
    audio.playPageTurn();

    const overlay = document.createElement('div');
    overlay.className = 'pvp-career-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'pvp-career-title');
    overlay.innerHTML = `
      <div class="pvp-career-card">
        <div class="pvp-career-head" id="pvp-career-head"></div>
        <div class="pvp-career-body" id="pvp-career-body"></div>
        <div class="pvp-career-foot">
          <div class="pvp-career-hint">Your career is saved with your game and ranked on the cloud board. Titles are earned, never bought.</div>
          <button type="button" class="pvp-career-btn" data-action="close-career">BACK TO THE ARENA</button>
        </div>
      </div>
    `;
    this.overlay = overlay;
    this.parent.appendChild(overlay);
    this.renderBody();

    const close = () => this.close();
    overlay.addEventListener('click', event => {
      if (event.target === overlay) close();
    });
    overlay.querySelector('[data-action="close-career"]')?.addEventListener('click', close);
    overlay.querySelector('[data-action="close-career-x"]')?.addEventListener('click', close);
    this.releaseFocus = installModalFocusTrap(overlay, {
      onEscape: close,
      initialFocus: overlay.querySelector<HTMLElement>('[data-action="close-career"]') || undefined,
    });
  }

  public close(): void {
    if (!this.overlay) return;
    audio.playClick();
    this.releaseFocus?.();
    this.releaseFocus = null;
    this.overlay.remove();
    this.overlay = null;
  }

  private renderBody(): void {
    const overlay = this.overlay;
    if (!overlay) return;
    const { record, playerName, className, classId, level } = this.data;
    const title = pvpTitleFor(record);
    const rating = pvpRating(record);
    const tiers = pvpTitleTiers(record);
    const rate = record.matches > 0 ? Math.round(pvpWinRate(record) * 100) : 0;
    const icon = CLASS_ICONS[classId || ''] || '';

    const head = overlay.querySelector('#pvp-career-head');
    if (head) {
      head.innerHTML = `
        <div>
          <div class="pvp-career-kicker">Colosseum career</div>
          <div class="pvp-career-name" id="pvp-career-title">
            ${icon ? `<img src="${icon}" alt="" />` : ''}
            <span>${escapeHtml(playerName || 'Champion')}</span>
          </div>
          <div class="pvp-career-sub">${escapeHtml(className || 'Warrior')} · Level ${Math.max(1, Math.round(level))} · ${escapeHtml(title)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="pvp-career-rating" title="Rating grows with wins and your best streak, and slips with losses">
            <b>${rating}</b>
            <span>Arena rating</span>
          </div>
          <button type="button" class="pvp-career-close" data-action="close-career-x" aria-label="Close career page">&times;</button>
        </div>
      `;
      head.querySelector('[data-action="close-career-x"]')?.addEventListener('click', () => this.close());
    }

    const body = overlay.querySelector('#pvp-career-body');
    if (!body) return;
    const stat = (value: string, label: string) => `
      <div class="pvp-career-stat"><b>${value}</b><span>${label}</span></div>
    `;
    const currentTitle = title;
    const tierRows = tiers.map(tier => {
      const pct = Math.round(tier.progress * 100);
      return `
        <div class="pvp-career-tier ${tier.earned ? 'earned' : ''} ${tier.title === currentTitle ? 'current' : ''}">
          <span class="pvp-career-medal" aria-hidden="true"></span>
          <div>
            <div class="pvp-career-tier-name">${escapeHtml(tier.title)}</div>
            <span class="pvp-career-tier-req">${escapeHtml(tier.requirement)}</span>
          </div>
          <div>
            <div class="pvp-career-bar"><i style="width:${pct}%"></i></div>
            <div class="pvp-career-pct">${tier.earned ? 'DONE' : `${pct}%`}</div>
          </div>
        </div>
      `;
    }).join('');

    body.innerHTML = `
      <section class="pvp-career-panel">
        <h3>Record</h3>
        <div class="pvp-career-stats">
          ${stat(String(record.matches), 'Bouts')}
          ${stat(String(record.wins), 'Wins')}
          ${stat(String(record.losses), 'Losses')}
          ${stat(`${rate}%`, 'Win rate')}
          ${stat(String(record.bestStreak), 'Best streak')}
          ${stat(String(record.mvps), 'MVPs')}
          ${stat(`${record.roundsWon}-${record.roundsLost}`, 'Rounds')}
          ${stat(String(record.suddenDeathWins), 'Sudden death')}
          ${stat(gold(record.goldEarned), 'Gold earned')}
        </div>
        <div class="pvp-career-record-line">${escapeHtml(describePvpRecord(record))}</div>
      </section>
      <section class="pvp-career-panel">
        <h3>Title ladder</h3>
        ${tierRows}
      </section>
      <section class="pvp-career-panel pvp-career-purse">
        <h3>What the arena pays</h3>
        <div class="pvp-career-purse-grid">
          <div class="pvp-career-purse-row"><span>Victory · 1v1</span><b>${gold(PVP_REWARDS.winByFormat['1v1'])}</b></div>
          <div class="pvp-career-purse-row"><span>Victory · 2v2</span><b>${gold(PVP_REWARDS.winByFormat['2v2'])}</b></div>
          <div class="pvp-career-purse-row"><span>Victory · 3v3</span><b>${gold(PVP_REWARDS.winByFormat['3v3'])}</b></div>
          <div class="pvp-career-purse-row"><span>Victory · 4v4</span><b>${gold(PVP_REWARDS.winByFormat['4v4'])}</b></div>
          <div class="pvp-career-purse-row"><span>Defeat consolation</span><b>${gold(PVP_REWARDS.loss)}</b></div>
          <div class="pvp-career-purse-row"><span>Every round won</span><b>${gold(PVP_REWARDS.perRound)}</b></div>
          <div class="pvp-career-purse-row"><span>MVP bonus</span><b>${gold(PVP_REWARDS.mvp)}</b></div>
          <div class="pvp-career-purse-row"><span>Win streak · per win</span><b>${gold(PVP_REWARDS.streakStep)}</b></div>
          <div class="pvp-career-purse-row"><span>First win of the day</span><b>${gold(PVP_REWARDS.firstWinOfDay)}</b></div>
        </div>
      </section>
    `;
  }
}
