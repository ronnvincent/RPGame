import { CHARACTER_CLASSES } from '../classes/ClassDefinitions';
import type { RunStats } from '../network/NetworkManager';
import { clampPercent, escapeHtml, finiteNumber, installModalFocusTrap } from './UiSafety';

export interface SummaryRow extends RunStats {
  socketId: string;
  isMe: boolean;
}

const STYLE_ID = 'run-summary-rpg-style';

/** End-of-run contribution report, safe for remote party display names. */
export class RunSummaryUI {
  private root: HTMLElement | null = null;
  private releaseFocus: (() => void) | null = null;
  public onClose: (() => void) | null = null;
  public onRematch: (() => void) | null = null;

  constructor(private container: HTMLElement) {
    this.injectStyles();
  }

  public open(rows: SummaryRow[], title: string, subtitle: string, canRematch: boolean): void {
    this.close();
    const ranked = [...rows].sort((a, b) => b.damageDealt - a.damageDealt);
    const top = Math.max(1, finiteNumber(ranked[0]?.damageDealt, 0));
    const totalDamage = ranked.reduce((sum, row) => sum + Math.max(0, finiteNumber(row.damageDealt)), 0);
    const totalKills = ranked.reduce((sum, row) => sum + Math.max(0, finiteNumber(row.kills)), 0);
    const totalRevives = ranked.reduce((sum, row) => sum + Math.max(0, finiteNumber(row.revives)), 0);

    const back = document.createElement('div');
    back.className = 'rpg-screen rpg-modal rs-back';
    back.setAttribute('role', 'dialog');
    back.setAttribute('aria-modal', 'true');
    back.setAttribute('aria-labelledby', 'run-summary-title');
    back.innerHTML = `<div class="rpg-screen__backdrop" aria-hidden="true"></div>
      <section class="rpg-panel rpg-dialog rpg-dialog--compact rs-panel" tabindex="-1">
        <header class="rs-head">
          <p class="rpg-kicker">Expedition Report</p>
          <h2 class="rpg-title rs-title" id="run-summary-title">${escapeHtml(title)}</h2>
          <p class="rs-sub">${escapeHtml(subtitle)}</p>
        </header>
        <div class="rs-totals" aria-label="Party totals">
          <div><span>Damage</span><strong>${totalDamage.toLocaleString()}</strong></div>
          <div><span>Enemies</span><strong>${totalKills.toLocaleString()}</strong></div>
          <div><span>Revives</span><strong>${totalRevives.toLocaleString()}</strong></div>
        </div>
        <div class="rpg-dialog__body rs-list">
          ${ranked.length ? ranked.map((row, index) => {
            const cls = CHARACTER_CLASSES.find(candidate => candidate.id === row.classId);
            const damage = Math.max(0, finiteNumber(row.damageDealt));
            const taken = Math.max(0, finiteNumber(row.damageTaken));
            const kills = Math.max(0, finiteNumber(row.kills));
            const revives = Math.max(0, finiteNumber(row.revives));
            const pct = clampPercent((damage / top) * 100);
            const mvp = index === 0 && ranked.length > 1;
            return `<article class="rpg-card rs-row ${mvp ? 'rs-mvp' : ''} ${row.isMe ? 'rs-me' : ''}">
              <div class="rs-rank" aria-label="Rank ${index + 1}">${index + 1}</div>
              <div class="rs-member">
                <div class="rs-name">${escapeHtml(row.name)}${mvp ? '<span class="rs-badge">MVP</span>' : ''}${row.isMe ? '<span class="rpg-badge rpg-badge--success">You</span>' : ''}</div>
                <div class="rs-cls">${escapeHtml(cls?.name || 'Adventurer')}</div>
                <div class="rpg-progress rs-bar" style="--rpg-progress-value:${pct}%;--rpg-progress-color:#e58c43" role="progressbar" aria-label="Damage contribution" aria-valuemin="0" aria-valuemax="${top}" aria-valuenow="${damage}"></div>
              </div>
              <dl class="rs-nums">
                <div><dt>Damage</dt><dd class="rs-dmg">${damage.toLocaleString()}</dd></div>
                <div><dt>Kills</dt><dd>${kills.toLocaleString()}</dd></div>
                <div><dt>Taken</dt><dd>${taken.toLocaleString()}</dd></div>
                ${revives > 0 ? `<div><dt>Revives</dt><dd>${revives.toLocaleString()}</dd></div>` : ''}
              </dl>
            </article>`;
          }).join('') : '<div class="rpg-empty">No contribution data was received for this run.</div>'}
        </div>
        <footer class="rpg-dialog__footer rs-foot">
          ${canRematch ? '<button class="rpg-button" id="rs-rematch" type="button">Rematch</button>' : ''}
          <button class="rpg-button rpg-button--primary" id="rs-close" type="button">Continue</button>
        </footer>
      </section>`;

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
    this.releaseFocus = installModalFocusTrap(back, {
      onEscape: () => {
        this.close();
        this.onClose?.();
      },
      initialFocus: back.querySelector<HTMLButtonElement>('#rs-close'),
    });
  }

  public close(): void {
    this.releaseFocus?.();
    this.releaseFocus = null;
    this.root?.remove();
    this.root = null;
  }

  private injectStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .rs-panel{max-height:92dvh}.rs-head{text-align:center}.rs-head p{margin:4px 0 10px}.rs-sub{color:var(--rpg-muted);line-height:1.4}
      .rs-totals{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:0 0 8px}.rs-totals div{display:grid;padding:7px 9px;text-align:center;background:rgba(0,0,0,.35);border:1px solid rgba(231,189,85,.2)}.rs-totals span{color:var(--rpg-muted);font-size:.68rem;font-weight:900;text-transform:uppercase}.rs-totals strong{color:var(--rpg-gold-bright);font-variant-numeric:tabular-nums}
      .rs-list{display:grid;gap:7px;padding:2px}.rs-row{display:grid;grid-template-columns:32px 1fr minmax(120px,auto);gap:9px;align-items:center;padding:9px;border-width:9px;border-image-width:9px}.rs-row.rs-mvp{box-shadow:inset 3px 0 var(--rpg-gold),0 8px 14px rgba(0,0,0,.38)}.rs-row.rs-me{outline:1px solid rgba(77,184,232,.7);outline-offset:-3px}
      .rs-rank{color:var(--rpg-muted);font:900 1.1rem/1 'Cinzel',serif;text-align:center}.rs-name{display:flex;align-items:center;gap:6px;color:var(--rpg-paper);font-weight:900}.rs-badge{padding:2px 6px;color:#1a1204;background:var(--rpg-gold);font-size:.62rem;font-weight:900}.rs-cls{color:var(--rpg-muted);font-size:.74rem}.rs-bar{margin-top:5px}
      .rs-nums{display:grid;grid-template-columns:1fr 1fr;gap:3px 10px;margin:0;text-align:right}.rs-nums div{display:grid}.rs-nums dt{color:var(--rpg-muted);font-size:.62rem;text-transform:uppercase}.rs-nums dd{margin:0;color:#e4d9c1;font-size:.78rem;font-weight:800}.rs-nums .rs-dmg{color:#f2a75a;font-size:.95rem}.rs-foot{justify-content:stretch}.rs-foot button{flex:1}
      @media(max-width:520px){.rs-panel{max-height:96dvh}.rs-row{grid-template-columns:28px 1fr}.rs-nums{grid-column:2;grid-template-columns:repeat(4,1fr);text-align:left}.rs-totals{font-size:.82rem}}
    `;
    document.head.appendChild(style);
  }
}
