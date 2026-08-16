import { io, Socket } from 'socket.io-client';
import { PlayerState } from '../engine/SideViewEngine';

export class NetworkManager {
  public socket: Socket | null = null;
  public static instance: NetworkManager;
  public room: string | null = null;
  private readonly debugKey = 'rpg_debug_multiplayer';
  
  public remotePlayers: Record<string, {
    classId?: string;
    name: string;
    x: number;
    y: number;
    facing: number;
    isGrounded: boolean;
    isAttacking: boolean;
    animState: string;
    isTownMode?: boolean;
  }> = {};

  constructor() {
    NetworkManager.instance = this;
  }

  public connect() {
    if (this.socket) return;
    
    // Automatically switch between Localhost and Railway Live Server
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const SERVER_URL = isLocal ? 'http://localhost:3001' : 'https://rpgame-production-3453.up.railway.app';
    
    this.socket = io(SERVER_URL);

    this.socket.on('connect', () => {
      console.log('Connected to multiplayer server.');
      
      const uuid = localStorage.getItem('playerUUID');
      const name = localStorage.getItem('playerName');
      const shortId = localStorage.getItem('playerShortId');
      if (uuid && name && shortId) {
        this.socket?.emit('register_player', { uuid, name, shortId });
      }
    });

    this.socket.on('remote_player_move', (data) => {
      if (!this.remotePlayers[data.socketId]) {
        this.remotePlayers[data.socketId] = {
          classId: data.classId,
          name: data.name || 'Player',
          x: data.x, y: data.y, facing: data.facing,
          isGrounded: data.isGrounded, isAttacking: data.isAttacking,
          animState: data.animState || 'idle',
          isTownMode: !!data.isTownMode
        };
      } else {
        const p = this.remotePlayers[data.socketId];
        p.classId = data.classId;
        p.name = data.name || p.name;
        p.x = data.x;
        p.y = data.y;
        p.facing = data.facing;
        p.isGrounded = data.isGrounded;
        p.isAttacking = data.isAttacking;
        p.animState = data.animState || 'idle';
        p.isTownMode = !!data.isTownMode;
      }
    });

    this.socket.on('player_left', (data) => {
      delete this.remotePlayers[data.socketId];
    });
  }

  public createLobby(dungeonId: string, onUpdate: (lobbyData: any) => void, onStart: (roomData: any) => void) {
    if (!this.socket) this.connect();
    
    this.socket?.off('lobby_update');
    this.socket?.off('dungeon_start');

    this.socket?.on('lobby_update', (data) => {
      onUpdate(data);
    });

    this.socket?.on('dungeon_start', (data) => {
      this.room = data.roomId;
      onStart(data);
    });

    const uuid = localStorage.getItem('playerUUID');
    const name = localStorage.getItem('playerName');
    const shortId = localStorage.getItem('playerShortId');
    this.socket?.emit('create_lobby', { dungeonId, uuid, name, shortId });
  }

  public invitePlayer(targetShortId: string, onResponse: (msg: string, success: boolean) => void) {
    if (!this.socket) return;
    const uuid = localStorage.getItem('playerUUID');
    const name = localStorage.getItem('playerName');
    const shortId = localStorage.getItem('playerShortId');
    this.socket.emit('send_invite', { targetShortId, uuid, name, shortId }, (response: { success: boolean, msg: string }) => {
      onResponse(response.msg, response.success);
    });
  }

  public acceptInvite(roomId: string, onStart: (roomData: any) => void) {
    if (!this.socket) this.connect();
    
    this.socket?.off('dungeon_start');
    this.socket?.on('dungeon_start', (data) => {
      this.room = data.roomId;
      onStart(data);
    });

    const uuid = localStorage.getItem('playerUUID');
    const name = localStorage.getItem('playerName');
    const shortId = localStorage.getItem('playerShortId');
    this.socket?.emit('accept_invite', { roomId, uuid, name, shortId });
  }

  public listenForInvites(onInviteReceived: (inviteData: { fromName: string, dungeonId: string, roomId: string }) => void) {
    if (!this.socket) this.connect();
    this.socket?.off('invite_received');
    this.socket?.on('invite_received', (data) => {
      onInviteReceived(data);
    });
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
    y = y - groundY;
    if (!this.socket || !this.room) return;
    const payload = {
      skillIndex,
      classId,
      x,
      y,
      facing,
      isTownMode,
      skillDamage
    };

    if (typeof localStorage !== 'undefined' && localStorage.getItem(this.debugKey) === '1') {
      console.log('[NET][OUT] player_skill', payload);
    }

    this.socket.emit('player_skill', payload);
  }

