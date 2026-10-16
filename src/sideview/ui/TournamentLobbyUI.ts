/**
 * Tournament Mode & Multiplayer PvP Colosseum Lobby UI
 *
 * Authentic Dark Fantasy Action RPG Colosseum staging area:
 * - Uses real Kenney RPG UI pixel assets (/assets/kenney-rpg-ui/)
 * - Mobile Legends: Bang Bang style 2-team custom room (Crimson vs Azure)
 * - Zero AI bots: real connected players only
 * - Live animated pixel hero sprites on pedestals facing each other
 * - Quick Join by 4-digit Room Code input & 1-click code copying
 * - Rich champion slot UI with role indicators & avatar silhouettes in open slots
 * - Immediate optimistic state updates so buttons respond with 0ms lag
 * - Integrated tabs: [Versus Arena], [Invite Friends], [Public Duels]
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
import QRCode from 'qrcode';

const STYLE_ID = 'tournament-lobby-style';

const RED_ROLE_SLOTS = [
  { title: 'CRIMSON VANGUARD', icon: '🛡️', role: 'Frontline' },
  { title: 'CRIMSON STRIKER', icon: '⚔️', role: 'Skirmisher' },
  { title: 'CRIMSON ARCHER', icon: '🏹', role: 'Marksman' },
  { title: 'CRIMSON CHAMPION', icon: '👑', role: 'Duelist' },
];

const BLUE_ROLE_SLOTS = [
  { title: 'AZURE GUARDIAN', icon: '🛡️', role: 'Frontline' },
  { title: 'AZURE STRIKER', icon: '⚔️', role: 'Skirmisher' },
  { title: 'AZURE MYSTIC', icon: '🔮', role: 'Spellcaster' },
  { title: 'AZURE CHAMPION', icon: '👑', role: 'Duelist' },
];

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
  private generatedRoomCode: string = '';
  private isJoiningRoom: boolean = false;

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
    network.isPvpSession = true;
    audio.playPageTurn();
    this.injectStyle();

    this.overlay = document.createElement('div');
    this.overlay.className = 'tournament-lobby-backdrop';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-labelledby', 'pvp-colosseum-title');

    // Ensure unique room code is generated immediately
    if (!this.generatedRoomCode) {
      this.generatedRoomCode = Math.floor(1000 + Math.random() * 9000).toString();
    }

    // Subscribe to network events
    const unsubState = network.onLobbyState((state) => {
      this.isJoiningRoom = false;
      this.state = state;
      if (state.roomCode) {
        this.generatedRoomCode = String(state.roomCode).replace(/^PVP-/i, '');
      }
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
      if (this.isJoiningRoom) return;
      this.close();
    });

    network.onLobbyError((msg) => {
      this.isJoiningRoom = false;
      this.toast(msg);
    });

    // Check if player is already in a PvP room
    if (network.currentLobbyState && network.currentLobbyState.isPvp) {
      this.state = network.currentLobbyState;
      if (this.state.pvpFormat) this.currentFormat = this.state.pvpFormat;
      if (this.state.roomCode) {
        this.generatedRoomCode = String(this.state.roomCode).replace(/^PVP-/i, '');
      }
      const myId = network.getActorId();
      if (this.state.pvpTeams && this.state.pvpTeams[myId]) {
        this.localTeam = this.state.pvpTeams[myId];
      }
    } else {
      network.createPvpLobby('tournament_colosseum', this.currentFormat, this.localTeam, this.getShortRoomCode());
    }

    network.requestFriends();
    network.browsePvpLobbies();
    network.browseLobbies();

    (this.parent || document.body).appendChild(this.overlay);
    this.render();

    this.releaseFocus = installModalFocusTrap(this.overlay, {
      onEscape: () => {
        this.handleLeaveOrClose();
      },
    });

    // Character idle animation loop
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
    this.isJoiningRoom = false;
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

  public getShortRoomCode(): string {
    if (this.state?.roomCode && this.state.roomCode !== this.state.roomId) {
      const clean = String(this.state.roomCode).replace(/^PVP-/i, '').replace(/[^A-Za-z0-9]/g, '');
      if (clean.length >= 4) return clean.slice(-4).toUpperCase();
    }
    if (this.state?.roomId) {
      const digits = this.state.roomId.replace(/[^0-9]/g, '');
      if (digits.length >= 4) return digits.slice(-4);
    }
    if (!this.generatedRoomCode) {
      this.generatedRoomCode = Math.floor(1000 + Math.random() * 9000).toString();
    }
    return this.generatedRoomCode;
  }

  public getDisplayRoomCode(): string {
    return `PVP-${this.getShortRoomCode()}`;
  }

  public async joinRoomByCode(inputCode: string): Promise<void> {
    const clean = inputCode.trim().toUpperCase();
    if (!clean) {
      this.toast('Please enter a valid Room Code.');
      return;
    }
    network.isPvpSession = true;
    audio.playLevelUp();
    this.toast(`Connecting to Colosseum lobby ${clean}...`);
    this.isJoiningRoom = true;
    const success = await network.joinByRoomCode(clean);
    this.activeTab = 'arena';
    if (!success) {
      this.isJoiningRoom = false;
    }
  }

  private async showQrCodeModal(): Promise<void> {
    if (!this.overlay) return;
    audio.playClick();
    const existing = this.overlay.querySelector('.pvp-qr-modal-backdrop');
    if (existing) existing.remove();

    const fullId = this.state?.roomId || '';
    const shortCode = this.getShortRoomCode();
    const displayCode = this.getDisplayRoomCode();
    const joinParam = fullId.startsWith('room_') ? fullId : shortCode;
    const joinUrl = `${window.location.origin}${window.location.pathname}?joinRoom=${encodeURIComponent(joinParam)}`;

    let qrSvg = '';
    try {
      qrSvg = await QRCode.toString(joinUrl, {
        type: 'svg',
        margin: 2,
        color: {
          dark: '#261405',
          light: '#fcf6e8',
        },
      });
    } catch (e) {
      console.error('Failed to generate QR Code:', e);
    }

    const qrBackdrop = document.createElement('div');
    qrBackdrop.className = 'pvp-qr-modal-backdrop';
    qrBackdrop.innerHTML = `
      <div class="pvp-qr-modal-card">
        <div class="pvp-qr-modal-header">
          <h2 class="pvp-qr-modal-title">⚔️ SCAN TO JOIN COLOSSEUM</h2>
          <button class="pvp-qr-close-btn" type="button" aria-label="Close QR modal">&times;</button>
        </div>
        <div class="pvp-qr-modal-body">
          <div class="pvp-qr-svg-wrapper">
            ${qrSvg || '<div class="pvp-qr-fallback">Could not generate QR code.</div>'}
          </div>
          <div class="pvp-qr-code-display">
            <span class="pvp-qr-code-lbl">ROOM CODE:</span>
            <span class="pvp-qr-code-val">${escapeHtml(displayCode)}</span>
          </div>
          <p class="pvp-qr-instructions">
            Scan this QR code with your mobile device's camera to enter the lobby directly without typing!
          </p>
          <div class="pvp-qr-link-row">
            <input type="text" class="pvp-qr-link-input" readonly value="${escapeHtmlAttribute(joinUrl)}" />
            <button class="pvp-qr-copy-link-btn" type="button">📋 COPY LINK</button>
          </div>
        </div>
      </div>
    `;

    qrBackdrop.querySelector('.pvp-qr-close-btn')?.addEventListener('click', () => {
      audio.playClick();
      qrBackdrop.remove();
    });
    qrBackdrop.addEventListener('click', (e) => {
      if (e.target === qrBackdrop) {
        audio.playClick();
        qrBackdrop.remove();
      }
    });
    qrBackdrop.querySelector('.pvp-qr-copy-link-btn')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(joinUrl);
      this.toast('Direct Join Link copied to clipboard!');
    });

    this.overlay.appendChild(qrBackdrop);
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
    const roomCode = this.getDisplayRoomCode();

    // Ensure local player is always placed on slot
    const rawMembers = st?.members && st.members.length > 0 ? [...st.members] : [me];
    if (!rawMembers.some(m => m.actorId === myId || m.uuid === myId)) {
      rawMembers.unshift(me);
    }

    const redMembers: LobbyMember[] = [];
    const blueMembers: LobbyMember[] = [];

    for (const m of rawMembers) {
      const aid = m.actorId || m.uuid;
      const isMe = aid === myId;
      const serverAssigned = (st?.pvpTeams && st.pvpTeams[aid]) || m.team;
      let assigned = serverAssigned;
      if (!assigned) {
        assigned = isMe ? this.localTeam : (this.localTeam === 'red' ? 'blue' : 'red');
      }
      if (isMe && serverAssigned && serverAssigned !== this.localTeam) {
        this.localTeam = serverAssigned;
      }

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

    // 1. Top Header with Quick Room Code & Close Button
    const header = document.createElement('div');
    header.className = 'pvp-header';
    header.innerHTML = `
      <div class="pvp-title-cluster">
        <h1 class="pvp-title" id="pvp-colosseum-title">THE GRAND COLOSSEUM</h1>
        <div class="pvp-subtitle">Multiplayer PvP Duel • Mobile Legends Custom Format</div>
      </div>

      <div class="pvp-header-actions">
        <button class="pvp-qr-btn" data-action="open-qr" title="Generate QR Code for Mobile Players">
          📱 QR CODE
        </button>
        <div class="pvp-quick-code-badge" title="Share this code for friends to join directly!" data-action="copy-code">
          <span class="pvp-badge-lbl">ROOM CODE:</span>
          <span class="pvp-badge-val">${escapeHtml(roomCode)}</span>
          <button class="pvp-badge-copy-btn" title="Copy Room Code">📋</button>
        </div>
        <button class="pvp-close-btn" aria-label="Close Colosseum" title="Leave or Close">&times;</button>
      </div>
    `;

    header.querySelector('[data-action="open-qr"]')?.addEventListener('click', () => {
      this.showQrCodeModal();
    });
    header.querySelector('[data-action="copy-code"]')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(roomCode);
      this.toast(`Room Code ${roomCode} copied to clipboard!`);
    });
    header.querySelector('.pvp-close-btn')?.addEventListener('click', () => {
      this.handleLeaveOrClose();
    });
    modal.appendChild(header);

    // 2. Direct Join by Room Code Bar
    const joinBar = document.createElement('div');
    joinBar.className = 'pvp-quick-join-bar';
    joinBar.innerHTML = `
      <span class="pvp-join-lbl">⚔️ JOIN BY ROOM CODE:</span>
      <input type="text" class="pvp-join-input" placeholder="ENTER 4-DIGIT CODE (e.g. ${escapeHtml(roomCode)})" maxlength="12" />
      <button class="pvp-join-code-btn" type="button">JOIN LOBBY</button>
    `;

    const joinInput = joinBar.querySelector<HTMLInputElement>('.pvp-join-input');
    const joinBtn = joinBar.querySelector<HTMLButtonElement>('.pvp-join-code-btn');

    const triggerJoin = () => {
      if (joinInput && joinInput.value) {
        this.joinRoomByCode(joinInput.value);
        joinInput.value = '';
      }
    };
    joinBtn?.addEventListener('click', triggerJoin);
    joinInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') triggerJoin();
    });
    modal.appendChild(joinBar);

    // 3. Navigation Tabs (Versus Arena vs Invite Friends vs Public Duels)
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

    // 4. Main Tab Contents
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
          <div class="pvp-banner-count">${redMembers.length} / ${teamSize} FIGHTERS</div>
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
          <b>ARENA RULES</b>
          <span>0.22 PvP Multiplier</span>
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
          <div class="pvp-banner-count">${blueMembers.length} / ${teamSize} FIGHTERS</div>
        </div>
        <div class="pvp-slots-container">
          ${this.renderTeamSlots('blue', teamSize, blueMembers, myId, iAmHost)}
        </div>
      `;
      stage.appendChild(rightCol);

      modal.appendChild(stage);

      // Bind slot interactions
      this.bindSlotActions(modal);
    } else if (this.activeTab === 'invite') {
      const invitePanel = document.createElement('div');
      invitePanel.className = 'pvp-tab-panel';
      invitePanel.innerHTML = this.renderInviteContent(roomCode);
      this.bindInviteContent(invitePanel);
      modal.appendChild(invitePanel);
    } else if (this.activeTab === 'public') {
      const publicPanel = document.createElement('div');
      publicPanel.className = 'pvp-tab-panel';
      publicPanel.innerHTML = this.renderPublicLobbiesContent();
      this.bindPublicContent(publicPanel);
      modal.appendChild(publicPanel);
    }

    // 5. Bottom Action Bar
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
    const roleList = isRed ? RED_ROLE_SLOTS : BLUE_ROLE_SLOTS;

    for (let i = 0; i < teamSize; i++) {
      const member = teamMembers[i] || null;
      const role = roleList[i % roleList.length];

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
                onerror="this.onerror=null; this.src='/assets/heroes/warrior/idle/0.png';"
              />
            </div>
            <div class="pvp-fighter-info">
              <div class="pvp-info-row1">
                ${iconSrc ? `<img class="pvp-class-icon" src="${escapeHtmlAttribute(iconSrc)}" alt="" onerror="this.style.display='none';" />` : ''}
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
        // Authentic Character Slot in Empty State
        html += `
          <div class="pvp-fighter-card pvp-empty-slot ${isRed ? 'empty-red' : 'empty-blue'}" data-action="switch-here" data-team="${team}">
            <div class="pvp-fighter-avatar pvp-empty-avatar">
              <div class="pvp-avatar-silhouette">${role.icon}</div>
              <div class="pvp-avatar-sigil">✦</div>
            </div>
            <div class="pvp-fighter-info">
              <div class="pvp-info-row1">
                <span class="pvp-empty-role-title">${escapeHtml(role.title)}</span>
                <span class="pvp-badge badge-empty">OPEN</span>
              </div>
              <div class="pvp-info-row2">
                <span class="pvp-empty-role-sub">${escapeHtml(role.role)} Position • Waiting for Challenger</span>
              </div>
            </div>
            <div class="pvp-empty-action-group">
              <button class="pvp-slot-claim-btn" type="button" data-action="switch-here" data-team="${team}">
                ⚔️ CLAIM
              </button>
              <button class="pvp-slot-inv-btn" type="button" data-action="open-invite">
                ➕
              </button>
            </div>
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

    modal.querySelectorAll<HTMLElement>('[data-action="open-invite"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        audio.playClick();
        this.activeTab = 'invite';
        this.render();
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

  private renderInviteContent(roomCode: string): string {
    const onlineFriends = this.friends.filter(f => f.online);
    let friendsHtml = '';

    if (onlineFriends.length === 0) {
      friendsHtml = '<div class="pvp-empty-list">No online guild members found. Share your Room Code or invite by Player ID below!</div>';
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
        <div class="pvp-share-code-card">
          <div class="pvp-share-code-left">
            <span class="pvp-share-lbl">CURRENT ARENA ROOM CODE:</span>
            <span class="pvp-share-val">${escapeHtml(roomCode)}</span>
          </div>
          <div class="pvp-share-code-btns">
            <button class="pvp-share-qr-btn" data-action="open-qr-invite">📱 SHOW QR CODE</button>
            <button class="pvp-share-copy-btn" data-action="copy-share-code">📋 COPY CODE</button>
          </div>
        </div>

        <h2 class="pvp-panel-title" style="margin-top: 14px;">DIRECT CHALLENGE BY PLAYER ID</h2>
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
    panel.querySelector('[data-action="open-qr-invite"]')?.addEventListener('click', () => {
      this.showQrCodeModal();
    });

    panel.querySelector('[data-action="copy-share-code"]')?.addEventListener('click', () => {
      const code = this.getDisplayRoomCode();
      navigator.clipboard?.writeText(code);
      this.toast(`Room Code ${code} copied to clipboard!`);
    });

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
      html = '<div class="pvp-empty-list">No other open Colosseum duels available right now. Share your Room Code to challenge a friend!</div>';
    } else {
      for (const d of duels) {
        const code = d.roomCode || d.roomId.slice(-4).toUpperCase();
        html += `
          <div class="pvp-lobby-card">
            <div class="pvp-lobby-info">
              <span class="pvp-lobby-host">HOST: ${escapeHtml(d.hostName || 'Challenger')} <b style="color: #ffd770; margin-left: 6px;">[CODE: ${escapeHtml(code)}]</b></span>
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
          network.isPvpSession = true;
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
        width: 1040px; max-width: 98vw;
        max-height: 96vh;
        max-height: 96dvh;
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
        padding: 8px 14px;
        background: rgba(18, 12, 7, 0.7);
        border-bottom: 2px solid #5a3d24;
        gap: 8px; flex-shrink: 0;
      }
      .pvp-title-cluster { min-width: 0; }
      .pvp-title {
        margin: 0; font-family: 'Cinzel', Georgia, serif; font-size: clamp(14px, 2.5vw, 20px); font-weight: 900;
        color: #fce79a; letter-spacing: 1.2px;
        text-shadow: 0 2px 4px #000;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .pvp-subtitle { font-size: 10.5px; color: #b89f80; margin-top: 1px; font-weight: 600; white-space: nowrap; }

      .pvp-header-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
      .pvp-qr-btn {
        padding: 5px 10px; font-size: 10.5px; font-weight: 900;
        background: url('/assets/kenney-rpg-ui/buttonLong_blue.png') no-repeat center/100% 100%;
        border: 0; color: #fff; cursor: pointer; text-shadow: 0 1px 2px #000;
        display: flex; align-items: center; gap: 4px; border-radius: 3px;
        white-space: nowrap;
        transition: filter 0.15s ease;
      }
      .pvp-qr-btn:hover { filter: brightness(1.2); }
      .pvp-quick-code-badge {
        display: flex; align-items: center; gap: 5px;
        background: url('/assets/kenney-rpg-ui/panelInset_brown.png') repeat;
        padding: 4px 10px; border-radius: 4px; cursor: pointer;
        border: 1px solid #735134;
        white-space: nowrap;
        transition: all 0.15s ease;
      }
      .pvp-quick-code-badge:hover { border-color: #ffd770; filter: brightness(1.15); }
      .pvp-badge-lbl { font-size: 9.5px; font-weight: 800; color: #ffd770; letter-spacing: 0.8px; }
      .pvp-badge-val { font-size: 12px; font-weight: 900; color: #fff; font-family: monospace; letter-spacing: 1px; }
      .pvp-badge-copy-btn { background: none; border: 0; color: #ffd770; cursor: pointer; font-size: 11px; padding: 0 2px; }

      .pvp-close-btn {
        width: 30px; height: 30px;
        background: url('/assets/kenney-rpg-ui/buttonSquare_brown.png') no-repeat center/100% 100%;
        border: 0; color: #fca5a5; font-size: 18px; font-weight: 900;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .pvp-close-btn:hover { filter: brightness(1.25); color: #fff; }

      /* Direct Quick Join Bar */
      .pvp-quick-join-bar {
        display: flex; align-items: center; gap: 8px;
        padding: 5px 14px;
        background: rgba(10, 7, 4, 0.9);
        border-bottom: 1px solid #4a321c;
        overflow-x: auto; flex-shrink: 0;
      }
      .pvp-join-lbl { font-size: 10.5px; font-weight: 900; color: #ffd770; letter-spacing: 0.8px; white-space: nowrap; }
      .pvp-join-input {
        width: clamp(140px, 24vw, 240px); padding: 4px 8px; font-size: 11px;
        background: rgba(0, 0, 0, 0.6); border: 1px solid #634327; color: #fff;
        font-family: monospace; text-transform: uppercase; border-radius: 3px;
        box-sizing: border-box;
      }
      .pvp-join-input:focus { border-color: #ffd770; outline: none; }
      .pvp-join-code-btn {
        padding: 5px 14px; font-size: 11px; font-weight: 900;
        background: url('/assets/kenney-rpg-ui/buttonLong_blue.png') no-repeat center/100% 100%;
        border: 0; color: #fff; cursor: pointer; text-shadow: 0 1px 2px #000;
      }
      .pvp-join-code-btn:hover { filter: brightness(1.2); }

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
        display: grid; grid-template-columns: 1fr 140px 1fr;
        padding: 10px 14px; gap: 10px;
        background: url('/assets/kenney-rpg-ui/panelInset_brown.png') repeat;
        overflow-y: auto; flex: 1; min-height: 0;
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

      /* Occupied Fighter Card */
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
      .badge-empty { background: rgba(0, 0, 0, 0.5); border: 1px solid #735134; color: #b89f80; }

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

      /* Empty Slot Styled as Character Dais */
      .pvp-empty-slot {
        background: rgba(10, 8, 6, 0.65);
        border: 2px dashed rgba(180, 140, 90, 0.4);
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .pvp-empty-slot:hover {
        background: rgba(25, 18, 12, 0.8);
        border-color: #ffd770;
        box-shadow: 0 0 10px rgba(255, 215, 112, 0.25);
      }
      .pvp-empty-slot.empty-red { border-left: 3px solid #ef4444; }
      .pvp-empty-slot.empty-blue { border-left: 3px solid #3b82f6; }

      .pvp-empty-avatar {
        background: radial-gradient(circle, rgba(255, 215, 112, 0.08) 0%, rgba(0, 0, 0, 0.5) 100%);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
      }
      .pvp-avatar-silhouette { font-size: 22px; opacity: 0.65; filter: grayscale(0.5); }
      .pvp-avatar-sigil { font-size: 10px; color: #ffd770; opacity: 0.7; }

      .pvp-empty-role-title { font-size: 12px; font-weight: 800; color: #e2cbb0; letter-spacing: 0.8px; }
      .pvp-empty-role-sub { font-size: 9.5px; color: #8e7a63; }

      .pvp-empty-action-group { display: flex; gap: 4px; }
      .pvp-slot-claim-btn {
        padding: 5px 10px; font-size: 10px; font-weight: 900;
        background: url('/assets/kenney-rpg-ui/buttonSquare_brown.png') no-repeat center/100% 100%;
        border: 0; color: #fce79a; cursor: pointer;
      }
      .pvp-slot-claim-btn:hover { filter: brightness(1.25); }
      .pvp-slot-inv-btn {
        width: 26px; height: 26px; font-size: 12px; font-weight: 900;
        background: url('/assets/kenney-rpg-ui/buttonSquare_beige.png') no-repeat center/100% 100%;
        border: 0; color: #2b1807; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
      }
      .pvp-slot-inv-btn:hover { filter: brightness(1.2); }

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
      .pvp-share-code-card {
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px 14px; background: rgba(0, 0, 0, 0.6);
        border: 2px solid #ffd770; border-radius: 4px; margin-bottom: 8px;
      }
      .pvp-share-code-left { display: flex; align-items: center; gap: 8px; }
      .pvp-share-lbl { font-size: 11px; font-weight: 900; color: #ffd770; }
      .pvp-share-val { font-size: 18px; font-weight: 900; color: #fff; font-family: monospace; letter-spacing: 2px; }
      .pvp-share-code-btns { display: flex; gap: 6px; }
      .pvp-share-qr-btn {
        padding: 6px 12px; font-size: 11px; font-weight: 900;
        background: url('/assets/kenney-rpg-ui/buttonLong_brown.png') no-repeat center/100% 100%;
        border: 0; color: #ffd770; cursor: pointer; text-shadow: 0 1px 2px #000;
      }
      .pvp-share-qr-btn:hover { filter: brightness(1.2); color: #fff; }
      .pvp-share-copy-btn {
        padding: 6px 14px; font-size: 11px; font-weight: 900;
        background: url('/assets/kenney-rpg-ui/buttonLong_blue.png') no-repeat center/100% 100%;
        border: 0; color: #fff; cursor: pointer; text-shadow: 0 1px 2px #000;
      }
      .pvp-share-copy-btn:hover { filter: brightness(1.2); }

      /* QR Code Modal Styles */
      .pvp-qr-modal-backdrop {
        position: absolute; inset: 0;
        background: rgba(0, 0, 0, 0.85);
        display: flex; align-items: center; justify-content: center;
        z-index: 200; backdrop-filter: blur(2px);
      }
      .pvp-qr-modal-card {
        width: 380px; max-width: 90vw;
        background: url('/assets/kenney-rpg-ui/panel_brown.png') repeat;
        border: 4px solid #3d2817; border-radius: 8px;
        box-shadow: 0 0 40px rgba(0, 0, 0, 0.95), inset 0 0 20px rgba(0, 0, 0, 0.6);
        padding: 16px 20px; color: #f7e7ce;
        display: flex; flex-direction: column; align-items: center; text-align: center;
        box-sizing: border-box;
      }
      .pvp-qr-modal-header {
        width: 100%; display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 12px; border-bottom: 1px solid #5a3d24; padding-bottom: 8px;
      }
      .pvp-qr-modal-title {
        margin: 0; font-family: 'Cinzel', serif; font-size: 15px; font-weight: 900;
        color: #ffd770; letter-spacing: 1px;
      }
      .pvp-qr-close-btn {
        background: url('/assets/kenney-rpg-ui/buttonSquare_brown.png') no-repeat center/100% 100%;
        border: 0; width: 28px; height: 28px; color: #fca5a5; font-size: 18px; font-weight: 900;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
      }
      .pvp-qr-close-btn:hover { filter: brightness(1.25); color: #fff; }
      .pvp-qr-modal-body {
        width: 100%; display: flex; flex-direction: column; align-items: center;
      }
      .pvp-qr-svg-wrapper {
        background: #fdf6e2; padding: 12px; border-radius: 6px;
        border: 3px solid #3d240f; box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        margin-bottom: 10px; display: flex; align-items: center; justify-content: center;
      }
      .pvp-qr-svg-wrapper svg {
        width: 180px; height: 180px; display: block;
      }
      .pvp-qr-code-display {
        display: flex; align-items: center; gap: 8px;
        background: url('/assets/kenney-rpg-ui/panelInset_brown.png') repeat;
        padding: 5px 14px; border-radius: 4px; border: 1px solid #735134;
        margin-bottom: 8px;
      }
      .pvp-qr-code-lbl { font-size: 11px; font-weight: 800; color: #ffd770; }
      .pvp-qr-code-val { font-size: 16px; font-weight: 900; color: #fff; font-family: monospace; letter-spacing: 1.5px; }
      .pvp-qr-instructions {
        font-size: 11px; color: #c4b5a0; margin: 4px 0 10px; line-height: 1.4;
      }
      .pvp-qr-link-row {
        width: 100%; display: flex; gap: 6px;
      }
      .pvp-qr-link-input {
        flex: 1; padding: 6px 8px; font-size: 10.5px;
        background: rgba(0, 0, 0, 0.6); border: 1px solid #5a3d24; color: #fff;
        font-family: monospace; border-radius: 3px;
      }
      .pvp-qr-copy-link-btn {
        padding: 6px 12px; font-size: 10.5px; font-weight: 900;
        background: url('/assets/kenney-rpg-ui/buttonLong_blue.png') no-repeat center/100% 100%;
        border: 0; color: #fff; cursor: pointer; white-space: nowrap;
      }
      .pvp-qr-copy-link-btn:hover { filter: brightness(1.2); }

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

      /* Responsive: Mobile Landscape & Short Viewports (height <= 560px) */
      @media (max-height: 560px) {
        .pvp-modal-shell { max-height: 98vh; max-height: 98dvh; width: 98vw; }
        .pvp-header { padding: 4px 10px; }
        .pvp-title { font-size: 13.5px; }
        .pvp-subtitle { display: none; }
        .pvp-qr-btn { padding: 3px 8px; font-size: 9.5px; }
        .pvp-quick-code-badge { padding: 3px 8px; }
        .pvp-badge-lbl { font-size: 8.5px; }
        .pvp-badge-val { font-size: 11px; }
        .pvp-close-btn { width: 24px; height: 24px; font-size: 15px; }
        .pvp-quick-join-bar { padding: 3px 10px; gap: 5px; }
        .pvp-join-lbl { font-size: 9px; }
        .pvp-join-input { padding: 2px 6px; font-size: 9.5px; width: 130px; }
        .pvp-join-code-btn { padding: 2px 8px; font-size: 9px; }
        .pvp-nav-tabs { padding: 3px 10px; gap: 4px; }
        .pvp-nav-tab { padding: 3px 10px; font-size: 9.5px; }
        .pvp-format-selector { padding: 2px 10px; }
        .pvp-fmt-btn { padding: 2px 8px; font-size: 9px; }
        .pvp-versus-stage { padding: 6px 8px; gap: 6px; grid-template-columns: 1fr 105px 1fr; }
        .pvp-team-banner { padding: 3px 6px; }
        .pvp-banner-title { font-size: 11px; }
        .pvp-banner-count { font-size: 8.5px; }
        .pvp-slots-container { gap: 4px; }
        .pvp-fighter-card { padding: 3px 6px; gap: 6px; }
        .pvp-fighter-avatar { width: 38px; height: 38px; }
        .pvp-pedestal-sprite { height: 40px; }
        .pvp-fighter-name { font-size: 11px; }
        .pvp-class-icon { width: 16px; height: 16px; }
        .pvp-info-row2 { font-size: 8px; gap: 4px; }
        .pvp-empty-role-title { font-size: 10px; }
        .pvp-empty-role-sub { font-size: 8px; }
        .pvp-avatar-silhouette { font-size: 16px; }
        .pvp-slot-claim-btn { padding: 3px 6px; font-size: 8.5px; }
        .pvp-slot-inv-btn { width: 22px; height: 22px; font-size: 10px; }
        .pvp-center-col { gap: 4px; }
        .pvp-vs-emblem { width: 34px; height: 34px; font-size: 12px; }
        .pvp-switch-team-btn { width: 90px; height: 30px; }
        .pvp-switch-team-btn span { font-size: 7.5px; }
        .pvp-switch-team-btn b { font-size: 9px; }
        .pvp-balance-badge { display: none; }
        .pvp-footer { padding: 4px 10px; }
        .pvp-btn-leave { padding: 4px 10px; font-size: 9.5px; }
        .pvp-btn-ready, .pvp-btn-start { width: 135px; height: 32px; font-size: 10px; }
        .pvp-launch-warning { font-size: 9px; }
      }

      /* Responsive: Mobile Portrait & Narrow Width (width <= 720px) */
      @media (max-width: 720px) {
        .pvp-header { flex-wrap: wrap; }
        .pvp-header-actions { width: 100%; justify-content: space-between; }
        .pvp-versus-stage { grid-template-columns: 1fr; gap: 8px; }
        .pvp-center-col { flex-direction: row; justify-content: center; gap: 8px; }
        .pvp-balance-badge { display: none; }
      }
    `;
    document.head.appendChild(style);
  }
}
