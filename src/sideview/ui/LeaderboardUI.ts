import { audio } from '../engine/AudioManager';
import { getGameApiBase } from '../config/RuntimeConfig';
import { escapeHtml, finiteNumber, installModalFocusTrap } from './UiSafety';

interface Entry {
  rank: number;
  name: string;
  shortId: string;
  power: number;
  className: string | null;
  level: number;
}

const API_URL = getGameApiBase();
const STYLE_ID = 'leaderboard-rpg-style';

export class LeaderboardUI {
  private root: HTMLElement | null = null;
  private sort: 'power' | 'level' = 'power';
  private myPower = 0;
  private myLevel = 1;
  private request: AbortController | null = null;
  private requestSequence = 0;
  private releaseFocus: (() => void) | null = null;

  constructor(private parent: HTMLElement) {
    this.injectStyle();
  }

  public async open(myPower: number, myLevel = 1): Promise<void> {
    if (this.root) return;
    this.myPower = Math.max(0, finiteNumber(myPower));
    this.myLevel = Math.max(1, finiteNumber(myLevel, 1));

    const root = document.createElement('div');
    root.className = 'rpg-screen rpg-modal lb-backdrop';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'leaderboard-title');
    root.innerHTML = `<div class="rpg-screen__backdrop" aria-hidden="true"></div>
      <section class="rpg-panel rpg-dialog rpg-dialog--compact lb-panel" tabindex="-1">
        <header class="rpg-dialog__header lb-head">
          <div><p class="rpg-kicker">Hall of Champions</p><h2 class="rpg-title lb-title" id="leaderboard-title">Power Rankings</h2><p class="rpg-help">Levels, equipment, and forge upgrades all count.</p></div>
          <button class="rpg-icon-button lb-close" type="button" aria-label="Close rankings">&times;</button>
        </header>
        <div class="rpg-tabs lb-tabs" role="tablist" aria-label="Ranking category">
          <button class="rpg-tab lb-tab lb-tab-on" type="button" role="tab" aria-selected="true" data-sort="power">Power</button>
          <button class="rpg-tab lb-tab" type="button" role="tab" aria-selected="false" data-sort="level">Level</button>
        </div>
        <div class="rpg-card lb-mine"><span class="rpg-label" id="lb-mine-label">Your Power</span><strong class="lb-mine-value" id="lb-mine-value">${this.myPower.toLocaleString()}</strong></div>
        <div class="rpg-dialog__body lb-list" id="lb-list" role="list" aria-live="polite" aria-busy="true"><div class="rpg-empty lb-empty">Loading rankings...</div></div>
      </section>`;
    this.parent.appendChild(root);
    this.root = root;

