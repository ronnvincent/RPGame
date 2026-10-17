/**
 * Post-match Colosseum results card.
 *
 * Before this, a finished match showed a banner for three seconds and dropped
 * the player back in town - no scoreboard, no spoils, no idea who actually won
 * the duel. This renders the full bout: roster and per-player stats, the MVP,
 * an itemised purse, and the rematch vote.
 *
 * Styling reuses the Kenney RPG UI pack the rest of the HUD is built from.
 * Layout is a two-column card on desktop and a single stacked column on a
 * phone, with the roster as a real table so long names and four-player teams
 * stay readable.
 */
import { audio } from '../engine/AudioManager';
import type { PvpMatchSummary, PvpScoreboardRow } from '../pvp/TournamentSystem';
import {
  describePvpRecord,
  pvpRating,
  pvpTitleFor,
  type PvpRecord,
  type PvpRewardBreakdown,
} from '../pvp/PvpRecord';
import { escapeHtml, installModalFocusTrap } from './UiSafety';

const STYLE_ID = 'pvp-results-style';

export type PvpResultsAction = 'rematch' | 'lobby' | 'town';

export interface PvpResultsData {
  summary: PvpMatchSummary;
  record: PvpRecord;
  rewards: PvpRewardBreakdown;
  title: string;
  newTitle: string | null;
  /** Local player's display name, used in the headline when nobody is named. */
  localName: string;
  /** The local player watched from the bench: no purse, no record change. */
  spectator?: boolean;
}

interface RematchState {
  votes: number;
  total: number;
  needed: number;
  started: boolean;
}

function formatGold(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString('en-US');
}

