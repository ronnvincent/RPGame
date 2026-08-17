import { io, Socket } from 'socket.io-client';
import { PlayerState } from '../engine/SideViewEngine';

export interface RemotePlayerState {
  classId?: string;
  name: string;
  x: number;
  y: number;
  facing: number;
  isGrounded: boolean;
  isAttacking: boolean;
  animState: string;
  isTownMode?: boolean;
}

export interface FullSyncSnapshot {
  requesterId?: string;
  waveIndex: number;
  dungeonIndex: number;
  dungeonId: string;
  enemies: any[];
}

type SkillHandler = (
  socketId: string,
  skillIndex: number,
  classId: string,
  x: number,
  y: number,
  facing: number,
  isTownMode: boolean,
  skillDamage: number
) => void;

export class NetworkManager {
  public socket: Socket | null = null;
  public static instance: NetworkManager;
  public room: string | null = null;

  /**
   * Host/guest role. This is written ONLY by server-sent events
   * (dungeon_start, room_rejoined, role_assign). Gameplay code must treat it
   * as read-only - previous versions let handlers flip it locally, which made
   * the role depend on packet arrival order.
   */
  public isHost: boolean = true;

  private readonly debugKey = 'rpg_debug_multiplayer';
  private handlersRegistered = false;

  /** Lightweight counters read by the co-op debug overlay. */
  public stats = {
    lastDamageSent: 0,
    lastDamageRecv: 0,
    lastHitRecv: 0,
    enemySyncCount: 0,
    skillsSent: 0,
    skillsRecv: 0,
    lastRoleSource: 'default'
  };

  public remotePlayers: Record<string, RemotePlayerState> = {};

  // Callbacks are stored rather than bound directly to the socket, so a
  // socket.io reconnect re-attaches every listener in one place.
  private onLobbyUpdateCb: ((data: any) => void) | null = null;
  private onDungeonStartCb: ((data: any) => void) | null = null;
  private onInviteCb: ((data: { fromName: string, dungeonId: string, roomId: string }) => void) | null = null;
  private onSkillCb: SkillHandler | null = null;
  private onPartyReturnTownCb: ((data: any) => void) | null = null;
  private onPartyNextDungeonCb: ((data: { dungeonId: string, dungeonIndex: number }) => void) | null = null;
  private onEnemySyncCb: ((enemies: any[], waveIndex: number, dungeonIndex?: number, dungeonId?: string) => void) | null = null;
  private onWaveSyncCb: ((data: any) => void) | null = null;
  private onEnemyDiedCb: ((data: any) => void) | null = null;
  private onDamageEnemyCb: ((enemyId: string, damage: number, facing: number) => void) | null = null;
  private onEnemyHitCb: ((data: { enemyId: string, damage: number, isCrit: boolean, knockbackDir: number, newHp: number }) => void) | null = null;
  private onFullSyncRequestCb: ((requesterId: string) => void) | null = null;
  private onFullSyncCb: ((snapshot: FullSyncSnapshot) => void) | null = null;
  private onRoleChangeCb: ((isHost: boolean) => void) | null = null;

  constructor() {
    NetworkManager.instance = this;
  }

