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
  PVP_ROUND_DURATION_SEC,
} from '../pvp/TournamentSystem';
import { network, type LobbyState, type LobbyMember, type FriendEntry } from '../network/NetworkManager';
import { CHARACTER_CLASSES } from '../classes/ClassDefinitions';
import {
  describePvpRecord,
  loadPvpRecord,
  pvpRating,
  pvpTitleFor,
} from '../pvp/PvpRecord';
import { HERO_SPRITES, heroFrame } from '../engine/HeroSprites';
import {
  escapeHtml,
  escapeHtmlAttribute,
  installModalFocusTrap,
} from './UiSafety';
import QRCode from 'qrcode';
import { PvpCareerUI } from './PvpCareerUI';

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
  /**
   * The seat the server last told us we hold. It survives a snapshot that
   * momentarily forgets us (a lagging lobby_state, a state from before our
   * join was written): without it the fallback put a benched spectator in a
   * fighting slot, which is exactly what a new arrival used to trigger.
   */
  private localSeat: 'red' | 'blue' | 'spectator' = 'red';
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
  private handshakeInterval: number | null = null;
  private careerPanel: PvpCareerUI | null = null;

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

    // Periodically broadcast PvP handshake if host so guests auto-convert to PvP Colosseum Lobby
    this.handshakeInterval = window.setInterval(() => {
      if (network.isHost && network.room) {
        network.broadcastPvpHandshake('tournament_colosseum', this.currentFormat, 'lobby');
      }
    }, 1200);

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
      const me = state.members?.find(m => m.actorId === myId || m.uuid === myId);
      if (me?.seat) {
        this.applyLocalSeat(me.seat);
      } else if (state.pvpTeams && state.pvpTeams[myId]) {
        this.applyLocalSeat(state.pvpTeams[myId]);
      }
      if (network.isHost && state.members && state.members.length > 1) {
        network.broadcastPvpHandshake('tournament_colosseum', this.currentFormat, 'lobby');
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
      const me = this.state.members?.find(m => m.actorId === myId || m.uuid === myId);
      if (me?.seat) {
        this.applyLocalSeat(me.seat);
      } else if (this.state.pvpTeams && this.state.pvpTeams[myId]) {
        this.applyLocalSeat(this.state.pvpTeams[myId]);
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
    if (this.handshakeInterval !== null) {
      window.clearInterval(this.handshakeInterval);
      this.handshakeInterval = null;
    }
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];

    this.careerPanel?.close();
    this.careerPanel = null;

    this.releaseFocus?.();
    this.releaseFocus = null;

    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.overlay = null;
    this.isJoiningRoom = false;
  }

  /**
   * The career chip is the only place the record lives in the lobby, so it
   * doubles as the way in to the full page.
   */
  private openCareerPanel(): void {
    if (!this.overlay) return;
    const player = this.engine.player;
    const classDef = player.characterClass;
    const data = {
      record: loadPvpRecord(),
      playerName: player.name || classDef?.name || 'Champion',
      className: classDef?.name || 'Warrior',
      classId: classDef?.id,
      level: player.level || 1,
    };
    if (this.careerPanel) {
      this.careerPanel.setData(data);
      this.careerPanel.open();
      return;
    }
    // Mounted on the body, not inside the lobby: a nested dialog would let
    // every Escape and Tab reach the lobby's own focus trap as well.
    this.careerPanel = new PvpCareerUI(document.body, data);
    this.careerPanel.open();
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
      team: this.localSeat === 'spectator' ? undefined : this.localSeat,
      seat: this.localSeat,
      ready: false,
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
    this.pickSeat(targetTeam);
  }

  /** Remember the seat the server just assigned to us. */
  private applyLocalSeat(seat: 'red' | 'blue' | 'spectator' | undefined | null): void {
    if (seat !== 'red' && seat !== 'blue' && seat !== 'spectator') return;
    this.localSeat = seat;
    if (seat !== 'spectator') this.localTeam = seat;
  }

  /**
   * Which seat a member is in.
   *
   * The server's `seat` is the truth. `pvpTeams` is the next-best record, and a
   * member's own `team` field only matters for old snapshots. A spectator is
   * never inferred: the bench is a seat, not something you fall out of.
   */
  private resolveSeat(member: LobbyMember, isMe: boolean): 'red' | 'blue' | 'spectator' {
    if (member.seat === 'spectator') return 'spectator';
    if (member.seat === 'red' || member.seat === 'blue') return member.seat;
    const key = member.actorId || member.uuid;
    const fromRoom = key ? this.state?.pvpTeams?.[key] : undefined;
    if (fromRoom === 'red' || fromRoom === 'blue') return fromRoom;
    if (member.team === 'red' || member.team === 'blue') return member.team;
    // Nobody else's missing data is allowed to move us: the last seat the
    // server gave us wins over any local guess.
    if (isMe) return this.localSeat;
    return this.localTeam === 'red' ? 'blue' : 'red';
  }

  /**
   * Take a seat: a team position or a chair on the bench.
   *
   * The local snapshot is updated first so the grid answers the tap on the
   * same frame; the server's broadcast is the authority and replaces it.
   */
  private pickSeat(seat: 'red' | 'blue' | 'spectator', slot?: number): void {
    const myId = network.getActorId();
    audio.playClick();

    this.applyLocalSeat(seat);

    if (this.state) {
      const me = this.state.members.find(m => m.actorId === myId || m.uuid === myId);
      if (me) {
        me.seat = seat;
        if (slot !== undefined) me.slot = slot;
        if (seat === 'spectator') me.team = undefined;
        else me.team = seat;
      }
      if (!this.state.pvpSeats) this.state.pvpSeats = {};
      if (slot !== undefined) this.state.pvpSeats[myId] = slot;
      if (seat === 'spectator') {
        if (this.state.pvpTeams) delete this.state.pvpTeams[myId];
      } else {
        if (!this.state.pvpTeams) this.state.pvpTeams = {};
        this.state.pvpTeams[myId] = seat;
      }
    }

    network.pickPvpSeat(seat, slot);
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

  /** Host rights as the room sees them, not as this browser's role guess. */
  private isHostNow(): boolean {
    const myId = network.getActorId();
    const me = this.state?.members?.find(m => m.actorId === myId || m.uuid === myId);
    return me ? Boolean(me.isHost) : network.isHost;
  }

  private toggleReady(): void {
    audio.playClick();
    // Readying up is the challengers' job. The host launches; the server
    // ignores a host ready packet (and their badge is the crown), so the
    // button must not pretend otherwise either.
    if (this.isHostNow()) return;
    const myId = network.getActorId();
    const me = this.state?.members.find(m => m.actorId === myId || m.uuid === myId);
    const nextReady = !(me?.ready);
    if (me) me.ready = nextReady;
    network.sendReady(nextReady);
    this.render();
  }

  private startTournament(): void {
    if (!this.isHostNow()) {
      this.toast('Only the host can start the match.');
      return;
    }
    audio.playLevelUp();
    network.broadcastPvpHandshake('tournament_colosseum', this.currentFormat, 'match');
    network.startMatch();
  }

  /**
   * A bout against the arena's own gladiator.
   *
   * The Colosseum is unplayable with nobody else online, which is exactly when
   * a new player wants to learn the map. Practice is a fully local match: the
   * room is left first, so no other player can be pulled into a fight that is
   * not on the server's scoreboard.
   */
  /**
   * A practice bout uses the format on screen: 3v3 practice is a real 3v3,
   * with the missing slots filled by arena bots on both sides. The empty side
   * is filled by the match, the player's own side by the engine at match
   * start. A 1v1 remains a clean duel.
   */
  private startPracticeMatch(): void {
    const self = this.getLocalMember();
    const actorId = network.getActorId() || 'local_player';
    const format = this.currentFormat;
    const match = new TournamentMatch({
      format,
      roundsToWin: 2,
      roundDurationSec: PVP_ROUND_DURATION_SEC,
      mapTheme: 'tournament_colosseum',
    });
    this.engine.pvpTeam = 'red';
    match.setupTeamsFromLobby(
      [{ actorId, uuid: self.uuid, name: self.name, classId: self.classId, team: 'red' }],
      actorId,
      format,
      { [actorId]: 'red' },
      'red',
    );

    audio.playLevelUp();
    network.leaveLobby();
    this.close();
    this.onStartMatchCb(match);
  }

  private render(): void {
    if (!this.overlay) return;
    this.overlay.innerHTML = '';

    const st = this.state;
    const teamSize = TOURNAMENT_FORMAT_TEAM_SIZES[this.currentFormat];
    const myId = network.getActorId();
    const self = this.getLocalMember();
    const roomCode = this.getDisplayRoomCode();

    // Ensure local player is always placed on slot
    const rawMembers = st?.members && st.members.length > 0 ? [...st.members] : [self];
    // Adopt the server's seat before any fallback can speak. A snapshot that
    // does not list us yet must not turn a bench seat into a team seat.
    const authoritativeMe = st?.members?.find(m => m.actorId === myId || m.uuid === myId);
    if (authoritativeMe?.seat) {
      this.applyLocalSeat(authoritativeMe.seat);
    } else if (st?.pvpTeams?.[myId]) {
      this.applyLocalSeat(st.pvpTeams[myId]);
    }
    if (!rawMembers.some(m => m.actorId === myId || m.uuid === myId)) {
      rawMembers.unshift(self);
    }
    const me = rawMembers.find(m => m.actorId === myId || m.uuid === myId) || self;

    // Every member owns one seat. The bench is a seat too, so it is split out
    // here and never counted as a fighter - a spectator must not stand in for
    // an empty team when the host checks whether a match can launch.
    const redMembers: LobbyMember[] = [];
    const blueMembers: LobbyMember[] = [];
    const benchMembers: LobbyMember[] = [];

    for (const m of rawMembers) {
      const aid = m.actorId || m.uuid;
      const isMe = aid === myId;
      const seat = this.resolveSeat(m, isMe);
      if (isMe) this.applyLocalSeat(seat);

      if (seat === 'spectator') benchMembers.push(m);
      else if (seat === 'blue') blueMembers.push(m);
      else redMembers.push(m);
    }

    const benchSize = Math.max(
      2,
      st?.pvpBenchSize || 0,
      teamSize,
      rawMembers.length - teamSize * 2,
    );
    const redSlots = this.seatRows(redMembers, teamSize);
    const blueSlots = this.seatRows(blueMembers, teamSize);
    const benchSlots = this.seatRows(benchMembers, benchSize);
    const meSeat = this.resolveSeat(me, true);

    // Host rights come from the room itself. `network.isHost` starts out true
    // before the first role packet (and returns to true when a player leaves
    // the party), so a guest could be shown the host's START button and no
    // READY button at all.
    const iAmHost = authoritativeMe ? Boolean(authoritativeMe.isHost) : network.isHost;
    const hasBothTeams = redMembers.length >= 1 && blueMembers.length >= 1;
    // Bench spectators are not fighters: their readiness cannot block a fight
    // they are not in.
    const fighters = rawMembers.filter(m => (m.seat || m.team) !== 'spectator');
    const allGuestsReady = fighters.every(m => m.isHost || m.ready);
    const canLaunch = iAmHost && hasBothTeams && allGuestsReady;

    let launchNotice = '';
    if (meSeat === 'spectator') {
      // On the arena tab the bench is right there, with TAKE A SEAT under it.
      // Repeating "you are spectating" costs a footer row on a phone and
      // tells the player what they can already see.
      launchNotice = this.activeTab === 'arena'
        ? ''
        : 'You are on the spectator bench — the bout starts without you.';
    } else if (!hasBothTeams) {
      launchNotice = 'Requires at least 1 warrior on Crimson and 1 on Azure.';
    } else if (!allGuestsReady) {
      const unreadyCount = fighters.filter(m => !m.isHost && !m.ready).length;
      launchNotice = `Waiting for ${unreadyCount} challenger${unreadyCount > 1 ? 's' : ''} to ready up.`;
    }

    // The Colosseum record travels with the room code: a challenger can see
    // who they are about to fight before they commit to it.
    const record = loadPvpRecord();
    const careerTitle = pvpTitleFor(record);
    const careerLine = describePvpRecord(record);

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
        <button type="button" class="pvp-career-chip" data-action="open-career" title="Open your Colosseum career" aria-label="Open your Colosseum career">
          <b>${escapeHtml(careerTitle)}</b>
          <span>${escapeHtml(careerLine)} · ${pvpRating(record)} RATING</span>
        </button>
        <button class="pvp-qr-btn" data-action="open-qr" aria-label="Show the room QR code" title="Generate QR Code for Mobile Players">
          <span class="pvp-qr-icon" aria-hidden="true">📱</span>
          <span class="pvp-qr-text">QR CODE</span>
        </button>
        <button type="button" class="pvp-quick-code-badge" title="Copy the room code" data-action="copy-code" aria-label="Copy room code ${escapeHtml(roomCode)}">
          <span class="pvp-badge-lbl">ROOM</span>
          <span class="pvp-badge-val">${escapeHtml(roomCode)}</span>
          <span class="pvp-badge-copy-btn" aria-hidden="true">📋</span>
        </button>
        <button class="pvp-close-btn" aria-label="Close Colosseum" title="Leave or Close">&times;</button>
      </div>
    `;

    header.querySelector('[data-action="open-qr"]')?.addEventListener('click', () => {
      this.showQrCodeModal();
    });
    header.querySelector('[data-action="open-career"]')?.addEventListener('click', () => {
      this.openCareerPanel();
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
    //
    // Only when it can actually do something. Inside a room the code is
    // already in the header, and a dead input is the first thing that turns a
    // phone screen into noise (and its placeholder was the first thing to get
    // clipped). The Public Duels tab keeps it, because that is where someone
    // arrives holding a code for another room.
    const inRoom = Boolean(this.state?.roomId || network.room);
    if (!inRoom || this.activeTab === 'public') {
      const joinBar = document.createElement('div');
      joinBar.className = 'pvp-quick-join-bar';
      joinBar.innerHTML = `
        <span class="pvp-join-lbl">JOIN BY CODE</span>
        <input type="text" class="pvp-join-input" placeholder="4-DIGIT CODE" aria-label="Room code" maxlength="12" inputmode="numeric" />
        <button class="pvp-join-code-btn" type="button">JOIN</button>
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
    }

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

      let formatHtml = '<span class="pvp-format-label">FORMAT</span><div class="pvp-format-buttons" role="group" aria-label="Match format">';
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
        formatHtml += '<span class="pvp-host-only-note">HOST SETS</span>';
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
          ${this.renderTeamSlots('red', teamSize, redSlots, myId, iAmHost)}
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
          ${this.renderTeamSlots('blue', teamSize, blueSlots, myId, iAmHost)}
        </div>
      `;
      stage.appendChild(rightCol);

      // The bench sits above both teams, exactly where a Colosseum broadcast
      // puts its observers. It is a real row of the stage, not a floating
      // overlay, so it never covers a team slot on a short screen.
      const bench = document.createElement('div');
      bench.className = 'pvp-spectator-bench';
      bench.innerHTML = `
        <div class="pvp-bench-head">
          <span class="pvp-bench-title">◉ BENCH</span>
          <span class="pvp-bench-count">${benchMembers.length}/${benchSize}</span>
        </div>
        <div class="pvp-bench-chairs">
          ${this.renderBenchSlots(benchSlots, myId)}
        </div>
        ${meSeat === 'spectator' ? '<button type="button" class="pvp-bench-note" data-action="take-team-seat">↩ TAKE A SEAT</button>' : ''}
      `;
      stage.insertBefore(bench, stage.firstChild);

      modal.appendChild(stage);
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
    //
    // A spectator already has "TAKE A SEAT" pinned under the bench, right
    // where their eyes are. Repeating it in the footer gives the phone two
    // identical primary buttons, so the footer stays quiet on that tab and
    // only picks the action up elsewhere, where no bench is on screen.
    const benchHasSeatAction = meSeat === 'spectator' && this.activeTab === 'arena';
    const footerAction = iAmHost
      ? `
        <button class="pvp-btn-start ${canLaunch ? 'ready-to-launch' : 'disabled'}" data-action="start-tournament" ${!canLaunch ? 'disabled' : ''}>
          <span class="pvp-start-full">⚔️ COMMENCE TOURNAMENT ⚔️</span>
          <span class="pvp-start-short">⚔️ START</span>
        </button>
      `
      : meSeat === 'spectator'
        ? (benchHasSeatAction ? '' : `
          <button class="pvp-btn-ready not-ready" data-action="take-team-seat" title="Leave the bench and take a team seat">
            👁 TAKE A SEAT
          </button>
        `)
        : `
          <button class="pvp-btn-ready ${me?.ready ? 'is-ready' : 'not-ready'}" data-action="toggle-ready">
            ${me?.ready ? '⌛ CANCEL READY' : '⚔️ READY'}
          </button>
        `;
    const showFooterRight = Boolean(launchNotice) || footerAction.trim().length > 0;

    const footer = document.createElement('div');
    footer.className = 'pvp-footer';

    footer.innerHTML = `
      <div class="pvp-footer-left">
        <button class="pvp-btn-leave" data-action="leave-lobby">
          🚪 LEAVE COLOSSEUM
        </button>
        <button class="pvp-btn-practice" data-action="practice-bots" title="Play a local 1v1 against an arena bot">
          🎯 PRACTICE VS BOT
        </button>
      </div>

      ${showFooterRight ? `
      <div class="pvp-footer-right">
        ${launchNotice ? `<div class="pvp-launch-warning" role="status">${escapeHtml(launchNotice)}</div>` : ''}
        ${footerAction.trim() ? `<div class="pvp-footer-actions">${footerAction}</div>` : ''}
      </div>
      ` : ''}
    `;

    footer.querySelector('[data-action="leave-lobby"]')?.addEventListener('click', () => {
      this.handleLeaveOrClose();
    });
    footer.querySelector('[data-action="practice-bots"]')?.addEventListener('click', () => {
      this.startPracticeMatch();
    });
    footer.querySelector('[data-action="toggle-ready"]')?.addEventListener('click', () => {
      this.toggleReady();
    });
    footer.querySelector('[data-action="start-tournament"]')?.addEventListener('click', () => {
      if (canLaunch) this.startTournament();
    });

    modal.appendChild(footer);

    // Bind slot interactions once the whole panel exists: the footer's seat
    // button is rendered after the stage, so binding before it left the
    // Invite and Public tabs with a TAKE A SEAT button that did nothing.
    this.bindSlotActions(modal);

    // Toast element
    const toast = document.createElement('div');
    toast.className = 'pvp-toast';
    modal.appendChild(toast);

    this.overlay.appendChild(modal);
  }

  /**
   * Lay members out by the seat they actually hold.
   *
   * The old grid was just "the first N members in join order", so a player who
   * picked the third chair still appeared second, and the only empty card that
   * responded was the first one. Slots are explicit now; a missing or taken
   * slot falls back to the first free chair instead of overlapping someone.
   */
  private seatRows(members: LobbyMember[], size: number): Array<LobbyMember | null> {
    const rows: Array<LobbyMember | null> = new Array(Math.max(0, size)).fill(null);
    for (const member of members) {
      const wanted = typeof member.slot === 'number' ? member.slot : -1;
      const index = wanted >= 0 && wanted < rows.length && !rows[wanted]
        ? wanted
        : rows.findIndex(row => !row);
      if (index >= 0) rows[index] = member;
    }
    return rows;
  }

  private renderTeamSlots(
    team: TournamentTeam,
    teamSize: number,
    rows: Array<LobbyMember | null>,
    myId: string,
    iAmHost: boolean
  ): string {
    let html = '';
    const isRed = team === 'red';
    const roleList = isRed ? RED_ROLE_SLOTS : BLUE_ROLE_SLOTS;

    for (let i = 0; i < teamSize; i++) {
      const member = rows[i] || null;
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
        // Someone else's seat is a swap target: tap it and they inherit yours.
        const seatAction = isMe
          ? ''
          : `data-action="pick-seat" data-seat="${team}" data-slot="${i}" role="button" tabindex="0" title="Take this seat - swaps with ${escapeHtmlAttribute(name)}"`;

        html += `
          <div class="pvp-fighter-card ${isMe ? 'is-me' : ''} ${isRed ? 'card-red' : 'card-blue'} ${isMe ? '' : 'is-swappable'}" ${seatAction}>
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
          <div class="pvp-fighter-card pvp-empty-slot ${isRed ? 'empty-red' : 'empty-blue'}" data-action="pick-seat" data-seat="${team}" data-slot="${i}" role="button" tabindex="0" title="Take this open seat">
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
              <button class="pvp-slot-claim-btn" type="button" data-action="pick-seat" data-seat="${team}" data-slot="${i}">
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

  /**
   * The bench above the teams.
   *
   * Spectators are real seats, not a queue: a chair can be taken, given up,
   * or swapped with somebody already sitting on it.
   */
  private renderBenchSlots(rows: Array<LobbyMember | null>, myId: string): string {
    let html = '';
    rows.forEach((member, index) => {
      if (!member) {
        html += `
          <button type="button" class="pvp-bench-chair is-open" data-action="pick-seat" data-seat="spectator" data-slot="${index}" title="Watch this bout from the bench">
            <span class="pvp-bench-plus">＋</span>
            <span class="pvp-bench-name">WATCH</span>
          </button>
        `;
        return;
      }
      const isMe = member.actorId === myId || member.uuid === myId;
      const clsId = member.classId || 'warrior';
      const name = member.name || 'Challenger';
      html += `
        <button type="button" class="pvp-bench-chair is-taken ${isMe ? 'is-me' : ''}" data-action="pick-seat" data-seat="spectator" data-slot="${index}" title="${isMe ? 'You are on the bench' : `Swap seats with ${escapeHtmlAttribute(name)}`}">
          <img
            class="pvp-bench-avatar"
            src="${heroFrame(clsId, 'idle', 0)}"
            alt=""
            loading="lazy"
            onerror="this.style.visibility='hidden';"
          />
          <span class="pvp-bench-name">${escapeHtml(name)}${isMe ? ' <b>(YOU)</b>' : ''}</span>
        </button>
      `;
    });
    return html;
  }

  private bindSlotActions(modal: HTMLElement): void {
    modal.querySelectorAll<HTMLElement>('[data-action="pick-seat"]').forEach((el) => {
      const take = (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
        const seat = el.getAttribute('data-seat') as 'red' | 'blue' | 'spectator' | null;
        if (!seat) return;
        const rawSlot = el.getAttribute('data-slot');
        const slot = rawSlot === null ? undefined : Number(rawSlot);
        this.pickSeat(seat, Number.isInteger(slot) ? slot : undefined);
      };
      el.addEventListener('click', take);
      // A seat is a button in all but markup: let the keyboard take it too.
      el.addEventListener('keydown', (e) => {
        const key = (e as KeyboardEvent).key;
        if (key === 'Enter' || key === ' ') take(e);
      });
    });

    modal.querySelectorAll<HTMLElement>('[data-action="take-team-seat"]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this.pickSeat(this.localTeam);
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
      /* ===================== DESIGN TOKENS =====================
         One spacing scale, one ink ramp, one touch target. Every row below
         is built from these, so the screen keeps its rhythm at any size. */
      .tournament-lobby-backdrop {
        --ink: #f7e7ce;
        --ink-dim: #c4b5a0;
        --ink-faint: #94826b;
        --gold: #ffd770;
        --line: #5a3d24;
        --line-strong: #3d2817;
        --surface: rgba(12, 8, 5, 0.82);
        --surface-2: rgba(22, 15, 9, 0.9);
        --sand: #ecdcb8;
        --sand-deep: #dcc79c;
        --sand-ink: #2b1a0d;
        --radius: 6px;
        --s1: 4px;
        --s2: 8px;
        --s3: 12px;
        --s4: 16px;
        --tap: 44px;

        position: fixed; inset: 0;
        background: rgba(4, 5, 8, 0.9);
        display: flex; align-items: center; justify-content: center;
        z-index: 10000;
        padding: var(--s3);
        box-sizing: border-box;
      }
      .tournament-lobby-backdrop *,
      .tournament-lobby-backdrop *::before,
      .tournament-lobby-backdrop *::after { box-sizing: border-box; }

      .pvp-modal-shell {
        position: relative;
        width: min(1040px, 100%);
        max-height: 96dvh;
        background: url('/assets/kenney-rpg-ui/panel_brown.png') repeat;
        border: 4px solid var(--line-strong);
        box-shadow: 0 0 40px rgba(0, 0, 0, 0.95), inset 0 0 20px rgba(0, 0, 0, 0.6);
        border-radius: 8px;
        display: flex; flex-direction: column;
        color: var(--ink);
        overflow: hidden;
        font-family: 'Outfit', 'Inter', sans-serif;
        -webkit-tap-highlight-color: transparent;
      }
      .pvp-modal-shell button { font-family: inherit; touch-action: manipulation; }

      /* ===================== HEADER ===================== */
      .pvp-header {
        display: flex; align-items: center; gap: var(--s2);
        padding: var(--s2) var(--s4);
        background: rgba(18, 12, 7, 0.78);
        border-bottom: 2px solid var(--line);
        flex: 0 0 auto;
        min-width: 0;
      }
      .pvp-title-cluster { min-width: 0; flex: 1 1 auto; }
      .pvp-title {
        margin: 0;
        font-family: 'Cinzel', Georgia, serif;
        font-size: clamp(15px, 2.1vw, 20px); font-weight: 900;
        color: #fce79a; letter-spacing: 0.08em; line-height: 1.15;
        text-shadow: 0 2px 4px #000;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .pvp-subtitle {
        font-size: 10px; color: var(--ink-faint); margin-top: 2px;
        font-weight: 600; letter-spacing: 0.04em;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }

      .pvp-header-actions { display: flex; align-items: center; gap: var(--s2); flex: 0 0 auto; min-width: 0; }

      .pvp-career-chip {
        appearance: none;
        display: flex; flex-direction: column; align-items: flex-end; gap: 1px;
        padding: 4px 10px;
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid #735134; border-radius: 4px;
        max-width: 190px; min-height: 36px;
        color: inherit; font: inherit; text-align: right; cursor: pointer;
      }
      .pvp-career-chip:hover { border-color: #b8860b; background: rgba(60, 38, 14, 0.55); }
      .pvp-career-chip:focus-visible { outline: 2px solid #ffe08a; outline-offset: 2px; }
      .pvp-career-chip b {
        font-family: 'Cinzel', serif; font-size: 10px; font-weight: 900; color: var(--gold);
        letter-spacing: 0.04em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
      }
      .pvp-career-chip span {
        font-size: 8.5px; color: var(--ink-dim);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
      }

      .pvp-qr-btn {
        display: inline-flex; align-items: center; gap: 5px;
        min-height: 36px; padding: 0 12px;
        font-size: 10.5px; font-weight: 900; letter-spacing: 0.04em;
        background: url('/assets/kenney-rpg-ui/buttonLong_blue.png') no-repeat center/100% 100%;
        border: 0; color: #fff; cursor: pointer; text-shadow: 0 1px 2px #000;
        white-space: nowrap; transition: filter 0.15s ease;
      }
      .pvp-qr-btn:hover { filter: brightness(1.2); }
      .pvp-qr-icon { font-size: 13px; }

      /* One tap target: the badge itself copies, the clipboard glyph is just
         a hint. A nested button would have split a 60px control into two
         focus stops and two toast events. */
      .pvp-quick-code-badge {
        display: inline-flex; align-items: center; gap: 6px;
        min-height: 36px; padding: 0 10px;
        background: rgba(0, 0, 0, 0.42);
        border: 1px solid #735134; border-radius: 4px;
        color: var(--ink); font-family: inherit;
        cursor: pointer; white-space: nowrap;
        transition: border-color 0.15s ease, filter 0.15s ease;
      }
      .pvp-quick-code-badge:hover { border-color: var(--gold); filter: brightness(1.15); }
      .pvp-quick-code-badge:focus-visible { outline: 2px solid #ffe08a; outline-offset: 2px; }
      .pvp-badge-lbl { font-size: 9px; font-weight: 800; color: var(--gold); letter-spacing: 0.08em; }
      .pvp-badge-val { font-size: 13px; font-weight: 900; color: #fff; font-family: monospace; letter-spacing: 0.06em; }
      .pvp-badge-copy-btn { font-size: 12px; line-height: 1; }

      .pvp-close-btn {
        width: 36px; height: 36px; flex: 0 0 auto;
        background: url('/assets/kenney-rpg-ui/buttonSquare_brown.png') no-repeat center/100% 100%;
        border: 0; color: #fca5a5; font-size: 18px; font-weight: 900; line-height: 1;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
      }
      .pvp-close-btn:hover { filter: brightness(1.25); color: #fff; }

      /* ===================== JOIN BAR ===================== */
      .pvp-quick-join-bar {
        display: flex; align-items: center; gap: var(--s2);
        padding: var(--s2) var(--s4);
        background: rgba(10, 7, 4, 0.92);
        border-bottom: 1px solid #4a321c;
        flex: 0 0 auto; min-width: 0;
      }
      .pvp-join-lbl {
        font-size: 10px; font-weight: 900; color: var(--gold);
        letter-spacing: 0.08em; white-space: nowrap; flex: 0 0 auto;
      }
      .pvp-join-input {
        flex: 1 1 auto; min-width: 0; max-width: 220px; min-height: 34px;
        padding: 0 10px; font-size: 12px;
        background: rgba(0, 0, 0, 0.6); border: 1px solid #634327; color: #fff;
        font-family: monospace; text-transform: uppercase; border-radius: 4px;
      }
      .pvp-join-input::placeholder { color: #7d6a52; }
      .pvp-join-input:focus { border-color: var(--gold); outline: none; }
      .pvp-join-code-btn {
        min-height: 34px; padding: 0 16px; flex: 0 0 auto;
        font-size: 11px; font-weight: 900;
        background: url('/assets/kenney-rpg-ui/buttonLong_blue.png') no-repeat center/100% 100%;
        border: 0; color: #fff; cursor: pointer; text-shadow: 0 1px 2px #000;
      }
      .pvp-join-code-btn:hover { filter: brightness(1.2); }

      /* ===================== TABS ===================== */
      .pvp-nav-tabs {
        display: flex; gap: var(--s2);
        padding: var(--s2) var(--s4);
        background: rgba(10, 7, 4, 0.86);
        border-bottom: 2px solid #4a321c;
        flex: 0 0 auto;
      }
      .pvp-nav-tab {
        flex: 1 1 0; min-width: 0; min-height: 40px;
        padding: 0 12px;
        font-family: 'Cinzel', serif; font-size: 11.5px; font-weight: 800;
        letter-spacing: 0.04em; cursor: pointer; border: 0;
        background: url('/assets/kenney-rpg-ui/buttonLong_brown.png') no-repeat center/100% 100%;
        color: #d8c29d;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        transition: filter 0.15s ease, color 0.15s ease;
      }
      .pvp-nav-tab:hover { filter: brightness(1.2); color: #fff; }
      .pvp-nav-tab.active {
        background: url('/assets/kenney-rpg-ui/buttonLong_blue.png') no-repeat center/100% 100%;
        color: #fff; text-shadow: 0 1px 3px #000;
      }

      /* ===================== FORMAT ROW ===================== */
      .pvp-format-selector {
        display: flex; align-items: center; gap: var(--s3);
        padding: 6px var(--s4);
        background: rgba(0, 0, 0, 0.38);
        border-bottom: 1px solid rgba(220, 180, 110, 0.2);
        flex: 0 0 auto; min-width: 0;
      }
      .pvp-format-label {
        font-size: 9.5px; font-weight: 900; color: var(--ink-faint);
        letter-spacing: 0.12em; flex: 0 0 auto;
      }
      .pvp-format-buttons {
        display: flex; gap: 6px; flex: 1 1 auto; min-width: 0;
        overflow-x: auto; scrollbar-width: none; padding: 2px;
      }
      .pvp-format-buttons::-webkit-scrollbar { display: none; }
      .pvp-fmt-btn {
        flex: 0 0 auto; min-height: 34px; padding: 0 12px;
        font-size: 10.5px; font-weight: 800;
        background: url('/assets/kenney-rpg-ui/buttonSquare_brown.png') no-repeat center/100% 100%;
        border: 0; color: #b89f80; cursor: pointer;
      }
      .pvp-fmt-btn.active {
        background: url('/assets/kenney-rpg-ui/buttonSquare_beige.png') no-repeat center/100% 100%;
        color: #2b1807; font-weight: 900;
      }
      .pvp-fmt-btn:disabled { opacity: 0.55; cursor: default; }
      .pvp-host-only-note {
        flex: 0 0 auto; font-size: 9px; font-weight: 800; color: #e2b153;
        letter-spacing: 0.08em; text-transform: uppercase;
      }

      /* ===================== STAGE ===================== */
      .pvp-versus-stage {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(84px, 132px) minmax(0, 1fr);
        gap: var(--s3);
        padding: var(--s3) var(--s4);
        background: rgba(0, 0, 0, 0.22);
        overflow-y: auto; overflow-x: hidden;
        flex: 1 1 auto; min-height: 0;
        align-content: start;
      }
      .pvp-versus-stage > * { min-width: 0; }

      /* ===================== BENCH =====================
         A solid sand strip with real contrast. It used to repeat a 93x94
         panel texture, whose seams read as a row of mystery buttons. */
      .pvp-spectator-bench {
        grid-column: 1 / -1;
        position: sticky; top: 0; z-index: 3;
        display: flex; align-items: center; gap: var(--s2);
        min-width: 0; min-height: 48px;
        padding: 5px var(--s2);
        background: linear-gradient(180deg, #f1e2c0 0%, #e3d0a6 100%);
        border: 2px solid #3a2415; border-radius: var(--radius);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 3px 0 rgba(0, 0, 0, 0.35);
        color: var(--sand-ink);
      }
      .pvp-bench-head { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
      .pvp-bench-title {
        font-family: 'Cinzel', serif; font-weight: 900; font-size: 10.5px;
        letter-spacing: 0.08em; color: #33200f; white-space: nowrap;
      }
      .pvp-bench-count {
        font-size: 9.5px; font-weight: 900; color: #f7e7ce;
        background: #3a2415; border-radius: 10px; padding: 1px 7px;
        font-variant-numeric: tabular-nums;
      }
      .pvp-bench-sub { display: none; }
      .pvp-bench-chairs {
        display: flex; align-items: center; gap: 6px;
        flex: 1 1 auto; min-width: 0;
        overflow-x: auto; overflow-y: hidden;
        scrollbar-width: none; padding: 1px;
      }
      .pvp-bench-chairs::-webkit-scrollbar { display: none; }
      .pvp-bench-chair {
        flex: 0 0 auto;
        display: inline-flex; align-items: center; gap: 6px;
        min-height: 36px; padding: 0 10px 0 5px;
        border: 2px solid #6b4a2c; border-radius: 4px;
        background: #fbf3e0; color: #2b1a0d;
        font-size: 11px; font-weight: 800; cursor: pointer;
        box-shadow: 0 1px 0 rgba(0, 0, 0, 0.25);
        max-width: 190px;
      }
      .pvp-bench-chair:hover { filter: brightness(1.05); border-color: #3a2415; }
      .pvp-bench-chair:focus-visible { outline: 2px solid #b45309; outline-offset: 2px; }
      .pvp-bench-chair.is-open {
        background: rgba(255, 255, 255, 0.28); border-style: dashed; color: #5c4026;
      }
      .pvp-bench-chair.is-me { border-color: #1d4ed8; box-shadow: 0 0 0 2px rgba(29, 78, 216, 0.25); }
      .pvp-bench-plus { font-size: 14px; font-weight: 900; line-height: 1; }
      .pvp-bench-avatar {
        width: 26px; height: 26px; object-fit: contain; flex: 0 0 auto;
        image-rendering: pixelated; filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.35));
      }
      .pvp-bench-name {
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
      }
      .pvp-bench-name b { color: #1d4ed8; font-size: 9px; }
      .pvp-bench-note {
        flex: 0 0 auto; min-height: 36px; padding: 0 10px;
        border: 2px solid #7c2d12; border-radius: 4px;
        background: #fff7e6; color: #7c2d12;
        font-size: 10px; font-weight: 900; letter-spacing: 0.04em;
        cursor: pointer; white-space: nowrap;
      }
      .pvp-bench-note:hover { background: #ffe9c7; }

      /* ===================== TEAM COLUMNS ===================== */
      .pvp-team-col { display: flex; flex-direction: column; gap: var(--s2); min-width: 0; }
      .pvp-team-banner {
        display: flex; justify-content: space-between; align-items: center;
        gap: var(--s2); min-height: 34px; padding: 5px 10px;
        border-radius: 4px;
        font-family: 'Cinzel', serif; font-weight: 900;
      }
      .banner-red {
        background: linear-gradient(90deg, #7f1d1d 0%, #450a0a 100%);
        border: 1px solid #ef4444; border-left: 4px solid #f87171; color: #fecaca;
      }
      .banner-blue {
        background: linear-gradient(90deg, #1e3a8a 0%, #172554 100%);
        border: 1px solid #3b82f6; border-left: 4px solid #60a5fa; color: #bfdbfe;
      }
      .pvp-banner-title {
        font-size: 12px; letter-spacing: 0.06em;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .pvp-banner-count {
        font-size: 10px; opacity: 0.9; font-family: 'Outfit', sans-serif;
        font-weight: 700; white-space: nowrap; flex: 0 0 auto;
      }

      .pvp-slots-container { display: flex; flex-direction: column; gap: var(--s2); min-width: 0; }

      .pvp-fighter-card {
        display: flex; align-items: center; gap: 10px;
        min-height: 54px; padding: 6px 10px;
        border-radius: var(--radius); position: relative;
        background: var(--surface-2);
        border: 2px solid var(--line);
        min-width: 0;
      }
      .pvp-fighter-card.card-red { border-color: rgba(239, 68, 68, 0.55); }
      .pvp-fighter-card.card-blue { border-color: rgba(59, 130, 246, 0.55); }
      .pvp-fighter-card.is-me {
        border-color: var(--gold) !important;
        box-shadow: 0 0 0 1px rgba(255, 215, 112, 0.35), 0 0 14px rgba(255, 215, 112, 0.22);
      }

      .pvp-fighter-avatar {
        width: 44px; height: 44px; flex: 0 0 auto;
        display: flex; align-items: flex-end; justify-content: center;
        background: rgba(0, 0, 0, 0.45); border-radius: 4px; overflow: hidden;
      }
      .pvp-pedestal-sprite {
        height: 48px; width: auto; object-fit: cover; object-position: center bottom;
        image-rendering: pixelated;
      }
      .pvp-pedestal-sprite.facing-left { transform: scaleX(-1); }

      .pvp-fighter-info { flex: 1 1 auto; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .pvp-info-row1 { display: flex; align-items: center; gap: 6px; min-width: 0; }
      .pvp-class-icon { width: 18px; height: 18px; flex: 0 0 auto; image-rendering: pixelated; border-radius: 2px; }
      .pvp-fighter-name {
        font-size: 13px; font-weight: 800; color: #fff; min-width: 0;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .pvp-you-tag { color: var(--gold); font-size: 9.5px; margin-left: 3px; }

      .pvp-badge {
        padding: 1px 6px; font-size: 8.5px; font-weight: 800; border-radius: 2px;
        flex: 0 0 auto; letter-spacing: 0.02em;
      }
      .badge-host { background: #b45309; color: #fef3c7; border: 1px solid #fde047; }
      .badge-ready { background: #166534; color: #dcfce7; border: 1px solid #4ade80; }
      .badge-wait { background: #3f3f46; color: #d4d4d8; }
      .badge-empty { background: rgba(0, 0, 0, 0.5); border: 1px solid #735134; color: #b89f80; }

      .pvp-info-row2 {
        display: flex; flex-wrap: wrap; gap: 8px;
        font-size: 10px; color: var(--ink-dim); font-weight: 700;
      }
      .pvp-stat-hp { color: #86efac; }
      .pvp-stat-pwr { color: #fde047; }

      .pvp-kick-btn {
        width: 30px; height: 30px; flex: 0 0 auto;
        background: #501010; border: 1px solid #991b1b; color: #fca5a5;
        cursor: pointer; border-radius: 3px; font-size: 15px;
        display: flex; align-items: center; justify-content: center;
      }
      .pvp-kick-btn:hover { background: #b91c1c; color: #fff; }

      /* Empty seat */
      .pvp-empty-slot {
        background: rgba(10, 8, 6, 0.55);
        border: 2px dashed rgba(180, 140, 90, 0.5);
        cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
      }
      .pvp-empty-slot:hover {
        background: rgba(25, 18, 12, 0.8);
        border-color: var(--gold);
        box-shadow: 0 0 10px rgba(255, 215, 112, 0.25);
      }
      .pvp-empty-slot.empty-red { border-left: 3px solid #ef4444; }
      .pvp-empty-slot.empty-blue { border-left: 3px solid #3b82f6; }

      .pvp-empty-avatar {
        background: radial-gradient(circle, rgba(255, 215, 112, 0.1) 0%, rgba(0, 0, 0, 0.5) 100%);
      }
      .pvp-avatar-silhouette { font-size: 20px; opacity: 0.7; filter: grayscale(0.5); }
      .pvp-avatar-sigil { display: none; }

      .pvp-empty-role-title {
        font-size: 11.5px; font-weight: 800; color: #e2cbb0; letter-spacing: 0.04em;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .pvp-empty-role-sub {
        font-size: 9.5px; color: #8e7a63;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }

      .pvp-empty-action-group { display: flex; gap: 6px; flex: 0 0 auto; }
      .pvp-slot-claim-btn {
        min-height: 36px; padding: 0 10px;
        font-size: 10px; font-weight: 900;
        background: url('/assets/kenney-rpg-ui/buttonSquare_brown.png') no-repeat center/100% 100%;
        border: 0; color: #fce79a; cursor: pointer; white-space: nowrap;
      }
      .pvp-slot-claim-btn:hover { filter: brightness(1.25); }
      .pvp-slot-inv-btn {
        width: 36px; height: 36px; flex: 0 0 auto;
        font-size: 14px; font-weight: 900;
        background: url('/assets/kenney-rpg-ui/buttonSquare_beige.png') no-repeat center/100% 100%;
        border: 0; color: #2b1807; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
      }
      .pvp-slot-inv-btn:hover { filter: brightness(1.2); }

      /* Center column */
      .pvp-center-col {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: var(--s3); text-align: center; min-width: 0;
      }
      .pvp-vs-emblem {
        width: 46px; height: 46px; border-radius: 50%;
        background: radial-gradient(circle at 35% 35%, #ffd770 0%, #996515 70%, #3d2305 100%);
        border: 2px solid #fff; font-family: 'Cinzel', serif; font-size: 16px; font-weight: 900;
        color: #fff; text-shadow: 0 2px 4px #000;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 0 16px rgba(255, 215, 112, 0.45);
      }
      .pvp-switch-team-btn {
        width: 100%; max-width: 132px; min-height: var(--tap);
        background: url('/assets/kenney-rpg-ui/buttonLong_blue.png') no-repeat center/100% 100%;
        border: 0; color: #fff; cursor: pointer;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        text-shadow: 0 1px 2px #000;
      }
      .pvp-switch-team-btn span { font-size: 9px; opacity: 0.9; }
      .pvp-switch-team-btn b { font-size: 11px; font-weight: 900; }
      .pvp-switch-team-btn:hover:not(:disabled) { filter: brightness(1.2); }
      .pvp-switch-team-btn:disabled { opacity: 0.45; cursor: default; }
      .pvp-balance-badge {
        background: rgba(0, 0, 0, 0.55); border: 1px solid var(--line);
        border-radius: 4px; padding: 6px 8px; width: 100%;
        display: flex; flex-direction: column; gap: 2px;
      }
      .pvp-balance-badge b { font-size: 9px; color: var(--gold); letter-spacing: 0.06em; }
      .pvp-balance-badge span { font-size: 8.5px; color: var(--ink-faint); }

      /* ===================== TAB PANELS ===================== */
      .pvp-tab-panel {
        padding: var(--s4);
        overflow-y: auto; max-height: 480px;
        background: rgba(0, 0, 0, 0.22);
        flex: 1 1 auto; min-height: 0;
      }
      .pvp-panel-box { display: flex; flex-direction: column; min-width: 0; }
      .pvp-share-code-card {
        display: flex; justify-content: space-between; align-items: center; gap: var(--s3);
        flex-wrap: wrap;
        padding: 10px 14px; background: rgba(0, 0, 0, 0.6);
        border: 2px solid var(--gold); border-radius: var(--radius); margin-bottom: var(--s2);
      }
      .pvp-share-code-left { display: flex; align-items: center; gap: var(--s2); flex-wrap: wrap; min-width: 0; }
      .pvp-share-lbl { font-size: 10px; font-weight: 900; color: var(--gold); letter-spacing: 0.04em; }
      .pvp-share-val { font-size: 18px; font-weight: 900; color: #fff; font-family: monospace; letter-spacing: 0.1em; }
      .pvp-share-code-btns { display: flex; gap: 6px; flex-wrap: wrap; }
      .pvp-share-qr-btn, .pvp-share-copy-btn {
        min-height: 38px; padding: 0 14px;
        font-size: 10.5px; font-weight: 900;
        border: 0; cursor: pointer; text-shadow: 0 1px 2px #000;
      }
      .pvp-share-qr-btn {
        background: url('/assets/kenney-rpg-ui/buttonLong_brown.png') no-repeat center/100% 100%;
        color: var(--gold);
      }
      .pvp-share-copy-btn {
        background: url('/assets/kenney-rpg-ui/buttonLong_blue.png') no-repeat center/100% 100%;
        color: #fff;
      }
      .pvp-share-qr-btn:hover, .pvp-share-copy-btn:hover { filter: brightness(1.2); }

      .pvp-panel-title {
        margin: 0 0 var(--s2);
        font-family: 'Cinzel', serif; font-size: 12px; font-weight: 900;
        color: var(--gold); letter-spacing: 0.06em;
      }
      .pvp-direct-invite-bar { display: flex; gap: var(--s2); margin-bottom: var(--s2); flex-wrap: wrap; }
      .pvp-id-input {
        flex: 1 1 180px; min-width: 0; min-height: 40px; padding: 0 12px;
        font-size: 12px;
        background: rgba(0, 0, 0, 0.6); border: 1px solid var(--line); color: #fff;
        font-family: monospace; text-transform: uppercase; border-radius: 4px;
      }
      .pvp-send-id-btn {
        min-height: 40px; padding: 0 16px;
        font-weight: 900; font-size: 11px;
        background: url('/assets/kenney-rpg-ui/buttonLong_blue.png') no-repeat center/100% 100%;
        border: 0; color: #fff; cursor: pointer;
      }
      .pvp-send-id-btn:hover { filter: brightness(1.2); }

      .pvp-friends-container, .pvp-lobbies-container { display: flex; flex-direction: column; gap: 6px; }
      .pvp-friend-card, .pvp-lobby-card {
        display: flex; justify-content: space-between; align-items: center; gap: var(--s2);
        padding: 8px 12px; background: rgba(0, 0, 0, 0.45);
        border: 1px solid var(--line); border-radius: 4px; min-width: 0;
      }
      .pvp-friend-info, .pvp-lobby-info { min-width: 0; }
      .pvp-friend-name, .pvp-lobby-host { font-size: 12.5px; font-weight: 800; color: #fff; }
      .pvp-friend-meta, .pvp-lobby-meta { font-size: 10px; color: var(--ink-faint); margin-top: 2px; }
      .pvp-invite-btn, .pvp-join-duel-btn {
        min-height: 38px; padding: 0 16px; flex: 0 0 auto;
        font-size: 10.5px; font-weight: 900;
        background: url('/assets/kenney-rpg-ui/buttonLong_blue.png') no-repeat center/100% 100%;
        border: 0; color: #fff; cursor: pointer;
      }
      .pvp-invite-btn:hover, .pvp-join-duel-btn:hover { filter: brightness(1.2); }
      .pvp-empty-list { font-size: 11.5px; color: var(--ink-faint); font-style: italic; padding: 12px 0; }

      /* ===================== FOOTER ===================== */
      .pvp-footer {
        display: flex; align-items: center; justify-content: space-between;
        gap: var(--s3);
        padding: var(--s2) var(--s4);
        background: rgba(18, 12, 7, 0.9);
        border-top: 3px solid var(--line);
        flex: 0 0 auto; min-width: 0;
      }
      .pvp-footer-left { display: flex; gap: var(--s2); flex: 0 0 auto; min-width: 0; }
      .pvp-btn-leave, .pvp-btn-practice {
        min-height: 40px; padding: 0 14px;
        font-size: 10.5px; font-weight: 800; letter-spacing: 0.02em;
        border: 0; cursor: pointer; white-space: nowrap;
      }
      .pvp-btn-leave {
        background: url('/assets/kenney-rpg-ui/buttonLong_brown.png') no-repeat center/100% 100%;
        color: #e2cbb0;
      }
      .pvp-btn-practice {
        background: url('/assets/kenney-rpg-ui/buttonLong_grey.png') no-repeat center/100% 100%;
        color: #e6dcc9;
      }
      .pvp-btn-leave:hover, .pvp-btn-practice:hover { filter: brightness(1.2); color: #fff; }

      .pvp-footer-right {
        display: flex; align-items: center; justify-content: flex-end; gap: var(--s3);
        flex: 1 1 auto; min-width: 0;
      }
      .pvp-launch-warning {
        font-size: 10.5px; color: #fbbf24; font-weight: 700; line-height: 1.35;
        text-align: right; min-width: 0;
      }
      .pvp-footer-actions { display: flex; gap: var(--s2); flex: 0 0 auto; }

      .pvp-btn-ready, .pvp-btn-start {
        min-height: var(--tap); padding: 0 20px;
        background: url('/assets/kenney-rpg-ui/buttonLong_blue.png') no-repeat center/100% 100%;
        border: 0; color: #fff; font-size: 11.5px; font-weight: 900;
        cursor: pointer; text-shadow: 0 1px 2px #000; white-space: nowrap;
      }
      .pvp-btn-ready.is-ready {
        background: url('/assets/kenney-rpg-ui/buttonLong_brown.png') no-repeat center/100% 100%;
        color: #86efac;
      }
      .pvp-btn-start { font-family: 'Cinzel', serif; min-width: 210px; }
      .pvp-start-short { display: none; }
      .pvp-btn-start.ready-to-launch {
        filter: drop-shadow(0 0 10px #ffd770) brightness(1.15);
        animation: pvpPulse 1.6s ease-in-out infinite alternate;
      }
      .pvp-btn-start.disabled, .pvp-btn-start:disabled {
        opacity: 0.5; cursor: default; filter: grayscale(0.8);
      }
      @keyframes pvpPulse {
        from { filter: drop-shadow(0 0 4px #ffd770); }
        to { filter: drop-shadow(0 0 14px #ffd770); }
      }

      .pvp-toast {
        position: absolute; bottom: 64px; left: 50%;
        transform: translateX(-50%) translateY(-8px);
        background: url('/assets/kenney-rpg-ui/panel_brown.png') repeat;
        border: 2px solid var(--gold); color: #fff;
        padding: 8px 16px; border-radius: 4px;
        font-size: 11px; font-weight: 800; opacity: 0; pointer-events: none;
        transition: opacity 0.2s ease, transform 0.2s ease;
        z-index: 50; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.8);
        max-width: calc(100% - 24px); text-align: center;
      }

      /* ===================== QR MODAL ===================== */
      .pvp-qr-modal-backdrop {
        position: absolute; inset: 0;
        background: rgba(0, 0, 0, 0.88);
        display: flex; align-items: center; justify-content: center;
        z-index: 200; padding: var(--s3); backdrop-filter: blur(2px);
      }
      .pvp-qr-modal-card {
        width: min(380px, 100%);
        background: url('/assets/kenney-rpg-ui/panel_brown.png') repeat;
        border: 4px solid var(--line-strong); border-radius: 8px;
        box-shadow: 0 0 40px rgba(0, 0, 0, 0.95), inset 0 0 20px rgba(0, 0, 0, 0.6);
        padding: 16px 20px; color: var(--ink);
        display: flex; flex-direction: column; align-items: center; text-align: center;
        max-height: 100%; overflow-y: auto;
      }
      .pvp-qr-modal-header {
        width: 100%; display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 12px; border-bottom: 1px solid var(--line); padding-bottom: 8px;
      }
      .pvp-qr-modal-title {
        margin: 0; font-family: 'Cinzel', serif; font-size: 15px; font-weight: 900;
        color: var(--gold); letter-spacing: 0.06em;
      }
      .pvp-qr-close-btn {
        background: url('/assets/kenney-rpg-ui/buttonSquare_brown.png') no-repeat center/100% 100%;
        border: 0; width: 36px; height: 36px; color: #fca5a5; font-size: 18px; font-weight: 900;
        cursor: pointer; display: flex; align-items: center; justify-content: center;
      }
      .pvp-qr-close-btn:hover { filter: brightness(1.25); color: #fff; }
      .pvp-qr-modal-body { width: 100%; display: flex; flex-direction: column; align-items: center; }
      .pvp-qr-svg-wrapper {
        background: #fdf6e2; padding: 12px; border-radius: 6px;
        border: 3px solid #3d240f; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
        margin-bottom: 10px; display: flex; align-items: center; justify-content: center;
      }
      .pvp-qr-svg-wrapper svg { width: min(180px, 42vw); height: auto; display: block; }
      .pvp-qr-code-display {
        display: flex; align-items: center; gap: 8px;
        background: rgba(0, 0, 0, 0.4);
        padding: 5px 14px; border-radius: 4px; border: 1px solid #735134;
        margin-bottom: 8px;
      }
      .pvp-qr-code-lbl { font-size: 10px; font-weight: 800; color: var(--gold); }
      .pvp-qr-code-val { font-size: 16px; font-weight: 900; color: #fff; font-family: monospace; letter-spacing: 0.1em; }
      .pvp-qr-instructions { font-size: 10.5px; color: var(--ink-dim); margin: 4px 0 10px; line-height: 1.45; }
      .pvp-qr-link-row { width: 100%; display: flex; gap: 6px; }
      .pvp-qr-link-input {
        flex: 1 1 auto; min-width: 0; min-height: 38px; padding: 0 8px;
        font-size: 10.5px;
        background: rgba(0, 0, 0, 0.6); border: 1px solid var(--line); color: #fff;
        font-family: monospace; border-radius: 4px;
      }
      .pvp-qr-copy-link-btn {
        min-height: 38px; padding: 0 12px;
        font-size: 10px; font-weight: 900;
        background: url('/assets/kenney-rpg-ui/buttonLong_blue.png') no-repeat center/100% 100%;
        border: 0; color: #fff; cursor: pointer; white-space: nowrap;
      }
      .pvp-qr-copy-link-btn:hover { filter: brightness(1.2); }

      /* ===================== RESPONSIVE =====================
         Tablets and small laptops: the career chip is the first thing to go,
         because the room code and the close button are the two controls a
         player needs before anything else. */
      @media (max-width: 900px) {
        .pvp-subtitle { display: none; }
        .pvp-career-chip { display: none; }
        .pvp-versus-stage { grid-template-columns: minmax(0, 1fr) minmax(76px, 104px) minmax(0, 1fr); gap: var(--s2); }
        .pvp-btn-start { min-width: 170px; }
      }

      /* Phones, portrait: full-bleed, two columns, primary action full width. */
      @media (max-width: 720px) {
        .tournament-lobby-backdrop { padding: 0; }
        .pvp-modal-shell {
          width: 100%; max-width: 100%;
          height: 100dvh; max-height: 100dvh;
          border-radius: 0; border-width: 0;
        }
        .pvp-header { padding: var(--s2) var(--s3); gap: 6px; }
        .pvp-title { font-size: 13.5px; letter-spacing: 0.05em; }
        .pvp-header-actions { gap: 6px; }
        .pvp-qr-btn { min-height: 40px; width: 40px; padding: 0; justify-content: center; }
        .pvp-qr-text { display: none; }
        .pvp-quick-code-badge { min-height: 40px; padding: 0 8px; }
        .pvp-badge-lbl { display: none; }
        .pvp-close-btn { width: 40px; height: 40px; }

        .pvp-quick-join-bar { padding: 6px var(--s3); }
        .pvp-join-input { min-height: 40px; }
        .pvp-join-code-btn { min-height: 40px; padding: 0 14px; }

        .pvp-nav-tabs { padding: 6px var(--s3); gap: 6px; }
        .pvp-nav-tab { min-height: 40px; padding: 0 8px; font-size: 10px; }

        .pvp-format-selector { padding: 6px var(--s3); gap: var(--s2); }
        /* The four chips say what they are; the word FORMAT was eating the
           ~45px that lets 4v4 GUILD WAR stay on screen instead of scrolling. */
        .pvp-format-label { display: none; }
        .pvp-fmt-btn { min-height: 38px; font-size: 10px; }

        .pvp-versus-stage {
          padding: var(--s2) var(--s3);
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          grid-template-areas: "bench bench" "center center" "red blue";
          gap: var(--s2);
        }
        .pvp-spectator-bench { grid-area: bench; position: static; }
        .pvp-center-col { grid-area: center; flex-direction: row; justify-content: center; gap: var(--s2); }
        .pvp-col-red { grid-area: red; }
        .pvp-col-blue { grid-area: blue; }
        .pvp-vs-emblem { width: 34px; height: 34px; font-size: 12px; flex: 0 0 auto; }
        .pvp-switch-team-btn { max-width: none; flex: 1 1 auto; min-height: 40px; }
        .pvp-balance-badge { display: none; }

        .pvp-team-banner { padding: 4px 8px; min-height: 32px; gap: 6px; }
        .pvp-banner-title { font-size: 10.5px; }
        .pvp-banner-count { font-size: 9px; }
        .pvp-fighter-card { padding: 5px 7px; gap: 7px; min-height: 50px; }
        .pvp-fighter-avatar { width: 38px; height: 38px; }
        .pvp-pedestal-sprite { height: 42px; }
        .pvp-fighter-name { font-size: 12px; }
        .pvp-class-icon { width: 16px; height: 16px; }
        .pvp-info-row2 { font-size: 9.5px; gap: 5px; }
        .pvp-stat-pwr { display: none; }
        .pvp-badge { font-size: 8.5px; padding: 1px 4px; }
        .pvp-empty-role-title { font-size: 10.5px; }
        .pvp-empty-role-sub { display: none; }
        .pvp-empty-action-group { flex-direction: column; gap: 4px; }
        .pvp-slot-claim-btn { min-height: 32px; padding: 0 8px; font-size: 9.5px; }
        /* Inviting lives in the Invite tab; on a two-column phone the seat
           needs every pixel for the name and the claim action. */
        .pvp-slot-inv-btn { display: none; }

        .pvp-bench-title { font-size: 10px; }
        .pvp-bench-chair { min-height: 40px; }
        .pvp-bench-note { min-height: 40px; }

        .pvp-tab-panel { padding: var(--s3); }
        .pvp-share-code-card { padding: 8px 10px; }
        .pvp-share-val { font-size: 16px; }

        /* Primary action full width, status above it, secondary row below. */
        .pvp-footer {
          flex-direction: column-reverse; align-items: stretch;
          gap: 6px; padding: 6px var(--s3) calc(6px + env(safe-area-inset-bottom, 0px));
        }
        .pvp-footer-right { flex-direction: column; align-items: stretch; gap: 6px; width: 100%; }
        .pvp-launch-warning { text-align: center; font-size: 10px; order: -1; }
        .pvp-footer-actions, .pvp-footer-actions .pvp-btn-ready,
        .pvp-footer-actions .pvp-btn-start { width: 100%; }
        .pvp-btn-start, .pvp-btn-ready { min-width: 0; min-height: 46px; font-size: 11.5px; }
        .pvp-footer-left { width: 100%; }
        .pvp-btn-leave, .pvp-btn-practice { flex: 1 1 0; min-height: 40px; padding: 0 8px; font-size: 9.5px; }
      }

      /* Phones, landscape and any short screen: the whole modal must fit the
         height, so every fixed row is measured and the roster gets the rest. */
      @media (max-height: 560px) {
        .tournament-lobby-backdrop { padding: 0; }
        .pvp-modal-shell {
          width: 100%; max-width: 100%;
          height: 100dvh; max-height: 100dvh;
          border-radius: 0; border-width: 0;
        }
        .pvp-header { padding: 4px 10px; gap: 8px; }
        .pvp-title { font-size: 12.5px; }
        .pvp-qr-btn { min-height: 32px; padding: 0 9px; font-size: 9.5px; }
        .pvp-quick-code-badge { min-height: 32px; padding: 0 8px; }
        .pvp-badge-lbl { font-size: 8.5px; }
        .pvp-badge-val { font-size: 11.5px; }
        .pvp-close-btn { width: 32px; height: 32px; font-size: 15px; }

        .pvp-quick-join-bar { padding: 3px 10px; gap: 6px; }
        .pvp-join-lbl { font-size: 9px; }
        .pvp-join-input { min-height: 28px; font-size: 10.5px; width: 130px; flex: 0 0 auto; }
        .pvp-join-code-btn { min-height: 28px; padding: 0 10px; font-size: 9.5px; }

        .pvp-nav-tabs { padding: 3px 10px; gap: 6px; }
        .pvp-nav-tab { min-height: 30px; font-size: 9.5px; padding: 0 8px; }

        .pvp-format-selector { padding: 3px 10px; gap: 8px; }
        .pvp-fmt-btn { min-height: 28px; font-size: 9.5px; padding: 0 9px; }
        .pvp-host-only-note { font-size: 8.5px; }

        .pvp-versus-stage {
          grid-template-columns: minmax(0, 1fr) minmax(64px, 88px) minmax(0, 1fr);
          grid-template-areas: none;
          padding: 6px 10px; gap: 6px;
        }
        /* The bench keeps the full width: without this reset the grid-area
           shorthand above drops the base 1 / -1 span and the bench lands in
           the first column, shoving Crimson down a row. */
        .pvp-spectator-bench { grid-area: auto; grid-column: 1 / -1; position: sticky; top: 0; min-height: 40px; padding: 3px 6px; gap: 6px; }
        .pvp-center-col { grid-area: auto; flex-direction: column; gap: 6px; }
        .pvp-col-red, .pvp-col-blue { grid-area: auto; }
        .pvp-bench-title { font-size: 9px; }
        .pvp-bench-count { font-size: 9px; padding: 1px 5px; }
        .pvp-bench-chair { min-height: 30px; padding: 0 7px 0 3px; font-size: 9.5px; max-width: 140px; }
        .pvp-bench-avatar { width: 20px; height: 20px; }
        .pvp-bench-plus { font-size: 12px; }
        .pvp-bench-note { min-height: 30px; font-size: 9px; padding: 0 7px; }

        .pvp-team-banner { min-height: 26px; padding: 2px 7px; }
        .pvp-banner-title { font-size: 10px; }
        .pvp-banner-count { font-size: 8.5px; }
        .pvp-slots-container { gap: 5px; }
        .pvp-fighter-card { min-height: 44px; padding: 3px 7px; gap: 6px; }
        .pvp-fighter-avatar { width: 34px; height: 34px; }
        .pvp-pedestal-sprite { height: 36px; }
        .pvp-fighter-name { font-size: 11px; }
        .pvp-class-icon { width: 14px; height: 14px; }
        .pvp-info-row2 { font-size: 8.5px; gap: 5px; }
        .pvp-kick-btn { width: 24px; height: 24px; font-size: 12px; }
        .pvp-empty-role-title { font-size: 9.5px; }
        .pvp-empty-role-sub { display: none; }
        .pvp-slot-claim-btn { min-height: 28px; font-size: 8.5px; padding: 0 7px; }
        .pvp-slot-inv-btn { width: 28px; height: 28px; font-size: 11px; }
        .pvp-vs-emblem { width: 32px; height: 32px; font-size: 11px; }
        .pvp-switch-team-btn { max-width: 88px; min-height: 34px; }
        .pvp-switch-team-btn span { font-size: 8.5px; }
        .pvp-switch-team-btn b { font-size: 9px; }
        .pvp-balance-badge { display: none; }

        .pvp-footer {
          flex-direction: row; align-items: center;
          padding: 4px 10px calc(4px + env(safe-area-inset-bottom, 0px));
          gap: 8px;
        }
        .pvp-footer-left { flex: 0 0 auto; gap: 6px; }
        .pvp-btn-leave, .pvp-btn-practice { min-height: 34px; padding: 0 10px; font-size: 9px; }
        .pvp-footer-right { flex-direction: row; align-items: center; gap: 8px; width: auto; flex: 1 1 auto; }
        .pvp-launch-warning { order: 0; flex: 1 1 auto; font-size: 9px; text-align: center; }
        .pvp-footer-actions { flex: 0 0 auto; }
        .pvp-footer-actions .pvp-btn-ready, .pvp-footer-actions .pvp-btn-start { width: auto; }
        .pvp-btn-ready, .pvp-btn-start { min-height: 36px; font-size: 9.5px; padding: 0 14px; }
        .pvp-btn-start { min-width: 150px; }
        .pvp-start-full { display: none; }
        .pvp-start-short { display: inline; }
      }

      @media (prefers-reduced-motion: reduce) {
        .pvp-modal-shell *, .pvp-modal-shell *::before, .pvp-modal-shell *::after {
          animation-duration: 0.001ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.001ms !important;
        }
      }
    
`;
    document.head.appendChild(style);
  }
}
