/**
 * Tournament Mode Lobby UI
 *
 * Allows players to configure 1v1, 2v2, 3v3, or 4v4 PvP matches:
 * - Format selection
 * - Team Red vs Team Blue slots
 * - Best of 3 / Best of 5 round structure
 * - Map verification (Gothic Bastion Arena with 7 parallax layers & solid ground)
 * - Strict adherence to project rules (no emojis in HUD/UI)
 */

import { audio } from '../engine/AudioManager';
import type { SideViewEngine } from '../engine/SideViewEngine';
import {
  TournamentMatch,
  type TournamentFormat,
  type TournamentTeam,
  TOURNAMENT_FORMAT_TEAM_SIZES,
  getNormalizedPvpBaseHp,
} from '../pvp/TournamentSystem';

export class TournamentLobbyUI {
  private overlay: HTMLDivElement | null = null;
  private parent: HTMLElement;
  private engine: SideViewEngine;
  private currentFormat: TournamentFormat = '1v1';
  private selectedRoundsToWin: number = 2; // Best of 3
  private selectedPlayerTeam: TournamentTeam = 'red';
  private onStartMatchCb: (match: TournamentMatch) => void;

  constructor(parent: HTMLElement, engine: SideViewEngine, onStartMatch: (match: TournamentMatch) => void) {
    this.parent = parent;
    this.engine = engine;
    this.onStartMatchCb = onStartMatch;
  }

  public get isOpen(): boolean {
    return this.overlay !== null;
  }