const CSS = `
.pvp-res-overlay {
  position: fixed;
  inset: 0;
  z-index: 9400;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(10px, env(safe-area-inset-top)) 10px max(10px, env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at 50% 32%, rgba(80, 48, 20, 0.28), rgba(8, 6, 4, 0.86) 72%),
    rgba(4, 3, 2, 0.72);
  font-family: 'Outfit', 'Inter', sans-serif;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
.pvp-res-card {
  position: relative;
  width: min(760px, 100%);
  margin: auto;
  padding: 0;
  color: #f6e7c8;
  background: url('/assets/kenney-rpg-ui/panel_brown.png') repeat;
  border: 3px solid #3a2415;
  border-radius: 4px;
  box-shadow:
    0 0 0 1px rgba(255, 222, 168, 0.22) inset,
    0 18px 44px rgba(0, 0, 0, 0.65);
  image-rendering: pixelated;
  animation: pvp-res-in 220ms ease-out;
}
@keyframes pvp-res-in {
  from { opacity: 0; transform: translateY(10px) scale(0.985); }
  to { opacity: 1; transform: none; }
}
.pvp-res-card::before,
.pvp-res-card::after {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  border: 2px solid #f0d59b;
  opacity: 0.5;
  pointer-events: none;
}
.pvp-res-card::before { top: 5px; left: 5px; border-right: 0; border-bottom: 0; }
.pvp-res-card::after { bottom: 5px; right: 5px; border-left: 0; border-top: 0; }

.pvp-res-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px 8px;
  border-bottom: 2px solid rgba(28, 16, 8, 0.55);
}
.pvp-res-kicker {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1.6px;
  text-transform: uppercase;
  color: #d8b47c;
}
.pvp-res-verdict {
  font-family: 'Cinzel', Georgia, serif;
  font-weight: 900;
  font-size: clamp(24px, 6vw, 36px);
  line-height: 1;
  margin: 2px 0 4px;
  letter-spacing: 0.5px;
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.55);
}
.pvp-res-verdict.win { color: #ffdd8a; }
.pvp-res-verdict.loss { color: #f0a9a0; }
.pvp-res-verdict.draw { color: #e8dcc2; }
.pvp-res-verdict.spectate { color: #cbd5e1; letter-spacing: 0.08em; }
.pvp-res-purse-empty { color: #9ca3af; font-size: 11px; line-height: 1.5; padding: 10px 0; }
.pvp-res-score {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 800;
  color: #e5cfaa;
}
.pvp-res-score b { font-size: 15px; }
.pvp-res-score .red { color: #ff8f7c; }
.pvp-res-score .blue { color: #8fb9ff; }
.pvp-res-score .dot { opacity: 0.45; font-weight: 400; }
.pvp-res-sub { margin-top: 3px; font-size: 10px; color: #bfa17a; }

.pvp-res-record {
  flex: 0 0 auto;
  text-align: right;
  padding: 6px 10px;
  min-width: 132px;
  background: rgba(20, 12, 6, 0.42);
  border: 1px solid rgba(240, 213, 155, 0.28);
  border-radius: 3px;
}
.pvp-res-record b {
  display: block;
  font-family: 'Cinzel', serif;
  font-size: 12px;
  color: #ffdd8a;
  letter-spacing: 0.4px;
}
.pvp-res-record span { display: block; font-size: 9.5px; color: #c9ab82; margin-top: 2px; }

.pvp-res-body {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(210px, 1fr);
  gap: 12px;
  padding: 12px 16px;
}
.pvp-res-section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 1.3px;
  text-transform: uppercase;
  color: #d8b47c;
  margin-bottom: 6px;
}
.pvp-res-section-title::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, rgba(216, 180, 124, 0.45), transparent);
}

/* series bracket */
.pvp-res-series {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  margin-top: 7px;
}
.pvp-res-series .chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  font-size: 8.5px;
  font-weight: 800;
  letter-spacing: 0.4px;
  border-radius: 2px;
  border: 1px solid rgba(240, 213, 155, 0.3);
  background: rgba(18, 11, 6, 0.4);
  color: #d9c3a0;
  white-space: nowrap;
}
.pvp-res-series .chip.red { border-color: rgba(255, 143, 124, 0.55); color: #ffb3a1; }
.pvp-res-series .chip.blue { border-color: rgba(143, 185, 255, 0.55); color: #a9c8ff; }
.pvp-res-series .chip.draw { color: #d9c3a0; }
.pvp-res-series .chip b { color: #fff3d6; }
.pvp-res-series .reason { opacity: 0.72; font-weight: 700; }

/* roster */
.pvp-res-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  background: rgba(18, 11, 6, 0.35);
  border: 1px solid rgba(240, 213, 155, 0.18);
}
.pvp-res-table th {
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: #b79568;
  padding: 5px 6px;
  text-align: right;
  border-bottom: 1px solid rgba(240, 213, 155, 0.22);
  white-space: nowrap;
}
.pvp-res-table th:first-child { text-align: left; }
.pvp-res-table td {
  padding: 5px 6px;
  text-align: right;
  border-bottom: 1px solid rgba(240, 213, 155, 0.08);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.pvp-res-table td:first-child { text-align: left; }
.pvp-res-table tr.team-red td { border-left: 2px solid rgba(185, 53, 38, 0.75); }
.pvp-res-table tr.team-blue td { border-left: 2px solid rgba(52, 96, 168, 0.8); }
.pvp-res-table tr.is-local { background: rgba(255, 216, 138, 0.09); }
.pvp-res-table tr.is-local td:first-child { color: #ffe6ae; font-weight: 800; }
.pvp-res-table tr.is-mvp td { background: rgba(255, 196, 84, 0.10); }
.pvp-res-name { display: inline-flex; align-items: center; gap: 5px; max-width: 190px; }
.pvp-res-name img { width: 16px; height: 16px; image-rendering: pixelated; flex: 0 0 auto; }
.pvp-res-name span { overflow: hidden; text-overflow: ellipsis; }
.pvp-res-tag {
  font-size: 7.5px;
  font-weight: 900;
  letter-spacing: 0.5px;
  padding: 1px 4px;
  border-radius: 2px;
  flex: 0 0 auto;
}
.pvp-res-tag.you { background: #6b4a22; color: #ffe6ae; border: 1px solid #c69a52; }
.pvp-res-tag.mvp { background: #b8860b; color: #201302; border: 1px solid #ffe08a; }
.pvp-res-tag.bot { background: rgba(0, 0, 0, 0.35); color: #a99578; border: 1px solid #5d472c; }

/* mvp + rewards column */
.pvp-res-side { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.pvp-res-mvp {
  position: relative;
  padding: 9px 10px 10px;
  background: linear-gradient(160deg, rgba(120, 86, 26, 0.55), rgba(46, 31, 13, 0.5));
  border: 1px solid rgba(255, 214, 138, 0.42);
  border-radius: 3px;
}
.pvp-res-mvp .crown { font-size: 15px; line-height: 1; }
.pvp-res-mvp-name {
  font-family: 'Cinzel', serif;
  font-size: 15px;
  font-weight: 900;
  color: #ffe6ae;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pvp-res-mvp-line {
  margin-top: 4px;
  font-size: 9.5px;
  color: #d9bf94;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.pvp-res-mvp-line b { color: #fff2d2; }

.pvp-res-purse { display: flex; flex-direction: column; gap: 3px; font-size: 10.5px; }
.pvp-res-purse-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  color: #cbb08a;
  padding: 2px 0;
}
.pvp-res-purse-row b { color: #ffe6ae; font-variant-numeric: tabular-nums; }
.pvp-res-purse-total {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  margin-top: 5px;
  padding-top: 6px;
  border-top: 1px solid rgba(240, 213, 155, 0.3);
}
.pvp-res-purse-total span { font-size: 9px; letter-spacing: 1px; text-transform: uppercase; color: #d8b47c; }
.pvp-res-purse-total b { font-family: 'Cinzel', serif; font-size: 20px; color: #ffd76e; }
.pvp-res-title {
  font-size: 9.5px;
  color: #cdb08a;
  padding: 6px 8px;
  border: 1px dashed rgba(240, 213, 155, 0.28);
  border-radius: 3px;
}
.pvp-res-title b { color: #ffe6ae; }
.pvp-res-title.new { border-style: solid; border-color: #c69a52; background: rgba(198, 154, 82, 0.12); }

.pvp-res-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 16px 14px;
  border-top: 2px solid rgba(28, 16, 8, 0.55);
}
.pvp-res-vote { font-size: 9.5px; color: #c3a67f; min-height: 14px; }
.pvp-res-vote b { color: #ffe6ae; }
.pvp-res-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.pvp-res-btn {
  appearance: none;
  border: 0;
  padding: 9px 16px;
  min-height: 40px;
  cursor: pointer;
  color: #f7edd8;
  font-family: inherit;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  background: url('/assets/kenney-rpg-ui/buttonLong_brown.png') no-repeat center / 100% 100%;
  image-rendering: pixelated;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.55);
}
.pvp-res-btn.primary { background-image: url('/assets/kenney-rpg-ui/buttonLong_blue.png'); }
.pvp-res-btn:hover:not(:disabled) { filter: brightness(1.14); }
.pvp-res-btn:active:not(:disabled) { transform: translateY(1px); }
.pvp-res-btn:focus-visible { outline: 2px solid #ffe08a; outline-offset: 2px; }
.pvp-res-btn:disabled { opacity: 0.55; cursor: default; }

@media (max-width: 640px) {
  .pvp-res-overlay { align-items: flex-start; }
  .pvp-res-head { flex-direction: column; gap: 8px; padding: 10px 12px 8px; }
  .pvp-res-record { width: 100%; text-align: left; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .pvp-res-record span { margin-top: 0; }
  .pvp-res-body { grid-template-columns: 1fr; gap: 10px; padding: 10px 12px; }
  .pvp-res-table { font-size: 10.5px; }
  .pvp-res-table th, .pvp-res-table td { padding: 4px; }
  .pvp-res-table th.hide-sm, .pvp-res-table td.hide-sm { display: none; }
  .pvp-res-name { max-width: 132px; }
  .pvp-res-foot { flex-direction: column; align-items: stretch; padding: 8px 12px 12px; }
  .pvp-res-actions { width: 100%; }
  .pvp-res-btn { flex: 1 1 auto; }
}
@media (max-width: 380px) {
  .pvp-res-table th.hide-xs, .pvp-res-table td.hide-xs { display: none; }
  .pvp-res-name { max-width: 104px; }
}
@media (prefers-reduced-motion: reduce) {
  .pvp-res-card { animation: none; }
}
`;

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement('style');
  tag.id = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

