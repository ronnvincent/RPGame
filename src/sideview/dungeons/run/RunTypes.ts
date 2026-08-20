/**
 * Serializable contracts for deterministic dungeon runs.
 *
 * Runtime integrations should resolve every `*SpriteId` through the curated
 * asset manifest. A sprite id is deliberately not a URL or filesystem path.
 */

export const DUNGEON_RUN_SCHEMA_VERSION = 1 as const;

export const RUN_LIMITS = Object.freeze({
  maxActors: 8,
  maxRooms: 32,
  maxCriticalRooms: 16,
  maxBranches: 8,
  maxBranchLength: 4,
  maxExitsPerRoom: 4,
  maxObjectiveEntities: 64,
  maxRoomChoices: 12,
  maxRelicsPerActor: 24,
  maxRelicOfferSize: 4,
  maxRelicOffers: 32,
  maxTickMs: 1_000,
});

export type DungeonRunSchemaVersion = typeof DUNGEON_RUN_SCHEMA_VERSION;
export type RunId = string;
export type ActorId = string;
export type RoomId = string;
export type RoomTemplateId = string;
export type ExitId = string;
export type SpriteId = string;
export type ObjectiveId = string;
export type RelicId = string;

/** Manifest ids are namespaced tokens, never paths, URLs, or filenames. */
export function isManifestSpriteId(value: string): boolean {
  return /^(?!.*(?:png|webp|jpe?g|gif|svg)$)[a-z][a-z0-9]*(?:[:._-][a-z0-9]+)*$/i.test(value)
    && !/[\\/]/.test(value);
}

export type RoomKind =
  | 'combat'
  | 'objective'
  | 'elite'
  | 'miniboss'
  | 'event'
  | 'treasure'
  | 'shrine'
  | 'boss'
  | 'escape';

export type RoomAccess = 'normal' | 'secret';
export type RunStatus = 'active' | 'completed' | 'failed';
export type RoomStatus = 'available' | 'active' | 'completed' | 'failed';
export type ObjectiveStatus = 'active' | 'succeeded' | 'failed';

export interface SpriteLayerDefinition {
  spriteId: SpriteId;
  depth: number;
  parallaxPermille: number;
}

/** All room presentation is asset-backed and referenced by manifest id. */
export interface RoomSpriteDefinition {
  backgroundLayers: SpriteLayerDefinition[];
  groundSpriteId: SpriteId;
  foregroundLayers: SpriteLayerDefinition[];
  entryDoorSpriteId: SpriteId;
  exitDoorSpriteId: SpriteId;
  lockedExitSpriteId: SpriteId;
  secretExitSpriteId: SpriteId;
  objectiveMarkerSpriteId: SpriteId;
  roomIconSpriteId: SpriteId;
}

export interface KillAllObjectiveDefinition {
  id: ObjectiveId;
  type: 'kill_all';
  spawnGroupIds: string[];
}

export interface DefendRelicObjectiveDefinition {
  id: ObjectiveId;
  type: 'defend_relic';
  targetObjectId: string;
  durationMs: number;
  maxHp: number;
  spawnGroupIds: string[];
}

export interface EscortObjectiveDefinition {
  id: ObjectiveId;
  type: 'escort';
  escortActorId: string;
  checkpointIds: string[];
  maxHp: number;
  spawnGroupIds: string[];
}

export interface SurviveObjectiveDefinition {
  id: ObjectiveId;
  type: 'survive';
  durationMs: number;
  spawnGroupIds: string[];
}

export interface DestroyNestsObjectiveDefinition {
  id: ObjectiveId;
  type: 'destroy_nests';
  nestObjectIds: string[];
  spawnGroupIds: string[];
}

export interface TimedEscapeObjectiveDefinition {
  id: ObjectiveId;
  type: 'timed_escape';
  durationMs: number;
  exitTriggerId: string;
  participation: 'all_active' | 'fixed_count';
  requiredCount?: number;
}

export type ObjectiveDefinition =
  | KillAllObjectiveDefinition
  | DefendRelicObjectiveDefinition
  | EscortObjectiveDefinition
  | SurviveObjectiveDefinition
  | DestroyNestsObjectiveDefinition
  | TimedEscapeObjectiveDefinition;

interface ObjectiveStateBase {
  id: ObjectiveId;
  status: ObjectiveStatus;
}