  public open(): void {
    if (this.overlay) this.close();
    audio.playPageTurn();

    this.overlay = document.createElement('div');
    this.overlay.className = 'dialogue-modal-backdrop tournament-lobby-modal';
    this.overlay.style.cssText = `
      position: fixed; inset: 0; background: rgba(8, 10, 16, 0.85);
      display: flex; align-items: center; justify-content: center;
      z-index: 10000; font-family: monospace, sans-serif;
    `;

    this.render();
    (this.parent || document.body).appendChild(this.overlay);

    // Escape key closes modal
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.close();
        window.removeEventListener('keydown', onKey);
      }
    };
    window.addEventListener('keydown', onKey);
  }

  public close(): void {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.overlay = null;
  }

  private render(): void {
    if (!this.overlay) return;
    this.overlay.innerHTML = '';

    const modal = document.createElement('div');
    modal.className = 'dialogue-box-frame';
    modal.style.cssText = `
      position: relative; width: 780px; max-width: 95vw; max-height: 90vh;
      overflow-y: auto; background: #13141f; border: 2px solid #583f6b;
      box-shadow: 0 0 24px rgba(88, 63, 107, 0.45); border-radius: 6px;
      color: #f1f5f9; padding: 20px 24px; box-sizing: border-box;
    `;

    // Standardized Top-Right Corner Close Button
    const closeBtn = document.createElement('button');
    closeBtn.id = 'tournament-close-top-btn';
    closeBtn.className = 'rpg-dialog-close-btn';
    closeBtn.style.cssText = `
      position: absolute; top: 12px; right: 14px;
      background: #231d2b; border: 1px solid #7c5c96; color: #e2e8f0;
      padding: 4px 10px; cursor: pointer; font-weight: bold; border-radius: 4px;
    `;
    closeBtn.textContent = '[X]';
    closeBtn.onclick = () => this.close();
    modal.appendChild(closeBtn);

    // Header Title
    const header = document.createElement('div');
    header.style.cssText = 'border-bottom: 1px solid #3b2c48; padding-bottom: 12px; margin-bottom: 16px;';
    header.innerHTML = `
      <div style="font-size: 10px; letter-spacing: 2px; color: #a855f7; text-transform: uppercase;">PvP ARENA COMBAT</div>
      <div style="font-size: 20px; font-weight: 900; color: #fbbf24; letter-spacing: 1px; margin-top: 2px;">
        COLOSSEUM TOURNAMENT: GOTHIC BASTION
      </div>
      <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">
        Normalized Stats | 0.22 PvP Damage Scale | Anti-Burst Shield | Diminishing CC
      </div>
    `;
    modal.appendChild(header);

    // Format Selector Tabs
    const formatRow = document.createElement('div');
    formatRow.style.cssText = 'display: flex; gap: 8px; margin-bottom: 18px;';
    const formats: TournamentFormat[] = ['1v1', '2v2', '3v3', '4v4'];
    const formatLabels: Record<TournamentFormat, string> = {
      '1v1': '1v1 DUEL',
      '2v2': '2v2 SKIRMISH',
      '3v3': '3v3 SQUAD',
      '4v4': '4v4 WAR',
    };

    for (const fmt of formats) {
      const isSelected = this.currentFormat === fmt;
      const tab = document.createElement('button');
      tab.style.cssText = `
        flex: 1; padding: 8px 12px; font-size: 12px; font-weight: 800;
        cursor: pointer; border-radius: 4px; transition: all 0.15s ease;
        background: ${isSelected ? '#6b21a8' : '#1e1c2e'};
        color: ${isSelected ? '#ffffff' : '#94a3b8'};
        border: 1px solid ${isSelected ? '#c084fc' : '#39334d'};
      `;
      tab.textContent = formatLabels[fmt];
      tab.onclick = () => {
        audio.playClick();
        this.currentFormat = fmt;
        this.render();
      };
      formatRow.appendChild(tab);
    }
    modal.appendChild(formatRow);

    // Team Rosters Display
    const teamSize = TOURNAMENT_FORMAT_TEAM_SIZES[this.currentFormat];
    const playerClass = this.engine.player.characterClass?.name || 'Warrior';
    const playerClassId = this.engine.player.characterClass?.id || 'warrior';
    const playerHp = getNormalizedPvpBaseHp(playerClassId);
    const playerName = this.engine.player.name || this.engine.player.characterClass?.name || 'Hero';

    const rostersContainer = document.createElement('div');
    rostersContainer.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;';

    // TEAM RED
    const redBox = document.createElement('div');
    redBox.style.cssText = `
      background: rgba(153, 27, 27, 0.12); border: 1px solid rgba(239, 68, 68, 0.35);
      border-radius: 6px; padding: 12px 14px;
    `;
    redBox.innerHTML = `
      <div style="font-size: 13px; font-weight: 900; color: #ef4444; margin-bottom: 8px; display: flex; justify-content: space-between;">
        <span>TEAM RED [WEST]</span>
        <span style="font-size: 11px; color: #fca5a5;">${teamSize} Fighter${teamSize > 1 ? 's' : ''}</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px;">
        <div style="background: rgba(30, 41, 59, 0.85); padding: 6px 10px; border-radius: 4px; border-left: 3px solid #ef4444; font-size: 12px;">
          <div style="font-weight: bold; color: #f8fafc;">${playerName} (YOU)</div>
          <div style="font-size: 10px; color: #94a3b8;">${playerClass.toUpperCase()} | HP: ${playerHp}</div>
        </div>
        ${this.generateAllySlots(teamSize)}
      </div>
    `;
    rostersContainer.appendChild(redBox);

    // TEAM BLUE
    const blueBox = document.createElement('div');
    blueBox.style.cssText = `
      background: rgba(30, 58, 138, 0.15); border: 1px solid rgba(59, 130, 246, 0.35);
      border-radius: 6px; padding: 12px 14px;
    `;
    blueBox.innerHTML = `
      <div style="font-size: 13px; font-weight: 900; color: #3b82f6; margin-bottom: 8px; display: flex; justify-content: space-between;">
        <span>TEAM BLUE [EAST]</span>
        <span style="font-size: 11px; color: #93c5fd;">${teamSize} Fighter${teamSize > 1 ? 's' : ''}</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px;">
        ${this.generateEnemySlots(teamSize)}
      </div>
    `;
    rostersContainer.appendChild(blueBox);
    modal.appendChild(rostersContainer);

    // Arena Map & Match Rules Bar
    const infoBar = document.createElement('div');
    infoBar.style.cssText = `
      background: #181726; border: 1px solid #362f49; border-radius: 6px;
      padding: 10px 14px; margin-bottom: 20px; font-size: 11px; color: #cbd5e1;
      display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
    `;
    infoBar.innerHTML = `
      <div>
        <span style="color: #a855f7; font-weight: bold;">ARENA MAP:</span> Gothic Bastion<br>
        <span style="color: #64748b;">7 Parallax Layers | Ground: 0.7972 | Triple Ledges</span>
      </div>
      <div>
        <span style="color: #fbbf24; font-weight: bold;">MATCH FORMAT:</span> Best of 3 (90s / round)<br>
        <span style="color: #64748b;">Tiebreak: Highest Remaining Health %</span>
      </div>
    `;
    modal.appendChild(infoBar);

    // Action Buttons
    const actionRow = document.createElement('div');
    actionRow.style.cssText = 'display: flex; gap: 12px; justify-content: flex-end;';

    const cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = `
      padding: 10px 18px; background: #262338; border: 1px solid #4a4466;
      color: #94a3b8; font-weight: bold; border-radius: 4px; cursor: pointer;
    `;
    cancelBtn.textContent = 'CANCEL';
    cancelBtn.onclick = () => this.close();

    const startBtn = document.createElement('button');
    startBtn.style.cssText = `
      padding: 10px 24px; background: #f59e0b; border: 1px solid #fde047;
      color: #1a0f02; font-weight: 900; font-size: 13px; letter-spacing: 1px;
      border-radius: 4px; cursor: pointer; box-shadow: 0 0 12px rgba(245, 158, 11, 0.35);
    `;
    startBtn.textContent = 'ENTER TOURNAMENT ARENA';
    startBtn.onclick = () => {
      audio.playLevelUp();
      const match = new TournamentMatch({
        format: this.currentFormat,
        roundsToWin: this.selectedRoundsToWin,
        roundDurationSec: 90,
        mapTheme: 'tournament_arena',
      });
      match.setupTeams(playerName, playerClassId, this.currentFormat);
      this.close();
      this.onStartMatchCb(match);
    };

    actionRow.appendChild(cancelBtn);
    actionRow.appendChild(startBtn);
    modal.appendChild(actionRow);

    this.overlay.appendChild(modal);
  }

  private generateAllySlots(teamSize: number): string {
    if (teamSize <= 1) return '';
    const allies = [
      { name: 'Paladin Roland (AI)', class: 'Hero Knight', hp: 1800 },
      { name: 'Huntress Lyra (AI)', class: 'Huntress', hp: 1350 },
      { name: 'Priestess Serena (AI)', class: 'Priestess', hp: 1350 },
    ];
    let html = '';
    for (let i = 1; i < teamSize; i++) {
      const a = allies[(i - 1) % allies.length];
      html += `
        <div style="background: rgba(30, 41, 59, 0.65); padding: 6px 10px; border-radius: 4px; border-left: 3px solid #f87171; font-size: 12px;">
          <div style="font-weight: bold; color: #f8fafc;">${a.name}</div>
          <div style="font-size: 10px; color: #94a3b8;">${a.class.toUpperCase()} | HP: ${a.hp}</div>
        </div>
      `;
    }
    return html;
  }

  private generateEnemySlots(teamSize: number): string {
    const enemies = [
      { name: 'Gladiator Marcus (AI)', class: 'Warrior', hp: 1550 },
      { name: 'Valkyrie Freya (AI)', class: 'Hero Knight', hp: 1800 },
      { name: 'Shadowblade Kael (AI)', class: 'Nightborne', hp: 1550 },
      { name: 'Archmage Zephyr (AI)', class: 'Wizard', hp: 1350 },
    ];
    let html = '';
    for (let i = 0; i < teamSize; i++) {
      const e = enemies[i % enemies.length];
      html += `
        <div style="background: rgba(30, 41, 59, 0.65); padding: 6px 10px; border-radius: 4px; border-left: 3px solid #60a5fa; font-size: 12px;">
          <div style="font-weight: bold; color: #f8fafc;">${e.name}</div>
          <div style="font-size: 10px; color: #94a3b8;">${e.class.toUpperCase()} | HP: ${e.hp}</div>
        </div>
      `;
    }
    return html;
  }
}