const CLASS_ICONS: Record<string, string> = {
  warrior: '/assets/UI/skills/warrior/01_icon.png',
  mage: '/assets/UI/skills/mage/01_icon.png',
  archer: '/assets/UI/skills/archer/01_icon.png',
  rogue: '/assets/UI/skills/rogue/01_icon.png',
  cleric: '/assets/UI/skills/cleric/01_icon.png',
};

export class PvpResultsUI {
  private overlay: HTMLDivElement | null = null;
  private parent: HTMLElement;
  private data: PvpResultsData;
  private onAction: (action: PvpResultsAction) => void;
  private onVote: (() => void) | null;
  private onCloseVote: (() => void) | null;
  private releaseFocus: (() => void) | null = null;
  private rematch: RematchState = { votes: 0, total: 0, needed: 0, started: false };
  private voted = false;

  constructor(
    parent: HTMLElement,
    data: PvpResultsData,
    onAction: (action: PvpResultsAction) => void,
    options: { onVote?: () => void; onCloseVote?: () => void } = {},
  ) {
    this.parent = parent;
    this.data = data;
    this.onAction = onAction;
    this.onVote = options.onVote || null;
    this.onCloseVote = options.onCloseVote || null;
  }

  public get isOpen(): boolean {
    return Boolean(this.overlay);
  }

