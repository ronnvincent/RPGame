import { io, Socket } from 'socket.io-client';
import { getGameServerOrigin } from '../config/RuntimeConfig';
import type { IncomingAttackDefense } from '../combat/DefenseMechanics';
import type { EnemyAttackProfileId } from '../combat/EnemyAttackProfiles';
import type { PlayerState } from '../engine/SideViewEngine';
import {
  DUNGEON_RUN_SCHEMA_VERSION,
  RUN_LIMITS,
  type DungeonRunState as DungeonRunStateContract,
} from '../dungeons/run/RunTypes';
import {
  isBoundedDungeonEncounterSnapshot,
  type DungeonEncounterSnapshot,
} from '../dungeons/DungeonEncounterRuntime';
import { PayloadCadence, quantizeNetworkCoordinate, smoothNetworkCoordinate } from './NetworkCadence';

export type DungeonRunState = DungeonRunStateContract;
export const RUN_SYNC_PROTOCOL_VERSION = 1 as const;
export const RUN_SYNC_MAX_BYTES = 128 * 1024;

export interface DungeonRunSyncPacket {
  protocolVersion: typeof RUN_SYNC_PROTOCOL_VERSION;
  runState: DungeonRunState;
  /** Optional host-authoritative live objective/hazard state. */
  encounterSnapshot?: DungeonEncounterSnapshot;
}

export type CombatDefenseOutcome = 'dodge' | 'perfect-dodge' | 'parry';

/** Guest-authored result for one host-authored enemy attack intent. */
export interface CombatDefenseResultPacket {
  intentId: string;
  sourceEnemyId: string;
  outcome: CombatDefenseOutcome;
}

/** Server-stamped packet delivered only to the current room host. */
export interface RemoteCombatDefenseResultPacket extends CombatDefenseResultPacket {
  socketId: string;
}

/** An open party shown in the browser. */
export interface OpenLobby {
  roomId: string;
  dungeonId: string;
  minLevel: number;
  hostName: string;
  members: number;
  maxPlayers: number;
}

/** One member's contribution to a finished run. */
export interface RunStats {
  name: string;
  classId?: string;
  damageDealt: number;
  damageTaken: number;
  kills: number;
  revives: number;
}

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
  /** Canonical combat scene stamped by the server (`town` or a dungeon id). */
  sceneId?: string;
  /** Down and bleeding out, waiting for someone to reach them. */
  downed?: boolean;
  /** Their health as a fraction, so the ally rail can show it. */
  hpPct?: number;
  /** Skill slot of their current swing, for attack animation variety. */
  lastSkillIndex?: number;
  /** Latest authoritative packet; render coordinates ease toward these. */
  targetX?: number;
  targetY?: number;
}

export type PlayerDamageStatusKind = 'slow' | 'poison' | 'burn' | 'stun';

/** Optional, host-authored enemy status carried with one authoritative hit. */
export interface PlayerDamageStatus {
  kind: PlayerDamageStatusKind;
  duration: number;
  magnitude: number;
  tickInterval?: number;
  rawTickDamage?: number;
}

/** Host -> server -> one guest. The recipient resolves its own mitigation. */
export interface PlayerDamagePacket {
  hitId: string;
  rawDamage: number;
  sourceX: number;
  knockbackDir: -1 | 1;
  isTownMode: boolean;
  sceneId: string;
  status?: PlayerDamageStatus;
  /** Optional enemy-intent metadata used by the guest dodge/parry resolver. */
  parryability?: IncomingAttackDefense;
  intentId?: string;
  sourceEnemyId?: string;
  profileId?: EnemyAttackProfileId;
}

export interface LobbyMember {
  actorId?: string;
  /** Stable public actor key; it is not the private account UUID. */
  uuid: string;
  socketId: string | null;
  name: string;
  shortId: string;
  classId: string | null;
  level: number;
  power?: number;
  ready: boolean;
  isHost: boolean;
  online: boolean;
}

export interface LobbyState {
  roomId: string;
  dungeonId: string;
  maxPlayers: number;
  started: boolean;
  members: LobbyMember[];
}

export interface FriendEntry {
  uuid: string;
  name: string;
  shortId: string;
  classId: string | null;
  level: number;
  online: boolean;
  inParty: boolean;
}

/** Sent with lobby packets so other players' cards can show class and level. */
export interface LocalProfile {
  classId?: string;
  level?: number;
  /** Total Power, so a party card can show what each member brings. */
  power?: number;
}

const RUN_STATE_STATUSES = new Set(['active', 'completed', 'failed']);
const ROOM_STATE_STATUSES = new Set(['available', 'active', 'completed', 'failed']);
const RESERVED_RECORD_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isSafeRunToken(value: unknown, max = 128): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= max
    && !RESERVED_RECORD_KEYS.has(value)
    && /^[A-Za-z0-9:._-]+$/.test(value);
}