    root.querySelector('.lb-close')?.addEventListener('click', () => this.close());
    root.querySelectorAll<HTMLButtonElement>('.lb-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const sort = tab.dataset.sort as 'power' | 'level';
        if (!sort || sort === this.sort) return;
        this.sort = sort;
        root.querySelectorAll<HTMLButtonElement>('.lb-tab').forEach(button => {
          const active = button === tab;
          button.classList.toggle('lb-tab-on', active);
          button.setAttribute('aria-selected', String(active));
        });
        const label = root.querySelector('#lb-mine-label');
        const value = root.querySelector('#lb-mine-value');
        if (label) label.textContent = sort === 'level' ? 'Your Level' : 'Your Power';
        if (value) value.textContent = sort === 'level' ? String(this.myLevel) : this.myPower.toLocaleString();
        audio.playClick();
        void this.load();
      });
    });
    root.addEventListener('pointerdown', event => { if (event.target === root) this.close(); });
    this.releaseFocus = installModalFocusTrap(root, { onEscape: () => this.close(), initialFocus: root.querySelector('.lb-tab-on') });
    await this.load();
  }

  private async load(): Promise<void> {
    const root = this.root;
    if (!root) return;
    const list = root.querySelector('#lb-list') as HTMLElement;
    const myId = localStorage.getItem('playerShortId');
    const sequence = ++this.requestSequence;
    this.request?.abort();
    this.request = new AbortController();
    list.setAttribute('aria-busy', 'true');
    list.innerHTML = '<div class="rpg-empty lb-empty">Loading rankings...</div>';

    try {
      const response = await fetch(`${API_URL}/leaderboard?limit=25&sort=${this.sort}`, { signal: this.request.signal });
      if (!response.ok) throw new Error(`Rankings request failed (${response.status})`);
      const body = await response.json();
      if (sequence !== this.requestSequence || root !== this.root) return;
      const entries = this.normalizeEntries(body?.entries);
      list.setAttribute('aria-busy', 'false');

      if (!entries.length) {
        list.innerHTML = '<div class="rpg-empty lb-empty"><div><strong>No ranked players yet.</strong><p>Power is recorded when a game saves.</p></div></div>';
        return;
      }

      list.innerHTML = entries.map(entry => {
        const mine = entry.shortId === myId;
        const unranked = entry.power <= 0;
        const powerText = unranked ? 'Not recorded' : entry.power.toLocaleString();
        const figure = this.sort === 'level' ? `Level ${entry.level}` : powerText;
        const meta = this.sort === 'level'
          ? `${entry.className || 'Adventurer'} · ${powerText} power`
          : `${entry.className || 'Adventurer'} · Level ${entry.level}`;
        return `<article class="rpg-card lb-row${mine ? ' lb-row-me' : ''}${entry.rank <= 3 && !unranked ? ' lb-row-top' : ''}${unranked ? ' lb-row-unranked' : ''}" role="listitem">
          <span class="lb-rank" aria-label="Rank ${entry.rank}">${entry.rank}</span>
          <span class="lb-name">${escapeHtml(entry.name)}${mine ? ' <span class="lb-you">You</span>' : ''}<span class="lb-meta">${escapeHtml(meta)}</span></span>
          <strong class="lb-power">${escapeHtml(figure)}</strong>
        </article>`;
      }).join('');
    } catch (error) {
      if ((error as Error)?.name === 'AbortError' || sequence !== this.requestSequence || root !== this.root) return;
      list.setAttribute('aria-busy', 'false');
      list.innerHTML = '<div class="rpg-empty lb-empty"><div><strong>Could not reach the rankings.</strong><p>Check your connection, then try again.</p><button class="rpg-button lb-retry" type="button">Retry</button></div></div>';
      list.querySelector('.lb-retry')?.addEventListener('click', () => void this.load());
    }
  }

  private normalizeEntries(value: unknown): Entry[] {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 25).map((raw, index) => {
      const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
      return {
        rank: Math.max(1, Math.trunc(finiteNumber(source.rank, index + 1))),
        name: String(source.name ?? 'Unknown Adventurer').slice(0, 32),
        shortId: String(source.shortId ?? '').slice(0, 12),
        power: Math.max(0, Math.trunc(finiteNumber(source.power))),
        className: typeof source.className === 'string' ? source.className.slice(0, 32) : null,
        level: Math.max(1, Math.trunc(finiteNumber(source.level, 1))),
      };
    });
  }

  public close(): void {
    this.requestSequence++;
    this.request?.abort();
    this.request = null;
    this.releaseFocus?.();
    this.releaseFocus = null;
    if (this.root) audio.playClick();
    this.root?.remove();
    this.root = null;
  }

  private injectStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .lb-panel{height:min(88dvh,760px)}.lb-head p{margin:4px 0 0}.lb-close{font-size:1.4rem;cursor:pointer}.lb-tabs{padding-top:4px}.lb-tabs .lb-tab{flex:1}
      .lb-mine{display:flex;align-items:center;justify-content:space-between;margin:9px 0;padding:9px 13px;border-width:9px;border-image-width:9px}.lb-mine-value{color:var(--rpg-gold-bright);font:900 1.6rem/1 'Cinzel',serif;font-variant-numeric:tabular-nums}
      .lb-list{display:grid;gap:5px;padding:2px}.lb-row{display:grid;grid-template-columns:36px 1fr auto;align-items:center;gap:9px;padding:8px 10px;border-width:8px;border-image-width:8px}.lb-row-top{box-shadow:inset 3px 0 var(--rpg-gold)}.lb-row-me{outline:1px solid #5fd28b;outline-offset:-3px}.lb-row-unranked{opacity:.62}
      .lb-rank{color:var(--rpg-gold);font:900 1rem/1 'Cinzel',serif;text-align:center}.lb-name{display:flex;flex-wrap:wrap;align-items:center;gap:5px;color:var(--rpg-paper);font-weight:900}.lb-meta{flex-basis:100%;color:var(--rpg-muted);font-size:.7rem;font-weight:600}.lb-you{padding:2px 5px;color:#07180d;background:#63d68a;font-size:.6rem;font-weight:900;text-transform:uppercase}.lb-power{color:var(--rpg-gold-bright);font-variant-numeric:tabular-nums}.lb-empty p{margin:5px 0 12px}.lb-retry{min-width:120px}
      @media(max-width:520px){.lb-panel{height:96dvh}.lb-row{grid-template-columns:28px 1fr}.lb-power{grid-column:2}.lb-head .rpg-help{display:none}}
    `;
    document.head.appendChild(style);
  }
}