  public open(): void {
    if (this.overlay) return;
    ensureStyles();
    const host = document.createElement('div');
    host.className = 'pvp-res-overlay';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    host.setAttribute('aria-label', 'Match results');
    host.innerHTML = this.markup();
    (this.parent || document.body).appendChild(host);
    this.overlay = host;

    host.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.action as PvpResultsAction | 'vote' | undefined;
        if (action === 'vote') {
          this.voteRematch();
          return;
        }
        if (!action) return;
        audio.playClick();
        this.onAction(action);
      });
    });

    this.releaseFocus = installModalFocusTrap(host, {
      onEscape: () => {
        audio.playClick();
        this.onAction('town');
      },
    });
    // Land focus on the primary choice, not on the card itself.
    host.querySelector<HTMLButtonElement>('.pvp-res-btn.primary')?.focus();

    // A soft crowd bed while the card is up sells the "arena emptying out" beat.
    audio.playCrowdCheer(0.45);
  }

  public close(): void {
    this.releaseFocus?.();
    this.releaseFocus = null;
    if (this.overlay?.parentNode) this.overlay.parentNode.removeChild(this.overlay);
    this.overlay = null;
    this.voted = false;
  }

  /** Server-side vote tally for the rematch prompt. */
  public setRematchState(state: RematchState): void {
    this.rematch = state;
    if (!this.overlay) return;
    const note = this.overlay.querySelector<HTMLElement>('.pvp-res-vote');
    const button = this.overlay.querySelector<HTMLButtonElement>('[data-action="vote"]');
    const lobbyButton = this.overlay.querySelector<HTMLButtonElement>('[data-action="lobby"]');
    if (button) {
      // The first tally may reveal a room the lobby snapshot did not mention
      // (or lose one everybody left); both change which button leads.
      const hasRoom = state.needed > 0;
      button.hidden = !hasRoom;
      if (lobbyButton) {
        lobbyButton.textContent = hasRoom ? 'LOBBY' : 'NEW MATCH';
        lobbyButton.classList.toggle('primary', !hasRoom);
      }
      const waiting = hasRoom && state.votes < state.needed;
      button.disabled = this.voted || state.started;
      button.textContent = state.started
        ? 'STARTING…'
        : this.voted
          ? 'VOTE LOCKED'
          : waiting
            ? `REMATCH (${state.votes}/${state.needed})`
            : 'REMATCH';
    }
    if (note) {
      if (state.started) {
        note.innerHTML = '<b>Rematch accepted.</b> Back to the arena…';
      } else if (this.voted) {
        note.innerHTML = `<b>${state.votes}/${state.needed}</b> ready · waiting for the rest of the room…`;
      } else if (state.needed > 0) {
        note.innerHTML = `<b>${state.votes}/${state.needed}</b> want a rematch`;
      } else {
        note.textContent = '';
      }
    }
  }

  /** Called when the server refuses a rematch (someone left, room closed). */
  public notifyVoteFailed(message: string): void {
    if (!this.voted) return;
    this.voted = false;
    const note = this.overlay?.querySelector<HTMLElement>('.pvp-res-vote');
    if (note) note.textContent = message;
    this.setRematchState(this.rematch);
    const button = this.overlay?.querySelector<HTMLButtonElement>('[data-action="vote"]');
    if (button) button.disabled = false;
  }

  private voteRematch(): void {
    if (this.voted || !this.onVote) return;
    audio.playClick();
    this.voted = true;
    this.onVote();
    this.setRematchState({ ...this.rematch, votes: Math.max(1, this.rematch.votes + 1) });
  }

  private markup(): string {
    const { summary, record, rewards, title, newTitle } = this.data;
    const spectating = Boolean(this.data.spectator);
    const verdict = spectating
      ? 'spectate'
      : summary.winningTeam === null
        ? 'draw'
        : summary.localWon ? 'win' : 'loss';
    const verdictText = spectating
      ? 'MATCH COMPLETE'
      : verdict === 'draw' ? 'DRAW' : verdict === 'win' ? 'VICTORY' : 'DEFEAT';
    const formatLabel = summary.format.toUpperCase();
    const roundWord = summary.redScore + summary.blueScore === 1 ? 'ROUND' : 'ROUNDS';

    const rows = (team: 'red' | 'blue') => summary.rows
      .filter(row => row.team === team)
      .map(row => this.rowMarkup(row, summary.mvp?.id === row.id))
      .join('');

    const mvp = summary.mvp;
    const mvpBits = mvp
      ? `<div class="pvp-res-mvp">
          <div class="crown">👑</div>
          <div class="pvp-res-mvp-name">${escapeHtml(mvp.name)}</div>
          <div class="pvp-res-mvp-line">
            <span><b>${mvp.kills}</b> kills</span>
            <span><b>${formatGold(mvp.damageDealt)}</b> damage</span>
            <span><b>${mvp.deaths}</b> deaths</span>
          </div>
        </div>`
      : '';

    const purseRows: Array<[string, number]> = [
      ['Match purse', rewards.base],
      ['Rounds won', rewards.rounds],
    ];
    if (rewards.mvp > 0) purseRows.push(['MVP bonus', rewards.mvp]);
    if (rewards.streak > 0) purseRows.push([`Win streak x${record.winStreak}`, rewards.streak]);
    if (rewards.firstWin > 0) purseRows.push(['First win today', rewards.firstWin]);

    const purse = purseRows
      .filter(([, value]) => value > 0)
      .map(([label, value]) => `<div class="pvp-res-purse-row"><span>${escapeHtml(label)}</span><b>${formatGold(value)}</b></div>`)
      .join('');

    const titleBlock = newTitle
      ? `<div class="pvp-res-title new">New title earned · <b>${escapeHtml(newTitle)}</b></div>`
      : `<div class="pvp-res-title">Title · <b>${escapeHtml(title)}</b></div>`;

    const sudden = summary.suddenDeathRounds > 0
      ? `<span class="pvp-res-score"><span class="dot">·</span>${summary.suddenDeathRounds} sudden death</span>`
      : '';

    const hasRoom = this.rematch.needed > 0 && !spectating;
    const rematchButton = `<button type="button" class="pvp-res-btn primary" data-action="vote" ${hasRoom ? '' : 'hidden'}>REMATCH</button>`;
    const lobbyButtonLabel = hasRoom ? 'LOBBY' : 'NEW MATCH';

    return `
      <div class="pvp-res-card">
        <div class="pvp-res-head">
          <div>
            <div class="pvp-res-kicker">Colosseum · ${escapeHtml(formatLabel)} · Best of 3</div>
            <div class="pvp-res-verdict ${verdict}">${verdictText}</div>
            <div>
              <span class="pvp-res-score">
                <span class="red">${escapeHtml(this.teamLabel(summary, 'red'))} <b>${summary.redScore}</b></span>
                <span class="dot">—</span>
                <span class="blue"><b>${summary.blueScore}</b> ${escapeHtml(this.teamLabel(summary, 'blue'))}</span>
              </span>
              <span class="pvp-res-score"><span class="dot">·</span>${summary.redScore + summary.blueScore} ${roundWord}</span>
              ${sudden}
            </div>
            <div class="pvp-res-series">${this.seriesChips()}</div>
            <div class="pvp-res-sub">${escapeHtml(this.subtitle())}</div>
          </div>
          <div class="pvp-res-record">
            ${spectating
              ? `<b>SPECTATOR</b><span>No rating change</span><span>Bench view</span>`
              : `<b>${escapeHtml(pvpTitleFor(record))}</b>
                 <span>${escapeHtml(describePvpRecord(record))}</span>
                 <span>${pvpRating(record)} arena rating</span>`}
          </div>
        </div>

        <div class="pvp-res-body">
          <div>
            <div class="pvp-res-section-title">Bout scoreboard</div>
            <table class="pvp-res-table">
              <thead>
                <tr>
                  <th>Fighter</th>
                  <th>K</th>
                  <th>D</th>
                  <th class="hide-sm">Dealt</th>
                  <th class="hide-xs">Taken</th>
                </tr>
              </thead>
              <tbody>
                ${rows('red')}
                ${rows('blue')}
              </tbody>
            </table>
          </div>
          <div class="pvp-res-side">
            <div>
              <div class="pvp-res-section-title">Match MVP</div>
              ${mvpBits}
            </div>
            <div>
              <div class="pvp-res-section-title">Spoils</div>
              ${spectating
                ? `<div class="pvp-res-purse pvp-res-purse-empty">You watched this bout from the bench. Watching is free — no gold, no rating, no streak.</div>`
                : `<div class="pvp-res-purse">
                     ${purse}
                     <div class="pvp-res-purse-total"><span>Total gold</span><b>+${formatGold(rewards.total)}</b></div>
                   </div>`}
            </div>
            ${spectating ? '' : titleBlock}
          </div>
        </div>

        <div class="pvp-res-foot">
          <div class="pvp-res-vote">${hasRoom ? `<b>0/${this.rematch.needed}</b> want a rematch` : ''}</div>
          <div class="pvp-res-actions">
            ${rematchButton}
            <button type="button" class="pvp-res-btn${hasRoom ? '' : ' primary'}" data-action="lobby">${lobbyButtonLabel}</button>
            <button type="button" class="pvp-res-btn" data-action="town">RETURN TO TOWN</button>
          </div>
        </div>
      </div>
    `;
  }

  /** The best-of-three series as a bracket: one chip per settled round. */
  private seriesChips(): string {
    const rounds = this.data.summary.rounds;
    if (!rounds.length) return '';
    return rounds.map((round) => {
      const winner = round.winner === 'red' || round.winner === 'blue' ? round.winner : 'draw';
      const reason = round.reason === 'sudden_death'
        ? 'OT'
        : round.reason === 'health_lead'
          ? 'HP'
          : round.reason === 'wipe'
            ? 'KO'
            : '';
      const side = winner === 'red' ? 'Crimson' : winner === 'blue' ? 'Azure' : 'Draw';
      const title = `Round ${round.roundNumber}: ${side}${reason ? ` (${reason})` : ''}`;
      return `<span class="chip ${winner}" title="${escapeHtml(title)}">R${round.roundNumber}<b>${winner === 'red' ? 'R' : winner === 'blue' ? 'B' : '—'}</b><span class="reason">${reason}</span></span>`;
    }).join('');
  }

  private rowMarkup(row: PvpScoreboardRow, isMvp: boolean): string {
    const tags: string[] = [];
    if (row.isLocal) tags.push('<span class="pvp-res-tag you">YOU</span>');
    if (isMvp) tags.push('<span class="pvp-res-tag mvp">MVP</span>');
    if (row.isBot) tags.push('<span class="pvp-res-tag bot">BOT</span>');
    const icon = CLASS_ICONS[row.className] || '';
    const classes = [
      `team-${row.team}`,
      row.isLocal ? 'is-local' : '',
      isMvp ? 'is-mvp' : '',
    ].filter(Boolean).join(' ');
    return `
      <tr class="${classes}">
        <td>
          <span class="pvp-res-name">
            ${icon ? `<img src="${icon}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}
            <span>${escapeHtml(row.name)}</span>
            ${tags.join('')}
          </span>
        </td>
        <td>${row.kills}</td>
        <td>${row.deaths}</td>
        <td class="hide-sm">${formatGold(row.damageDealt)}</td>
        <td class="hide-xs">${formatGold(row.damageTaken)}</td>
      </tr>
    `;
  }

  private teamLabel(summary: PvpMatchSummary, team: 'red' | 'blue'): string {
    const names = summary.rows.filter(row => row.team === team).map(row => row.name);
    if (names.length === 1) return names[0];
    return team === 'red' ? 'CRIMSON' : 'AZURE';
  }

  private subtitle(): string {
    const { summary } = this.data;
    if (this.data.spectator) {
      if (summary.winningTeam === null) return 'A draw — even the judges could not split them.';
      return summary.mvp
        ? `${summary.mvp.name} took MVP. You had the best seat in the house.`
        : 'The crowd settles. You had the best seat in the house.';
    }
    if (summary.winningTeam === null) {
      return 'No team broke through — the judges call it even.';
    }
    if (summary.localWon && summary.suddenDeathRounds > 0) {
      return 'Settled in sudden death. The arena will remember that one.';
    }
    if (summary.localWon) return 'The crowd is on its feet. Your team takes the arena.';
    if (summary.suddenDeathRounds > 0) return 'Overtime went the other way. One more round and it was yours.';
    return 'The other team takes the belt. Regroup and try the rematch.';
  }
}