export interface KillAllObjectiveState extends ObjectiveStateBase {
  type: 'kill_all';
  spawnedEnemyIds: string[];
  defeatedEnemyIds: string[];
  spawnsSealed: boolean;
}

export interface DefendRelicObjectiveState extends ObjectiveStateBase {
  type: 'defend_relic';
  targetObjectId: string;
  targetHp: number;
  elapsedMs: number;
}

export interface EscortObjectiveState extends ObjectiveStateBase {
  type: 'escort';
  escortActorId: string;
  hp: number;
  nextCheckpointIndex: number;
  reachedCheckpointIds: string[];
}

export interface SurviveObjectiveState extends ObjectiveStateBase {
  type: 'survive';
  elapsedMs: number;
}

export interface DestroyNestsObjectiveState extends ObjectiveStateBase {
  type: 'destroy_nests';
  destroyedNestIds: string[];
}

export interface TimedEscapeObjectiveState extends ObjectiveStateBase {
  type: 'timed_escape';
  elapsedMs: number;
  activeActorIds: ActorId[];
  escapedActorIds: ActorId[];
}

export type ObjectiveState =
  | KillAllObjectiveState
  | DefendRelicObjectiveState
  | EscortObjectiveState
  | SurviveObjectiveState
  | DestroyNestsObjectiveState
  | TimedEscapeObjectiveState;

export type ObjectiveEvent =
  | { type: 'tick'; deltaMs: number }
  | { type: 'enemy_spawned'; enemyIds: string[] }
  | { type: 'enemy_defeated'; enemyId: string }
  | { type: 'spawns_sealed' }
  | { type: 'world_object_damaged'; objectId: string; damage: number }
  | { type: 'world_object_destroyed'; objectId: string }
  | { type: 'escort_damaged'; escortActorId: string; damage: number }
  | { type: 'escort_checkpoint_reached'; escortActorId: string; checkpointId: string }
  | { type: 'actor_escaped'; actorId: ActorId; exitTriggerId: string }
  | { type: 'active_actors_changed'; actorIds: ActorId[] };

export interface RoomChoiceDefinition {
  id: string;
  titleKey: string;
  descriptionKey: string;
  iconSpriteId: SpriteId;
  effectIds: string[];
}

export type RoomCompletionDefinition =
  | { type: 'objective' }
  | { type: 'party_choice' }
  | { type: 'actor_choices'; requiredActorCount: number }
  | { type: 'on_enter' };

export interface RoomTemplateDefinition {
  id: RoomTemplateId;
  kind: RoomKind;
  weight: number;
  maxPerRun: number;
  sceneId: string;
  sprites: RoomSpriteDefinition;
  enemyGroupIds: string[];
  worldObjectIds: string[];
  objective?: ObjectiveDefinition;
  choices: RoomChoiceDefinition[];
  completion: RoomCompletionDefinition;
  tags: string[];
}

export interface RoomPoolDefinition {
  id: string;
  templateIds: RoomTemplateId[];
}

export interface CriticalPathRule {
  minRooms: number;
  maxRooms: number;
  entryPoolId: string;
  middlePoolId: string;
  finalePoolId: string;
  requiredKinds: RoomKind[];
}

export interface BranchRuleDefinition {
  id: string;
  poolId: string;
  minCount: number;
  maxCount: number;
  minLength: number;
  maxLength: number;
  minSourceDepth: number;
  maxSourceDepth: number;
  chancePermille: number;
  access: RoomAccess;
  requiredKinds: RoomKind[];
}

export interface RunBlueprintDefinition {
  id: string;
  dungeonId: string;
  contentVersion: string;
  criticalPath: CriticalPathRule;
  branches: BranchRuleDefinition[];
}

export interface DungeonRunContent {
  roomTemplates: RoomTemplateDefinition[];
  roomPools: RoomPoolDefinition[];
}

export interface DungeonRoomNode {
  id: RoomId;
  templateId: RoomTemplateId;
  kind: RoomKind;
  access: RoomAccess;
  depth: number;
  sceneId: string;
  sprites: RoomSpriteDefinition;
  enemyGroupIds: string[];
  worldObjectIds: string[];
  objective?: ObjectiveDefinition;
  choices: RoomChoiceDefinition[];
  completion: RoomCompletionDefinition;
  tags: string[];
}

export type ExitKind = 'critical' | 'branch' | 'rejoin' | 'secret';

