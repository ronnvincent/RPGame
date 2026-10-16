/**
 * Tournament Mode & Multiplayer PvP Colosseum Lobby UI
 *
 * Authentic Dark Fantasy Action RPG Colosseum staging area:
 * - Uses real Kenney RPG UI pixel assets (/assets/kenney-rpg-ui/)
 * - Mobile Legends: Bang Bang style 2-team custom room (Crimson vs Azure)
 * - Zero AI bots: real connected players only
 * - Live animated pixel hero sprites on pedestals facing each other
 * - Immediate optimistic state updates so buttons respond with 0ms lag
 * - Integrated tabs: [Arena Stage], [Invite Friends], [Public Duels]
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
import { network, type LobbyState, type LobbyMember, type FriendEntry } from '../network/NetworkManager';
import { CHARACTER_CLASSES } from '../classes/ClassDefinitions';
import { HERO_SPRITES, heroFrame } from '../engine/HeroSprites';
import {
  escapeHtml,
  escapeHtmlAttribute,
  installModalFocusTrap,
} from './UiSafety';

const STYLE_ID = 'tournament-lobby-style';

function classOf(classId: string | null) {
  return CHARACTER_CLASSES.find(c => c.id === classId) || null;
}

function classIcon(classId: string | null): string | null {
  const cls = classOf(classId);
  return cls?.skills?.[0]?.iconImage || null;
}

export class TournamentLobbyUI {
  private overlay: HTMLDivElement | null = null;
  private parent: HTMLElement;
  private engine: SideViewEngine;
  public currentFormat: TournamentFormat = '1v1';
  private localTeam: TournamentTeam = 'red';
  private onStartMatchCb: (match: TournamentMatch) => void;

  private state: LobbyState | null = null;
  private friends: FriendEntry[] = [];
  private pvpLobbies: any[] = [];
  private activeTab: 'arena' | 'invite' | 'public' = 'arena';

  private idleFrame: number = 0;
  private idleTimer: number | null = null;
  private unsubs: Array<() => void> = [];
  private releaseFocus: (() => void) | null = null;
  private toastTimer: number | null = null;

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
    this.injectStyle();

    this.overlay = document.createElement('div');
    this.overlay.className = 'tournament-lobby-backdrop';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-labelledby', 'pvp-colosseum-title');

    // Subscribe to network events
    const unsubState = network.onLobbyState((state) => {
      this.state = state;
      if (state.pvpFormat && ['1v1', '2v2', '3v3', '4v4'].includes(state.pvpFormat)) {
        this.currentFormat = state.pvpFormat;
      }
      const myId = network.getActorId();
      if (state.pvpTeams && state.pvpTeams[myId]) {
        this.localTeam = state.pvpTeams[myId];
      }
      if (state.started) {
        this.close();
      } else {
        this.render();
      }
    });
    this.unsubs.push(unsubState);

    network.onFriends((friends) => {
      this.friends = friends;
      if (this.overlay && this.activeTab === 'invite') this.render();
    });

    network.onPvpLobbyList((lobbies) => {
      this.pvpLobbies = lobbies || [];
      if (this.overlay && this.activeTab === 'public') this.render();
    });

    network.onLobbyLeft(() => {
      this.close();
    });

    network.onLobbyError((msg) => {
      this.toast(msg);
    });

    // Check if player is already in a PvP room
    if (network.currentLobbyState && network.currentLobbyState.isPvp) {
      this.state = network.currentLobbyState;
      if (this.state.pvpFormat) this.currentFormat = this.state.pvpFormat;
      const myId = network.getActorId();
      if (this.state.pvpTeams && this.state.pvpTeams[myId]) {
        this.localTeam = this.state.pvpTeams[myId];
      }
    } else {
      network.createPvpLobby('tournament_colosseum', this.currentFormat, this.localTeam);
    }

    network.requestFriends();
    network.browsePvpLobbies();

    (this.parent || document.body).appendChild(this.overlay);
    this.render();

    this.releaseFocus = installModalFocusTrap(this.overlay, {
      onEscape: () => {
        this.handleLeaveOrClose();
      },
    });

    // Animate idle heroes on pedestals
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      || document.documentElement.dataset.rpgReducedMotion === 'true';
    if (!reducedMotion) {
      this.idleTimer = window.setInterval(() => {
        this.idleFrame++;
        if (!this.overlay) return;
        this.overlay.querySelectorAll<HTMLImageElement>('.pvp-pedestal-sprite').forEach((img) => {
          const cls = img.getAttribute('data-class');
          if (cls) {
            const set = HERO_SPRITES[cls];
            const maxF = set?.anims?.idle || 8;
            img.src = heroFrame(cls, 'idle', this.idleFrame % maxF);
          }
        });
      }, 110);
    }
  }

  public close(): void {
    if (this.idleTimer !== null) {
      window.clearInterval(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];

    this.releaseFocus?.();
    this.releaseFocus = null;

    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.overlay = null;
  }

  private handleLeaveOrClose(): void {
    audio.playClick();
    network.leaveLobby();
    this.close();
  }

  private toast(msg: string): void {
    if (!this.overlay) return;
    const el = this.overlay.querySelector('.pvp-toast') as HTMLElement | null;
    if (!el) return;
    el.textContent = msg;
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      if (el) {
        el.style.opacity = '0';
        el.style.transform = 'translateY(-8px)';
      }
    }, 2800);
  }

  /** Synthesizes or retrieves the local player representation */
  private getLocalMember(): LobbyMember {
    const aid = network.getActorId();
    const storedName = localStorage.getItem('playerName') || '';
    const storedClass = localStorage.getItem('lastClassId') || '';
    const storedLevel = Number(localStorage.getItem('playerLevel')) || 1;
    const p = this.engine.player;

    return {
      actorId: aid,
      uuid: localStorage.getItem('playerUUID') || 'guest',
      socketId: network.socket?.id || null,
      name: p?.name || storedName || 'Champion',
      shortId: localStorage.getItem('playerShortId') || 'CECT-HERO',
      classId: p?.characterClass?.id || storedClass || 'warrior',
      level: p?.level || storedLevel || 1,
      power: (p as any)?.power || 150,
      team: this.localTeam,
      ready: true,
      isHost: network.isHost,
      online: true,
    };
  }

  private switchTeam(targetTeam: TournamentTeam): void {
    audio.playClick();
    this.localTeam = targetTeam;
    if (this.state) {
      if (!this.state.pvpTeams) this.state.pvpTeams = {};
      this.state.pvpTeams[network.getActorId()] = targetTeam;
    }
    network.switchPvpTeam(targetTeam);
    this.render();
  }

  private setFormat(fmt: TournamentFormat): void {
    audio.playClick();
    this.currentFormat = fmt;
    if (this.state) {
      this.state.pvpFormat = fmt;
      this.state.maxPlayers = TOURNAMENT_FORMAT_TEAM_SIZES[fmt] * 2;
    }
    network.setPvpFormat(fmt);
    this.render();
  }

  private toggleReady(): void {
    audio.playClick();
    const myId = network.getActorId();
    const me = this.state?.members.find(m => m.actorId === myId || m.uuid === myId);
    const nextReady = !(me?.ready);
    if (me) me.ready = nextReady;
    network.sendReady(nextReady);
    this.render();
  }

  private startTournament(): void {
    audio.playLevelUp();
    network.startMatch();
  }

  private render(): void {
    if (!this.overlay) return;
    this.overlay.innerHTML = '';

    const st = this.state;
    const teamSize = TOURNAMENT_FORMAT_TEAM_SIZES[this.currentFormat];
    const myId = network.getActorId();
    const me = this.getLocalMember();

    // Ensure local player is always in member list
    const rawMembers = st?.members && st.members.length > 0 ? [...st.members] : [me];
    if (!rawMembers.some(m => m.actorId === myId || m.uuid === myId)) {
      rawMembers.unshift(me);
    }

    const redMembers: LobbyMember[] = [];
    const blueMembers: LobbyMember[] = [];

    for (const m of rawMembers) {
      const aid = m.actorId || m.uuid;
      const isMe = aid === myId;
      const assigned = isMe
        ? this.localTeam
        : ((st?.pvpTeams && st.pvpTeams[aid]) || m.team || 'red');

      if (assigned === 'blue') {
        blueMembers.push(m);
      } else {
        redMembers.push(m);
      }
    }

    const iAmHost = network.isHost;
    const hasBothTeams = redMembers.length >= 1 && blueMembers.length >= 1;
    const allGuestsReady = rawMembers.every(m => m.isHost || m.ready);
    const canLaunch = iAmHost && hasBothTeams && allGuestsReady;

    let launchNotice = '';
    if (!hasBothTeams) {
      launchNotice = 'Requires at least 1 warrior on Crimson and 1 on Azure.';
    } else if (!allGuestsReady) {
      const unreadyCount = rawMembers.filter(m => !m.isHost && !m.ready).length;
      launchNotice = `Waiting for ${unreadyCount} challenger${unreadyCount > 1 ? 's' : ''} to ready up.`;
    }

    const modal = document.createElement('div');
    modal.className = 'pvp-modal-shell';

    // 1. Top Header
    const header = document.createElement('div');
    header.className = 'pvp-header';
    header.innerHTML = `
      <div class="pvp-title-cluster">
        <h1 class="pvp-title" id="pvp-colosseum-title">THE GRAND COLOSSEUM</h1>
        <div class="pvp-subtitle">Multiplayer PvP Duel • Mobile Legends Custom Format</div>
      </div>
      <div class="pvp-header-actions">
        <div class="pvp-room-code-tag" title="Click to copy Room Code">
          <span class="pvp-tag-label">ROOM:</span>
          <span class="pvp-tag-val">${escapeHtml(st?.roomId || 'ARENA-LOBBY')}</span>
          <span class="pvp-tag-copy">📋</span>
        </div>
        <button class="pvp-close-btn" aria-label="Close Colosseum" title="Leave or Close">&times;</button>
      </div>
    `;

    header.querySelector('.pvp-room-code-tag')?.addEventListener('click', () => {
      if (st?.roomId) {
        navigator.clipboard?.writeText(st.roomId);
        this.toast('Room code copied to clipboard!');
      }
    });
    header.querySelector('.pvp-close-btn')?.addEventListener('click', () => {
      this.handleLeaveOrClose();
    });
    modal.appendChild(header);

    // 2. Navigation Tabs (Arena Stage vs Invite Friends vs Public Duels)
    const tabsBar = document.createElement('div');
    tabsBar.className = 'pvp-nav-tabs';
    tabsBar.innerHTML = `
      <button class="pvp-nav-tab ${this.activeTab === 'arena' ? 'active' : ''}" data-tab="arena">
        ⚔️ VERSUS ARENA
      </button>
      <button class="pvp-nav-tab ${this.activeTab === 'invite' ? 'active' : ''}" data-tab="invite">
        👥 INVITE FRIENDS
      </button>
      <button class="pvp-nav-tab ${this.activeTab === 'public' ? 'active' : ''}" data-tab="public">
        📜 PUBLIC DUELS
      </button>
    `;

    tabsBar.querySelectorAll<HTMLButtonElement>('.pvp-nav-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = btn.getAttribute('data-tab') as 'arena' | 'invite' | 'public';
        if (t && t !== this.activeTab) {
          audio.playClick();
          this.activeTab = t;
          if (t === 'public') network.browsePvpLobbies();
          this.render();
        }
      });
    });
    modal.appendChild(tabsBar);

    // 3. Tab Contents
    if (this.activeTab === 'arena') {
      // Format selector bar
      const formatBar = document.createElement('div');
      formatBar.className = 'pvp-format-selector';
      const formats: Array<{ id: TournamentFormat; label: string }> = [
        { id: '1v1', label: '1v1 DUEL' },
        { id: '2v2', label: '2v2 SKIRMISH' },
        { id: '3v3', label: '3v3 SQUAD' },
        { id: '4v4', label: '4v4 GUILD WAR' },
      ];

      let formatHtml = '<div class="pvp-format-buttons">';
      for (const f of formats) {
        const isSel = this.currentFormat === f.id;
        formatHtml += `
          <button class="pvp-fmt-btn ${isSel ? 'active' : ''}" data-format="${f.id}" ${!iAmHost ? 'disabled' : ''}>
            ${f.label}
          </button>
        `;
      }
      formatHtml += '</div>';
      if (!iAmHost) {
        formatHtml += '<span class="pvp-host-only-note">(Host sets match format)</span>';
      }
      formatBar.innerHTML = formatHtml;

      if (iAmHost) {
        formatBar.querySelectorAll<HTMLButtonElement>('.pvp-fmt-btn').forEach((btn) => {
          btn.addEventListener('click', () => {
            const fmt = btn.getAttribute('data-format') as TournamentFormat;
            if (fmt && fmt !== this.currentFormat) {
              this.setFormat(fmt);
            }
          });
        });
      }
      modal.appendChild(formatBar);

      // Symmetrical Versus Stage
      const stage = document.createElement('div');
      stage.className = `pvp-versus-stage pvp-stage-${this.currentFormat}`;

      // Left Column: Crimson Legion (Red)
      const leftCol = document.createElement('div');
      leftCol.className = 'pvp-team-col pvp-col-red';
      leftCol.innerHTML = `
        <div class="pvp-team-banner banner-red">
          <div class="pvp-banner-title">CRIMSON LEGION</div>
          <div class="pvp-banner-count">${redMembers.length} / ${teamSize} WARRIORS</div>
        </div>
        <div class="pvp-slots-container">
          ${this.renderTeamSlots('red', teamSize, redMembers, myId, iAmHost)}
        </div>
      `;
      stage.appendChild(leftCol);

      // Center Divider: VS Medallion & Switch Button
      const centerCol = document.createElement('div');
      centerCol.className = 'pvp-center-col';
      const canSwitch = this.localTeam === 'red' ? (blueMembers.length < teamSize) : (redMembers.length < teamSize);
      const otherTeamName = this.localTeam === 'red' ? 'AZURE' : 'CRIMSON';
      const switchTarget = this.localTeam === 'red' ? 'blue' : 'red';

      centerCol.innerHTML = `
        <div class="pvp-vs-emblem">VS</div>
        <button class="pvp-switch-team-btn" data-action="switch-team" ${!canSwitch ? 'disabled' : ''}>
          <span>⇄ SWITCH TO</span>
          <b>${otherTeamName}</b>
        </button>
        <div class="pvp-balance-badge">
          <b>PVP BALANCING</b>
          <span>0.22 Multiplier</span>
          <span>Anti-Burst Aegis</span>
          <span>Normalized HP</span>
        </div>
      `;

      centerCol.querySelector('[data-action="switch-team"]')?.addEventListener('click', () => {
        this.switchTeam(switchTarget);
      });
      stage.appendChild(centerCol);

      // Right Column: Azure Sentinels (Blue)
      const rightCol = document.createElement('div');
      rightCol.className = 'pvp-team-col pvp-col-blue';
      rightCol.innerHTML = `
        <div class="pvp-team-banner banner-blue">
          <div class="pvp-banner-title">AZURE SENTINELS</div>
          <div class="pvp-banner-count">${blueMembers.length} / ${teamSize} WARRIORS</div>
        </div>
        <div class="pvp-slots-container">
          ${this.renderTeamSlots('blue', teamSize, blueMembers, myId, iAmHost)}
        </div>
      `;
      stage.appendChild(rightCol);

      modal.appendChild(stage);

      // Bind slot switch clicks
      this.bindSlotActions(modal);
    } else if (this.activeTab === 'invite') {
      const invitePanel = document.createElement('div');
      invitePanel.className = 'pvp-tab-panel';
      invitePanel.innerHTML = this.renderInviteContent();
      this.bindInviteContent(invitePanel);
      modal.appendChild(invitePanel);
    } else if (this.activeTab === 'public') {
      const publicPanel = document.createElement('div');
      publicPanel.className = 'pvp-tab-panel';
      publicPanel.innerHTML = this.renderPublicLobbiesContent();
      this.bindPublicContent(publicPanel);
      modal.appendChild(publicPanel);
    }

    // 4. Bottom Footer Action Bar
    const footer = document.createElement('div');
    footer.className = 'pvp-footer';

    footer.innerHTML = `
      <div class="pvp-footer-left">
        <button class="pvp-btn-leave" data-action="leave-lobby">
          🚪 LEAVE COLOSSEUM
        </button>
      </div>

      <div class="pvp-footer-right">
        ${launchNotice ? `<div class="pvp-launch-warning">${escapeHtml(launchNotice)}</div>` : ''}
        ${
          iAmHost
            ? `
              <button class="pvp-btn-start ${canLaunch ? 'ready-to-launch' : 'disabled'}" data-action="start-tournament" ${!canLaunch ? 'disabled' : ''}>
                ⚔️ COMMENCE TOURNAMENT ⚔️
              </button>
            `
            : `
              <button class="pvp-btn-ready ${me?.ready ? 'is-ready' : 'not-ready'}" data-action="toggle-ready">
                ${me?.ready ? '⌛ CANCEL READY' : '⚔️ READY FOR BATTLE'}
              </button>
            `
        }
      </div>
    `;

    footer.querySelector('[data-action="leave-lobby"]')?.addEventListener('click', () => {
      this.handleLeaveOrClose();
    });
    footer.querySelector('[data-action="toggle-ready"]')?.addEventListener('click', () => {
      this.toggleReady();
    });
    footer.querySelector('[data-action="start-tournament"]')?.addEventListener('click', () => {
      if (canLaunch) this.startTournament();
    });

    modal.appendChild(footer);

    // Toast element
    const toast = document.createElement('div');
    toast.className = 'pvp-toast';
    modal.appendChild(toast);

    this.overlay.appendChild(modal);
  }

  private renderTeamSlots(
    team: TournamentTeam,
    teamSize: number,
    teamMembers: LobbyMember[],
    myId: string,
    iAmHost: boolean
  ): string {
    let html = '';
    const isRed = team === 'red';

    for (let i = 0; i < teamSize; i++) {
      const member = teamMembers[i] || null;
      if (member) {
        const isMe = member.actorId === myId || member.uuid === myId;
        const clsId = member.classId || 'warrior';
        const clsDef = classOf(clsId);
        const iconSrc = classIcon(clsId);
        const hp = getNormalizedPvpBaseHp(clsId);
        const name = member.name || 'Gladiator';
        const lvl = member.level || 1;
        const power = member.power || 0;

        let badgeHtml = '';
        if (member.isHost) {
          badgeHtml = '<span class="pvp-badge badge-host">👑 HOST</span>';
        } else if (member.ready) {
          badgeHtml = '<span class="pvp-badge badge-ready">✓ READY</span>';
        } else {
          badgeHtml = '<span class="pvp-badge badge-wait">PREPARING</span>';
        }

        const canKick = iAmHost && !isMe;
        const memberAid = member.actorId || member.uuid;

        html += `
          <div class="pvp-fighter-card ${isMe ? 'is-me' : ''} ${isRed ? 'card-red' : 'card-blue'}">
            <div class="pvp-fighter-avatar">
              <img
                class="pvp-pedestal-sprite ${isRed ? 'facing-right' : 'facing-left'}"
                src="${heroFrame(clsId, 'idle', 0)}"
                data-class="${escapeHtmlAttribute(clsId)}"
                alt="${escapeHtmlAttribute(name)}"
              />
            </div>
            <div class="pvp-fighter-info">
              <div class="pvp-info-row1">
                ${iconSrc ? `<img class="pvp-class-icon" src="${escapeHtmlAttribute(iconSrc)}" alt="" />` : ''}
                <span class="pvp-fighter-name">${escapeHtml(name)} ${isMe ? '<b class="pvp-you-tag">(YOU)</b>' : ''}</span>
                ${badgeHtml}
              </div>
              <div class="pvp-info-row2">
                <span class="pvp-class-label">LV ${lvl} ${escapeHtml((clsDef?.name || clsId).toUpperCase())}</span>
                <span class="pvp-stat-hp">HP: ${hp}</span>
                <span class="pvp-stat-pwr">PWR: ${power}</span>
              </div>
            </div>
            ${canKick ? `<button class="pvp-kick-btn" data-action="kick" data-aid="${escapeHtmlAttribute(memberAid)}" title="Kick Player">&times;</button>` : ''}
          </div>
        `;
      } else {
        html += `
          <div class="pvp-empty-card" data-action="switch-here" data-team="${team}">
            <div class="pvp-empty-label">✦ OPEN WARRIOR SLOT ✦</div>
            <button class="pvp-empty-switch-btn" type="button" data-action="switch-here" data-team="${team}">
              ⚔️ SWITCH HERE
            </button>
          </div>
        `;
      }
    }

    return html;
  }

  private bindSlotActions(modal: HTMLElement): void {
    modal.querySelectorAll<HTMLElement>('[data-action="switch-here"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetTeam = el.getAttribute('data-team') as TournamentTeam;
        if (targetTeam) this.switchTeam(targetTeam);
      });
    });

    modal.querySelectorAll<HTMLButtonElement>('[data-action="kick"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const aid = btn.getAttribute('data-aid');
        if (aid) {
          const target = this.state?.members.find(m => (m.actorId === aid || m.uuid === aid));
          if (target) {
            audio.playClick();
            network.kickMember(target.shortId, target.actorId);
          }
        }
      });
    });
  }

  private renderInviteContent(): string {
    const onlineFriends = this.friends.filter(f => f.online);
    let friendsHtml = '';

    if (onlineFriends.length === 0) {
      friendsHtml = '<div class="pvp-empty-list">No online guild members or friends found. Share your Player ID or Room Code below!</div>';
    } else {
      for (const f of onlineFriends) {
        const clsDef = classOf(f.classId);
        friendsHtml += `
          <div class="pvp-friend-card">
            <div class="pvp-friend-info">
              <span class="pvp-friend-name">${escapeHtml(f.name)}</span>
              <span class="pvp-friend-meta">LV ${f.level} ${escapeHtml((clsDef?.name || f.classId || '').toUpperCase())} • ID: ${escapeHtml(f.shortId)}</span>
            </div>
            <button class="pvp-invite-btn" data-shortid="${escapeHtmlAttribute(f.shortId)}">
              INVITE
            </button>
          </div>
        `;
      }
    }

    return `
      <div class="pvp-panel-box">
        <h2 class="pvp-panel-title">DIRECT INVITE BY PLAYER ID</h2>
        <div class="pvp-direct-invite-bar">
          <input type="text" class="pvp-id-input" placeholder="ENTER PLAYER ID (CECT-XXXX)" maxlength="16" />
          <button class="pvp-send-id-btn">SEND CHALLENGE</button>
        </div>

        <h2 class="pvp-panel-title" style="margin-top: 18px;">ONLINE ALLIES & FRIENDS</h2>
        <div class="pvp-friends-container">
          ${friendsHtml}
        </div>
      </div>
    `;
  }

  private bindInviteContent(panel: HTMLElement): void {
    panel.querySelectorAll<HTMLButtonElement>('.pvp-invite-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sid = btn.getAttribute('data-shortid');
        if (sid) {
          audio.playClick();
          network.inviteFriend(sid);
          btn.textContent = 'SENT ✓';
          btn.disabled = true;
          this.toast(`Challenge sent to ${sid}!`);
        }
      });
    });

    const sendBtn = panel.querySelector<HTMLButtonElement>('.pvp-send-id-btn');
    const input = panel.querySelector<HTMLInputElement>('.pvp-id-input');

    const handleSend = () => {
      const val = (input?.value || '').trim().toUpperCase();
      if (!val) return;
      audio.playClick();
      network.inviteFriend(val);
      if (input) input.value = '';
      this.toast(`Colosseum challenge dispatched to ${val}!`);
    };

    sendBtn?.addEventListener('click', handleSend);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSend();
    });
  }

  private renderPublicLobbiesContent(): string {
    const duels = (this.pvpLobbies || []).filter(l => l.isPvp && l.roomId !== this.state?.roomId);
    let html = '';

    if (duels.length === 0) {
      html = '<div class="pvp-empty-list">No other open Colosseum duels available right now. Invite friends to start a match!</div>';
    } else {
      for (const d of duels) {
        html += `
          <div class="pvp-lobby-card">
            <div class="pvp-lobby-info">
              <span class="pvp-lobby-host">HOST: ${escapeHtml(d.hostName || 'Challenger')}</span>
              <span class="pvp-lobby-meta">Format: ${(d.pvpFormat || '1v1').toUpperCase()} • Fighters: ${d.members || 1}/${d.maxPlayers || 2}</span>
            </div>
            <button class="pvp-join-duel-btn" data-roomid="${escapeHtmlAttribute(d.roomId)}">
              JOIN ARENA
            </button>
          </div>
        `;
      }
    }

    return `
      <div class="pvp-panel-box">
        <h2 class="pvp-panel-title">OPEN COLOSSEUM LOBBIES</h2>
        <div class="pvp-lobbies-container">
          ${html}
        </div>
      </div>
    `;
  }

  private bindPublicContent(panel: HTMLElement): void {
    panel.querySelectorAll<HTMLButtonElement>('.pvp-join-duel-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rid = btn.getAttribute('data-roomid');
        if (rid) {
          audio.playClick();
          network.leaveLobby();
          network.joinLobby(rid);
          this.activeTab = 'arena';
          this.toast('Connecting to Colosseum duel...');
        }
      });
    });
  }

  private injectStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .tournament-lobby-backdrop {
        position: fixed; inset: 0;
        background: rgba(4, 5, 8, 0.88);
        display: flex; align-items: center; justify-content: center;
        z-index: 10000;
        padding: 12px;
        box-sizing: border-box;
      }

      .pvp-modal-shell {
        position: relative;
        width: 1020px; max-width: 96vw;
        max-height: 92vh;
        background: url('/assets/kenney-rpg-ui/panel_brown.png') repeat;
        border: 4px solid #3d2817;
        box-shadow: 0 0 40px rgba(0, 0, 0, 0.95), inset 0 0 20px rgba(0, 0, 0, 0.6);
        border-radius: 8px;
        display: flex; flex-direction: column;
        color: #f7e7ce;
        overflow: hidden;
        font-family: 'Outfit', 'Inter', sans-serif;
      }

      .pvp-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px 18px;
        background: rgba(18, 12, 7, 0.7);
        border-bottom: 3px solid #5a3d24;
      }
      .pvp-title {
        margin: 0; font-family: 'Cinzel', Georgia, serif; font-size: 20px; font-weight: 900;
        color: #fce79a; letter-spacing: 1.5px;
        text-shadow: 0 2px 4px #000;
      }
      .pvp-subtitle { font-size: 11px; color: #b89f80; margin-top: 1px; font-weight: 600; }

      .pvp-header-actions { display: flex; align-items: center; gap: 10px; }
      .pvp-room-code-tag {
        display: flex; align-items: center; gap: 6px;
        background: url('/assets/kenney-rpg-ui/panelInset_brown.png') repeat;
        padding: 4px 10px; border-radius: 4px; cursor: pointer;
        border: 1px solid #735134;
      }
      .pvp-room-code-tag:hover { border-color: #ffd770; }
      .pvp-tag-label { font-size: 9.5px; font-weight: 800; color: #ffd770; }
      .pvp-tag-val { font-size: 11px; font-weight: 800; color: #fff; font-family: monospace; }
      .pvp-tag-copy { font-size: 11px; }

      .pvp-close-btn {
        width: 34px; height: 34px;
        background: url('/assets/kenney-rpg-ui/buttonSquare_brown.png') no-repeat center/100% 100%;
        border: 0; color: #fca5a5; font-size: 20px; font-weight: 900;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
      }
      .pvp-close-btn:hover { filter: brightness(1.25); color: #fff; }

      .pvp-nav-tabs {
        display: flex; gap: 8px; padding: 8px 18px;
        background: rgba(10, 7, 4, 0.8);
        border-bottom: 2px solid #4a321c;
      }
      .pvp-nav-tab {
        padding: 8px 18px; font-family: 'Cinzel', serif; font-size: 12px; font-weight: 800;
        letter-spacing: 0.8px; cursor: pointer; border: 0;
        background: url('/assets/kenney-rpg-ui/buttonLong_brown.png') no-repeat center/100% 100%;
        color: #d8c29d; transition: all 0.15s ease;
      }
      .pvp-nav-tab:hover { filter: brightness(1.2); color: #fff; }
      .pvp-nav-tab.active {
        background: url('/assets/kenney-rpg-ui/buttonLong_blue.png') no-repeat center/100% 100%;
        color: #ffffff; text-shadow: 0 1px 3px #000;
      }

      .pvp-format-selector {
        display: flex; justify-content: space-between; align-items: center;
        padding: 6px 18px; background: rgba(0, 0, 0, 0.35);
        border-bottom: 1px solid rgba(220, 180, 110, 0.2);
      }
      .pvp-format-buttons { display: flex; gap: 8px; }
      .pvp-fmt-btn {
        padding: 5px 12px; font-size: 11px; font-weight: 800;
        background: url('/assets/kenney-rpg-ui/buttonSquare_brown.png') no-repeat center/100% 100%;
        border: 0; color: #b89f80; cursor: pointer;
      }
      .pvp-fmt-btn.active {
        background: url('/assets/kenney-rpg-ui/buttonSquare_beige.png') no-repeat center/100% 100%;
        color: #2b1807; font-weight: 900;
      }
      .pvp-fmt-btn:disabled { opacity: 0.6; cursor: default; }
      .pvp-host-only-note { font-size: 10px; color: #e2b153; font-style: italic; }

      .pvp-versus-stage {
        display: grid; grid-template-columns: 1fr 150px 1fr;
        padding: 12px 16px; gap: 12px;
        background: url('/assets/kenney-rpg-ui/panelInset_brown.png') repeat;
        overflow-y: auto; max-height: 520px;
      }

      .pvp-team-col { display: flex; flex-direction: column; gap: 8px; }
      .pvp-team-banner {
        padding: 6px 12px; border-radius: 4px;
        display: flex; justify-content: space-between; align-items: center;
        font-family: 'Cinzel', serif; font-weight: 900;
      }
      .banner-red {
        background: linear-gradient(90deg, #7f1d1d 0%, #450a0a 100%);
        border: 1px solid #ef4444; color: #fecaca;
      }
      .banner-blue {
        background: linear-gradient(90deg, #1e3a8a 0%, #172554 100%);
        border: 1px solid #3b82f6; color: #bfdbfe;
      }
      .pvp-banner-title { font-size: 13px; letter-spacing: 1px; }
      .pvp-banner-count { font-size: 10.5px; opacity: 0.85; font-family: 'Outfit', sans-serif; }

      .pvp-slots-container { display: flex; flex-direction: column; gap: 8px; }

      .pvp-fighter-card {
        display: flex; align-items: center; gap: 10px;
        padding: 6px 10px; border-radius: 4px; position: relative;
        background: rgba(15, 10, 8, 0.75); border: 2px solid #5a3d24;
      }
      .pvp-fighter-card.card-red { border-color: rgba(239, 68, 68, 0.6); }
      .pvp-fighter-card.card-blue { border-color: rgba(59, 130, 246, 0.6); }
      .pvp-fighter-card.is-me {
        border-color: #ffd770 !important;
        box-shadow: 0 0 12px rgba(255, 215, 112, 0.4);
      }

      .pvp-fighter-avatar {
        width: 56px; height: 56px; display: flex; align-items: flex-end; justify-content: center;
        background: rgba(0, 0, 0, 0.4); border-radius: 4px; overflow: hidden;
      }
      .pvp-pedestal-sprite {
        height: 60px; width: auto; object-fit: cover; object-position: center bottom;
        image-rendering: pixelated;
      }
      .pvp-pedestal-sprite.facing-left { transform: scaleX(-1); }

      .pvp-fighter-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
      .pvp-info-row1 { display: flex; align-items: center; gap: 6px; }
      .pvp-class-icon { width: 20px; height: 20px; image-rendering: pixelated; border-radius: 2px; }
      .pvp-fighter-name { font-size: 13px; font-weight: 800; color: #fff; }
      .pvp-you-tag { color: #ffd770; font-size: 9.5px; margin-left: 3px; }

      .pvp-badge { padding: 1px 6px; font-size: 8.5px; font-weight: 800; border-radius: 2px; }
      .badge-host { background: #b45309; color: #fef3c7; border: 1px solid #fde047; }
      .badge-ready { background: #166534; color: #dcfce7; border: 1px solid #4ade80; }
      .badge-wait { background: #3f3f46; color: #d4d4d8; }

      .pvp-info-row2 {
        display: flex; gap: 8px; font-size: 10px; color: #c4b5a0; font-weight: 700;
      }
      .pvp-stat-hp { color: #86efac; }
      .pvp-stat-pwr { color: #fde047; }

      .pvp-kick-btn {
        background: #501010; border: 1px solid #991b1b; color: #fca5a5;
        width: 22px; height: 22px; cursor: pointer; border-radius: 2px;
        font-size: 14px; display: flex; align-items: center; justify-content: center;
      }
      .pvp-kick-btn:hover { background: #b91c1c; color: #fff; }

      .pvp-empty-card {
        height: 58px; display: flex; align-items: center; justify-content: space-between;
        padding: 0 12px; border: 2px dashed rgba(220, 190, 140, 0.3);
        background: rgba(0, 0, 0, 0.35); border-radius: 4px; cursor: pointer;
      }
      .pvp-empty-card:hover { border-color: #ffd770; background: rgba(0, 0, 0, 0.5); }
      .pvp-empty-label { font-size: 10.5px; font-weight: 800; color: #94826b; }
      .pvp-empty-switch-btn {
        padding: 4px 10px; font-size: 10px; font-weight: 900;
        background: url('/assets/kenney-rpg-ui/buttonSquare_brown.png') no-repeat center/100% 100%;
        border: 0; color: #fce79a; cursor: pointer;
      }
      .pvp-empty-switch-btn:hover { filter: brightness(1.25); }

      .pvp-center-col {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 12px; text-align: center;
      }
      .pvp-vs-emblem {
        width: 52px; height: 52px; border-radius: 50%;
        background: radial-gradient(circle at 35% 35%, #ffd770 0%, #996515 70%, #3d2305 100%);
        border: 2px solid #fff; font-family: 'Cinzel', serif; font-size: 18px; font-weight: 900;
        color: #fff; text-shadow: 0 2px 4px #000;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 0 16px rgba(255, 215, 112, 0.45);
      }

      .pvp-switch-team-btn {
        width: 130px; height: 46px;
        background: url('/assets/kenney-rpg-ui/buttonLong_blue.png') no-repeat center/100% 100%;
        border: 0; color: #fff; cursor: pointer;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        text-shadow: 0 1px 2px #000; font-family: 'Outfit', sans-serif;
      }
      .pvp-switch-team-btn span { font-size: 9.5px; opacity: 0.9; }
      .pvp-switch-team-btn b { font-size: 11.5px; font-weight: 900; }
      .pvp-switch-team-btn:hover:not(:disabled) { filter: brightness(1.2); }
      .pvp-switch-team-btn:disabled { opacity: 0.45; cursor: default; }

      .pvp-balance-badge {
        background: rgba(0, 0, 0, 0.55); border: 1px solid #5a3d24;
        border-radius: 4px; padding: 6px 8px; width: 100%; box-sizing: border-box;
        display: flex; flex-direction: column; gap: 2px;
      }
      .pvp-balance-badge b { font-size: 9px; color: #ffd770; letter-spacing: 0.8px; }
      .pvp-balance-badge span { font-size: 8.5px; color: #b89f80; }

      .pvp-tab-panel {
        padding: 16px 20px; overflow-y: auto; max-height: 480px;
        background: url('/assets/kenney-rpg-ui/panelInset_brown.png') repeat;
      }
      .pvp-panel-box { display: flex; flex-direction: column; }
      .pvp-panel-title {
        margin: 0 0 8px; font-family: 'Cinzel', serif; font-size: 13px; font-weight: 900;
        color: #ffd770; letter-spacing: 1px;
      }
      .pvp-direct-invite-bar { display: flex; gap: 8px; margin-bottom: 8px; }
      .pvp-id-input {
        flex: 1; max-width: 280px; padding: 8px 12px; font-size: 12px;
        background: rgba(0, 0, 0, 0.6); border: 1px solid #5a3d24; color: #fff;
        font-family: monospace; text-transform: uppercase; border-radius: 4px;
      }
      .pvp-send-id-btn {
        padding: 8px 16px; font-weight: 900; font-size: 11px;
        background: url('/assets/kenney-rpg-ui/buttonLong_blue.png') no-repeat center/100% 100%;
        border: 0; color: #fff; cursor: pointer;
      }
      .pvp-send-id-btn:hover { filter: brightness(1.2); }

      .pvp-friends-container, .pvp-lobbies-container { display: flex; flex-direction: column; gap: 6px; }
      .pvp-friend-card, .pvp-lobby-card {
        display: flex; justify-content: space-between; align-items: center;
        padding: 8px 12px; background: rgba(0, 0, 0, 0.45); border: 1px solid #5a3d24;
        border-radius: 4px;
      }
      .pvp-friend-name, .pvp-lobby-host { font-size: 13px; font-weight: 800; color: #fff; }
      .pvp-friend-meta, .pvp-lobby-meta { font-size: 10.5px; color: #b89f80; margin-top: 1px; }
      .pvp-invite-btn, .pvp-join-duel-btn {
        padding: 6px 16px; font-size: 11px; font-weight: 900;
        background: url('/assets/kenney-rpg-ui/buttonLong_blue.png') no-repeat center/100% 100%;
        border: 0; color: #fff; cursor: pointer;
      }
      .pvp-invite-btn:hover, .pvp-join-duel-btn:hover { filter: brightness(1.2); }
      .pvp-empty-list { font-size: 11.5px; color: #94826b; font-style: italic; padding: 12px 0; }

      .pvp-footer {
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px 18px; background: rgba(18, 12, 7, 0.85);
        border-top: 3px solid #5a3d24;
      }
      .pvp-footer-left { display: flex; gap: 8px; }
      .pvp-btn-leave {
        padding: 8px 16px; font-size: 11px; font-weight: 800;
        background: url('/assets/kenney-rpg-ui/buttonLong_brown.png') no-repeat center/100% 100%;
        border: 0; color: #e2cbb0; cursor: pointer;
      }
      .pvp-btn-leave:hover { filter: brightness(1.2); color: #fff; }

      .pvp-footer-right { display: flex; align-items: center; gap: 12px; }
      .pvp-launch-warning { font-size: 11px; color: #fbbf24; font-weight: 700; }

      .pvp-btn-ready {
        width: 180px; height: 42px;
        background: url('/assets/kenney-rpg-ui/buttonLong_blue.png') no-repeat center/100% 100%;
        border: 0; color: #fff; font-size: 12px; font-weight: 900; cursor: pointer;
        text-shadow: 0 1px 2px #000;
      }
      .pvp-btn-ready.is-ready {
        background: url('/assets/kenney-rpg-ui/buttonLong_brown.png') no-repeat center/100% 100%;
        color: #86efac;
      }

      .pvp-btn-start {
        width: 220px; height: 44px;
        background: url('/assets/kenney-rpg-ui/buttonLong_blue.png') no-repeat center/100% 100%;
        border: 0; color: #fff; font-family: 'Cinzel', serif; font-size: 13px; font-weight: 900;
        cursor: pointer; text-shadow: 0 2px 4px #000;
      }
      .pvp-btn-start.ready-to-launch {
        filter: drop-shadow(0 0 10px #ffd770) brightness(1.15);
        animation: pvpPulse 1.2s infinite alternate;
      }
      .pvp-btn-start.disabled, .pvp-btn-start:disabled {
        opacity: 0.45; cursor: default; filter: grayscale(0.8);
      }
      @keyframes pvpPulse {
        from { transform: scale(1); filter: drop-shadow(0 0 6px #ffd770); }
        to { transform: scale(1.02); filter: drop-shadow(0 0 16px #ffd770); }
      }

      .pvp-toast {
        position: absolute; bottom: 58px; left: 50%; transform: translateX(-50%) translateY(-8px);
        background: url('/assets/kenney-rpg-ui/panel_brown.png') repeat;
        border: 2px solid #ffd770; color: #fff; padding: 6px 16px; border-radius: 4px;
        font-size: 11px; font-weight: 800; opacity: 0; pointer-events: none;
        transition: all 0.2s ease; z-index: 50; box-shadow: 0 4px 12px rgba(0,0,0,0.8);
      }
    `;
    document.head.appendChild(style);
  }
}