function isBoundedInteger(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

function isBoundedTokenArray(value: unknown, maxItems: number, maxTokenLength = 128): value is string[] {
  return Array.isArray(value)
    && value.length <= maxItems
    && value.every(item => isSafeRunToken(item, maxTokenLength));
}

function serializedByteLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * Runtime boundary for host-authored run snapshots. TypeScript cannot protect
 * reconnect packets, so both inbound and outbound snapshots use this same
 * schema/version/count/byte gate before gameplay sees them.
 */
export function isBoundedDungeonRunState(value: unknown): value is DungeonRunState {
  if (!isRecord(value) || serializedByteLength(value) > RUN_SYNC_MAX_BYTES) return false;
  const state = value as any;
  if (state.schemaVersion !== DUNGEON_RUN_SCHEMA_VERSION) return false;
  if (!isSafeRunToken(state.contentVersion, 64)) return false;
  if (!isSafeRunToken(state.runId, 128) || !isSafeRunToken(state.dungeonId, 64)) return false;
  if (!isBoundedInteger(state.seed, 0, 0xffff_ffff)) return false;
  if (!isBoundedInteger(state.authorityEpoch, 1, 1_000_000_000)) return false;
  if (!isBoundedInteger(state.revision, 0, 2_147_483_647)) return false;
  if (!isBoundedInteger(state.lastCommandSequence, 0, 2_147_483_647)) return false;
  if (!isBoundedInteger(state.elapsedMs, 0, 2_147_483_647)) return false;
  if (!RUN_STATE_STATUSES.has(state.status) || !isSafeRunToken(state.currentRoomId, 128)) return false;

  if (!isRecord(state.graph) || !Array.isArray(state.graph.nodes) || !Array.isArray(state.graph.exits)) return false;
  if (state.graph.nodes.length < 1 || state.graph.nodes.length > RUN_LIMITS.maxRooms) return false;
  if (state.graph.exits.length > RUN_LIMITS.maxRooms * RUN_LIMITS.maxExitsPerRoom) return false;

  const nodeIds = new Set<string>();
  for (const node of state.graph.nodes) {
    if (!isRecord(node) || !isSafeRunToken(node.id, 128) || nodeIds.has(node.id)) return false;
    if (!isSafeRunToken(node.templateId, 128) || !isSafeRunToken(node.sceneId, 128)) return false;
    if (!isBoundedTokenArray(node.enemyGroupIds, RUN_LIMITS.maxObjectiveEntities)) return false;
    if (!isBoundedTokenArray(node.worldObjectIds, RUN_LIMITS.maxObjectiveEntities)) return false;
    if (!Array.isArray(node.choices) || node.choices.length > RUN_LIMITS.maxRoomChoices) return false;
    if (!isBoundedTokenArray(node.tags, 32, 64)) return false;
    nodeIds.add(node.id);
  }
  if (!isSafeRunToken(state.graph.entryRoomId, 128) || !nodeIds.has(state.graph.entryRoomId)) return false;
  if (!isSafeRunToken(state.graph.finaleRoomId, 128) || !nodeIds.has(state.graph.finaleRoomId)) return false;
  if (!nodeIds.has(state.currentRoomId)) return false;
  for (const exit of state.graph.exits) {
    if (!isRecord(exit) || !isSafeRunToken(exit.id, 128)) return false;
    if (!isSafeRunToken(exit.fromRoomId, 128) || !nodeIds.has(exit.fromRoomId)) return false;
    if (!isSafeRunToken(exit.toRoomId, 128) || !nodeIds.has(exit.toRoomId)) return false;
  }

  if (!isBoundedTokenArray(state.activeActorIds, RUN_LIMITS.maxActors)) return false;
  if (new Set(state.activeActorIds).size !== state.activeActorIds.length) return false;
  if (!isBoundedTokenArray(state.visitedRoomIds, RUN_LIMITS.maxRooms)) return false;
  if (!state.visitedRoomIds.every((id: string) => nodeIds.has(id))) return false;
  if (!isBoundedTokenArray(state.revealedSecretRoomIds, RUN_LIMITS.maxRooms)) return false;
  if (!state.revealedSecretRoomIds.every((id: string) => nodeIds.has(id))) return false;

  if (!isRecord(state.roomStates)) return false;
  const roomStates = Object.entries(state.roomStates);
  if (roomStates.length > RUN_LIMITS.maxRooms) return false;
  for (const [roomId, roomState] of roomStates) {
    if (!isSafeRunToken(roomId, 128) || !nodeIds.has(roomId) || !isRecord(roomState)) return false;
    if (roomState.roomId !== roomId || !ROOM_STATE_STATUSES.has(roomState.status as string)) return false;
    if (!Array.isArray(roomState.choiceSelections)
      || roomState.choiceSelections.length > RUN_LIMITS.maxRoomChoices) return false;
    for (const choice of roomState.choiceSelections) {
      if (!isRecord(choice)
        || !isSafeRunToken(choice.actorId, 128)
        || !isSafeRunToken(choice.choiceId, 128)) return false;
    }
    if (roomState.objectiveState !== undefined && !isRecord(roomState.objectiveState)) return false;
  }
  if (!Object.hasOwn(state.roomStates, state.currentRoomId)) return false;

  if (!isRecord(state.relicsByActorId)) return false;
  const relicEntries = Object.entries(state.relicsByActorId);
  if (relicEntries.length > RUN_LIMITS.maxActors) return false;
  for (const [actorId, relicIds] of relicEntries) {
    if (!isSafeRunToken(actorId, 128)
      || !isBoundedTokenArray(relicIds, RUN_LIMITS.maxRelicsPerActor)) return false;
  }

  if (!Array.isArray(state.relicOffers)
    || state.relicOffers.length > RUN_LIMITS.maxRooms) return false;
  for (const offer of state.relicOffers) {
    if (!isRecord(offer)
      || !isSafeRunToken(offer.id, 128)
      || !isSafeRunToken(offer.actorId, 128)
      || !isSafeRunToken(offer.sourceId, 128)
      || !isBoundedTokenArray(offer.relicIds, RUN_LIMITS.maxRelicOfferSize)) return false;
    if (offer.chosenRelicId !== undefined && !isSafeRunToken(offer.chosenRelicId, 128)) return false;
  }
  if (state.failureReason !== undefined
    && (typeof state.failureReason !== 'string' || state.failureReason.length > 256)) return false;
  return true;
}

function isCombatDefenseResult(value: unknown, withSocketId: boolean): boolean {
  if (!isRecord(value) || serializedByteLength(value) > 1024) return false;
  if (!isSafeRunToken(value.intentId, 96) || !isSafeRunToken(value.sourceEnemyId, 160)) return false;
  if (value.outcome !== 'dodge' && value.outcome !== 'perfect-dodge' && value.outcome !== 'parry') return false;
  return !withSocketId || isSafeRunToken(value.socketId, 128);
}

export interface FullSyncSnapshot {
  /** Added in protocol v1; omitted by legacy servers and therefore optional inbound. */
  protocolVersion?: typeof RUN_SYNC_PROTOCOL_VERSION;
  requesterId?: string;
  waveIndex: number;
  dungeonIndex: number;
  dungeonId: string;
  enemies: any[];
  /** Optional deterministic run controller state for reconnecting guests. */
  runState?: DungeonRunState;
  /** Optional live room simulation state for reconnecting guests. */
  encounterSnapshot?: DungeonEncounterSnapshot;
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
  private readonly actorStorageKey = 'multiplayerActorId';
  private readonly actorOwnerStorageKey = 'multiplayerActorAccount';
  private handlersRegistered = false;
  /** Stationary players send a heartbeat instead of twenty identical packets a second. */
  private readonly movementCadence = new PayloadCadence(500);

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
  private onPlayerDamageCb: ((data: PlayerDamagePacket) => void) | null = null;
  private onCombatDefenseCb: ((data: RemoteCombatDefenseResultPacket) => void) | null = null;
  private onFullSyncRequestCb: ((requesterId: string) => void) | null = null;
  private onFullSyncCb: ((snapshot: FullSyncSnapshot) => void) | null = null;
  private onRunSyncCb: ((runState: DungeonRunState, encounterSnapshot?: DungeonEncounterSnapshot) => void) | null = null;
  private onRoleChangeCb: ((isHost: boolean) => void) | null = null;
  private onLobbyErrorCb: ((msg: string) => void) | null = null;
  private onLobbyStateCb: ((state: LobbyState) => void) | null = null;
  private onLobbyLeftCb: (() => void) | null = null;
  private onFriendsCb: ((friends: FriendEntry[]) => void) | null = null;
  private onFriendNoticeCb: ((msg: string) => void) | null = null;

  /** Class/level of the local player, attached to lobby packets. */
  public profile: LocalProfile = {};
  private onPartySupportCb: ((payload: any) => void) | null = null;
  private onRunStatsCb: ((payload: any) => void) | null = null;
  private onQuickChatCb: ((payload: any) => void) | null = null;
  private onPingCb: ((payload: any) => void) | null = null;
  private onLobbyListCb: ((lobbies: any[]) => void) | null = null;

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

  /**
   * Single place the room id changes. Moving rooms invalidates every remote
   * player we knew about - without this the old party members linger forever
   * as ghosts in the overlay and in the renderer.
   */
  private setRoom(roomId: string | null) {
    if (this.room === roomId) return;
    this.room = roomId;
    this.remotePlayers = {};
    this.movementCadence.reset();
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

  /** One actor per browser/device. Account UUID remains shared for saves and
   * friends, but two devices logged into one account must not collapse into a
   * single party member. */
  private getActorId(): string {
    const accountUuid = localStorage.getItem('playerUUID') || '';
    const existing = localStorage.getItem(this.actorStorageKey);
    const existingOwner = localStorage.getItem(this.actorOwnerStorageKey);
    if (existing && /^[A-Za-z0-9:_-]{8,128}$/.test(existing) && (!existingOwner || existingOwner === accountUuid)) {
      if (!existingOwner && accountUuid) localStorage.setItem(this.actorOwnerStorageKey, accountUuid);
      return existing;
    }
    const random = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    const actorId = `actor_${random}`;
    localStorage.setItem(this.actorStorageKey, actorId);
    if (accountUuid) localStorage.setItem(this.actorOwnerStorageKey, accountUuid);
    return actorId;
  }

  public connect() {
    if (this.socket) return;

    // Automatically switch between Localhost and Railway Live Server
    const SERVER_URL = getGameServerOrigin();

    const token = localStorage.getItem('playerSessionToken');
    this.socket = io(SERVER_URL, {
      auth: token ? { token } : {},
    });
    this.registerHandlers();
  }

  private identify() {
    const uuid = localStorage.getItem('playerUUID');
    const name = localStorage.getItem('playerName');
    const shortId = localStorage.getItem('playerShortId');
    if (uuid && name && shortId) {
      this.socket?.emit('register_player', {
        uuid,
        actorId: this.getActorId(),
        name,
        shortId,
        ...this.profile,
      });
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

    this.socket.on('connect_error', (error) => {
      console.warn('[NET] Connection failed:', error.message);
      if (/authentication required/i.test(error.message)) {
        // An expired/revoked token must not leave the game looking connected
        // while cloud saves and party events are being rejected silently.
        localStorage.removeItem('playerSessionToken');
        this.onLobbyErrorCb?.('Your session expired. Please sign in again.');
      }
    });

    this.socket.on('session_replaced', () => {
      this.setRoom(null);
      this.setRole(true, 'session_replaced');
      this.onLobbyErrorCb?.('This game session continued in another tab or connection.');
    });

    this.socket.on('room_rejoined', (data) => {
      this.debug('IN', 'room_rejoined', data);
      this.setRoom(data.roomId);
      this.setRole(Boolean(data.isHost), 'room_rejoined');
      // We may have missed an arbitrary amount of state while away.
      this.socket?.emit('request_full_sync');
    });

    this.socket.on('role_assign', (data) => {
      this.debug('IN', 'role_assign', data);
      if (data?.roomId) this.setRoom(data.roomId);
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
          isTownMode: !!data.isTownMode,
          sceneId: typeof data.sceneId === 'string' ? data.sceneId : undefined,
          // Both of these were sent but never applied on arrival, so a downed
          // teammate looked like a teammate standing still and the marker over
          // them never drew.
          downed: !!data.downed,
          hpPct: typeof data.hpPct === 'number' ? data.hpPct : 100,
          targetX: data.x,
          targetY: data.y
        };
      } else {
        existing.classId = data.classId;
        existing.name = data.name || existing.name;
        const environmentChanged = existing.isTownMode !== !!data.isTownMode;
        const discontinuity = Math.hypot(data.x - existing.x, data.y - existing.y) >= 420;
        existing.targetX = data.x;
        existing.targetY = data.y;
        if (environmentChanged || discontinuity) {
          existing.x = data.x;
          existing.y = data.y;
        }
        existing.facing = data.facing;
        existing.isGrounded = data.isGrounded;
        existing.isAttacking = data.isAttacking;
        existing.animState = data.animState || 'idle';
        existing.isTownMode = !!data.isTownMode;
        existing.sceneId = typeof data.sceneId === 'string' ? data.sceneId : existing.sceneId;
        existing.downed = !!data.downed;
        if (typeof data.hpPct === 'number') existing.hpPct = data.hpPct;
      }
    });

    this.socket.on('player_left', (data) => {
      delete this.remotePlayers[data.socketId];
    });

    // A disconnected actor keeps its room slot during the mobile reconnect
    // grace period, but its old socket id must stop rendering immediately.
    this.socket.on('player_disconnected', (data) => {
      if (data?.socketId) delete this.remotePlayers[data.socketId];
    });

    this.socket.on('lobby_update', (data) => {
      this.setRoom(data.roomId);
      if (typeof data.isHost === 'boolean') this.setRole(data.isHost, 'lobby_update');
      this.onLobbyUpdateCb?.(data);
    });

    this.socket.on('dungeon_start', (data) => {
      this.debug('IN', 'dungeon_start', data);
      this.setRoom(data.roomId);
      this.setRole(Boolean(data.isHost), 'dungeon_start');
      this.onDungeonStartCb?.(data);
    });

    this.socket.on('invite_received', (data) => {
      this.onInviteCb?.(data);
    });

    // The server refuses to let a partied player open a second lobby.
    this.socket.on('remote_party_support', (data) => {
      this.onPartySupportCb?.(data);
    });

    this.socket.on('remote_party_stats', (data) => {
      this.onRunStatsCb?.(data);
    });

    this.socket.on('remote_party_chat', (data) => {
      this.onQuickChatCb?.(data);
    });

    this.socket.on('remote_party_ping', (data) => {
      this.onPingCb?.(data);
    });

    this.socket.on('lobby_list', (data) => {
      this.onLobbyListCb?.(data?.lobbies || []);
    });

    // Quick join is answered with a room to enter, so the join runs through the
    // same path an accepted invite does rather than a second way in.
    this.socket.on('quick_join_room', (data) => {
      if (data?.roomId) this.acceptInvite(data.roomId);
    });

    this.socket.on('lobby_error', (data) => {
      console.warn('[NET] lobby_error:', data?.msg);
      this.onLobbyErrorCb?.(data?.msg || 'Could not create lobby.');
    });

    // The host is told through the send_invite callback; this is the other half,
    // so the person who was refused learns why instead of simply never being
    // invited.
    this.socket.on('invite_blocked', (data) => {
      console.warn('[NET] invite_blocked:', data?.msg);
      this.onLobbyErrorCb?.(data?.msg || 'You do not meet the level requirement for that dungeon.');
    });

    this.socket.on('invite_error', (data) => {
      console.warn('[NET] invite_error:', data?.msg);
      this.onLobbyErrorCb?.(data?.msg || 'Could not join that party.');
    });

    this.socket.on('lobby_state', (state: LobbyState) => {
      this.debug('IN', 'lobby_state', { members: state?.members?.length });
      if (state?.roomId) this.setRoom(state.roomId);
      if (state) this.onLobbyStateCb?.(state);
    });

    this.socket.on('friends_list', (data) => {
      this.onFriendsCb?.(data?.friends || []);
    });

    // The server uses this channel for both failures and confirmations.
    this.socket.on('friend_error', (data) => {
      this.onFriendNoticeCb?.(data?.msg || 'Something went wrong.');
    });

    this.socket.on('friend_added', (data) => {
      this.onFriendNoticeCb?.(`${data?.name || 'Player'} added as a friend.`);
    });

    this.socket.on('lobby_left', () => {
      this.setRoom(null);
      this.isHost = true;
      this.onLobbyLeftCb?.();
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

    // This channel is server-targeted: only the selected guest receives it,
    // and only a room host is allowed to originate it.
    this.socket.on('player_damage', (data: PlayerDamagePacket) => {
      this.debug('IN', 'player_damage', data);
      this.onPlayerDamageCb?.(data);
    });

    // The server stamps the guest socket id and routes this only to the room
    // host. Validate again at the browser boundary before combat consumes it.
    this.socket.on('combat_defense', (data: RemoteCombatDefenseResultPacket) => {
      if (!this.isHost || !isCombatDefenseResult(data, true)) return;
      this.debug('IN', 'combat_defense', data);
      this.onCombatDefenseCb?.(data);
    });

    this.socket.on('run_sync', (data: DungeonRunSyncPacket) => {
      if (data?.protocolVersion !== RUN_SYNC_PROTOCOL_VERSION
        || serializedByteLength(data) > RUN_SYNC_MAX_BYTES
        || !isBoundedDungeonRunState(data.runState)
        || (data.encounterSnapshot !== undefined
          && !isBoundedDungeonEncounterSnapshot(data.encounterSnapshot))) return;
      this.debug('IN', 'run_sync', {
        runId: data.runState.runId,
        revision: data.runState.revision,
      });
      this.onRunSyncCb?.(data.runState, data.encounterSnapshot);
    });

    this.socket.on('request_full_sync', (data) => {
      this.debug('IN', 'request_full_sync', data);
      this.onFullSyncRequestCb?.(data?.requesterId);
    });

    this.socket.on('full_sync', (data) => {
      this.debug('IN', 'full_sync', { enemies: data?.enemies?.length, waveIndex: data?.waveIndex });
      if (data?.protocolVersion !== undefined && data.protocolVersion !== RUN_SYNC_PROTOCOL_VERSION) return;
      if (data?.runState !== undefined && !isBoundedDungeonRunState(data.runState)) return;
      if (data?.encounterSnapshot !== undefined
        && !isBoundedDungeonEncounterSnapshot(data.encounterSnapshot)) return;
      if (data) this.onFullSyncCb?.(data);
    });
  }

  /**
   * The server learned a player's level only from lobby packets, so anyone who
   * had not created or joined a lobby this session was Lv 1 to everyone else -
   * in the friends list, on the lobby cards, and to the invite gate, which then
   * refused them dungeons they had long outlevelled. Registration now carries
   * the profile, and this pushes it again whenever the level actually changes.
   */
  public updateProfile(profile: LocalProfile) {
    // Power belongs in this comparison. It changes on equipping and forging
    // while the level stands still, so leaving it out meant a party card showed
    // whatever power you had the last time you levelled up.
    const same = this.profile.level === profile.level
      && this.profile.classId === profile.classId
      && this.profile.power === profile.power;
    this.profile = profile;
    if (same) return;
    this.socket?.emit('profile_update', profile);
  }

  public createLobby(dungeonId: string, minLevel: number, onUpdate: (lobbyData: any) => void, onStart: (roomData: any) => void) {
    if (!this.socket) this.connect();

    this.onLobbyUpdateCb = onUpdate;
    this.onDungeonStartCb = onStart;

    const uuid = localStorage.getItem('playerUUID');
    const name = localStorage.getItem('playerName');
    const shortId = localStorage.getItem('playerShortId');
    // The requirement travels with the lobby rather than being duplicated in a
    // second table on the server, which could then drift from the dungeons.
    this.socket?.emit('create_lobby', {
      dungeonId,
      minLevel,
      uuid,
      actorId: this.getActorId(),
      name,
      shortId,
      ...this.profile,
    });
  }

  public invitePlayer(targetShortId: string, onResponse: (msg: string, success: boolean) => void) {
    if (!this.socket) this.connect();
    const uuid = localStorage.getItem('playerUUID');
    const name = localStorage.getItem('playerName');
    const shortId = localStorage.getItem('playerShortId');
    this.socket?.emit('send_invite', {
      targetShortId,
      uuid,
      actorId: this.getActorId(),
      name,
      shortId,
    }, (response: { success: boolean, msg: string }) => {
      onResponse(response.msg, response.success);
    });
  }

  /**
   * Quick join enters through here too, and passes no callback: it must not
   * clobber the one the invite path already registered, or accepting an invite
   * after a quick join would start nothing.
   */
  public acceptInvite(roomId: string, onStart?: (roomData: any) => void) {
    if (!this.socket) this.connect();

    if (onStart) this.onDungeonStartCb = onStart;

    const uuid = localStorage.getItem('playerUUID');
    const name = localStorage.getItem('playerName');
    const shortId = localStorage.getItem('playerShortId');
    this.socket?.emit('accept_invite', {
      roomId,
      uuid,
      actorId: this.getActorId(),
      name,
      shortId,
      ...this.profile,
    });
  }

  public listenForInvites(onInviteReceived: (inviteData: { fromName: string, dungeonId: string, roomId: string }) => void) {
    if (!this.socket) this.connect();
    this.onInviteCb = onInviteReceived;
  }

  public onRoleChange(cb: (isHost: boolean) => void) {
    if (!this.socket) this.connect();
    this.onRoleChangeCb = cb;
  }

  /**
   * A heal or buff cast by one player, applied to everyone in the party.
   *
   * Support skills only ever touched the caster, so a priest healing in a party
   * healed nobody who needed it.
   */
  public sendPartySupport(payload: {
    kind: 'heal' | 'buff' | 'cleanse' | 'downed' | 'revive' | 'loot';
    amount?: number;
    percent?: number;
    count?: number;
    stat?: string;
    multiplier?: number;
    duration?: number;
    casterName?: string;
    targetSocketId?: string;
    itemName?: string;
    rarity?: string;
  }) {
    this.socket?.emit('party_support', payload);
  }

  /**
   * What each member did this run, exchanged when the dungeon ends. Every
   * client tallies only its own blows, so a summary of the whole party can
   * only be assembled by everyone saying their own number.
   */
  public sendRunStats(payload: RunStats) {
    this.socket?.emit('party_stats', payload);
  }

  public onRunStats(cb: (payload: RunStats & { socketId: string }) => void) {
    this.onRunStatsCb = cb;
  }

  /**
   * A canned line, by id. Only the id crosses the wire - never typed text -
   * so there is no free-text channel to moderate.
   */
  public sendQuickChat(lineId: string) {
    this.socket?.emit('party_chat', { lineId });
  }

  public onQuickChat(cb: (payload: { socketId: string; lineId: string }) => void) {
    this.onQuickChatCb = cb;
  }

  /** A marker dropped on the world, for pointing at something. */
  public sendPing(x: number, y: number) {
    this.socket?.emit('party_ping', { x, y });
  }

  public onPing(cb: (payload: { socketId: string; x: number; y: number }) => void) {
    this.onPingCb = cb;
  }

  /** Open parties we could join, filtered server-side by our level. */
  public browseLobbies() {
    if (!this.socket) this.connect();
    this.socket?.emit('browse_lobbies');
  }

  public onLobbyList(cb: (lobbies: OpenLobby[]) => void) {
    this.onLobbyListCb = cb;
  }

  /** Ask the server for the best open party and join it. */
  public quickJoin() {
    if (!this.socket) this.connect();
    this.socket?.emit('quick_join');
  }

  /**
   * The standing "the run has begun" handler.
   *
   * This used to be set only by createLobby and by an accepted invite, so quick
   * join - which deliberately passes none, to avoid clobbering the invite one -
   * left it null for anyone who had not been invited yet this session. The host
   * pressed START and the packet arrived with nobody listening: the rest of the
   * party entered the dungeon and that player sat in the lobby. Registered once
   * at startup, there is always somebody to receive it.
   */
  public onDungeonStart(cb: (roomData: any) => void) {
    this.onDungeonStartCb = cb;
  }

  public onPartySupport(cb: (payload: any) => void) {
    this.onPartySupportCb = cb;
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

  public sendPlayerMove(
    playerState: any,
    groundY: number,
    isAttacking: boolean = false,
    isTownMode: boolean = false,
    sceneId: string = isTownMode ? 'town' : 'goblin_catacombs',
  ) {
    if (!this.socket || !this.room) return;
    const payload = {
      classId: playerState.characterClass ? playerState.characterClass.id : 'knight',
      // Quarter-pixel quantization is below visible sprite precision but keeps
      // tiny floating-point drift from defeating duplicate suppression.
      x: quantizeNetworkCoordinate(playerState.x),
      y: quantizeNetworkCoordinate(this.toNetworkY(playerState.y, groundY)),
      facing: playerState.facing,
      isGrounded: playerState.isGrounded,
      isAttacking,
      animState: playerState.animState || 'idle',
      isTownMode: Boolean(isTownMode),
      sceneId,
      // Teammates need to see you are down, not merely standing still.
      downed: Boolean(playerState.downed),
      // Rounded to whole percent: this rides every move packet, and nobody can
      // read the difference between 61% and 61.4% on a sliver four pixels tall.
      hpPct: Math.max(0, Math.min(100, Math.round((playerState.hp / Math.max(1, playerState.maxHp)) * 100)))
    };
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!this.movementCadence.shouldSend(JSON.stringify(payload), now)) return;
    this.socket.emit('player_move', payload);
  }

  /** Smooth 20 Hz packets for rendering without delaying teleports/zone changes. */
  public updateRemotePlayers(dt: number): void {
    for (const player of Object.values(this.remotePlayers)) {
      if (typeof player.targetX === 'number') {
        player.x = smoothNetworkCoordinate(player.x, player.targetX, dt);
      }
      if (typeof player.targetY === 'number') {
        player.y = smoothNetworkCoordinate(player.y, player.targetY, dt);
      }
    }
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
    this.setRoom(null);
    this.isHost = true; // Solo play from here on.
  }

  /** Our own socket id, so a targeted party packet can tell if it means us. */
  public get mySocketId(): string | null {
    return this.socket?.id || null;
  }

  /** True when we are in a room with at least one other player. */
  public get isPartied(): boolean {
    return !!this.room && Object.keys(this.remotePlayers).length > 0;
  }

  public onLobbyError(cb: (msg: string) => void) {
    if (!this.socket) this.connect();
    this.onLobbyErrorCb = cb;
  }

  // ================= LOBBY =================

  public onLobbyState(cb: (state: LobbyState) => void) {
    if (!this.socket) this.connect();
    this.onLobbyStateCb = cb;
  }

  public onLobbyLeft(cb: () => void) {
    if (!this.socket) this.connect();
    this.onLobbyLeftCb = cb;
  }

  /** Toggle readiness. Ignored for the host, who is always ready. */
  public sendReady(ready: boolean) {
    if (!this.socket || !this.room) return;
    this.socket.emit('lobby_ready', { ready });
  }

  /** Host only - launches the run for everyone. */
  public startMatch() {
    if (!this.socket || !this.room) return;
    this.socket.emit('lobby_start');
  }

  public leaveLobby() {
    if (!this.socket || !this.room) return;
    this.socket.emit('leave_lobby');
  }

  // ================= FRIENDS =================

  public onFriends(cb: (friends: FriendEntry[]) => void) {
    if (!this.socket) this.connect();
    this.onFriendsCb = cb;
  }

  public onFriendNotice(cb: (msg: string) => void) {
    if (!this.socket) this.connect();
    this.onFriendNoticeCb = cb;
  }

  public requestFriends() {
    if (!this.socket) this.connect();
    this.socket?.emit('friends_request_list');
  }

  public addFriend(shortId: string) {
    if (!this.socket) this.connect();
    this.socket?.emit('friend_add', { shortId });
  }

  public removeFriend(uuid: string) {
    this.socket?.emit('friend_remove', { uuid });
  }

  /** Pull a friend straight into the current party. */
  public inviteFriend(uuid: string) {
    this.socket?.emit('friend_invite', { uuid });
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
      isElite: e.isElite,
      phases: e.phases,
      currentPhase: e.currentPhase,
      specialAttackTimer: e.specialAttackTimer,
      bossCastName: e.bossCastName,
      bossCastTimer: e.bossCastTimer,
      bossCastDuration: e.bossCastDuration,
      role: e.role,
      formationId: e.formationId,
      formationSlotId: e.formationSlotId,
      eliteModifiers: Array.isArray(e.eliteModifiers) ? [...e.eliteModifiers] : undefined,
      guardState: e.guardState ? { ...e.guardState } : undefined,
      attackProfileId: e.attackProfileId,
      attackIntent: e.attackIntent
        ? {
            ...e.attackIntent,
            // Intent Y coordinates follow the same ground-relative wire
            // convention as enemy/player Y so different viewport heights agree.
            sourceY: this.toNetworkY(e.attackIntent.sourceY, groundY),
            target: e.attackIntent.target
              ? { ...e.attackIntent.target, y: this.toNetworkY(e.attackIntent.target.y, groundY) }
              : undefined,
          }
        : undefined,
      intentSequence: e.intentSequence,
      roleActionCooldown: e.roleActionCooldown,
      summonOwnerId: e.summonOwnerId,
      objectiveEntity: e.objectiveEntity,
      featureSpriteId: e.featureSpriteId,
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

  /** Host-authored enemy damage sent to exactly one remote party member. */
  public sendPlayerDamage(targetSocketId: string, payload: PlayerDamagePacket) {
    if (!this.socket || !this.room || !this.isHost) return;
    this.socket.emit('player_damage', { targetSocketId, ...payload });
  }

  /** Receive damage that the server has verified came from the current host. */
  public onPlayerDamage(onDamage: (data: PlayerDamagePacket) => void) {
    if (!this.socket) this.connect();
    this.onPlayerDamageCb = onDamage;
  }

  /** Guest -> server -> host: resolution of one enemy attack intent. */
  public sendCombatDefense(result: CombatDefenseResultPacket) {
    if (!this.socket || !this.room || this.isHost || !isCombatDefenseResult(result, false)) return;
    this.debug('OUT', 'combat_defense', result);
    this.socket.emit('combat_defense', result);
  }

  /** Host side: receives only server-validated results from current guests. */
  public onCombatDefense(cb: (data: RemoteCombatDefenseResultPacket) => void) {
    if (!this.socket) this.connect();
    this.onCombatDefenseCb = cb;
  }

  /** Host-only deterministic run snapshot broadcast to every current guest. */
  public sendRunSync(runState: DungeonRunState, encounterSnapshot?: DungeonEncounterSnapshot | null) {
    if (!this.socket || !this.room || !this.isHost || !isBoundedDungeonRunState(runState)) return;
    if (encounterSnapshot !== undefined && encounterSnapshot !== null
      && !isBoundedDungeonEncounterSnapshot(encounterSnapshot)) return;
    const packet: DungeonRunSyncPacket = {
      protocolVersion: RUN_SYNC_PROTOCOL_VERSION,
      runState,
      ...(encounterSnapshot ? { encounterSnapshot } : {}),
    };
    if (serializedByteLength(packet) > RUN_SYNC_MAX_BYTES) return;
    this.debug('OUT', 'run_sync', { runId: runState.runId, revision: runState.revision });
    this.socket.emit('run_sync', packet);
  }

  /** Guest side: receives bounded, schema-compatible host run state. */
  public onRunSync(cb: (runState: DungeonRunState, encounterSnapshot?: DungeonEncounterSnapshot) => void) {
    if (!this.socket) this.connect();
    this.onRunSyncCb = cb;
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
    if (snapshot.runState !== undefined && !isBoundedDungeonRunState(snapshot.runState)) return;
    if (snapshot.encounterSnapshot !== undefined
      && !isBoundedDungeonEncounterSnapshot(snapshot.encounterSnapshot)) return;
    const payload = {
      protocolVersion: RUN_SYNC_PROTOCOL_VERSION,
      requesterId,
      waveIndex: snapshot.waveIndex,
      dungeonIndex: snapshot.dungeonIndex,
      dungeonId: snapshot.dungeonId,
      enemies: (snapshot.enemies || []).map(e => this.serializeEnemy(e, groundY)),
      ...(snapshot.runState ? { runState: snapshot.runState } : {}),
      ...(snapshot.encounterSnapshot ? { encounterSnapshot: snapshot.encounterSnapshot } : {}),
    };
    this.debug('OUT', 'full_sync', {
      requesterId,
      enemies: payload.enemies.length,
      runRevision: snapshot.runState?.revision,
    });
    this.socket.emit('full_sync', payload);
  }

  /** Guest side: receives the host's snapshot. */
  public onFullSync(cb: (snapshot: FullSyncSnapshot) => void) {
    if (!this.socket) this.connect();
    this.onFullSyncCb = cb;
  }
}

export const network = new NetworkManager();
