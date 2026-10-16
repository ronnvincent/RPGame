/**
 * Tournament Mode & Multiplayer PvP Colosseum Lobby UI
 *
 * Symmetrical Dark Fantasy Action RPG Colosseum staging area:
 * - Real connected players only (zero AI bots)
 * - Mobile Legends: Bang Bang style team switching (Crimson Legion vs Azure Sentinels)
 * - Symmetrical slot pedestals with animated pixel hero sprites facing each other
 * - Integrated friend invites & player ID lookup
 * - Host format management (1v1, 2v2, 3v3, 4v4)
 * - Ornate medieval stone & gold filigree styling
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
  finiteNumber,
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
  private selectedRoundsToWin: number = 2;
  private onStartMatchCb: (match: TournamentMatch) => void;

  private state: LobbyState | null = null;
  private friends: FriendEntry[] = [];
  private pvpLobbies: any[] = [];
  private activeDrawer: 'none' | 'invite' | 'lobbies' = 'none';

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
    this.overlay.className = 'dialogue-modal-backdrop tournament-lobby-backdrop';
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-labelledby', 'pvp-colosseum-title');

    // Subscribe to network events
    const unsubState = network.onLobbyState((state) => {
      this.state = state;
      if (state.pvpFormat && ['1v1', '2v2', '3v3', '4v4'].includes(state.pvpFormat)) {
        this.currentFormat = state.pvpFormat;
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
      if (this.overlay && this.activeDrawer === 'invite') this.render();
    });

    network.onPvpLobbyList((lobbies) => {
      this.pvpLobbies = lobbies || [];
      if (this.overlay && this.activeDrawer === 'lobbies') this.render();
    });

    network.onLobbyLeft(() => {
      this.close();
    });

    network.onLobbyError((msg) => {
      this.toast(msg);
    });

    // Check if player is already in a PvP lobby
    if (network.currentLobbyState && network.currentLobbyState.isPvp) {
      this.state = network.currentLobbyState;
      if (this.state.pvpFormat) this.currentFormat = this.state.pvpFormat;
    } else {
      // Auto-create Colosseum room for player
      network.createPvpLobby('tournament_colosseum', this.currentFormat, 'red');
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

    // Character idle animation loop (~9 fps)
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

  private myActorId(): string {
    return network.getActorId();
  }

  private myMember(): LobbyMember | null {
    const aid = this.myActorId();
    return this.state?.members.find(m => m.actorId === aid || m.uuid === aid || m.socketId === network.socket?.id) || null;
  }

  private myTeam(): TournamentTeam {
    const me = this.myMember();
    if (!me) return 'red';
    const aid = me.actorId || me.uuid;
    if (this.state?.pvpTeams && this.state.pvpTeams[aid]) {
      return this.state.pvpTeams[aid];
    }
    return me.team || 'red';
  }

  private switchTeam(targetTeam: TournamentTeam): void {
    audio.playClick();
    network.switchPvpTeam(targetTeam);
  }

  private setFormat(fmt: TournamentFormat): void {
    audio.playClick();
    this.currentFormat = fmt;
    network.setPvpFormat(fmt);
  }

  private toggleReady(): void {
    const me = this.myMember();
    if (!me) return;
    audio.playClick();
    network.sendReady(!me.ready);
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
    const members = st?.members || [];
    const iAmHost = network.isHost;
    const myId = this.myActorId();
    const myTeam = this.myTeam();
    const me = this.myMember();

    // Group real connected players by team
    const redMembers: LobbyMember[] = [];
    const blueMembers: LobbyMember[] = [];

    for (const m of members) {
      const aid = m.actorId || m.uuid;
      const assigned = (st?.pvpTeams && st.pvpTeams[aid]) || m.team || 'red';
      if (assigned === 'blue') {
        blueMembers.push(m);
      } else {
        redMembers.push(m);
      }
    }

    // Determine launch readiness
    const hasBothTeams = redMembers.length >= 1 && blueMembers.length >= 1;
    const allGuestsReady = members.every(m => m.isHost || m.ready);
    const canLaunch = iAmHost && hasBothTeams && allGuestsReady;

    let launchNotice = '';
    if (!hasBothTeams) {
      launchNotice = 'Requires at least 1 warrior on Crimson and 1 on Azure.';
    } else if (!allGuestsReady) {
      const unreadyCount = members.filter(m => !m.isHost && !m.ready).length;
      launchNotice = `Waiting for ${unreadyCount} challenger${unreadyCount > 1 ? 's' : ''} to ready up.`;
    }

    const modal = document.createElement('div');
    modal.className = 'pvp-modal-shell';

    // Top Header with Title & Room Code
    const header = document.createElement('div');
    header.className = 'pvp-header';
    header.innerHTML = `
      <div class="pvp-title-group">
        <div class="pvp-subcrest">MULTIPLAYER BATTLEGROUND • MOBILE LEGENDS CUSTOM MODE</div>
        <h1 class="pvp-main-title">THE GRAND COLOSSEUM</h1>
        <div class="pvp-stat-strip">
          <span>0.22 PvP Multiplier</span>
          <span class="pvp-bullet">•</span>
          <span>Normalized HP</span>
          <span class="pvp-bullet">•</span>
          <span>Anti-Burst Aegis</span>
          <span class="pvp-bullet">•</span>
          <span>Diminishing CC</span>
          <span class="pvp-bullet">•</span>
          <span style="color: #4ade80;">Real Players Only</span>
        </div>
      </div>
      <div class="pvp-header-right">
        <div class="pvp-room-code-badge" title="Click to copy Room Code" data-action="copy-code">
          <span class="pvp-code-lbl">COLOSSEUM:</span>
          <span class="pvp-code-val">${escapeHtml(st?.roomId || 'ARENA-LOBBY')}</span>
          <button class="pvp-copy-btn" aria-label="Copy Code">📋</button>
        </div>
        <button class="pvp-close-top-btn" aria-label="Close Colosseum">✕</button>
      </div>
    `;

    header.querySelector('[data-action="copy-code"]')?.addEventListener('click', () => {
      if (st?.roomId) {
        navigator.clipboard?.writeText(st.roomId);
        this.toast('Room code copied to clipboard!');
      }
    });
    header.querySelector('.pvp-close-top-btn')?.addEventListener('click', () => {
      this.handleLeaveOrClose();
    });
    modal.appendChild(header);

    // Format Selector Bar
    const formatBar = document.createElement('div');
    formatBar.className = 'pvp-format-bar';
    const formats: Array<{ id: TournamentFormat; label: string; icon: string }> = [
      { id: '1v1', label: '1v1 DUEL', icon: '⚔️' },
      { id: '2v2', label: '2v2 SKIRMISH', icon: '🛡️' },
      { id: '3v3', label: '3v3 SQUAD', icon: '🏹' },
      { id: '4v4', label: '4v4 GUILD WAR', icon: '👑' },
    ];

    let formatHtml = '<div class="pvp-format-tabs">';
    for (const fmt of formats) {
      const active = this.currentFormat === fmt.id ? 'active' : '';
      const disabled = !iAmHost ? 'disabled' : '';
      formatHtml += `
        <button class="pvp-format-tab ${active}" data-format="${fmt.id}" ${disabled}>
          <span class="pvp-tab-icon">${fmt.icon}</span>
          <span class="pvp-tab-label">${fmt.label}</span>
          <span class="pvp-tab-cap">${TOURNAMENT_FORMAT_TEAM_SIZES[fmt.id]} vs ${TOURNAMENT_FORMAT_TEAM_SIZES[fmt.id]}</span>
        </button>
      `;
    }
    formatHtml += '</div>';
    if (!iAmHost) {
      formatHtml += '<div class="pvp-guest-format-hint">Lobby Host sets match format</div>';
    }
    formatBar.innerHTML = formatHtml;

    if (iAmHost) {
      formatBar.querySelectorAll<HTMLButtonElement>('.pvp-format-tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          const fmt = tab.getAttribute('data-format') as TournamentFormat;
          if (fmt && fmt !== this.currentFormat) {
            this.setFormat(fmt);
          }
        });
      });
    }
    modal.appendChild(formatBar);

    // Symmetrical Colosseum Stage (West vs Center vs East)
    const stage = document.createElement('div');
    stage.className = 'pvp-stage';

    // WEST WING: CRIMSON LEGION (RED)
    const redWing = document.createElement('div');
    redWing.className = 'pvp-wing pvp-wing-red';
    redWing.innerHTML = `
      <div class="pvp-wing-header">
        <div class="pvp-banner-crest">🦁</div>
        <div class="pvp-wing-title-box">
          <div class="pvp-wing-title">CRIMSON LEGION</div>
          <div class="pvp-wing-sub">WEST SIDE • ${redMembers.length} / ${teamSize} FIGHTERS</div>
        </div>
      </div>
      <div class="pvp-pedestals-column pvp-pedestals-red">
        ${this.renderPedestalSlots('red', teamSize, redMembers, myId, iAmHost)}
      </div>
    `;
    stage.appendChild(redWing);

    // CENTER DIVIDER: VS COIN & SWITCH BUTTON
    const centerDivider = document.createElement('div');
    centerDivider.className = 'pvp-center-divider';
    const canSwitchToOther = myTeam === 'red' ? (blueMembers.length < teamSize) : (redMembers.length < teamSize);
    const targetTeamName = myTeam === 'red' ? 'AZURE' : 'CRIMSON';
    const switchTarget = myTeam === 'red' ? 'blue' : 'red';

    centerDivider.innerHTML = `
      <div class="pvp-vs-emblem">
        <div class="pvp-vs-circle">VS</div>
      </div>

      <button class="pvp-switch-btn" data-action="switch-team" ${!canSwitchToOther ? 'disabled' : ''}>
        <span class="pvp-switch-arrows">⇄</span>
        <span class="pvp-switch-text">SWITCH TO ${targetTeamName}</span>
      </button>

      <div class="pvp-arena-scroll">
        <div class="pvp-scroll-head">GOTHIC BASTION</div>
        <div class="pvp-scroll-sub">Multi-Tier Arena Platforms</div>
        <div class="pvp-scroll-body">
          Symmetrical spawns, high-ground platforms, and 0 friendly fire.
        </div>
      </div>
    `;

    centerDivider.querySelector('[data-action="switch-team"]')?.addEventListener('click', () => {
      this.switchTeam(switchTarget);
    });
    stage.appendChild(centerDivider);

    // EAST WING: AZURE SENTINELS (BLUE)
    const blueWing = document.createElement('div');
    blueWing.className = 'pvp-wing pvp-wing-blue';
    blueWing.innerHTML = `
      <div class="pvp-wing-header">
        <div class="pvp-wing-title-box" style="text-align: right;">
          <div class="pvp-wing-title">AZURE SENTINELS</div>
          <div class="pvp-wing-sub">EAST SIDE • ${blueMembers.length} / ${teamSize} FIGHTERS</div>
        </div>
        <div class="pvp-banner-crest">🦅</div>
      </div>
      <div class="pvp-pedestals-column pvp-pedestals-blue">
        ${this.renderPedestalSlots('blue', teamSize, blueMembers, myId, iAmHost)}
      </div>
    `;
    stage.appendChild(blueWing);

    modal.appendChild(stage);

    // Drawer Container (Invite Friends / Public Duels)
    if (this.activeDrawer !== 'none') {
      const drawer = document.createElement('div');
      drawer.className = 'pvp-drawer-panel';
      if (this.activeDrawer === 'invite') {
        drawer.innerHTML = this.renderInviteDrawer();
        this.bindInviteDrawerEvents(drawer);
      } else if (this.activeDrawer === 'lobbies') {
        drawer.innerHTML = this.renderLobbiesDrawer();
        this.bindLobbiesDrawerEvents(drawer);
      }
      modal.appendChild(drawer);
    }

    // Bottom Action Bar
    const footer = document.createElement('div');
    footer.className = 'pvp-footer';

    footer.innerHTML = `
      <div class="pvp-footer-left">
        <button class="pvp-sub-btn ${this.activeDrawer === 'invite' ? 'active' : ''}" data-action="toggle-invite">
          👥 INVITE FIGHTERS
        </button>
        <button class="pvp-sub-btn ${this.activeDrawer === 'lobbies' ? 'active' : ''}" data-action="toggle-lobbies">
          📜 BROWSE DUELS
        </button>
        <button class="pvp-sub-btn pvp-leave-btn" data-action="leave-lobby">
          🚪 LEAVE COLOSSEUM
        </button>
      </div>

      <div class="pvp-footer-right">
        ${launchNotice ? `<div class="pvp-launch-hint">${escapeHtml(launchNotice)}</div>` : ''}
        ${
          iAmHost
            ? `
              <button class="pvp-start-btn ${canLaunch ? 'ready-pulse' : 'disabled'}" data-action="start-tournament" ${!canLaunch ? 'disabled' : ''}>
                ⚔️ COMMENCE TOURNAMENT ⚔️
              </button>
            `
            : `
              <button class="pvp-ready-btn ${me?.ready ? 'is-ready' : 'not-ready'}" data-action="toggle-ready">
                ${me?.ready ? '⌛ CANCEL READY' : '⚔️ READY FOR BATTLE'}
              </button>
            `
        }
      </div>
    `;

    footer.querySelector('[data-action="toggle-invite"]')?.addEventListener('click', () => {
      this.activeDrawer = this.activeDrawer === 'invite' ? 'none' : 'invite';
      this.render();
    });
    footer.querySelector('[data-action="toggle-lobbies"]')?.addEventListener('click', () => {
      this.activeDrawer = this.activeDrawer === 'lobbies' ? 'none' : 'lobbies';
      if (this.activeDrawer === 'lobbies') network.browsePvpLobbies();
      this.render();
    });
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

    // Toast Container
    const toast = document.createElement('div');
    toast.className = 'pvp-toast';
    modal.appendChild(toast);

    this.overlay.appendChild(modal);

    // Bind slot-specific events (switching here or kicking)
    this.bindSlotActions(modal);
  }

  private renderPedestalSlots(
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

        // Wax seal badge
        let sealHtml = '';
        if (member.isHost) {
          sealHtml = '<div class="pvp-wax-seal pvp-seal-gold">👑 HOST</div>';
        } else if (member.ready) {
          sealHtml = '<div class="pvp-wax-seal pvp-seal-green">✓ READY</div>';
        } else {
          sealHtml = '<div class="pvp-wax-seal pvp-seal-amber">PREPARING</div>';
        }

        const canKick = iAmHost && !isMe;
        const memberAid = member.actorId || member.uuid;

        html += `
          <div class="pvp-pedestal-card filled ${isMe ? 'is-me' : ''} ${isRed ? 'card-red' : 'card-blue'}">
            <div class="pvp-pedestal-dais">
              <img
                class="pvp-pedestal-sprite ${isRed ? 'facing-right' : 'facing-left'}"
                src="${heroFrame(clsId, 'idle', 0)}"
                data-class="${escapeHtmlAttribute(clsId)}"
                alt="${escapeHtmlAttribute(name)}"
              />
              <div class="pvp-pedestal-rune-glow"></div>
            </div>

            <div class="pvp-pedestal-info">
              <div class="pvp-info-top">
                ${iconSrc ? `<img class="pvp-class-icon" src="${escapeHtmlAttribute(iconSrc)}" alt="" />` : ''}
                <div class="pvp-name-cluster">
                  <div class="pvp-fighter-name">${escapeHtml(name)} ${isMe ? '<span class="pvp-you-tag">[YOU]</span>' : ''}</div>
                  <div class="pvp-fighter-sub">LV ${lvl} ${escapeHtml((clsDef?.name || clsId).toUpperCase())}</div>
                </div>
                ${sealHtml}
              </div>

              <div class="pvp-hp-bar-shell">
                <div class="pvp-hp-bar-fill" style="width: 100%;"></div>
                <div class="pvp-hp-bar-label">HP: ${hp} | PWR: ${power}</div>
              </div>
            </div>

            ${canKick ? `<button class="pvp-kick-btn" data-action="kick" data-aid="${escapeHtmlAttribute(memberAid)}" title="Kick Player">✕</button>` : ''}
          </div>
        `;
      } else {
        // Empty slot with MLBB Switch Here action
        html += `
          <div class="pvp-pedestal-card empty ${isRed ? 'empty-red' : 'empty-blue'}" data-action="switch-to-team" data-team="${team}">
            <div class="pvp-empty-sigil">✦</div>
            <div class="pvp-empty-title">OPEN WARRIOR SLOT</div>
            <div class="pvp-empty-actions">
              <button class="pvp-slot-switch-btn" data-action="switch-to-team" data-team="${team}">
                ⚔️ SWITCH HERE
              </button>
              <button class="pvp-slot-invite-btn" data-action="open-invite">
                ➕ INVITE
              </button>
            </div>
          </div>
        `;
      }
    }

    return html;
  }

  private bindSlotActions(modal: HTMLElement): void {
    modal.querySelectorAll<HTMLButtonElement>('[data-action="switch-to-team"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetTeam = btn.getAttribute('data-team') as TournamentTeam;
        if (targetTeam) this.switchTeam(targetTeam);
      });
    });

    modal.querySelectorAll<HTMLButtonElement>('[data-action="open-invite"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.activeDrawer = 'invite';
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

  private renderInviteDrawer(): string {
    const onlineFriends = this.friends.filter(f => f.online);
    let friendsHtml = '';

    if (onlineFriends.length === 0) {
      friendsHtml = '<div class="pvp-drawer-empty">No online friends found. Invite by Short ID below!</div>';
    } else {
      for (const f of onlineFriends) {
        const clsDef = classOf(f.classId);
        friendsHtml += `
          <div class="pvp-friend-row">
            <div class="pvp-friend-details">
              <span class="pvp-friend-name">${escapeHtml(f.name)}</span>
              <span class="pvp-friend-meta">LV ${f.level} ${escapeHtml((clsDef?.name || f.classId || '').toUpperCase())} • ${escapeHtml(f.shortId)}</span>
            </div>
            <button class="pvp-send-inv-btn" data-shortid="${escapeHtmlAttribute(f.shortId)}">INVITE</button>
          </div>
        `;
      }
    }

    return `
      <div class="pvp-drawer-header">
        <span class="pvp-drawer-title">INVITE CHALLENGERS</span>
        <button class="pvp-drawer-close-btn" data-action="close-drawer">✕</button>
      </div>
      <div class="pvp-drawer-body">
        <div class="pvp-drawer-section">
          <div class="pvp-drawer-sub">DIRECT INVITE BY PLAYER ID</div>
          <div class="pvp-input-row">
            <input type="text" class="pvp-shortid-input" placeholder="ENTER CECT-XXXX" maxlength="16" />
            <button class="pvp-direct-send-btn">SEND INVITE</button>
          </div>
        </div>
        <div class="pvp-drawer-section">
          <div class="pvp-drawer-sub">ONLINE GUILD & ALLIES</div>
          <div class="pvp-friends-list">
            ${friendsHtml}
          </div>
        </div>
      </div>
    `;
  }

  private bindInviteDrawerEvents(drawer: HTMLElement): void {
    drawer.querySelector('[data-action="close-drawer"]')?.addEventListener('click', () => {
      this.activeDrawer = 'none';
      this.render();
    });

    drawer.querySelectorAll<HTMLButtonElement>('.pvp-send-inv-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sid = btn.getAttribute('data-shortid');
        if (sid) {
          audio.playClick();
          network.inviteFriend(sid);
          btn.textContent = 'SENT ✓';
          btn.disabled = true;
          this.toast(`Invite sent to ${sid}!`);
        }
      });
    });

    const sendBtn = drawer.querySelector<HTMLButtonElement>('.pvp-direct-send-btn');
    const input = drawer.querySelector<HTMLInputElement>('.pvp-shortid-input');

    const doSend = () => {
      const val = (input?.value || '').trim().toUpperCase();
      if (!val) return;
      audio.playClick();
      network.inviteFriend(val);
      if (input) input.value = '';
      this.toast(`Colosseum challenge dispatched to ${val}!`);
    };

    sendBtn?.addEventListener('click', doSend);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSend();
    });
  }

  private renderLobbiesDrawer(): string {
    let listHtml = '';
    const openDuels = (this.pvpLobbies || []).filter(l => l.isPvp && l.roomId !== this.state?.roomId);

    if (openDuels.length === 0) {
      listHtml = '<div class="pvp-drawer-empty">No active open duels found. Share your room code to challenge friends!</div>';
    } else {
      for (const lobby of openDuels) {
        listHtml += `
          <div class="pvp-lobby-row">
            <div class="pvp-lobby-details">
              <span class="pvp-lobby-host">Host: ${escapeHtml(lobby.hostName || 'Challenger')}</span>
              <span class="pvp-lobby-meta">Format: ${(lobby.pvpFormat || '1v1').toUpperCase()} • Fighters: ${lobby.playerCount || 1}/${lobby.maxPlayers || 2}</span>
            </div>
            <button class="pvp-join-duel-btn" data-roomid="${escapeHtmlAttribute(lobby.roomId)}">JOIN DUEL</button>
          </div>
        `;
      }
    }

    return `
      <div class="pvp-drawer-header">
        <span class="pvp-drawer-title">ACTIVE COLOSSEUM LOBBIES</span>
        <button class="pvp-drawer-close-btn" data-action="close-drawer">✕</button>
      </div>
      <div class="pvp-drawer-body">
        <div class="pvp-drawer-section">
          <div class="pvp-lobby-list">
            ${listHtml}
          </div>
        </div>
      </div>
    `;
  }

  private bindLobbiesDrawerEvents(drawer: HTMLElement): void {
    drawer.querySelector('[data-action="close-drawer"]')?.addEventListener('click', () => {
      this.activeDrawer = 'none';
      this.render();
    });

    drawer.querySelectorAll<HTMLButtonElement>('.pvp-join-duel-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rid = btn.getAttribute('data-roomid');
        if (rid) {
          audio.playClick();
          network.leaveLobby();
          network.joinLobby(rid);
          this.activeDrawer = 'none';
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
        background: radial-gradient(circle at center, rgba(14, 16, 26, 0.92) 0%, rgba(6, 7, 12, 0.98) 100%);
        display: flex; align-items: center; justify-content: center;
        z-index: 10000;
        padding: 16px;
        box-sizing: border-box;
      }

      .pvp-modal-shell {
        position: relative;
        width: 1100px; max-width: 96vw;
        max-height: 94vh;
        background: #0d0f17;
        border: 2px solid #523826;
        box-shadow: 0 0 50px rgba(0, 0, 0, 0.95), inset 0 0 30px rgba(180, 130, 40, 0.12);
        border-radius: 8px;
        display: flex; flex-direction: column;
        color: #f1f5f9;
        overflow: hidden;
        font-family: 'Outfit', sans-serif;
      }

      .pvp-header {
        display: flex; justify-content: space-between; align-items: center;
        padding: 14px 22px;
        background: linear-gradient(180deg, #1b1625 0%, #111019 100%);
        border-bottom: 2px solid #3d2f4a;
      }
      .pvp-subcrest {
        font-family: 'Cinzel', serif;
        font-size: 10px; font-weight: 700; letter-spacing: 2px;
        color: #c084fc; text-transform: uppercase;
      }
      .pvp-main-title {
        font-family: 'Cinzel', serif;
        margin: 2px 0 4px; font-size: 22px; font-weight: 900;
        letter-spacing: 2px;
        background: linear-gradient(180deg, #fef08a 0%, #eab308 50%, #ca8a04 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        text-shadow: 0 2px 8px rgba(234, 179, 8, 0.4);
      }
      .pvp-stat-strip {
        display: flex; gap: 8px; align-items: center;
        font-size: 11px; color: #94a3b8; letter-spacing: 0.5px;
      }
      .pvp-bullet { color: #583f6b; }

      .pvp-header-right { display: flex; align-items: center; gap: 12px; }
      .pvp-room-code-badge {
        display: flex; align-items: center; gap: 6px;
        background: #191624; border: 1px solid #483d5a;
        padding: 6px 12px; border-radius: 4px; cursor: pointer;
        transition: all 0.15s ease;
      }
      .pvp-room-code-badge:hover { border-color: #fbbf24; background: #221d30; }
      .pvp-code-lbl { font-size: 10px; font-weight: 800; color: #a855f7; letter-spacing: 1px; }
      .pvp-code-val { font-size: 11.5px; font-weight: 800; color: #f1f5f9; letter-spacing: 1.2px; font-family: monospace; }
      .pvp-copy-btn { background: none; border: 0; color: #94a3b8; cursor: pointer; font-size: 12px; }

      .pvp-close-top-btn {
        background: #241d2d; border: 1px solid #6b537c; color: #cbd5e1;
        width: 32px; height: 32px; border-radius: 4px; font-size: 14px;
        font-weight: 900; cursor: pointer; display: flex; align-items: center; justify-content: center;
      }
      .pvp-close-top-btn:hover { background: #7f1d1d; border-color: #ef4444; color: #fff; }

      .pvp-format-bar {
        display: flex; justify-content: space-between; align-items: center;
        padding: 10px 22px;
        background: #11121c;
        border-bottom: 1px solid #282436;
      }
      .pvp-format-tabs { display: flex; gap: 10px; flex: 1; }
      .pvp-format-tab {
        flex: 1; padding: 7px 10px; display: flex; flex-direction: column; align-items: center;
        background: #181724; border: 1px solid #353046; border-radius: 4px;
        cursor: pointer; color: #94a3b8; transition: all 0.15s ease;
      }
      .pvp-format-tab:hover:not(:disabled) { border-color: #fbbf24; background: #221f33; color: #f8fafc; }
      .pvp-format-tab.active {
        background: linear-gradient(180deg, #4c1d95 0%, #311160 100%);
        border-color: #a855f7; color: #ffffff;
        box-shadow: 0 0 14px rgba(168, 85, 247, 0.4);
      }
      .pvp-format-tab:disabled { opacity: 0.75; cursor: default; }
      .pvp-tab-label { font-size: 12px; font-weight: 800; letter-spacing: 0.8px; margin-top: 1px; }
      .pvp-tab-cap { font-size: 9.5px; opacity: 0.7; }
      .pvp-guest-format-hint { font-size: 11px; color: #a855f7; font-style: italic; margin-left: 14px; }

      .pvp-stage {
        display: grid; grid-template-columns: 1fr 140px 1fr;
        flex: 1; min-height: 380px; max-height: 520px;
        background: #090a10;
        overflow-y: auto;
      }

      .pvp-wing {
        display: flex; flex-direction: column;
        padding: 16px 20px;
        box-sizing: border-box;
      }
      .pvp-wing-red { background: linear-gradient(90deg, rgba(153, 27, 27, 0.08) 0%, transparent 100%); }
      .pvp-wing-blue { background: linear-gradient(270deg, rgba(30, 58, 138, 0.08) 0%, transparent 100%); }

      .pvp-wing-header {
        display: flex; align-items: center; gap: 12px; margin-bottom: 12px;
      }
      .pvp-banner-crest {
        font-size: 26px; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.8));
      }
      .pvp-wing-red .pvp-wing-title {
        font-family: 'Cinzel', serif; font-size: 15px; font-weight: 900;
        letter-spacing: 1.5px; color: #ef4444;
      }
      .pvp-wing-blue .pvp-wing-title {
        font-family: 'Cinzel', serif; font-size: 15px; font-weight: 900;
        letter-spacing: 1.5px; color: #3b82f6;
      }
      .pvp-wing-sub { font-size: 10px; color: #94a3b8; font-weight: 700; letter-spacing: 0.8px; }

      .pvp-pedestals-column { display: flex; flex-direction: column; gap: 10px; }

      .pvp-pedestal-card {
        display: flex; align-items: center; gap: 12px;
        border-radius: 6px; padding: 8px 12px;
        position: relative; box-sizing: border-box;
        transition: all 0.15s ease;
      }
      .pvp-pedestal-card.card-red {
        background: linear-gradient(180deg, rgba(20, 10, 14, 0.85) 0%, rgba(38, 12, 16, 0.95) 100%);
        border: 1px solid rgba(239, 68, 68, 0.4);
        box-shadow: 0 0 12px rgba(220, 38, 38, 0.2);
      }
      .pvp-pedestal-card.card-blue {
        background: linear-gradient(180deg, rgba(10, 14, 25, 0.85) 0%, rgba(12, 22, 42, 0.95) 100%);
        border: 1px solid rgba(59, 130, 246, 0.4);
        box-shadow: 0 0 12px rgba(37, 99, 235, 0.2);
      }
      .pvp-pedestal-card.is-me {
        border-color: #fbbf24 !important;
        box-shadow: 0 0 18px rgba(251, 191, 36, 0.35) !important;
      }

      .pvp-pedestal-card.empty {
        min-height: 78px; justify-content: center; flex-direction: column;
        border: 1px dashed rgba(255, 255, 255, 0.18);
        background: rgba(255, 255, 255, 0.02);
        cursor: pointer;
      }
      .pvp-pedestal-card.empty:hover {
        background: rgba(255, 255, 255, 0.05);
        border-color: #fbbf24;
      }
      .pvp-empty-sigil { font-size: 14px; opacity: 0.4; }
      .pvp-empty-title { font-size: 10.5px; font-weight: 800; color: #64748b; letter-spacing: 1px; }
      .pvp-empty-actions { display: flex; gap: 8px; margin-top: 4px; }
      .pvp-slot-switch-btn {
        padding: 4px 10px; font-size: 10px; font-weight: 800; border-radius: 3px;
        background: #231c2e; border: 1px solid #7c5c96; color: #f1f5f9; cursor: pointer;
      }
      .pvp-slot-switch-btn:hover { background: #4c1d95; border-color: #c084fc; }
      .pvp-slot-invite-btn {
        padding: 4px 10px; font-size: 10px; font-weight: 800; border-radius: 3px;
        background: #16222f; border: 1px solid #33618a; color: #93c5fd; cursor: pointer;
      }
      .pvp-slot-invite-btn:hover { background: #1e3a8a; }

      .pvp-pedestal-dais {
        width: 64px; height: 64px; position: relative;
        display: flex; align-items: flex-end; justify-content: center;
        background: radial-gradient(ellipse at bottom, rgba(255,255,255,0.08) 0%, transparent 70%);
      }
      .pvp-pedestal-sprite {
        height: 72px; width: auto; object-fit: cover; object-position: center bottom;
        image-rendering: pixelated; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.85));
      }
      .pvp-pedestal-sprite.facing-left { transform: scaleX(-1); }

      .pvp-pedestal-info { flex: 1; display: flex; flex-direction: column; gap: 4px; }
      .pvp-info-top { display: flex; align-items: center; gap: 8px; }
      .pvp-class-icon { width: 24px; height: 24px; image-rendering: pixelated; border-radius: 3px; }
      .pvp-name-cluster { flex: 1; }
      .pvp-fighter-name { font-size: 13.5px; font-weight: 800; color: #f8fafc; letter-spacing: 0.5px; }
      .pvp-you-tag { color: #fbbf24; font-size: 10px; margin-left: 4px; font-weight: 900; }
      .pvp-fighter-sub { font-size: 10px; color: #94a3b8; font-weight: 700; }

      .pvp-wax-seal {
        padding: 2px 7px; border-radius: 3px; font-size: 9.5px; font-weight: 900; letter-spacing: 0.8px;
      }
      .pvp-seal-gold { background: #78350f; border: 1px solid #fde047; color: #fef08a; }
      .pvp-seal-green { background: #14532d; border: 1px solid #4ade80; color: #dcfce7; }
      .pvp-seal-amber { background: #27272a; border: 1px solid #71717a; color: #d4d4d8; }

      .pvp-hp-bar-shell {
        position: relative; height: 16px; background: rgba(0, 0, 0, 0.65);
        border: 1px solid #334155; border-radius: 3px; overflow: hidden;
      }
      .pvp-pedestal-card.card-red .pvp-hp-bar-fill {
        height: 100%; background: linear-gradient(90deg, #b91c1c 0%, #ef4444 100%);
      }
      .pvp-pedestal-card.card-blue .pvp-hp-bar-fill {
        height: 100%; background: linear-gradient(90deg, #1d4ed8 0%, #3b82f6 100%);
      }
      .pvp-hp-bar-label {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        font-size: 9.5px; font-weight: 800; color: #f8fafc; letter-spacing: 0.5px;
        text-shadow: 0 1px 2px #000;
      }

      .pvp-kick-btn {
        background: #361717; border: 1px solid #7f1d1d; color: #f87171;
        width: 22px; height: 22px; border-radius: 3px; cursor: pointer;
        display: flex; align-items: center; justify-content: center; font-size: 11px;
      }
      .pvp-kick-btn:hover { background: #991b1b; color: #fff; }

      .pvp-center-divider {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        padding: 12px 8px; border-left: 1px solid #1e1b29; border-right: 1px solid #1e1b29;
        gap: 14px; text-align: center;
      }
      .pvp-vs-emblem {
        width: 54px; height: 54px; border-radius: 50%;
        background: radial-gradient(circle at 35% 35%, #ca8a04 0%, #713f12 70%, #291806 100%);
        border: 2px solid #fef08a;
        box-shadow: 0 0 16px rgba(234, 179, 8, 0.45);
        display: flex; align-items: center; justify-content: center;
      }
      .pvp-vs-circle {
        font-family: 'Cinzel', serif; font-size: 18px; font-weight: 900;
        color: #ffffff; text-shadow: 0 2px 4px rgba(0,0,0,0.9);
      }

      .pvp-switch-btn {
        padding: 8px 10px; font-size: 11px; font-weight: 900; letter-spacing: 0.8px;
        background: linear-gradient(180deg, #372946 0%, #1e1628 100%);
        border: 1px solid #c084fc; color: #f8fafc; border-radius: 4px;
        cursor: pointer; box-shadow: 0 0 10px rgba(192, 132, 252, 0.25);
        display: flex; flex-direction: column; align-items: center; gap: 2px;
        transition: all 0.15s ease;
      }
      .pvp-switch-btn:hover:not(:disabled) {
        background: linear-gradient(180deg, #6b21a8 0%, #4c1d95 100%);
        border-color: #e9d5ff; transform: scale(1.03);
      }
      .pvp-switch-btn:disabled { opacity: 0.45; cursor: default; }
      .pvp-switch-arrows { font-size: 16px; }

      .pvp-arena-scroll {
        background: #14131d; border: 1px solid #2f2b3e; border-radius: 4px;
        padding: 8px 6px; width: 100%; box-sizing: border-box;
      }
      .pvp-scroll-head { font-size: 10px; font-weight: 800; color: #eab308; letter-spacing: 1px; }
      .pvp-scroll-sub { font-size: 9px; color: #94a3b8; margin: 2px 0 4px; }
      .pvp-scroll-body { font-size: 8.5px; color: #64748b; line-height: 1.3; }

      .pvp-drawer-panel {
        background: #12131d; border-top: 1px solid #352e47; border-bottom: 1px solid #352e47;
        padding: 12px 20px; max-height: 200px; overflow-y: auto;
      }
      .pvp-drawer-header {
        display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;
      }
      .pvp-drawer-title { font-size: 11px; font-weight: 900; color: #c084fc; letter-spacing: 1.2px; }
      .pvp-drawer-close-btn {
        background: none; border: 0; color: #94a3b8; font-size: 14px; cursor: pointer;
      }
      .pvp-drawer-sub { font-size: 10px; font-weight: 800; color: #64748b; margin-bottom: 6px; }
      .pvp-input-row { display: flex; gap: 8px; margin-bottom: 12px; }
      .pvp-shortid-input {
        flex: 1; max-width: 240px; padding: 6px 10px; background: #090a10;
        border: 1px solid #39334d; color: #fff; font-family: monospace; font-size: 12px;
        text-transform: uppercase; border-radius: 4px;
      }
      .pvp-direct-send-btn {
        padding: 6px 14px; background: #7c3aed; border: 1px solid #a78bfa;
        color: #fff; font-size: 11px; font-weight: 800; border-radius: 4px; cursor: pointer;
      }
      .pvp-direct-send-btn:hover { background: #6d28d9; }

      .pvp-friends-list, .pvp-lobby-list { display: flex; flex-direction: column; gap: 6px; }
      .pvp-friend-row, .pvp-lobby-row {
        display: flex; justify-content: space-between; align-items: center;
        background: #191827; border: 1px solid #2d293d; padding: 6px 12px; border-radius: 4px;
      }
      .pvp-friend-details, .pvp-lobby-details { display: flex; flex-direction: column; }
      .pvp-friend-name, .pvp-lobby-host { font-size: 12px; font-weight: 800; color: #f1f5f9; }
      .pvp-friend-meta, .pvp-lobby-meta { font-size: 10px; color: #94a3b8; }
      .pvp-send-inv-btn, .pvp-join-duel-btn {
        padding: 5px 12px; font-size: 10.5px; font-weight: 800; border-radius: 3px;
        background: #166534; border: 1px solid #4ade80; color: #f0fdf4; cursor: pointer;
      }
      .pvp-send-inv-btn:hover, .pvp-join-duel-btn:hover { background: #15803d; }
      .pvp-drawer-empty { font-size: 11px; color: #64748b; font-style: italic; padding: 8px 0; }

      .pvp-footer {
        display: flex; justify-content: space-between; align-items: center;
        padding: 12px 22px;
        background: linear-gradient(180deg, #111018 0%, #0c0b12 100%);
        border-top: 1px solid #282436;
      }
      .pvp-footer-left { display: flex; gap: 10px; }
      .pvp-sub-btn {
        padding: 8px 14px; font-size: 11px; font-weight: 800; letter-spacing: 0.8px;
        background: #1c1b2b; border: 1px solid #36324a; color: #cbd5e1;
        border-radius: 4px; cursor: pointer; transition: all 0.15s ease;
      }
      .pvp-sub-btn:hover { background: #27253b; border-color: #64748b; }
      .pvp-sub-btn.active { background: #4c1d95; border-color: #a855f7; color: #fff; }
      .pvp-leave-btn:hover { background: #450a0a; border-color: #ef4444; color: #fca5a5; }

      .pvp-footer-right { display: flex; align-items: center; gap: 14px; }
      .pvp-launch-hint { font-size: 11px; color: #f59e0b; font-weight: 700; }

      .pvp-ready-btn {
        padding: 10px 24px; font-size: 13px; font-weight: 900; letter-spacing: 1px;
        border-radius: 4px; cursor: pointer; transition: all 0.15s ease;
      }
      .pvp-ready-btn.not-ready {
        background: linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%);
        border: 1px solid #60a5fa; color: #fff;
        box-shadow: 0 0 14px rgba(59, 130, 246, 0.4);
      }
      .pvp-ready-btn.is-ready {
        background: linear-gradient(180deg, #15803d 0%, #14532d 100%);
        border: 1px solid #4ade80; color: #dcfce7;
      }

      .pvp-start-btn {
        padding: 11px 28px; font-size: 13.5px; font-weight: 900; letter-spacing: 1.2px;
        font-family: 'Cinzel', serif; border-radius: 4px; cursor: pointer;
        background: linear-gradient(180deg, #f59e0b 0%, #d97706 100%);
        border: 1px solid #fef08a; color: #1a0f02;
        box-shadow: 0 0 20px rgba(245, 158, 11, 0.5);
        transition: all 0.15s ease;
      }
      .pvp-start-btn:hover:not(:disabled) {
        background: linear-gradient(180deg, #fbbf24 0%, #b45309 100%);
        transform: scale(1.02);
      }
      .pvp-start-btn.disabled, .pvp-start-btn:disabled {
        opacity: 0.4; cursor: default; box-shadow: none; filter: grayscale(0.6);
      }
      .pvp-start-btn.ready-pulse {
        animation: pvpGlowPulse 1.4s infinite alternate;
      }
      @keyframes pvpGlowPulse {
        from { box-shadow: 0 0 12px rgba(245, 158, 11, 0.4); }
        to { box-shadow: 0 0 28px rgba(245, 158, 11, 0.85), 0 0 8px #fef08a; }
      }

      .pvp-toast {
        position: absolute; bottom: 64px; left: 50%; transform: translateX(-50%) translateY(-8px);
        background: #1f1b2d; border: 1px solid #8b5cf6; color: #ede9fe;
        padding: 7px 18px; border-radius: 20px; font-size: 11px; font-weight: 800;
        letter-spacing: 0.5px; opacity: 0; pointer-events: none;
        transition: all 0.2s ease; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.8);
        z-index: 20;
      }
    `;
    document.head.appendChild(style);
  }
}
