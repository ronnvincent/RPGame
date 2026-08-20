/**
 * Deterministic, sprite-only room objective and hazard simulation.
 *
 * This module deliberately owns no canvas art. It emits bounded gameplay
 * records and asks GameplaySpriteRenderer to paint manifest ids. The host
 * remains responsible for applying damage and forwarding ObjectiveEvent
 * records to DungeonRunController.
 */

import {
  EXPLORATION_SPRITES,
  HAZARD_SPRITES,
  OBJECTIVE_SPRITES,
  isGameplaySpriteId,
  type GameplaySpriteId,
} from '../assets/GameplaySpriteManifest.ts';
import type { GameplaySpriteRenderer } from '../engine/GameplaySpriteRenderer.ts';
import type {
  DungeonRoomNode,
  ObjectiveDefinition,
  ObjectiveEvent,
  RoomAccess,
  RoomKind,
} from './run/RunTypes.ts';
import { SeededRng, normalizeSeed } from './run/SeededRng.ts';

export const ENCOUNTER_RUNTIME_SCHEMA_VERSION = 1 as const;
export const ENCOUNTER_SNAPSHOT_MAX_BYTES = 64 * 1024;

export const ENCOUNTER_RUNTIME_LIMITS = Object.freeze({
  maxActors: 8,
  maxEnemies: 32,
  maxWorldObjects: 32,
  maxHazards: 16,
  maxRouteProps: 8,
  maxDynamicPlatforms: 8,
  maxPendingExplosions: 8,
  maxObjectiveEventsPerCall: 64,
  maxDamageEventsPerTargetKind: 64,
  maxRuntimeEventsPerCall: 64,
  maxDeltaSeconds: 0.25,
  maxDamagePerEvent: 9_999,
  minArenaWidth: 640,
  maxArenaWidth: 12_000,
});

export type EncounterHazardKind = 'falling-rocks' | 'traps' | 'moving-platform';
export type EncounterWorldObjectKind =
  | 'relic'
  | 'nest'
  | 'explosive-barrel'
  | 'breakable-bridge'
  | 'escape-gate'
  | 'survival-ward';
export type EncounterRoutePropKind = 'route' | 'event' | 'treasure' | 'shrine' | 'secret';
export type EncounterHazardPhase = 'cooldown' | 'telegraph' | 'active';

export interface EncounterActorPosition {
  actorId: string;
  x: number;
  y: number;
  active?: boolean;
}

export interface EncounterEnemyPosition {
  enemyId: string;
  x: number;
  y: number;
  alive?: boolean;
  /** Damage applied only while this enemy is in range of an objective target. */
  objectiveDamagePerSecond?: number;
}

export interface EncounterUpdateContext {
  localActor?: EncounterActorPosition | null;
  remoteActors?: readonly EncounterActorPosition[];
  enemies?: readonly EncounterEnemyPosition[];
  /** Used by kill-all rooms so late spawns cannot complete the room early. */
  spawnsSealed?: boolean;
}

export interface EncounterHitArea {
  x: number;
  y: number;
  radius: number;
  sourceId?: string;
}

export interface EncounterDamageEvent {
  sequence: number;
  sourceId: string;
  targetId: string;
  amount: number;
  x: number;
  y: number;
  kind: 'falling-rock' | 'spike-trap' | 'barrel-explosion' | 'objective-attack' | 'world-object-hit';
}

export interface EncounterRuntimeEvent {
  sequence: number;
  type: 'hazard-telegraphed' | 'hazard-triggered' | 'world-object-destroyed' | 'escort-checkpoint';
  sourceId: string;
  x: number;
  y: number;
  spriteId: GameplaySpriteId;
  targetId?: string;
}

export interface EncounterUpdateResult {
  objectiveEvents: ObjectiveEvent[];
  playerDamage: EncounterDamageEvent[];
  enemyDamage: EncounterDamageEvent[];
  worldDamage: EncounterDamageEvent[];
  events: EncounterRuntimeEvent[];
}

export interface EncounterWorldObjectState {
  id: string;
  kind: EncounterWorldObjectKind;
  spriteId: GameplaySpriteId;
  secondarySpriteId?: GameplaySpriteId;
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  active: boolean;
}

export interface EncounterHazardState {
  id: string;
  kind: EncounterHazardKind;
  bodySpriteId: GameplaySpriteId;
  telegraphSpriteId: GameplaySpriteId;
  impactSpriteId: GameplaySpriteId;
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  minX: number;
  maxX: number;
  width: number;
  height: number;
  direction: -1 | 1;
  phase: EncounterHazardPhase;
  timerSeconds: number;
  impactSeconds: number;
  cycle: number;
}

export interface EncounterRoutePropState {
  id: string;
  kind: EncounterRoutePropKind;
  spriteId: GameplaySpriteId;
  x: number;
  y: number;
  scale: number;
}

export interface EncounterEscortState {
  actorId: string;
  idleSpriteId: GameplaySpriteId;
  walkSpriteId: GameplaySpriteId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  nextCheckpointIndex: number;
  checkpointXs: number[];
  moving: boolean;
}

export interface EncounterDynamicPlatform {
  id: string;
  kind: 'breakable-bridge' | 'moving-platform';
  x: number;
  y: number;
  width: number;
  height: number;
  velocityX: number;
  active: boolean;
}

export interface EncounterObjectiveTarget {
  kind: 'world-object' | 'escort';
  targetId: string;
  x: number;
  y: number;
  radius: number;
}

interface PendingExplosion {
  id: string;
  x: number;
  y: number;
  radius: number;
  playerDamage: number;
  enemyDamage: number;
}

interface RoomSnapshot {
  id: string;
  kind: RoomKind;
  access: RoomAccess;
  objective?: ObjectiveDefinition;
}

export interface DungeonEncounterSnapshot {
  schemaVersion: typeof ENCOUNTER_RUNTIME_SCHEMA_VERSION;
  room: RoomSnapshot;
  seed: number;
  arenaWidth: number;
  groundY: number;
  elapsedSeconds: number;
  objectiveElapsedMs: number;
  objectiveStatus: 'active' | 'succeeded' | 'failed';
  eventSequence: number;
  worldObjects: EncounterWorldObjectState[];
  hazards: EncounterHazardState[];
  routeProps: EncounterRoutePropState[];
  escort: EncounterEscortState | null;
  activeActorIds: string[];
  escapedActorIds: string[];
  knownEnemyIds: string[];
  defeatedEnemyIds: string[];
  spawnsSealed: boolean;
  pendingExplosions: PendingExplosion[];
}

type EncounterSpriteRenderer = Pick<GameplaySpriteRenderer, 'draw' | 'warm'>;

const EMPTY_RESULT = (): EncounterUpdateResult => ({
  objectiveEvents: [], playerDamage: [], enemyDamage: [], worldDamage: [], events: [],
});

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, finite(value, minimum)));
}