  private debug(direction: 'OUT' | 'IN', event: string, payload: any) {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(this.debugKey) === '1') {
      console.log(`[NET][${direction}] ${event}`, payload);
    }
  }

  /** Network coordinates are stored relative to the ground line so devices with
   *  different canvas heights agree on vertical position. */
  private toNetworkY(y: number, groundY: number): number {
    return y - groundY;
  }

  private setRole(isHost: boolean, source: string) {
    // Record the source even when the value is unchanged - when diagnosing a
    // desync it matters which packet last spoke, not just when it flipped.
    this.stats.lastRoleSource = source;
    if (this.isHost === isHost) return;
    this.isHost = isHost;
    this.debug('IN', 'role_change', { isHost, source });
    this.onRoleChangeCb?.(isHost);
  }

  public connect() {
    if (this.socket) return;

    // Automatically switch between Localhost and Railway Live Server
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const SERVER_URL = isLocal ? 'http://localhost:3001' : 'https://rpgame-production-3453.up.railway.app';

    this.socket = io(SERVER_URL);
    this.registerHandlers();
  }

  private identify() {
    const uuid = localStorage.getItem('playerUUID');
    const name = localStorage.getItem('playerName');
    const shortId = localStorage.getItem('playerShortId');
    if (uuid && name && shortId) {
      this.socket?.emit('register_player', { uuid, name, shortId });
    }
  }

  /**
   * Every socket listener lives here and is attached exactly once. socket.io
   * keeps listeners across its own reconnects, so this survives the mobile
   * disconnect cycle that previously orphaned the client.
   */
  private registerHandlers() {
    if (!this.socket || this.handlersRegistered) return;
    this.handlersRegistered = true;

    this.socket.on('connect', () => {
      console.log('Connected to multiplayer server.');
      // Re-identify on every connect: the server matches us by uuid and puts
      // us back into our room, then we pull a fresh snapshot.
      this.identify();
      if (this.room) {
        this.socket?.emit('request_full_sync');
      }
    });

    this.socket.on('room_rejoined', (data) => {
      this.debug('IN', 'room_rejoined', data);
      this.room = data.roomId;
      this.setRole(Boolean(data.isHost), 'room_rejoined');
      // We may have missed an arbitrary amount of state while away.
      this.socket?.emit('request_full_sync');
    });

    this.socket.on('role_assign', (data) => {
      this.debug('IN', 'role_assign', data);
      if (data?.roomId) this.room = data.roomId;
      this.setRole(Boolean(data?.isHost), 'role_assign');
    });

    this.socket.on('remote_player_move', (data) => {
      const existing = this.remotePlayers[data.socketId];
      if (!existing) {
        this.remotePlayers[data.socketId] = {
          classId: data.classId,
          name: data.name || 'Player',
          x: data.x, y: data.y, facing: data.facing,
          isGrounded: data.isGrounded, isAttacking: data.isAttacking,
          animState: data.animState || 'idle',
          isTownMode: !!data.isTownMode
        };
      } else {
        existing.classId = data.classId;
        existing.name = data.name || existing.name;
        existing.x = data.x;
        existing.y = data.y;
        existing.facing = data.facing;
        existing.isGrounded = data.isGrounded;
        existing.isAttacking = data.isAttacking;
        existing.animState = data.animState || 'idle';
        existing.isTownMode = !!data.isTownMode;
      }
    });

    this.socket.on('player_left', (data) => {
      delete this.remotePlayers[data.socketId];
    });

    this.socket.on('lobby_update', (data) => {
      this.room = data.roomId;
      if (typeof data.isHost === 'boolean') this.setRole(data.isHost, 'lobby_update');
      this.onLobbyUpdateCb?.(data);
    });

    this.socket.on('dungeon_start', (data) => {
      this.debug('IN', 'dungeon_start', data);
      this.room = data.roomId;
      this.setRole(Boolean(data.isHost), 'dungeon_start');
      this.onDungeonStartCb?.(data);
    });

    this.socket.on('invite_received', (data) => {
      this.onInviteCb?.(data);
    });

    this.socket.on('remote_player_skill', (data) => {
      const skillDamage = typeof data.skillDamage === 'number' ? data.skillDamage : 0;
      this.stats.skillsRecv++;
      this.debug('IN', 'remote_player_skill', data);
      this.onSkillCb?.(
        data.socketId,
        data.skillIndex,
        data.classId,
        data.x,
        data.y,
        data.facing,
        Boolean(data.isTownMode),
        skillDamage
      );
    });

    this.socket.on('party_return_town', (data) => {
      this.debug('IN', 'party_return_town', data);
      this.onPartyReturnTownCb?.(data || { socketId: 'unknown' });
    });

    this.socket.on('party_next_dungeon', (data) => {
      this.onPartyNextDungeonCb?.(data);
    });

    this.socket.on('enemy_sync', (data) => {
      this.stats.enemySyncCount++;
      this.onEnemySyncCb?.(data.enemies, data.waveIndex || 0, data.dungeonIndex, data.dungeonId);
    });

    this.socket.on('wave_sync', (data) => {
      this.onWaveSyncCb?.(data);
    });

    this.socket.on('enemy_died', (data) => {
      this.onEnemyDiedCb?.(data);
    });

    this.socket.on('damage_enemy', (data) => {
      this.stats.lastDamageRecv = data.damage;
      this.onDamageEnemyCb?.(data.enemyId, data.damage, data.facing);
    });

    this.socket.on('enemy_hit', (data) => {
      this.stats.lastHitRecv = data.damage;
      this.onEnemyHitCb?.(data);
    });

    this.socket.on('request_full_sync', (data) => {
      this.debug('IN', 'request_full_sync', data);
      this.onFullSyncRequestCb?.(data?.requesterId);
    });

    this.socket.on('full_sync', (data) => {
      this.debug('IN', 'full_sync', { enemies: data?.enemies?.length, waveIndex: data?.waveIndex });
      if (data) this.onFullSyncCb?.(data);
    });
  }

  public createLobby(dungeonId: string, onUpdate: (lobbyData: any) => void, onStart: (roomData: any) => void) {
    if (!this.socket) this.connect();

    this.onLobbyUpdateCb = onUpdate;
    this.onDungeonStartCb = onStart;

    const uuid = localStorage.getItem('playerUUID');
    const name = localStorage.getItem('playerName');
    const shortId = localStorage.getItem('playerShortId');
    this.socket?.emit('create_lobby', { dungeonId, uuid, name, shortId });
  }

  public invitePlayer(targetShortId: string, onResponse: (msg: string, success: boolean) => void) {
    if (!this.socket) this.connect();
    const uuid = localStorage.getItem('playerUUID');
    const name = localStorage.getItem('playerName');
    const shortId = localStorage.getItem('playerShortId');
    this.socket?.emit('send_invite', { targetShortId, uuid, name, shortId }, (response: { success: boolean, msg: string }) => {
      onResponse(response.msg, response.success);
    });
  }

  public acceptInvite(roomId: string, onStart: (roomData: any) => void) {
    if (!this.socket) this.connect();

    this.onDungeonStartCb = onStart;

    const uuid = localStorage.getItem('playerUUID');
    const name = localStorage.getItem('playerName');
    const shortId = localStorage.getItem('playerShortId');
    this.socket?.emit('accept_invite', { roomId, uuid, name, shortId });
  }

  public listenForInvites(onInviteReceived: (inviteData: { fromName: string, dungeonId: string, roomId: string }) => void) {
    if (!this.socket) this.connect();
    this.onInviteCb = onInviteReceived;
  }

  public onRoleChange(cb: (isHost: boolean) => void) {
    if (!this.socket) this.connect();
    this.onRoleChangeCb = cb;
  }

  public sendPlayerSkill(
    skillIndex: number,
    classId: string,
    x: number,
    y: number,
    facing: number,
    groundY: number,
    isTownMode: boolean = false,
    skillDamage?: number
  ) {
    if (!this.socket || !this.room) return;
    const payload = {
      skillIndex,
      classId,
      x,
      y: this.toNetworkY(y, groundY),
      facing,
      isTownMode,
      skillDamage
    };

    this.stats.skillsSent++;
    this.debug('OUT', 'player_skill', payload);
    this.socket.emit('player_skill', payload);
  }

  public listenForPlayerSkill(onSkill: SkillHandler) {
    if (!this.socket) this.connect();
    this.onSkillCb = onSkill;
  }

  public sendPlayerMove(playerState: any, groundY: number, isAttacking: boolean = false, isTownMode: boolean = false) {
    if (!this.socket || !this.room) return;
    this.socket.emit('player_move', {
      classId: playerState.characterClass ? playerState.characterClass.id : 'knight',
      name: localStorage.getItem('playerName') || 'Player',
      x: playerState.x,
      y: this.toNetworkY(playerState.y, groundY),
      facing: playerState.facing,
      isGrounded: playerState.isGrounded,
      isAttacking,
      animState: playerState.animState || 'idle',
      isTownMode: Boolean(isTownMode)
    });
  }

  public sendPartyReturnTown(playerState: PlayerState, groundY: number) {
    if (!this.socket || !this.room) return;
    const payload = {
      x: playerState.x,
      y: this.toNetworkY(playerState.y, groundY),
      facing: playerState.facing,
      animState: playerState.animState || 'idle',
      isTownMode: true,
      classId: playerState.characterClass ? playerState.characterClass.id : undefined,
      name: localStorage.getItem('playerName') || 'Player'
    };

    this.debug('OUT', 'party_return_town', payload);
    this.socket.emit('party_return_town', payload);
  }

  public listenForPartyReturnTown(onReturn: (data: {
    socketId: string;
    /** Server-stamped: true when the sender is the room host. */
    fromHost?: boolean;
    x?: number;
    y?: number;
    facing?: number;
    animState?: string;
    isTownMode?: boolean;
    classId?: string;
    name?: string;
  }) => void) {
    if (!this.socket) this.connect();
    this.onPartyReturnTownCb = onReturn;
  }

  public sendPartyNextDungeon(dungeonId: string, dungeonIndex: number) {
    if (!this.socket || !this.room) return;
    this.socket.emit('party_next_dungeon', { dungeonId, dungeonIndex });
  }

  public listenForPartyNextDungeon(onNext: (data: { dungeonId: string, dungeonIndex: number }) => void) {
    if (!this.socket) this.connect();
    this.onPartyNextDungeonCb = onNext;
  }

  public leaveDungeonRoom() {
    if (this.socket && this.room) {
      this.socket.emit('leave_dungeon_room');
    }
    this.room = null;
    this.isHost = true; // Solo play from here on.
    this.remotePlayers = {};
  }

  // ================= SYNC EVENTS =================

  /** Strips an enemy down to the fields the remote client actually needs. */
  private serializeEnemy(e: any, groundY: number) {
    return {
      id: e.id,
      name: e.name,
      type: e.type,
      icon: e.icon,
      color: e.color,
      maxHp: e.maxHp,
      hp: e.hp,
      atk: e.atk,
      def: e.def,
      speed: e.speed,
      expReward: e.expReward,
      goldReward: e.goldReward,
      width: e.width,
      height: e.height,
      attackRange: e.attackRange,
      attackCooldown: e.attackCooldown,
      attackTimer: e.attackTimer,
      x: e.x,
      y: this.toNetworkY(e.y, groundY),
      vx: e.vx,
      vy: e.vy,
      isGrounded: e.isGrounded,
      facing: e.facing,
      isAttacking: e.isAttacking,
      isActive: e.isActive,
      spawnDelay: e.spawnDelay,
      hitStun: e.hitStun,
      isDead: e.isDead,
      phases: e.phases,
      currentPhase: e.currentPhase,
      specialAttackTimer: e.specialAttackTimer,
      lootDrop: e.lootDrop
    };
  }

  public sendEnemySync(enemiesData: any[], groundY: number, waveIndex: number = 0, dungeonIndex?: number, dungeonId?: string) {
    if (!this.socket || !this.room) return;
    const slim = enemiesData.map(e => this.serializeEnemy(e, groundY));
    this.socket.emit('enemy_sync', { enemies: slim, waveIndex, dungeonIndex, dungeonId });
  }

  public listenForEnemySync(onSync: (enemiesData: any[], waveIndex: number, dungeonIndex?: number, dungeonId?: string) => void) {
    if (!this.socket) this.connect();
    this.onEnemySyncCb = onSync;
  }

  public sendWaveSync(waveData: any) {
    if (!this.socket || !this.room) return;
    this.socket.emit('wave_sync', waveData);
  }

  public listenForWaveSync(onSync: (waveData: any) => void) {
    if (!this.socket) this.connect();
    this.onWaveSyncCb = onSync;
  }

  public sendEnemyDied(enemyData: any, groundY: number) {
    if (!this.socket || !this.room) return;
    // Copy before normalizing - mutating the caller's enemy corrupted the
    // host's own world position.
    this.socket.emit('enemy_died', {
      ...enemyData,
      y: this.toNetworkY(enemyData.y, groundY)
    });
  }

  public listenForEnemyDied(onDied: (enemyData: any) => void) {
    if (!this.socket) this.connect();
    this.onEnemyDiedCb = onDied;
  }

  public sendDamageEnemy(enemyId: string, damage: number, facing: number) {
    if (!this.socket || !this.room) return;
    this.stats.lastDamageSent = damage;
    this.socket.emit('damage_enemy', { enemyId, damage, facing });
  }

  public listenForDamageEnemy(onDamage: (enemyId: string, damage: number, facing: number) => void) {
    if (!this.socket) this.connect();
    this.onDamageEnemyCb = onDamage;
  }

  public sendEnemyHit(enemyId: string, damage: number, isCrit: boolean, knockbackDir: number, newHp: number) {
    if (!this.socket || !this.room) return;
    this.socket.emit('enemy_hit', { enemyId, damage, isCrit, knockbackDir, newHp });
  }

  public listenForEnemyHit(onHit: (data: { enemyId: string, damage: number, isCrit: boolean, knockbackDir: number, newHp: number }) => void) {
    if (!this.socket) this.connect();
    this.onEnemyHitCb = onHit;
  }

  // ================= FULL SNAPSHOT =================

  /** Guest -> server -> host: "I just joined/reconnected, send me everything." */
  public requestFullSync() {
    if (!this.socket || !this.room) return;
    this.debug('OUT', 'request_full_sync', { room: this.room });
    this.socket.emit('request_full_sync');
  }

  /** Host side: called when a guest asks for a snapshot. */
  public onFullSyncRequest(cb: (requesterId: string) => void) {
    if (!this.socket) this.connect();
    this.onFullSyncRequestCb = cb;
  }

  public sendFullSync(requesterId: string | undefined, snapshot: Omit<FullSyncSnapshot, 'requesterId'>, groundY: number) {
    if (!this.socket || !this.room) return;
    const payload = {
      requesterId,
      waveIndex: snapshot.waveIndex,
      dungeonIndex: snapshot.dungeonIndex,
      dungeonId: snapshot.dungeonId,
      enemies: (snapshot.enemies || []).map(e => this.serializeEnemy(e, groundY))
    };
    this.debug('OUT', 'full_sync', { requesterId, enemies: payload.enemies.length });
    this.socket.emit('full_sync', payload);
  }

  /** Guest side: receives the host's snapshot. */
  public onFullSync(cb: (snapshot: FullSyncSnapshot) => void) {
    if (!this.socket) this.connect();
    this.onFullSyncCb = cb;
  }
}

export const network = new NetworkManager();