export interface DungeonRoomExit {
  id: ExitId;
  fromRoomId: RoomId;
  toRoomId: RoomId;
  kind: ExitKind;
  doorSpriteId: SpriteId;
  lockedSpriteId: SpriteId;
}

export interface DungeonRoomGraph {
  entryRoomId: RoomId;
  finaleRoomId: RoomId;
  nodes: DungeonRoomNode[];
  exits: DungeonRoomExit[];
}

export interface GeneratedDungeonRun {
  schemaVersion: DungeonRunSchemaVersion;
  contentVersion: string;
  runId: RunId;
  dungeonId: string;
  seed: number;
  graph: DungeonRoomGraph;
}

export interface RoomChoiceSelection {
  actorId: ActorId;
  choiceId: string;
}

export interface RoomRuntimeState {
  roomId: RoomId;
  status: RoomStatus;
  objectiveState?: ObjectiveState;
  choiceSelections: RoomChoiceSelection[];
}

export type RelicRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export type RelicEffectDefinition =
  | { type: 'flat_stat'; statId: string; amount: number }
  | { type: 'multiply_stat'; statId: string; multiplierPermille: number }
  | { type: 'status_combo'; comboId: string; powerPermille: number }
  | { type: 'event_hook'; eventId: string; effectId: string; chancePermille: number; cooldownMs: number };

export interface RelicDefinition {
  id: RelicId;
  nameKey: string;
  descriptionKey: string;
  iconSpriteId: SpriteId;
  rarity: RelicRarity;
  offerWeight: number;
  maxStacks: number;
  tags: string[];
  incompatibleRelicIds: RelicId[];
  effects: RelicEffectDefinition[];
}

export interface RelicOfferState {
  id: string;
  actorId: ActorId;
  sourceId: string;
  relicIds: RelicId[];
  chosenRelicId?: RelicId;
}

export interface DungeonRunState {
  schemaVersion: DungeonRunSchemaVersion;
  contentVersion: string;
  runId: RunId;
  dungeonId: string;
  seed: number;
  authorityEpoch: number;
  revision: number;
  lastCommandSequence: number;
  elapsedMs: number;
  status: RunStatus;
  currentRoomId: RoomId;
  graph: DungeonRoomGraph;
  activeActorIds: ActorId[];
  visitedRoomIds: RoomId[];
  revealedSecretRoomIds: RoomId[];
  roomStates: Record<RoomId, RoomRuntimeState>;
  relicsByActorId: Record<ActorId, RelicId[]>;
  relicOffers: RelicOfferState[];
  failureReason?: string;
}

interface DungeonRunCommandBase {
  commandId: string;
  authorityEpoch: number;
  sequence: number;
}

export type DungeonRunCommand =
  | (DungeonRunCommandBase & { type: 'advance_time'; deltaMs: number })
  | (DungeonRunCommandBase & { type: 'objective_event'; event: ObjectiveEvent })
  | (DungeonRunCommandBase & { type: 'choose_exit'; exitId: ExitId })
  | (DungeonRunCommandBase & { type: 'reveal_secret'; exitId: ExitId })
  | (DungeonRunCommandBase & { type: 'resolve_room_choice'; actorId: ActorId; choiceId: string })
  | (DungeonRunCommandBase & { type: 'create_relic_offer'; actorId: ActorId; sourceId: string; count: number })
  | (DungeonRunCommandBase & { type: 'choose_relic'; actorId: ActorId; offerId: string; relicId: RelicId })
  | (DungeonRunCommandBase & { type: 'set_active_actors'; actorIds: ActorId[] })
  | (DungeonRunCommandBase & { type: 'fail_run'; reason: string });

export type DungeonRunEffect =
  | { type: 'room_entered'; roomId: RoomId; sceneId: string }
  | { type: 'room_completed'; roomId: RoomId }
  | { type: 'secret_revealed'; roomId: RoomId; exitId: ExitId }
  | { type: 'choice_resolved'; roomId: RoomId; actorId: ActorId; choiceId: string; effectIds: string[] }
  | { type: 'relic_offer_created'; offer: RelicOfferState }
  | { type: 'relic_granted'; actorId: ActorId; relicId: RelicId }
  | { type: 'run_completed' }
  | { type: 'run_failed'; reason: string };

export interface DungeonRunTransition {
  accepted: boolean;
  reason?: string;
  state: DungeonRunState;
  effects: DungeonRunEffect[];
}
