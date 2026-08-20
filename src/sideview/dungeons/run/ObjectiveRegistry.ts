import {
  ObjectiveDefinition,
  ObjectiveEvent,
  ObjectiveState,
  RUN_LIMITS,
  ActorId,
} from './RunTypes';

export interface ObjectiveInitContext {
  activeActorIds: ActorId[];
}

function finitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than zero`);
}

function uniqueIds(values: readonly string[], limit: number, label: string): string[] {
  const result = [...new Set(values)].sort();
  if (result.some(value => !value || value.length > 128)) throw new Error(`${label} contains an invalid id`);
  if (result.length > limit) throw new Error(`${label} exceeds the limit of ${limit}`);
  return result;
}

export function validateObjectiveDefinition(definition: ObjectiveDefinition): void {
  if (!definition.id || definition.id.length > 128) throw new Error('Objective id is invalid');
  switch (definition.type) {
    case 'kill_all':
      uniqueIds(definition.spawnGroupIds, RUN_LIMITS.maxObjectiveEntities, 'spawnGroupIds');
      break;
    case 'defend_relic':
      finitePositive(definition.durationMs, 'durationMs');
      finitePositive(definition.maxHp, 'maxHp');
      if (!definition.targetObjectId) throw new Error('defend_relic requires targetObjectId');
      uniqueIds(definition.spawnGroupIds, RUN_LIMITS.maxObjectiveEntities, 'spawnGroupIds');
      break;
    case 'escort':
      finitePositive(definition.maxHp, 'maxHp');
      if (!definition.escortActorId) throw new Error('escort requires escortActorId');
      if (uniqueIds(definition.checkpointIds, RUN_LIMITS.maxObjectiveEntities, 'checkpointIds').length === 0) {
        throw new Error('escort requires at least one checkpoint');
      }
      uniqueIds(definition.spawnGroupIds, RUN_LIMITS.maxObjectiveEntities, 'spawnGroupIds');
      break;
    case 'survive':
      finitePositive(definition.durationMs, 'durationMs');
      uniqueIds(definition.spawnGroupIds, RUN_LIMITS.maxObjectiveEntities, 'spawnGroupIds');
      break;
    case 'destroy_nests':
      if (uniqueIds(definition.nestObjectIds, RUN_LIMITS.maxObjectiveEntities, 'nestObjectIds').length === 0) {
        throw new Error('destroy_nests requires at least one nest');
      }
      uniqueIds(definition.spawnGroupIds, RUN_LIMITS.maxObjectiveEntities, 'spawnGroupIds');
      break;
    case 'timed_escape':
      finitePositive(definition.durationMs, 'durationMs');
      if (!definition.exitTriggerId) throw new Error('timed_escape requires exitTriggerId');
      if (definition.participation === 'fixed_count'
        && (!Number.isInteger(definition.requiredCount) || (definition.requiredCount || 0) < 1
          || (definition.requiredCount || 0) > RUN_LIMITS.maxActors)) {
        throw new Error(`timed_escape requiredCount must be 1..${RUN_LIMITS.maxActors}`);
      }
      break;
  }
}
export function createObjectiveState(
  definition: ObjectiveDefinition,
  context: ObjectiveInitContext,
): ObjectiveState {
  validateObjectiveDefinition(definition);
  const actors = uniqueIds(context.activeActorIds, RUN_LIMITS.maxActors, 'activeActorIds');
  switch (definition.type) {
    case 'kill_all':
      return { id: definition.id, type: definition.type, status: 'active', spawnedEnemyIds: [], defeatedEnemyIds: [], spawnsSealed: false };
    case 'defend_relic':
      return { id: definition.id, type: definition.type, status: 'active', targetObjectId: definition.targetObjectId, targetHp: definition.maxHp, elapsedMs: 0 };
    case 'escort':
      return { id: definition.id, type: definition.type, status: 'active', escortActorId: definition.escortActorId, hp: definition.maxHp, nextCheckpointIndex: 0, reachedCheckpointIds: [] };
    case 'survive':
      return { id: definition.id, type: definition.type, status: 'active', elapsedMs: 0 };
    case 'destroy_nests':
      return { id: definition.id, type: definition.type, status: 'active', destroyedNestIds: [] };
    case 'timed_escape':
      return { id: definition.id, type: definition.type, status: 'active', elapsedMs: 0, activeActorIds: actors, escapedActorIds: [] };
  }
}

function validateTick(deltaMs: number): void {
  if (!Number.isFinite(deltaMs) || deltaMs < 0 || deltaMs > RUN_LIMITS.maxTickMs) {
    throw new Error(`Objective tick must be between 0 and ${RUN_LIMITS.maxTickMs}ms`);
  }
}

function escapeComplete(definition: Extract<ObjectiveDefinition, { type: 'timed_escape' }>, state: Extract<ObjectiveState, { type: 'timed_escape' }>): boolean {
  if (definition.participation === 'fixed_count') return state.escapedActorIds.length >= (definition.requiredCount || 1);
  return state.activeActorIds.length > 0 && state.activeActorIds.every(id => state.escapedActorIds.includes(id));
}

export function reduceObjective(
  definition: ObjectiveDefinition,
  state: ObjectiveState,
  event: ObjectiveEvent,
): ObjectiveState {
  if (definition.type !== state.type || definition.id !== state.id) throw new Error('Objective state does not match its definition');
  if (state.status !== 'active') return state;

  switch (definition.type) {
    case 'kill_all': {
      const current = state as Extract<ObjectiveState, { type: 'kill_all' }>;
      let spawned = current.spawnedEnemyIds;
      let defeated = current.defeatedEnemyIds;
      let sealed = current.spawnsSealed;
      if (event.type === 'enemy_spawned') {
        const incoming = uniqueIds(event.enemyIds, RUN_LIMITS.maxObjectiveEntities, 'enemyIds');
        const newIds = incoming.filter(id => !spawned.includes(id));
        if (sealed && newIds.length) throw new Error('Cannot register enemies after spawns are sealed');
        spawned = uniqueIds([...spawned, ...incoming], RUN_LIMITS.maxObjectiveEntities, 'spawnedEnemyIds');
      } else if (event.type === 'enemy_defeated' && spawned.includes(event.enemyId)) {
        defeated = uniqueIds([...defeated, event.enemyId], RUN_LIMITS.maxObjectiveEntities, 'defeatedEnemyIds');
      } else if (event.type === 'spawns_sealed') {
        sealed = true;
      }
      const succeeded = sealed && spawned.every(id => defeated.includes(id));
      return { ...current, spawnedEnemyIds: spawned, defeatedEnemyIds: defeated, spawnsSealed: sealed, status: succeeded ? 'succeeded' : 'active' };
    }
    case 'defend_relic': {
      const current = state as Extract<ObjectiveState, { type: 'defend_relic' }>;
      let hp = current.targetHp;
      let elapsedMs = current.elapsedMs;
      if (event.type === 'tick') {
        validateTick(event.deltaMs);
        elapsedMs = Math.min(definition.durationMs, elapsedMs + event.deltaMs);
      } else if (event.type === 'world_object_damaged' && event.objectId === definition.targetObjectId) {
        finitePositive(event.damage, 'damage');
        hp = Math.max(0, hp - event.damage);
      } else if (event.type === 'world_object_destroyed' && event.objectId === definition.targetObjectId) {
        hp = 0;
      }
      return { ...current, targetHp: hp, elapsedMs, status: hp <= 0 ? 'failed' : elapsedMs >= definition.durationMs ? 'succeeded' : 'active' };
    }
    case 'escort': {
      const current = state as Extract<ObjectiveState, { type: 'escort' }>;
      let hp = current.hp;
      let next = current.nextCheckpointIndex;
      let reached = current.reachedCheckpointIds;
      if (event.type === 'escort_damaged' && event.escortActorId === definition.escortActorId) {
        finitePositive(event.damage, 'damage');
        hp = Math.max(0, hp - event.damage);
      } else if (event.type === 'escort_checkpoint_reached' && event.escortActorId === definition.escortActorId
        && event.checkpointId === definition.checkpointIds[next]) {
        reached = [...reached, event.checkpointId];
        next++;
      }
      return { ...current, hp, nextCheckpointIndex: next, reachedCheckpointIds: reached, status: hp <= 0 ? 'failed' : next >= definition.checkpointIds.length ? 'succeeded' : 'active' };
    }
    case 'survive': {
      const current = state as Extract<ObjectiveState, { type: 'survive' }>;
      if (event.type !== 'tick') return current;
      validateTick(event.deltaMs);
      const elapsedMs = Math.min(definition.durationMs, current.elapsedMs + event.deltaMs);
      return { ...current, elapsedMs, status: elapsedMs >= definition.durationMs ? 'succeeded' : 'active' };
    }
    case 'destroy_nests': {
      const current = state as Extract<ObjectiveState, { type: 'destroy_nests' }>;
      if (event.type !== 'world_object_destroyed' || !definition.nestObjectIds.includes(event.objectId)) return current;
      const destroyedNestIds = uniqueIds([...current.destroyedNestIds, event.objectId], RUN_LIMITS.maxObjectiveEntities, 'destroyedNestIds');
      return { ...current, destroyedNestIds, status: definition.nestObjectIds.every(id => destroyedNestIds.includes(id)) ? 'succeeded' : 'active' };
    }
    case 'timed_escape': {
      const current = state as Extract<ObjectiveState, { type: 'timed_escape' }>;
      let elapsedMs = current.elapsedMs;
      let activeActorIds = current.activeActorIds;
      let escapedActorIds = current.escapedActorIds;
      if (event.type === 'tick') {
        validateTick(event.deltaMs);
        elapsedMs = Math.min(definition.durationMs, elapsedMs + event.deltaMs);
      } else if (event.type === 'active_actors_changed') {
        activeActorIds = uniqueIds(event.actorIds, RUN_LIMITS.maxActors, 'activeActorIds');
      } else if (event.type === 'actor_escaped' && event.exitTriggerId === definition.exitTriggerId && activeActorIds.includes(event.actorId)) {
        escapedActorIds = uniqueIds([...escapedActorIds, event.actorId], RUN_LIMITS.maxActors, 'escapedActorIds');
      }
      const next = { ...current, elapsedMs, activeActorIds, escapedActorIds };
      const complete = escapeComplete(definition, next);
      return { ...next, status: complete ? 'succeeded' : elapsedMs >= definition.durationMs ? 'failed' : 'active' };
    }
  }
}