function round(value: number, precision = 100): number {
  return Math.round(value * precision) / precision;
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function validId(value: string, label: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128) throw new Error(`${label} is invalid`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function serializedByteLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function finiteInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function validSnapshotId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 128
    && !['__proto__', 'prototype', 'constructor'].includes(value)
    && /^[A-Za-z0-9:._-]+$/.test(value);
}

function validSnapshotIds(value: unknown, limit: number): value is string[] {
  return Array.isArray(value)
    && value.length <= limit
    && value.every(validSnapshotId)
    && new Set(value).size === value.length;
}

const ROOM_KINDS = new Set<RoomKind>([
  'combat', 'objective', 'elite', 'miniboss', 'event', 'treasure', 'shrine', 'boss', 'escape',
]);
const ROOM_ACCESS = new Set<RoomAccess>(['normal', 'secret']);
const OBJECTIVE_STATUSES = new Set(['active', 'succeeded', 'failed']);
const WORLD_OBJECT_KINDS = new Set<EncounterWorldObjectKind>([
  'relic', 'nest', 'explosive-barrel', 'breakable-bridge', 'escape-gate', 'survival-ward',
]);
const HAZARD_KINDS = new Set<EncounterHazardKind>(['falling-rocks', 'traps', 'moving-platform']);
const HAZARD_PHASES = new Set<EncounterHazardPhase>(['cooldown', 'telegraph', 'active']);
const ROUTE_PROP_KINDS = new Set<EncounterRoutePropKind>(['route', 'event', 'treasure', 'shrine', 'secret']);

function validObjectiveDefinition(value: unknown): value is ObjectiveDefinition {
  if (!isRecord(value) || !validSnapshotId(value.id) || typeof value.type !== 'string') return false;
  const spawnGroupsValid = (groups: unknown) => validSnapshotIds(groups, ENCOUNTER_RUNTIME_LIMITS.maxEnemies);
  switch (value.type) {
    case 'kill_all': return spawnGroupsValid(value.spawnGroupIds);
    case 'defend_relic':
      return validSnapshotId(value.targetObjectId)
        && finiteInRange(value.durationMs, 1, 3_600_000)
        && finiteInRange(value.maxHp, 1, 1_000_000_000)
        && spawnGroupsValid(value.spawnGroupIds);
    case 'escort':
      return validSnapshotId(value.escortActorId)
        && validSnapshotIds(value.checkpointIds, ENCOUNTER_RUNTIME_LIMITS.maxWorldObjects)
        && finiteInRange(value.maxHp, 1, 1_000_000_000)
        && spawnGroupsValid(value.spawnGroupIds);
    case 'survive':
      return finiteInRange(value.durationMs, 1, 3_600_000) && spawnGroupsValid(value.spawnGroupIds);
    case 'destroy_nests':
      return validSnapshotIds(value.nestObjectIds, ENCOUNTER_RUNTIME_LIMITS.maxWorldObjects)
        && spawnGroupsValid(value.spawnGroupIds);
    case 'timed_escape':
      return finiteInRange(value.durationMs, 1, 3_600_000)
        && validSnapshotId(value.exitTriggerId)
        && (value.participation === 'all_active' || value.participation === 'fixed_count')
        && (value.requiredCount === undefined
          || (Number.isSafeInteger(value.requiredCount) && Number(value.requiredCount) >= 1
            && Number(value.requiredCount) <= ENCOUNTER_RUNTIME_LIMITS.maxActors));
    default: return false;
  }
}

/**
 * Strict runtime boundary for host-authored encounter snapshots. It checks the
 * complete nested shape, manifest sprite ids, array cardinality and byte size
 * before any guest replaces live dungeon state.
 */
export function validateDungeonEncounterSnapshot(value: unknown): asserts value is DungeonEncounterSnapshot {
  if (!isRecord(value) || serializedByteLength(value) > ENCOUNTER_SNAPSHOT_MAX_BYTES) {
    throw new Error('Encounter snapshot is unbounded');
  }
  const snapshot = value as unknown as DungeonEncounterSnapshot;
  if (snapshot.schemaVersion !== ENCOUNTER_RUNTIME_SCHEMA_VERSION) throw new Error('Unsupported encounter snapshot');
  if (!isRecord(snapshot.room)
    || !validSnapshotId(snapshot.room.id)
    || !ROOM_KINDS.has(snapshot.room.kind)
    || !ROOM_ACCESS.has(snapshot.room.access)
    || (snapshot.room.objective !== undefined && !validObjectiveDefinition(snapshot.room.objective))) {
    throw new Error('Encounter snapshot room is invalid');
  }
  if (!Number.isSafeInteger(snapshot.seed) || snapshot.seed < 0 || snapshot.seed > 0xffff_ffff
    || !finiteInRange(snapshot.arenaWidth, ENCOUNTER_RUNTIME_LIMITS.minArenaWidth, ENCOUNTER_RUNTIME_LIMITS.maxArenaWidth)
    || !finiteInRange(snapshot.groundY, -ENCOUNTER_RUNTIME_LIMITS.maxArenaWidth, ENCOUNTER_RUNTIME_LIMITS.maxArenaWidth)
    || !finiteInRange(snapshot.elapsedSeconds, 0, 3_600_000)
    || !finiteInRange(snapshot.objectiveElapsedMs, 0, 3_600_000_000)
    || !Number.isSafeInteger(snapshot.eventSequence) || snapshot.eventSequence < 0
    || !OBJECTIVE_STATUSES.has(snapshot.objectiveStatus)) {
    throw new Error('Encounter snapshot contains invalid numbers or status');
  }

  const boundedArrays: Array<[unknown, number, string]> = [
    [snapshot.worldObjects, ENCOUNTER_RUNTIME_LIMITS.maxWorldObjects, 'worldObjects'],
    [snapshot.hazards, ENCOUNTER_RUNTIME_LIMITS.maxHazards, 'hazards'],
    [snapshot.routeProps, ENCOUNTER_RUNTIME_LIMITS.maxRouteProps, 'routeProps'],
    [snapshot.pendingExplosions, ENCOUNTER_RUNTIME_LIMITS.maxPendingExplosions, 'pendingExplosions'],
  ];
  for (const [items, limit, label] of boundedArrays) {
    if (!Array.isArray(items) || items.length > limit) throw new Error(`Encounter snapshot ${label} is unbounded`);
  }
  if (!validSnapshotIds(snapshot.activeActorIds, ENCOUNTER_RUNTIME_LIMITS.maxActors)
    || !validSnapshotIds(snapshot.escapedActorIds, ENCOUNTER_RUNTIME_LIMITS.maxActors)
    || !validSnapshotIds(snapshot.knownEnemyIds, ENCOUNTER_RUNTIME_LIMITS.maxEnemies)
    || !validSnapshotIds(snapshot.defeatedEnemyIds, ENCOUNTER_RUNTIME_LIMITS.maxEnemies)) {
    throw new Error('Encounter snapshot entity ids are invalid or unbounded');
  }
  if (!snapshot.escapedActorIds.every(id => snapshot.activeActorIds.includes(id))
    || !snapshot.defeatedEnemyIds.every(id => snapshot.knownEnemyIds.includes(id))
    || typeof snapshot.spawnsSealed !== 'boolean') {
    throw new Error('Encounter snapshot membership is invalid');
  }

  for (const object of snapshot.worldObjects) {
    if (!isRecord(object) || !isGameplaySpriteId(object.spriteId)
      || (object.secondarySpriteId !== undefined && !isGameplaySpriteId(object.secondarySpriteId))) {
      throw new Error('Encounter snapshot contains an unknown sprite id');
    }
    if (!validSnapshotId(object.id) || !WORLD_OBJECT_KINDS.has(object.kind)
      || !finiteInRange(object.x, -24_000, 24_000) || !finiteInRange(object.y, -24_000, 24_000)
      || !finiteInRange(object.width, 1, 4_000) || !finiteInRange(object.height, 1, 4_000)
      || !finiteInRange(object.maxHp, 1, 1_000_000_000) || !finiteInRange(object.hp, 0, object.maxHp)
      || typeof object.active !== 'boolean') throw new Error('Encounter snapshot world object is invalid');
  }
  for (const hazard of snapshot.hazards) {
    if (!isRecord(hazard) || !isGameplaySpriteId(hazard.bodySpriteId)
      || !isGameplaySpriteId(hazard.telegraphSpriteId) || !isGameplaySpriteId(hazard.impactSpriteId)) {
      throw new Error('Encounter snapshot contains an unknown sprite id');
    }
    if (!validSnapshotId(hazard.id) || !HAZARD_KINDS.has(hazard.kind)
      || ![hazard.x, hazard.y, hazard.baseX, hazard.baseY, hazard.minX, hazard.maxX]
        .every(number => finiteInRange(number, -24_000, 24_000))
      || hazard.minX > hazard.maxX
      || !finiteInRange(hazard.width, 1, 4_000) || !finiteInRange(hazard.height, 1, 4_000)
      || (hazard.direction !== -1 && hazard.direction !== 1) || !HAZARD_PHASES.has(hazard.phase)
      || !finiteInRange(hazard.timerSeconds, 0, 3_600) || !finiteInRange(hazard.impactSeconds, 0, 60)
      || !Number.isSafeInteger(hazard.cycle) || hazard.cycle < 0) throw new Error('Encounter snapshot hazard is invalid');
  }
  for (const prop of snapshot.routeProps) {
    if (!isRecord(prop) || !isGameplaySpriteId(prop.spriteId)) {
      throw new Error('Encounter snapshot contains an unknown sprite id');
    }
    if (!validSnapshotId(prop.id) || !ROUTE_PROP_KINDS.has(prop.kind)
      || !finiteInRange(prop.x, -24_000, 24_000)
      || !finiteInRange(prop.y, -24_000, 24_000) || !finiteInRange(prop.scale, 0.05, 20)) {
      throw new Error('Encounter snapshot route prop is invalid');
    }
  }
  if (snapshot.escort !== null) {
    const escort = snapshot.escort;
    if (!isRecord(escort) || !isGameplaySpriteId(escort.idleSpriteId) || !isGameplaySpriteId(escort.walkSpriteId)) {
      throw new Error('Encounter snapshot contains an unknown sprite id');
    }
    if (!validSnapshotId(escort.actorId) || !finiteInRange(escort.x, -24_000, 24_000)
      || !finiteInRange(escort.y, -24_000, 24_000) || !finiteInRange(escort.maxHp, 1, 1_000_000_000)
      || !finiteInRange(escort.hp, 0, escort.maxHp)
      || !Number.isSafeInteger(escort.nextCheckpointIndex) || escort.nextCheckpointIndex < 0
      || !Array.isArray(escort.checkpointXs) || escort.checkpointXs.length > ENCOUNTER_RUNTIME_LIMITS.maxWorldObjects
      || !escort.checkpointXs.every(x => finiteInRange(x, -24_000, 24_000))
      || typeof escort.moving !== 'boolean') throw new Error('Encounter snapshot escort is invalid');
  }
  for (const explosion of snapshot.pendingExplosions) {
    if (!isRecord(explosion) || !validSnapshotId(explosion.id)
      || !finiteInRange(explosion.x, -24_000, 24_000) || !finiteInRange(explosion.y, -24_000, 24_000)
      || !finiteInRange(explosion.radius, 1, 4_000)
      || !finiteInRange(explosion.playerDamage, 0, ENCOUNTER_RUNTIME_LIMITS.maxDamagePerEvent)
      || !finiteInRange(explosion.enemyDamage, 0, ENCOUNTER_RUNTIME_LIMITS.maxDamagePerEvent)) {
      throw new Error('Encounter snapshot pending explosion is invalid');
    }
  }
}

export function isBoundedDungeonEncounterSnapshot(value: unknown): value is DungeonEncounterSnapshot {
  try {
    validateDungeonEncounterSnapshot(value);
    return true;
  } catch {
    return false;
  }
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function withinRadius(ax: number, ay: number, bx: number, by: number, radius: number): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy <= radius * radius;
}

function boundedPush<T>(target: T[], value: T, limit: number): void {
  if (target.length < limit) target.push(value);
}

function objectiveSprite(definition: ObjectiveDefinition): GameplaySpriteId | null {
  switch (definition.type) {
    case 'defend_relic': return OBJECTIVE_SPRITES['defend-relic'].primary;
    case 'escort': return OBJECTIVE_SPRITES['escort-npc'].primary;
    case 'survive': return OBJECTIVE_SPRITES['survive-waves'].primary;
    case 'destroy_nests': return OBJECTIVE_SPRITES['destroy-nests'].primary;
    case 'timed_escape': return OBJECTIVE_SPRITES['timed-escape'].primary;
    case 'kill_all': return null;
  }
}

/**
 * The constructor takes the shared GameplaySpriteRenderer. Keeping it injected
 * makes the simulation independently testable and prevents a second sprite
 * cache from being created for dungeon rooms.
 */
export class DungeonEncounterRuntime {
  private readonly renderer: EncounterSpriteRenderer;
  private room: RoomSnapshot | null = null;
  private seed = 0;
  private arenaWidth = ENCOUNTER_RUNTIME_LIMITS.minArenaWidth;
  private groundY = 0;
  private elapsedSeconds = 0;
  private objectiveElapsedMs = 0;
  private objectiveStatus: 'active' | 'succeeded' | 'failed' = 'active';
  private eventSequence = 0;
  private worldObjects: EncounterWorldObjectState[] = [];
  private hazards: EncounterHazardState[] = [];
  private routeProps: EncounterRoutePropState[] = [];
  private escort: EncounterEscortState | null = null;
  private activeActorIds: string[] = [];
  private escapedActorIds: string[] = [];
  private knownEnemyIds: string[] = [];
  private defeatedEnemyIds: string[] = [];
  private spawnsSealed = false;
  private pendingExplosions: PendingExplosion[] = [];

  constructor(renderer: EncounterSpriteRenderer) {
    this.renderer = renderer;
  }

  public configureRoom(
    node: DungeonRoomNode,
    arenaWidth: number,
    groundY: number,
    seed: number | string,
  ): DungeonEncounterSnapshot {
    this.reset();
    validId(node.id, 'room id');
    this.room = {
      id: node.id,
      kind: node.kind,
      access: node.access,
      ...(node.objective ? { objective: copy(node.objective) } : {}),
    };
    this.seed = normalizeSeed(seed);
    this.arenaWidth = clamp(arenaWidth, ENCOUNTER_RUNTIME_LIMITS.minArenaWidth, ENCOUNTER_RUNTIME_LIMITS.maxArenaWidth);
    this.groundY = finite(groundY, 0);

    const rng = new SeededRng(`${this.seed}:${node.id}:encounter`);
    const positionedX = (fraction: number, jitter: number): number => round(clamp(
      this.arenaWidth * fraction + rng.int(-jitter, jitter),
      48,
      this.arenaWidth - 48,
    ));

    if (node.access === 'secret') {
      this.routeProps.push({
        id: 'route.secret-door', kind: 'secret', spriteId: EXPLORATION_SPRITES['secret-room'],
        x: 72, y: this.groundY, scale: 1,
      });
    }
    const roomProp = this.routePropForKind(node.kind);
    if (roomProp) this.routeProps.push(roomProp);

    if (node.objective) this.configureObjective(node.objective, positionedX);

    if (this.isDangerousRoom(node.kind)) {
      this.configureWorldHazards(positionedX, rng);
    }

    this.worldObjects = this.worldObjects.slice(0, ENCOUNTER_RUNTIME_LIMITS.maxWorldObjects);
    this.hazards = this.hazards.slice(0, ENCOUNTER_RUNTIME_LIMITS.maxHazards);
    this.routeProps = this.routeProps.slice(0, ENCOUNTER_RUNTIME_LIMITS.maxRouteProps);
    this.warmConfiguredSprites();
    return this.snapshot() as DungeonEncounterSnapshot;
  }

  public reset(): void {
    this.room = null;
    this.seed = 0;
    this.arenaWidth = ENCOUNTER_RUNTIME_LIMITS.minArenaWidth;
    this.groundY = 0;
    this.elapsedSeconds = 0;
    this.objectiveElapsedMs = 0;
    this.objectiveStatus = 'active';
    this.eventSequence = 0;
    this.worldObjects = [];
    this.hazards = [];
    this.routeProps = [];
    this.escort = null;
    this.activeActorIds = [];
    this.escapedActorIds = [];
    this.knownEnemyIds = [];
    this.defeatedEnemyIds = [];
    this.spawnsSealed = false;
    this.pendingExplosions = [];
  }

  public update(deltaSeconds: number, context: EncounterUpdateContext): EncounterUpdateResult {
    const result = EMPTY_RESULT();
    if (!this.room) return result;

    const dt = clamp(deltaSeconds, 0, ENCOUNTER_RUNTIME_LIMITS.maxDeltaSeconds);
    const actors = this.normalizedActors(context);
    const enemies = this.normalizedEnemies(context.enemies ?? []);
    this.elapsedSeconds = round(this.elapsedSeconds + dt, 1_000);

    this.updateMovingPlatforms(dt);
    this.resolvePendingExplosions(actors, enemies, result);
    this.updateHazards(dt, actors, enemies, result);
    this.updateObjective(dt, actors, enemies, context, result);
    return result;
  }

  /**
   * Damage only authored destructibles: nests, barrels, and the bridge. The
   * returned records are immediate and are not replayed by the next update.
   */
  public hitWorldObjects(area: EncounterHitArea, damage: number): EncounterUpdateResult {
    const result = EMPTY_RESULT();
    if (!this.room) return result;
    const x = finite(area.x, 0);
    const y = finite(area.y, this.groundY);
    const radius = clamp(area.radius, 1, 1_000);
    const amount = clamp(damage, 0, ENCOUNTER_RUNTIME_LIMITS.maxDamagePerEvent);
    if (amount <= 0) return result;
    const sourceId = typeof area.sourceId === 'string' && area.sourceId ? area.sourceId.slice(0, 128) : 'player-world-hit';

    for (const object of this.worldObjects) {
      if (!object.active || !['nest', 'explosive-barrel', 'breakable-bridge'].includes(object.kind)) continue;
      const collisionRadius = radius + Math.max(object.width, object.height) * 0.35;
      if (!withinRadius(x, y, object.x, object.y - object.height * 0.4, collisionRadius)) continue;

      const applied = Math.min(object.hp, amount);
      object.hp = round(Math.max(0, object.hp - applied));
      this.pushDamage(result.worldDamage, sourceId, object.id, applied, object.x, object.y, 'world-object-hit');
      if (object.kind === 'nest') {
        this.pushObjective(result, { type: 'world_object_damaged', objectId: object.id, damage: applied });
      }
      if (object.hp > 0) continue;

      object.active = false;
      this.pushRuntimeEvent(result, 'world-object-destroyed', object.id, object.x, object.y, object.spriteId);
      if (object.kind === 'nest') {
        this.pushObjective(result, { type: 'world_object_destroyed', objectId: object.id });
        this.updateDestroyNestsStatus();
      } else if (object.kind === 'explosive-barrel') {
        boundedPush(this.pendingExplosions, {
          id: object.id, x: object.x, y: object.y - 22, radius: 112, playerDamage: 85, enemyDamage: 120,
        }, ENCOUNTER_RUNTIME_LIMITS.maxPendingExplosions);
      }
    }
    return result;
  }

  public getObjectiveTargetForEnemy(): EncounterObjectiveTarget | null {
    const objective = this.room?.objective;
    if (!objective || this.objectiveStatus !== 'active') return null;
    if (objective.type === 'defend_relic') {
      const relic = this.worldObjects.find(object => object.id === objective.targetObjectId && object.active);
      return relic ? { kind: 'world-object', targetId: relic.id, x: relic.x, y: relic.y, radius: 86 } : null;
    }
    if (objective.type === 'escort' && this.escort?.hp && this.escort.hp > 0) {
      return { kind: 'escort', targetId: this.escort.actorId, x: this.escort.x, y: this.escort.y, radius: 72 };
    }
    return null;
  }

  public getDynamicPlatforms(): EncounterDynamicPlatform[] {
    const platforms: EncounterDynamicPlatform[] = [];
    for (const object of this.worldObjects) {
      if (object.kind === 'breakable-bridge' && object.active) {
        boundedPush(platforms, {
          id: object.id, kind: 'breakable-bridge', x: object.x, y: object.y,
          width: object.width, height: object.height, velocityX: 0, active: true,
        }, ENCOUNTER_RUNTIME_LIMITS.maxDynamicPlatforms);
      }
    }
    for (const hazard of this.hazards) {
      if (hazard.kind !== 'moving-platform') continue;
      boundedPush(platforms, {
        id: hazard.id, kind: 'moving-platform', x: hazard.x, y: hazard.y,
        width: hazard.width, height: hazard.height, velocityX: 58 * hazard.direction, active: true,
      }, ENCOUNTER_RUNTIME_LIMITS.maxDynamicPlatforms);
    }
    return platforms;
  }

  public snapshot(): DungeonEncounterSnapshot | null {
    if (!this.room) return null;
    return copy({
      schemaVersion: ENCOUNTER_RUNTIME_SCHEMA_VERSION,
      room: this.room,
      seed: this.seed,
      arenaWidth: this.arenaWidth,
      groundY: this.groundY,
      elapsedSeconds: this.elapsedSeconds,
      objectiveElapsedMs: this.objectiveElapsedMs,
      objectiveStatus: this.objectiveStatus,
      eventSequence: this.eventSequence,
      worldObjects: this.worldObjects,
      hazards: this.hazards,
      routeProps: this.routeProps,
      escort: this.escort,
      activeActorIds: this.activeActorIds,
      escapedActorIds: this.escapedActorIds,
      knownEnemyIds: this.knownEnemyIds,
      defeatedEnemyIds: this.defeatedEnemyIds,
      spawnsSealed: this.spawnsSealed,
      pendingExplosions: this.pendingExplosions,
    });
  }

  public applySnapshot(snapshot: DungeonEncounterSnapshot): void {
    validateDungeonEncounterSnapshot(snapshot);
    const state = copy(snapshot);
    this.room = state.room;
    this.seed = state.seed;
    this.arenaWidth = state.arenaWidth;
    this.groundY = state.groundY;
    this.elapsedSeconds = state.elapsedSeconds;
    this.objectiveElapsedMs = state.objectiveElapsedMs;
    this.objectiveStatus = state.objectiveStatus;
    this.eventSequence = state.eventSequence;
    this.worldObjects = state.worldObjects;
    this.hazards = state.hazards;
    this.routeProps = state.routeProps;
    this.escort = state.escort;
    this.activeActorIds = state.activeActorIds;
    this.escapedActorIds = state.escapedActorIds;
    this.knownEnemyIds = state.knownEnemyIds;
    this.defeatedEnemyIds = state.defeatedEnemyIds;
    this.spawnsSealed = state.spawnsSealed;
    this.pendingExplosions = state.pendingExplosions;
    this.warmConfiguredSprites();
  }

  /** Paints only manifest sprites through GameplaySpriteRenderer. */
  public render(ctx: CanvasRenderingContext2D, time: number): number {
    if (!this.room) return 0;
    const animationTime = Math.max(0, finite(time, this.elapsedSeconds));
    let drawn = 0;
    const paint = (
      spriteId: GameplaySpriteId,
      x: number,
      y: number,
      options: Parameters<EncounterSpriteRenderer['draw']>[4] = {},
    ): void => {
      if (this.renderer.draw(ctx, spriteId, x, y, { time: animationTime, ...options })) drawn++;
    };

    for (const prop of this.routeProps) paint(prop.spriteId, prop.x, prop.y, { scale: prop.scale });
    for (const object of this.worldObjects) {
      if (!object.active) continue;
      if (object.secondarySpriteId) paint(object.secondarySpriteId, object.x, object.y, { width: object.width });
      paint(object.spriteId, object.x, object.y, { width: object.width });
    }
    for (const hazard of this.hazards) {
      if (hazard.kind === 'moving-platform') {
        paint(hazard.bodySpriteId, hazard.x, hazard.y, { width: hazard.width });
        continue;
      }
      if (hazard.kind === 'traps') paint(hazard.bodySpriteId, hazard.x, hazard.baseY, { width: hazard.width });
      if (hazard.phase === 'telegraph') paint(hazard.telegraphSpriteId, hazard.baseX, hazard.baseY, { width: hazard.width * 1.35 });
      if (hazard.phase === 'active' && hazard.kind === 'falling-rocks') paint(hazard.bodySpriteId, hazard.x, hazard.y, { width: hazard.width });
      if (hazard.impactSeconds > 0) paint(hazard.impactSpriteId, hazard.baseX, hazard.baseY, { width: hazard.width * 1.2 });
    }
    if (this.escort && this.escort.hp > 0) {
      paint(this.escort.moving ? this.escort.walkSpriteId : this.escort.idleSpriteId, this.escort.x, this.escort.y);
    }
    return drawn;
  }

  private routePropForKind(kind: RoomKind): EncounterRoutePropState | null {
    const shared = { x: this.arenaWidth * 0.5, y: this.groundY, scale: 1 };
    if (kind === 'event') return { ...shared, id: 'route.event', kind: 'event', spriteId: EXPLORATION_SPRITES.event };
    if (kind === 'treasure') return { ...shared, id: 'route.treasure', kind: 'treasure', spriteId: EXPLORATION_SPRITES.treasure };
    if (kind === 'shrine') return { ...shared, id: 'route.shrine', kind: 'shrine', spriteId: EXPLORATION_SPRITES['risk-reward-shrine'] };
    return {
      id: 'route.exit', kind: 'route', spriteId: EXPLORATION_SPRITES['branching-route'],
      x: this.arenaWidth - 62, y: this.groundY, scale: 1,
    };
  }

  private configureObjective(
    definition: ObjectiveDefinition,
    positionedX: (fraction: number, jitter: number) => number,
  ): void {
    switch (definition.type) {
      case 'defend_relic':
        this.worldObjects.push({
          id: definition.targetObjectId, kind: 'relic', spriteId: OBJECTIVE_SPRITES['defend-relic'].primary,
          x: positionedX(0.5, 34), y: this.groundY, width: 82, height: 104,
          hp: definition.maxHp, maxHp: definition.maxHp, active: true,
        });
        break;
      case 'escort': {
        const checkpointXs = definition.checkpointIds.map((_id, index) => round(
          this.arenaWidth * (0.28 + (0.62 * (index + 1)) / definition.checkpointIds.length),
        ));
        this.escort = {
          actorId: definition.escortActorId,
          idleSpriteId: OBJECTIVE_SPRITES['escort-npc'].primary,
          walkSpriteId: OBJECTIVE_SPRITES['escort-npc'].active,
          x: this.arenaWidth * 0.12,
          y: this.groundY,
          hp: definition.maxHp,
          maxHp: definition.maxHp,
          nextCheckpointIndex: 0,
          checkpointXs,
          moving: false,
        };
        break;
      }
      case 'survive':
        this.worldObjects.push({
          id: 'object.survival-ward', kind: 'survival-ward', spriteId: OBJECTIVE_SPRITES['survive-waves'].primary,
          x: positionedX(0.5, 28), y: this.groundY, width: 112, height: 112,
          hp: 1, maxHp: 1, active: true,
        });
        break;
      case 'destroy_nests':
        definition.nestObjectIds.slice(0, ENCOUNTER_RUNTIME_LIMITS.maxWorldObjects).forEach((id, index, ids) => {
          this.worldObjects.push({
            id, kind: 'nest', spriteId: OBJECTIVE_SPRITES['destroy-nests'].primary,
            x: round(this.arenaWidth * (0.2 + (0.62 * (index + 0.5)) / ids.length)),
            y: this.groundY, width: 112, height: 58, hp: 260, maxHp: 260, active: true,
          });
        });
        break;
      case 'timed_escape':
        this.worldObjects.push({
          id: definition.exitTriggerId, kind: 'escape-gate', spriteId: OBJECTIVE_SPRITES['timed-escape'].primary,
          x: this.arenaWidth - 78, y: this.groundY, width: 96, height: 150,
          hp: 1, maxHp: 1, active: true,
        });
        break;
      case 'kill_all':
        break;
    }
  }

  private configureWorldHazards(
    positionedX: (fraction: number, jitter: number) => number,
    rng: SeededRng,
  ): void {
    this.worldObjects.push(
      {
        id: 'hazard.bridge', kind: 'breakable-bridge', spriteId: HAZARD_SPRITES['breakable-bridge'].body,
        secondarySpriteId: 'hazard.bridge-support', x: positionedX(0.58, 35), y: this.groundY - 2,
        width: 176, height: 28, hp: 240, maxHp: 240, active: true,
      },
      {
        id: 'hazard.barrel-a', kind: 'explosive-barrel', spriteId: HAZARD_SPRITES['explosive-barrel'].body,
        x: positionedX(0.32, 28), y: this.groundY, width: 52, height: 68, hp: 80, maxHp: 80, active: true,
      },
      {
        id: 'hazard.barrel-b', kind: 'explosive-barrel', spriteId: HAZARD_SPRITES['explosive-barrel'].body,
        x: positionedX(0.78, 28), y: this.groundY, width: 52, height: 68, hp: 80, maxHp: 80, active: true,
      },
    );

    for (const [index, fraction] of [0.24, 0.7].entries()) {
      const x = positionedX(fraction, 42);
      this.hazards.push({
        id: `hazard.rock-${index}`, kind: 'falling-rocks', bodySpriteId: HAZARD_SPRITES['falling-rocks'].body,
        telegraphSpriteId: HAZARD_SPRITES['falling-rocks'].telegraph,
        impactSpriteId: HAZARD_SPRITES['falling-rocks'].impact,
        x, y: this.groundY - 320, baseX: x, baseY: this.groundY,
        minX: x, maxX: x, width: 62, height: 62, direction: 1,
        phase: 'cooldown', timerSeconds: 0.6 + rng.nextFloat() * 1.4, impactSeconds: 0, cycle: 0,
      });
    }
    for (const [index, fraction] of [0.16, 0.66].entries()) {
      const x = positionedX(fraction, 24);
      this.hazards.push({
        id: `hazard.trap-${index}`, kind: 'traps', bodySpriteId: HAZARD_SPRITES.traps.body,
        telegraphSpriteId: HAZARD_SPRITES.traps.telegraph, impactSpriteId: HAZARD_SPRITES.traps.impact,
        x, y: this.groundY, baseX: x, baseY: this.groundY,
        minX: x, maxX: x, width: 78, height: 44, direction: 1,
        phase: 'cooldown', timerSeconds: 1.2 + rng.nextFloat() * 1.5, impactSeconds: 0, cycle: 0,
      });
    }
    const platformX = positionedX(0.45, 18);
    this.hazards.push({
      id: 'hazard.moving-platform', kind: 'moving-platform', bodySpriteId: HAZARD_SPRITES['moving-platform'].body,
      telegraphSpriteId: HAZARD_SPRITES['moving-platform'].telegraph,
      impactSpriteId: HAZARD_SPRITES['moving-platform'].impact,
      x: platformX, y: this.groundY - 112, baseX: platformX, baseY: this.groundY - 112,
      minX: clamp(platformX - 150, 80, this.arenaWidth - 80),
      maxX: clamp(platformX + 150, 80, this.arenaWidth - 80),
      width: 144, height: 24, direction: rng.chancePermille(500) ? 1 : -1,
      phase: 'active', timerSeconds: 0, impactSeconds: 0, cycle: 0,
    });
  }

  private isDangerousRoom(kind: RoomKind): boolean {
    return kind === 'combat' || kind === 'objective' || kind === 'elite'
      || kind === 'miniboss' || kind === 'boss' || kind === 'escape';
  }

  private normalizedActors(context: EncounterUpdateContext): EncounterActorPosition[] {
    const candidates = [context.localActor, ...(context.remoteActors ?? [])].filter(
      (actor): actor is EncounterActorPosition => Boolean(actor && actor.active !== false),
    );
    const actors = new Map<string, EncounterActorPosition>();
    for (const actor of candidates) {
      if (actors.size >= ENCOUNTER_RUNTIME_LIMITS.maxActors) break;
      if (typeof actor.actorId !== 'string' || !actor.actorId || actors.has(actor.actorId)) continue;
      actors.set(actor.actorId.slice(0, 128), {
        actorId: actor.actorId.slice(0, 128), x: finite(actor.x, 0), y: finite(actor.y, this.groundY), active: true,
      });
    }
    return [...actors.values()].sort((left, right) => left.actorId.localeCompare(right.actorId));
  }

  private normalizedEnemies(enemies: readonly EncounterEnemyPosition[]): EncounterEnemyPosition[] {
    const result = new Map<string, EncounterEnemyPosition>();
    for (const enemy of enemies) {
      if (result.size >= ENCOUNTER_RUNTIME_LIMITS.maxEnemies) break;
      if (typeof enemy.enemyId !== 'string' || !enemy.enemyId || result.has(enemy.enemyId)) continue;
      const enemyId = enemy.enemyId.slice(0, 128);
      result.set(enemyId, {
        enemyId, x: finite(enemy.x, 0), y: finite(enemy.y, this.groundY), alive: enemy.alive !== false,
        objectiveDamagePerSecond: clamp(enemy.objectiveDamagePerSecond ?? 18, 0, 250),
      });
    }
    return [...result.values()].sort((left, right) => left.enemyId.localeCompare(right.enemyId));
  }

  private updateMovingPlatforms(dt: number): void {
    for (const hazard of this.hazards) {
      if (hazard.kind !== 'moving-platform') continue;
      hazard.x = round(hazard.x + 58 * hazard.direction * dt);
      if (hazard.x >= hazard.maxX) {
        hazard.x = hazard.maxX;
        hazard.direction = -1;
      } else if (hazard.x <= hazard.minX) {
        hazard.x = hazard.minX;
        hazard.direction = 1;
      }
    }
  }

  private updateHazards(
    dt: number,
    actors: readonly EncounterActorPosition[],
    enemies: readonly EncounterEnemyPosition[],
    result: EncounterUpdateResult,
  ): void {
    for (const hazard of this.hazards) {
      hazard.impactSeconds = round(Math.max(0, hazard.impactSeconds - dt), 1_000);
      if (hazard.kind === 'moving-platform') continue;
      hazard.timerSeconds = round(hazard.timerSeconds - dt, 1_000);

      if (hazard.phase === 'cooldown' && hazard.timerSeconds <= 0) {
        hazard.phase = 'telegraph';
        hazard.timerSeconds = hazard.kind === 'falling-rocks' ? 0.75 : 0.48;
        this.pushRuntimeEvent(result, 'hazard-telegraphed', hazard.id, hazard.baseX, hazard.baseY, hazard.telegraphSpriteId);
      } else if (hazard.phase === 'telegraph' && hazard.timerSeconds <= 0) {
        hazard.phase = 'active';
        hazard.timerSeconds = hazard.kind === 'falling-rocks' ? 0.66 : 0.16;
        if (hazard.kind === 'falling-rocks') {
          hazard.x = hazard.baseX;
          hazard.y = hazard.baseY - 320;
        } else {
          this.triggerHazard(hazard, actors, enemies, result);
        }
      } else if (hazard.phase === 'active') {
        if (hazard.kind === 'falling-rocks') {
          hazard.y = round(Math.min(hazard.baseY, hazard.y + 520 * dt));
          if (hazard.y >= hazard.baseY || hazard.timerSeconds <= 0) this.triggerHazard(hazard, actors, enemies, result);
        } else if (hazard.timerSeconds <= 0) {
          this.beginHazardCooldown(hazard);
        }
      }
    }
  }

  private triggerHazard(
    hazard: EncounterHazardState,
    actors: readonly EncounterActorPosition[],
    enemies: readonly EncounterEnemyPosition[],
    result: EncounterUpdateResult,
  ): void {
    const radius = hazard.kind === 'falling-rocks' ? 88 : 62;
    const playerAmount = hazard.kind === 'falling-rocks' ? 70 : 42;
    const enemyAmount = hazard.kind === 'falling-rocks' ? 100 : 64;
    const damageKind = hazard.kind === 'falling-rocks' ? 'falling-rock' : 'spike-trap';
    for (const actor of actors) {
      if (withinRadius(actor.x, actor.y, hazard.baseX, hazard.baseY, radius)) {
        this.pushDamage(result.playerDamage, hazard.id, actor.actorId, playerAmount, actor.x, actor.y, damageKind);
      }
    }
    for (const enemy of enemies) {
      if (enemy.alive !== false && withinRadius(enemy.x, enemy.y, hazard.baseX, hazard.baseY, radius)) {
        this.pushDamage(result.enemyDamage, hazard.id, enemy.enemyId, enemyAmount, enemy.x, enemy.y, damageKind);
      }
    }
    hazard.impactSeconds = 0.24;
    this.pushRuntimeEvent(result, 'hazard-triggered', hazard.id, hazard.baseX, hazard.baseY, hazard.impactSpriteId);
    this.beginHazardCooldown(hazard);
  }

  private beginHazardCooldown(hazard: EncounterHazardState): void {
    hazard.phase = 'cooldown';
    hazard.cycle++;
    const rng = new SeededRng(`${this.seed}:${this.room?.id}:${hazard.id}:${hazard.cycle}`);
    hazard.timerSeconds = round(2.2 + rng.nextFloat() * 1.8, 1_000);
  }

  private resolvePendingExplosions(
    actors: readonly EncounterActorPosition[],
    enemies: readonly EncounterEnemyPosition[],
    result: EncounterUpdateResult,
  ): void {
    const explosions = this.pendingExplosions.splice(0, ENCOUNTER_RUNTIME_LIMITS.maxPendingExplosions);
    for (const explosion of explosions) {
      for (const actor of actors) {
        if (withinRadius(actor.x, actor.y, explosion.x, explosion.y, explosion.radius)) {
          this.pushDamage(result.playerDamage, explosion.id, actor.actorId, explosion.playerDamage, actor.x, actor.y, 'barrel-explosion');
        }
      }
      for (const enemy of enemies) {
        if (enemy.alive !== false && withinRadius(enemy.x, enemy.y, explosion.x, explosion.y, explosion.radius)) {
          this.pushDamage(result.enemyDamage, explosion.id, enemy.enemyId, explosion.enemyDamage, enemy.x, enemy.y, 'barrel-explosion');
        }
      }
      this.pushRuntimeEvent(result, 'hazard-triggered', explosion.id, explosion.x, explosion.y, HAZARD_SPRITES['explosive-barrel'].impact);
    }
  }

  private updateObjective(
    dt: number,
    actors: readonly EncounterActorPosition[],
    enemies: readonly EncounterEnemyPosition[],
    context: EncounterUpdateContext,
    result: EncounterUpdateResult,
  ): void {
    const objective = this.room?.objective;
    if (!objective || this.objectiveStatus !== 'active') return;
    const deltaMs = Math.round(dt * 1_000);

    switch (objective.type) {
      case 'kill_all':
        this.updateKillAllObjective(enemies, context.spawnsSealed === true, result);
        break;
      case 'defend_relic':
        this.damageDefendTarget(objective, dt, enemies, result);
        if (this.objectiveStatus === 'active') this.tickDurationObjective(objective.durationMs, deltaMs, result);
        break;
      case 'escort':
        this.updateEscortObjective(objective, dt, actors, enemies, result);
        break;
      case 'survive':
        this.tickDurationObjective(objective.durationMs, deltaMs, result);
        break;
      case 'destroy_nests':
        this.updateDestroyNestsStatus();
        break;
      case 'timed_escape':
        this.updateTimedEscapeObjective(objective, deltaMs, actors, result);
        break;
    }
  }

  private updateKillAllObjective(
    enemies: readonly EncounterEnemyPosition[],
    sealed: boolean,
    result: EncounterUpdateResult,
  ): void {
    const newIds = enemies.map(enemy => enemy.enemyId).filter(id => !this.knownEnemyIds.includes(id));
    if (newIds.length) {
      this.knownEnemyIds = [...this.knownEnemyIds, ...newIds].sort().slice(0, ENCOUNTER_RUNTIME_LIMITS.maxEnemies);
      this.pushObjective(result, { type: 'enemy_spawned', enemyIds: newIds });
    }
    for (const enemy of enemies) {
      if (enemy.alive === false && this.knownEnemyIds.includes(enemy.enemyId) && !this.defeatedEnemyIds.includes(enemy.enemyId)) {
        this.defeatedEnemyIds.push(enemy.enemyId);
        this.defeatedEnemyIds.sort();
        this.pushObjective(result, { type: 'enemy_defeated', enemyId: enemy.enemyId });
      }
    }
    if (sealed && !this.spawnsSealed) {
      this.spawnsSealed = true;
      this.pushObjective(result, { type: 'spawns_sealed' });
    }
    if (this.spawnsSealed && this.knownEnemyIds.every(id => this.defeatedEnemyIds.includes(id))) this.objectiveStatus = 'succeeded';
  }

  private damageDefendTarget(
    objective: Extract<ObjectiveDefinition, { type: 'defend_relic' }>,
    dt: number,
    enemies: readonly EncounterEnemyPosition[],
    result: EncounterUpdateResult,
  ): void {
    const relic = this.worldObjects.find(object => object.id === objective.targetObjectId && object.active);
    if (!relic) {
      this.objectiveStatus = 'failed';
      return;
    }
    const attackers = enemies.filter(enemy => enemy.alive !== false && withinRadius(enemy.x, enemy.y, relic.x, relic.y, 104));
    const damage = clamp(
      attackers.reduce((sum, enemy) => sum + (enemy.objectiveDamagePerSecond ?? 18) * dt, 0),
      0,
      ENCOUNTER_RUNTIME_LIMITS.maxDamagePerEvent,
    );
    if (damage <= 0) return;
    const applied = round(Math.min(relic.hp, damage));
    relic.hp = round(Math.max(0, relic.hp - applied));
    this.pushDamage(result.worldDamage, 'enemy-objective-attack', relic.id, applied, relic.x, relic.y, 'objective-attack');
    this.pushObjective(result, { type: 'world_object_damaged', objectId: relic.id, damage: applied });
    if (relic.hp <= 0) {
      relic.active = false;
      this.pushObjective(result, { type: 'world_object_destroyed', objectId: relic.id });
      this.pushRuntimeEvent(result, 'world-object-destroyed', relic.id, relic.x, relic.y, relic.spriteId);
      this.objectiveStatus = 'failed';
    }
  }

  private updateEscortObjective(
    objective: Extract<ObjectiveDefinition, { type: 'escort' }>,
    dt: number,
    actors: readonly EncounterActorPosition[],
    enemies: readonly EncounterEnemyPosition[],
    result: EncounterUpdateResult,
  ): void {
    const escort = this.escort;
    if (!escort) return;
    const attackers = enemies.filter(enemy => enemy.alive !== false && withinRadius(enemy.x, enemy.y, escort.x, escort.y, 92));
    const damage = clamp(
      attackers.reduce((sum, enemy) => sum + (enemy.objectiveDamagePerSecond ?? 18) * dt, 0),
      0,
      ENCOUNTER_RUNTIME_LIMITS.maxDamagePerEvent,
    );
    if (damage > 0) {
      const applied = round(Math.min(escort.hp, damage));
      escort.hp = round(Math.max(0, escort.hp - applied));
      this.pushObjective(result, { type: 'escort_damaged', escortActorId: escort.actorId, damage: applied });
      this.pushDamage(result.worldDamage, 'enemy-objective-attack', escort.actorId, applied, escort.x, escort.y, 'objective-attack');
      if (escort.hp <= 0) this.objectiveStatus = 'failed';
    }
    if (this.objectiveStatus !== 'active') return;

    const guarded = actors.some(actor => withinRadius(actor.x, actor.y, escort.x, escort.y, 190));
    const blocked = enemies.some(enemy => enemy.alive !== false && withinRadius(enemy.x, enemy.y, escort.x, escort.y, 118));
    escort.moving = guarded && !blocked && escort.nextCheckpointIndex < escort.checkpointXs.length;
    if (!escort.moving) return;
    escort.x = round(Math.min(escort.checkpointXs[escort.nextCheckpointIndex], escort.x + 72 * dt));
    const checkpointX = escort.checkpointXs[escort.nextCheckpointIndex];
    if (escort.x < checkpointX) return;

    const checkpointId = objective.checkpointIds[escort.nextCheckpointIndex];
    escort.nextCheckpointIndex++;
    this.pushObjective(result, { type: 'escort_checkpoint_reached', escortActorId: escort.actorId, checkpointId });
    this.pushRuntimeEvent(result, 'escort-checkpoint', escort.actorId, escort.x, escort.y, OBJECTIVE_SPRITES['escort-npc'].active, checkpointId);
    if (escort.nextCheckpointIndex >= objective.checkpointIds.length) {
      escort.moving = false;
      this.objectiveStatus = 'succeeded';
    }
  }

  private tickDurationObjective(durationMs: number, deltaMs: number, result: EncounterUpdateResult): void {
    if (deltaMs <= 0) return;
    const remaining = Math.max(0, durationMs - this.objectiveElapsedMs);
    const applied = Math.min(deltaMs, remaining);
    if (applied <= 0) return;
    this.objectiveElapsedMs += applied;
    this.pushObjective(result, { type: 'tick', deltaMs: applied });
    if (this.objectiveElapsedMs >= durationMs) this.objectiveStatus = 'succeeded';
  }

  private updateDestroyNestsStatus(): void {
    const objective = this.room?.objective;
    if (objective?.type !== 'destroy_nests') return;
    if (objective.nestObjectIds.every(id => this.worldObjects.some(object => object.id === id && !object.active))) {
      this.objectiveStatus = 'succeeded';
    }
  }

  private updateTimedEscapeObjective(
    objective: Extract<ObjectiveDefinition, { type: 'timed_escape' }>,
    deltaMs: number,
    actors: readonly EncounterActorPosition[],
    result: EncounterUpdateResult,
  ): void {
    const ids = actors.map(actor => actor.actorId).sort();
    if (!sameIds(ids, this.activeActorIds)) {
      this.activeActorIds = ids;
      this.escapedActorIds = this.escapedActorIds.filter(id => ids.includes(id));
      this.pushObjective(result, { type: 'active_actors_changed', actorIds: ids });
    }
    const gate = this.worldObjects.find(object => object.id === objective.exitTriggerId && object.active);
    if (gate) {
      for (const actor of actors) {
        if (this.escapedActorIds.includes(actor.actorId) || !withinRadius(actor.x, actor.y, gate.x, gate.y, 92)) continue;
        this.escapedActorIds.push(actor.actorId);
        this.escapedActorIds.sort();
        this.pushObjective(result, { type: 'actor_escaped', actorId: actor.actorId, exitTriggerId: objective.exitTriggerId });
      }
    }
    const required = objective.participation === 'fixed_count'
      ? Math.max(1, objective.requiredCount ?? 1)
      : this.activeActorIds.length;
    if (required > 0 && this.escapedActorIds.length >= required) {
      this.objectiveStatus = 'succeeded';
      return;
    }
    if (deltaMs > 0) {
      const remaining = Math.max(0, objective.durationMs - this.objectiveElapsedMs);
      const applied = Math.min(deltaMs, remaining);
      if (applied > 0) {
        this.objectiveElapsedMs += applied;
        this.pushObjective(result, { type: 'tick', deltaMs: applied });
      }
      if (this.objectiveElapsedMs >= objective.durationMs) this.objectiveStatus = 'failed';
    }
  }

  private pushObjective(result: EncounterUpdateResult, event: ObjectiveEvent): void {
    boundedPush(result.objectiveEvents, event, ENCOUNTER_RUNTIME_LIMITS.maxObjectiveEventsPerCall);
  }

  private pushDamage(
    target: EncounterDamageEvent[],
    sourceId: string,
    targetId: string,
    amount: number,
    x: number,
    y: number,
    kind: EncounterDamageEvent['kind'],
  ): void {
    if (amount <= 0 || target.length >= ENCOUNTER_RUNTIME_LIMITS.maxDamageEventsPerTargetKind) return;
    target.push({
      sequence: ++this.eventSequence,
      sourceId,
      targetId,
      amount: round(clamp(amount, 0, ENCOUNTER_RUNTIME_LIMITS.maxDamagePerEvent)),
      x: round(x),
      y: round(y),
      kind,
    });
  }

  private pushRuntimeEvent(
    result: EncounterUpdateResult,
    type: EncounterRuntimeEvent['type'],
    sourceId: string,
    x: number,
    y: number,
    spriteId: GameplaySpriteId,
    targetId?: string,
  ): void {
    if (result.events.length >= ENCOUNTER_RUNTIME_LIMITS.maxRuntimeEventsPerCall) return;
    result.events.push({
      sequence: ++this.eventSequence,
      type,
      sourceId,
      x: round(x),
      y: round(y),
      spriteId,
      ...(targetId ? { targetId } : {}),
    });
  }

  private warmConfiguredSprites(): void {
    const ids: GameplaySpriteId[] = [];
    for (const object of this.worldObjects) {
      ids.push(object.spriteId);
      if (object.secondarySpriteId) ids.push(object.secondarySpriteId);
    }
    for (const hazard of this.hazards) ids.push(hazard.bodySpriteId, hazard.telegraphSpriteId, hazard.impactSpriteId);
    for (const prop of this.routeProps) ids.push(prop.spriteId);
    if (this.escort) ids.push(this.escort.idleSpriteId, this.escort.walkSpriteId);
    const objective = this.room?.objective ? objectiveSprite(this.room.objective) : null;
    if (objective) ids.push(objective);
    this.renderer.warm([...new Set(ids)]);
  }

}

export function createDungeonEncounterRuntime(renderer: GameplaySpriteRenderer): DungeonEncounterRuntime {
  return new DungeonEncounterRuntime(renderer);
}