  public listenForPlayerSkill(onSkill: (socketId: string, skillIndex: number, classId: string, x: number, y: number, facing: number, isTownMode: boolean, skillDamage: number) => void) {
    if (!this.socket) this.connect();
    this.socket?.off('remote_player_skill');
    this.socket?.on('remote_player_skill', (data) => {
      const skillDamage = typeof data.skillDamage === 'number' ? data.skillDamage : 0;
      const payload = {
        data.socketId,
        skillIndex: data.skillIndex,
        classId: data.classId,
        x: data.x,
        y: data.y,
        facing: data.facing,
        isTownMode: Boolean(data.isTownMode),
        skillDamage
      };

      if (typeof localStorage !== 'undefined' && localStorage.getItem(this.debugKey) === '1') {
        console.log('[NET][IN] remote_player_skill', payload);
      }

      onSkill(
        payload.socketId,
        payload.skillIndex,
        payload.classId,
        payload.x,
        payload.y,
        payload.facing,
        payload.isTownMode,
        payload.skillDamage
      );
    });
  }

  public sendPlayerMove(playerState: any, groundY: number, isAttacking: boolean = false, isTownMode: boolean = false) {
    if (!this.socket || !this.room) return;
    this.socket.emit('player_move', {
      classId: playerState.characterClass ? playerState.characterClass.id : 'knight',
      name: localStorage.getItem('playerName') || 'Player',
      x: playerState.x,
      y: playerState.y - groundY,
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
      y: playerState.y - groundY,
      facing: playerState.facing,
      animState: playerState.animState || 'idle',
      isTownMode: true,
      classId: playerState.characterClass ? playerState.characterClass.id : undefined,
      name: localStorage.getItem('playerName') || 'Player'
    };

    if (typeof localStorage !== 'undefined' && localStorage.getItem(this.debugKey) === '1') {
      console.log('[NET][OUT] party_return_town', payload);
    }

    this.socket.emit('party_return_town', payload);
  }

  public listenForPartyReturnTown(onReturn: (data: {
    socketId: string;
    x?: number;
    y?: number;
    facing?: number;
    animState?: string;
    isTownMode?: boolean;
    classId?: string;
    name?: string;
  }) => void) {
    if (!this.socket) this.connect();
    this.socket?.off('party_return_town');
    this.socket?.on('party_return_town', (data) => {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(this.debugKey) === '1') {
        console.log('[NET][IN] party_return_town', data || { socketId: 'unknown' });
      }
      onReturn(data || { socketId: 'unknown' });
    });
  }

  public sendPartyNextDungeon(dungeonId: string, dungeonIndex: number) {
    if (!this.socket || !this.room) return;
    this.socket.emit('party_next_dungeon', { dungeonId, dungeonIndex });
  }

  public listenForPartyNextDungeon(onNext: (data: { dungeonId: string, dungeonIndex: number }) => void) {
    if (!this.socket) this.connect();
    this.socket?.off('party_next_dungeon');
    this.socket?.on('party_next_dungeon', (data) => {
      onNext(data);
    });
  }

  public leaveDungeonRoom() {
    if (this.socket && this.room) {
      this.socket.emit('leave_dungeon_room');
    }
    this.room = null;
    this.remotePlayers = {};
  }

  // ================= SYNC EVENTS =================

  public sendEnemySync(enemiesData: any[], groundY: number, waveIndex: number = 0) {
    if (!this.socket || !this.room) {
      return;
    }
    const slim = enemiesData.map(e => ({
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
      y: e.y - groundY,
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
      specialAttackTimer: e.specialAttackTimer
    }));
    this.socket.emit('enemy_sync', { enemies: slim, waveIndex });
  }

  public listenForEnemySync(onSync: (enemiesData: any[], waveIndex: number) => void) {
    if (!this.socket) this.connect();
    this.socket?.off('enemy_sync');
    this.socket?.on('enemy_sync', (data) => {
      onSync(data.enemies, data.waveIndex || 0);
    });
  }

  public sendWaveSync(waveData: any) {
    if (!this.socket || !this.room) return;
    this.socket.emit('wave_sync', waveData);
  }

  public listenForWaveSync(onSync: (waveData: any) => void) {
    if (!this.socket) this.connect();
    this.socket?.off('wave_sync');
    this.socket?.on('wave_sync', (data) => {
      onSync(data);
    });
  }

  public sendEnemyDied(enemyData: any, groundY: number) {
    if (!this.socket || !this.room) return;
    enemyData.y = enemyData.y - groundY;
    this.socket.emit('enemy_died', enemyData);
  }

  public listenForEnemyDied(onDied: (enemyData: any) => void) {
    if (!this.socket) this.connect();
    this.socket?.off('enemy_died');
    this.socket?.on('enemy_died', (data) => {
      onDied(data);
    });
  }

  public sendDamageEnemy(enemyId: string, damage: number, facing: number) {
    if (!this.socket || !this.room) return;
    this.socket.emit('damage_enemy', { enemyId, damage, facing });
  }

  public listenForDamageEnemy(onDamage: (enemyId: string, damage: number, facing: number) => void) {
    if (!this.socket) this.connect();
    this.socket?.off('damage_enemy');
    this.socket?.on('damage_enemy', (data) => {
      onDamage(data.enemyId, data.damage, data.facing);
    });
  }
}

export const network = new NetworkManager();
