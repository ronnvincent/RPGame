/**
 * Power rankings.
 *
 * The number itself is computed on the client and stored with the save, so this
 * only ever displays what the server was told - it never recomputes, because a
 * second copy of the formula would drift from the first and nobody would know
 * which was right.
 */
import { audio } from '../engine/AudioManager';

interface Entry {
  rank: number;
  name: string;
  shortId: string;
  power: number;
  className: string | null;
  level: number;
}

const API_URL = (() => {
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  return isLocal ? 'http://localhost:3001/api' : 'https://rpgame-production-3453.up.railway.app/api';
})();

export class LeaderboardUI {
  private root: HTMLElement | null = null;
  private styled = false;
  private sort: 'power' | 'level' = 'power';
  private myPower = 0;
  private myLevel = 1;

  constructor(private parent: HTMLElement) {}

  public async open(myPower: number, myLevel: number = 1) {
    if (this.root) return;
    this.myPower = myPower;
    this.myLevel = myLevel;
    this.injectStyle();

    const root = document.createElement('div');
    root.className = 'lb-backdrop';
    root.innerHTML = `
      <div class="lb-panel">
        <div class="lb-head">
          <div>
            <div class="lb-title">POWER RANKINGS</div>
            <div class="lb-sub">Every level, item and forge upgrade counts</div>
          </div>
          <button class="lb-close">✕</button>
        </div>
        <div class="lb-tabs">
          <button class="lb-tab lb-tab-on" data-sort="power">⚡ POWER</button>
          <button class="lb-tab" data-sort="level">★ LEVEL</button>
        </div>
        <div class="lb-mine">
          <span class="lb-mine-label" id="lb-mine-label">YOUR POWER</span>
          <span class="lb-mine-value" id="lb-mine-value">${myPower.toLocaleString()}</span>
        </div>
        <div class="lb-list" id="lb-list"><div class="lb-empty">Loading…</div></div>
      </div>`;
    this.parent.appendChild(root);
    this.root = root;

    root.querySelector('.lb-close')?.addEventListener('click', () => this.close());

    root.querySelectorAll('.lb-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const sort = (tab as HTMLElement).dataset.sort as 'power' | 'level';
        if (sort === this.sort) return;
        this.sort = sort;
        root.querySelectorAll('.lb-tab').forEach((t) => t.classList.toggle('lb-tab-on', t === tab));
        const label = root.querySelector('#lb-mine-label');
        const value = root.querySelector('#lb-mine-value');
        if (label) label.textContent = sort === 'level' ? 'YOUR LEVEL' : 'YOUR POWER';
        if (value) value.textContent = sort === 'level' ? String(this.myLevel) : this.myPower.toLocaleString();
        audio.playClick();
        this.load();
      });
    });
    root.addEventListener('click', (e) => { if (e.target === root) this.close(); });

    this.load();
  }

  private async load() {
    const root = this.root;
    if (!root) return;
    const list = root.querySelector('#lb-list') as HTMLElement;
    const myId = localStorage.getItem('playerShortId');
    list.innerHTML = `<div class="lb-empty">Loading…</div>`;

    try {
      const res = await fetch(`${API_URL}/leaderboard?limit=25&sort=${this.sort}`);
      const body = await res.json();
      const entries: Entry[] = body?.entries || [];

      if (!entries.length) {
        // Said plainly rather than shown as an empty table: a blank board looks
        // broken, and this one is simply new.
        list.innerHTML = `<div class="lb-empty">No ranked players yet.<br><span>Power is recorded when your game saves.</span></div>`;
        return;
      }

      list.innerHTML = entries.map((e) => {
        const mine = e.shortId === myId;
        const medal = e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : '';
        // A player who has not opened the game since power was added has no
        // figure yet. A dash says that; a zero would claim they are weak.
        const unranked = !e.power;
        const powerText = unranked ? '—' : Number(e.power).toLocaleString();
        const figure = this.sort === 'level' ? `Lv. ${e.level}` : powerText;
        const meta = this.sort === 'level'
          ? `${e.className || 'Adventurer'} · ⚡ ${powerText}`
          : `${e.className || 'Adventurer'} · Lv. ${e.level}`;
        return `
          <div class="lb-row${mine ? ' lb-row-me' : ''}${e.rank <= 3 && !unranked ? ' lb-row-top' : ''}${unranked ? ' lb-row-unranked' : ''}">
            <span class="lb-rank">${medal || e.rank}</span>
            <span class="lb-name">
              ${e.name}${mine ? ' <span class="lb-you">YOU</span>' : ''}
              <span class="lb-meta">${meta}</span>
            </span>
            <span class="lb-power">${figure}</span>
          </div>`;
      }).join('');
    } catch {
      list.innerHTML = `<div class="lb-empty">Could not reach the rankings.<br><span>Check your connection and try again.</span></div>`;
    }
  }

  public close() {
    audio.playClick();
    this.root?.remove();
    this.root = null;
  }

  private injectStyle() {
    if (this.styled) return;
    this.styled = true;
    const style = document.createElement('style');
    style.textContent = `
      .lb-backdrop {
        position: fixed; inset: 0; z-index: 300;
        background: rgba(4, 2, 10, 0.78);
        display: flex; align-items: center; justify-content: center;
        padding: 16px;
      }
      .lb-panel {
        width: min(560px, 94vw); max-height: 86vh;
        display: flex; flex-direction: column;
        background: url('/assets/kenney-rpg-ui/panel_brown.png') repeat;
        background-size: 100% 100%;
        border: 2px solid #6b4a24;
        box-shadow: 0 18px 50px rgba(0,0,0,0.9);
        font-family: 'Outfit', sans-serif;
      }
      .lb-head {
        display: flex; align-items: flex-start; justify-content: space-between;
        gap: 12px; padding: 14px 16px 10px 16px;
        border-bottom: 2px solid rgba(107, 74, 36, 0.7);
      }
      .lb-title {
        font-family: 'Cinzel', serif; font-weight: 900; font-size: 17px;
        color: #ffd700; letter-spacing: 1.5px; text-shadow: 1px 2px 3px #000;
      }
      .lb-sub { font-size: 10px; color: #cbb894; margin-top: 2px; }
      .lb-close {
        background: none; border: none; color: #e7c98a;
        font-size: 18px; cursor: pointer; line-height: 1; padding: 2px 4px;
      }
      .lb-mine {
        display: flex; align-items: baseline; justify-content: space-between;
        margin: 12px 16px 6px 16px; padding: 10px 14px;
        background: rgba(0,0,0,0.32); border: 1px solid rgba(255, 215, 0, 0.35);
      }
      .lb-mine-label { font-size: 10px; letter-spacing: 1.5px; color: #cbb894; font-weight: 800; }
      .lb-mine-value {
        font-family: 'Cinzel', serif; font-size: 26px; font-weight: 900;
        color: #ffd700; text-shadow: 0 0 14px rgba(255, 215, 0, 0.45);
      }
      .lb-tabs { display: flex; gap: 6px; padding: 10px 16px 0 16px; }
      .lb-tab {
        flex: 1; padding: 7px 10px; cursor: pointer;
        background: rgba(0,0,0,0.3); border: 1px solid #6b4a24;
        color: #cbb894; font-family: 'Cinzel', serif; font-weight: 900;
        font-size: 11px; letter-spacing: 1px;
      }
      .lb-tab-on { background: rgba(255, 215, 0, 0.16); color: #ffd700; border-color: #ffd700; }

      .lb-list { overflow-y: auto; padding: 6px 12px 14px 12px; }
      .lb-row {
        display: grid; grid-template-columns: 38px 1fr auto;
        align-items: center; gap: 10px;
        padding: 9px 10px; margin-bottom: 5px;
        background: rgba(0, 0, 0, 0.26);
        border-left: 3px solid transparent;
      }
      /* The top three and your own row are the two things anyone actually
         looks for, so they are the two that are marked. */
      .lb-row-top { background: rgba(255, 215, 0, 0.09); border-left-color: #ffd700; }
      /* No power recorded yet - shown, but not dressed up as a ranking. */
      .lb-row-unranked { opacity: 0.62; }

      .lb-row-me { background: rgba(74, 222, 128, 0.13); border-left-color: #4ade80; }
      .lb-rank {
        font-family: 'Cinzel', serif; font-weight: 900; font-size: 15px;
        color: #e7c98a; text-align: center;
      }
      .lb-name { font-size: 12.5px; font-weight: 700; color: #fff6e0; display: flex; flex-direction: column; }
      .lb-meta { font-size: 9.5px; color: #b7a380; font-weight: 500; margin-top: 1px; }
      .lb-you {
        font-size: 8.5px; background: #4ade80; color: #06240f;
        padding: 1px 5px; border-radius: 3px; font-weight: 900; letter-spacing: 0.5px;
      }
      .lb-power {
        font-family: 'Cinzel', serif; font-weight: 900; font-size: 15px; color: #ffd700;
      }
      .lb-empty { text-align: center; color: #cbb894; font-size: 12px; padding: 28px 10px; line-height: 1.6; }
      .lb-empty span { font-size: 10px; color: #a08d6c; }

      @media (max-width: 640px) {
        .lb-title { font-size: 15px; }
        .lb-mine-value { font-size: 22px; }
        .lb-name { font-size: 11.5px; }
      }
    `;
    document.head.appendChild(style);
  }
}
