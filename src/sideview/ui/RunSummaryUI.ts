import { CHARACTER_CLASSES } from '../classes/ClassDefinitions';
import type { RunStats } from '../network/NetworkManager';

/** A finished run's contribution card, one row per member. */
export interface SummaryRow extends RunStats {
  socketId: string;
  isMe: boolean;
}

/**
 * What everyone actually did.
 *
 * A cleared dungeon used to end with a fanfare and nothing else, so a run with
 * four people in it said nothing about who carried it - and a co-op run with no
 * record of who did what is just four people in the same room. This is the part
 * players screenshot.
 */
export class RunSummaryUI {
  private container: HTMLElement;
  private root: HTMLElement | null = null;
  public onClose: (() => void) | null = null;
  public onRematch: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.injectStyles();
  }

  private injectStyles() {
    if (document.getElementById('run-summary-styles')) return;
    const style = document.createElement('style');
    style.id = 'run-summary-styles';
    style.textContent = `
      .rs-back {
        position: absolute; inset: 0; z-index: 120;
        background: rgba(6, 4, 12, 0.86);
        display: flex; align-items: center; justify-content: center;
        font-family: 'Outfit', sans-serif;
      }
      .rs-panel {
        width: min(560px, 92vw);
        max-height: 88vh; overflow-y: auto;
        background: url('/assets/kenney-rpg-ui/panelInset_brown.png') repeat;
        background-size: 100% 100%;
        border: 3px solid #d4af37; border-radius: 6px;
        padding: 18px 20px;
        box-shadow: 0 18px 50px rgba(0,0,0,0.7);
      }
      .rs-title {
        font-family: 'Cinzel', serif; font-weight: 900;
        font-size: 21px; letter-spacing: 1.6px; color: #ffd700;
        text-align: center; text-shadow: 0 2px 6px rgba(0,0,0,0.9);
      }
      .rs-sub {
        text-align: center; font-size: 11.5px; color: #c9b48a;
        margin: 3px 0 14px; letter-spacing: 0.4px;
      }
      .rs-row {
        display: grid;
        grid-template-columns: 26px 1fr auto;
        gap: 10px; align-items: center;
        padding: 9px 10px; margin-bottom: 7px;
        background: rgba(0,0,0,0.32);
        border: 1px solid rgba(255,255,255,0.09);
        border-radius: 4px;
      }
      .rs-row.rs-mvp { border-color: #ffd700; background: rgba(90, 70, 10, 0.42); }
      .rs-row.rs-me { box-shadow: inset 0 0 0 1px rgba(79,173,229,0.6); }
      .rs-rank { font-weight: 900; font-size: 13px; color: #8a7b5c; text-align: center; }
      .rs-name { font-weight: 800; font-size: 13.5px; color: #f3e6c8; }
      .rs-cls { font-size: 10.5px; color: #9b8a68; letter-spacing: 0.3px; }
      .rs-badge {
        display: inline-block; margin-left: 6px; padding: 1px 6px;
        background: #ffd700; color: #3a2c05;
        font-size: 9px; font-weight: 900; letter-spacing: 0.8px;
        border-radius: 3px; vertical-align: middle;
      }
      .rs-bar { height: 5px; margin-top: 5px; background: rgba(0,0,0,0.5); border-radius: 3px; overflow: hidden; }
      .rs-fill { height: 100%; background: linear-gradient(90deg, #ef5350, #ffb74d); }
      .rs-nums { text-align: right; font-size: 11px; color: #c9b48a; line-height: 1.5; white-space: nowrap; }
      .rs-dmg { font-weight: 900; font-size: 14px; color: #ffb74d; }
      .rs-foot { display: flex; gap: 10px; margin-top: 14px; }
      .rs-btn {
        flex: 1; padding: 10px; cursor: pointer;
        background: url('/assets/kenney-rpg-ui/buttonLong_brown.png') no-repeat center/100% 100%;
        border: none; color: #fff8e1;
        font-family: 'Cinzel', serif; font-weight: 800; font-size: 12.5px;
        letter-spacing: 1px; text-shadow: 0 2px 3px rgba(0,0,0,0.8);
      }
      .rs-btn:active { transform: translateY(1px); }
      @media (max-width: 767px), (orientation: landscape) and (max-height: 500px) {
        .rs-panel { padding: 12px 14px; }
        .rs-title { font-size: 17px; }
        .rs-row { padding: 7px 8px; }
      }
    `;
    document.head.appendChild(style);
  }

  public open(rows: SummaryRow[], title: string, subtitle: string, canRematch: boolean) {
    this.close();

    // Ranked by damage dealt, which is the number the badge is awarded on.
    const ranked = [...rows].sort((a, b) => b.damageDealt - a.damageDealt);
    const top = ranked[0]?.damageDealt || 1;

    const back = document.createElement('div');
    back.className = 'rs-back';
    back.innerHTML = `
      <div class="rs-panel">
        <div class="rs-title">${title}</div>
        <div class="rs-sub">${subtitle}</div>
        ${ranked.map((r, i) => {
          const cls = CHARACTER_CLASSES.find(c => c.id === r.classId);
          const pct = Math.max(2, Math.round((r.damageDealt / top) * 100));
          return `
            <div class="rs-row ${i === 0 && ranked.length > 1 ? 'rs-mvp' : ''} ${r.isMe ? 'rs-me' : ''}">
              <div class="rs-rank">${i + 1}</div>
              <div>
                <div class="rs-name">
                  ${r.name}${i === 0 && ranked.length > 1 ? '<span class="rs-badge">MVP</span>' : ''}
                </div>
                <div class="rs-cls">${cls ? cls.name : 'Adventurer'}</div>
                <div class="rs-bar"><div class="rs-fill" style="width:${pct}%"></div></div>
              </div>
              <div class="rs-nums">
                <div class="rs-dmg">${r.damageDealt.toLocaleString()}</div>
                <div>${r.kills} kills · ${r.damageTaken.toLocaleString()} taken</div>
                ${r.revives > 0 ? `<div>${r.revives} revive${r.revives > 1 ? 's' : ''}</div>` : ''}
              </div>
            </div>`;
        }).join('')}
        <div class="rs-foot">
          ${canRematch ? '<button class="rs-btn" id="rs-rematch">REMATCH</button>' : ''}
          <button class="rs-btn" id="rs-close">CONTINUE</button>
        </div>
      </div>`;

    this.container.appendChild(back);
    this.root = back;

    back.querySelector('#rs-close')?.addEventListener('click', () => {
      this.close();
      this.onClose?.();
    });
    back.querySelector('#rs-rematch')?.addEventListener('click', () => {
      this.close();
      this.onRematch?.();
    });
  }

  public close() {
    this.root?.remove();
    this.root = null;
  }
}
