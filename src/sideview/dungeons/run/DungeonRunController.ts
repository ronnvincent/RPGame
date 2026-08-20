import { createObjectiveState, reduceObjective } from './ObjectiveRegistry';
import { RelicRegistry } from './RelicRegistry';
import {
  ActorId,
  DungeonRoomNode,
  DungeonRunCommand,
  DungeonRunEffect,
  DungeonRunState,
  DungeonRunTransition,
  GeneratedDungeonRun,
  RoomRuntimeState,
  RUN_LIMITS,
} from './RunTypes';

function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function actorIds(values: readonly ActorId[]): ActorId[] {
  const result = [...new Set(values)].sort();
  if (!result.length || result.length > RUN_LIMITS.maxActors || result.some(id => !id || id.length > 128)) {
    throw new Error(`Active actor roster must contain 1..${RUN_LIMITS.maxActors} stable ids`);
  }
  return result;
}

function nodeFor(state: DungeonRunState, roomId = state.currentRoomId): DungeonRoomNode {
  const node = state.graph.nodes.find(candidate => candidate.id === roomId);
  if (!node) throw new Error(`Unknown room ${roomId}`);
  return node;
}

function runtimeForNode(node: DungeonRoomNode, activeActorIds: ActorId[]): RoomRuntimeState {
  const objectiveState = node.objective ? createObjectiveState(node.objective, { activeActorIds }) : undefined;
  return {
    roomId: node.id,
    status: node.completion.type === 'on_enter' ? 'completed' : 'active',
    choiceSelections: [],
    ...(objectiveState ? { objectiveState } : {}),
  };
}

export function createDungeonRunState(
  generated: GeneratedDungeonRun,
  activeActors: ActorId[],
  authorityEpoch = 1,
): DungeonRunState {
  if (!Number.isSafeInteger(authorityEpoch) || authorityEpoch < 1) throw new Error('authorityEpoch must be a positive integer');
  const activeActorIds = actorIds(activeActors);
  const entry = generated.graph.nodes.find(node => node.id === generated.graph.entryRoomId);
  if (!entry) throw new Error('Generated run has no entry room');
  const relicsByActorId: Record<ActorId, string[]> = {};
  for (const actorId of activeActorIds) relicsByActorId[actorId] = [];
  return {
    schemaVersion: generated.schemaVersion,
    contentVersion: generated.contentVersion,
    runId: generated.runId,
    dungeonId: generated.dungeonId,
    seed: generated.seed,
    authorityEpoch,
    revision: 0,
    lastCommandSequence: 0,
    elapsedMs: 0,
    status: 'active',
    currentRoomId: entry.id,
    graph: cloneData(generated.graph),
    activeActorIds,
    visitedRoomIds: [entry.id],
    revealedSecretRoomIds: [],
    roomStates: { [entry.id]: runtimeForNode(entry, activeActorIds) },
    relicsByActorId,
    relicOffers: [],
  };
}

function reject(state: DungeonRunState, reason: string): DungeonRunTransition {
  return { accepted: false, reason, state: cloneData(state), effects: [] };
}

function completeCurrentRoom(state: DungeonRunState, effects: DungeonRunEffect[]): void {
  const runtime = state.roomStates[state.currentRoomId];
  if (!runtime) return;
  if (runtime.status !== 'completed') {
    runtime.status = 'completed';
    effects.push({ type: 'room_completed', roomId: state.currentRoomId });
  }
  if (state.currentRoomId === state.graph.finaleRoomId && state.status === 'active') {
    state.status = 'completed';
    effects.push({ type: 'run_completed' });
  }
}

function failCurrentRun(state: DungeonRunState, reason: string, effects: DungeonRunEffect[]): void {
  state.status = 'failed';
  state.failureReason = reason;
  const runtime = state.roomStates[state.currentRoomId];
  if (runtime) runtime.status = 'failed';
  effects.push({ type: 'run_failed', reason });
}

function settleObjective(state: DungeonRunState, effects: DungeonRunEffect[]): void {
  const runtime = state.roomStates[state.currentRoomId];
  if (!runtime?.objectiveState) return;
  if (runtime.objectiveState.status === 'succeeded') completeCurrentRoom(state, effects);
  if (runtime.objectiveState.status === 'failed') failCurrentRun(state, `objective:${runtime.objectiveState.id}`, effects);
}

export function reduceDungeonRun(
  current: DungeonRunState,
  command: DungeonRunCommand,
  relicRegistry: RelicRegistry,
): DungeonRunTransition {
  if (!command.commandId || command.commandId.length > 128) return reject(current, 'invalid_command_id');
  if (command.authorityEpoch !== current.authorityEpoch) return reject(current, 'stale_authority_epoch');
  if (command.sequence !== current.lastCommandSequence + 1) return reject(current, 'out_of_order_sequence');
  if (current.status !== 'active') return reject(current, 'run_not_active');

  const state = cloneData(current);
  const effects: DungeonRunEffect[] = [];
  try {
    const node = nodeFor(state);
    const runtime = state.roomStates[state.currentRoomId];
    if (!runtime) throw new Error('Current room runtime is missing');

    switch (command.type) {
      case 'advance_time': {
        if (!Number.isFinite(command.deltaMs) || command.deltaMs < 0 || command.deltaMs > RUN_LIMITS.maxTickMs) {
          throw new Error(`advance_time must be 0..${RUN_LIMITS.maxTickMs}ms`);
        }
        state.elapsedMs += command.deltaMs;
        if (node.objective && runtime.objectiveState?.status === 'active') {
          runtime.objectiveState = reduceObjective(node.objective, runtime.objectiveState, { type: 'tick', deltaMs: command.deltaMs });
          settleObjective(state, effects);
        }
        break;
      }
      case 'objective_event': {
        if (!node.objective || !runtime.objectiveState || runtime.status !== 'active') throw new Error('Room has no active objective');
        if (command.event.type === 'tick') throw new Error('Use advance_time for objective ticks');
        runtime.objectiveState = reduceObjective(node.objective, runtime.objectiveState, command.event);
        settleObjective(state, effects);
        break;
      }
      case 'choose_exit': {
        if (runtime.status !== 'completed') throw new Error('Room must be completed before choosing an exit');
        const exit = state.graph.exits.find(candidate => candidate.id === command.exitId && candidate.fromRoomId === node.id);
        if (!exit) throw new Error('Exit is not available from the current room');
        const target = nodeFor(state, exit.toRoomId);
        if (target.access === 'secret' && !state.revealedSecretRoomIds.includes(target.id)) throw new Error('Secret exit has not been revealed');
        state.currentRoomId = target.id;
        if (!state.visitedRoomIds.includes(target.id)) state.visitedRoomIds.push(target.id);
        state.roomStates[target.id] = state.roomStates[target.id] || runtimeForNode(target, state.activeActorIds);
        effects.push({ type: 'room_entered', roomId: target.id, sceneId: target.sceneId });
        if (state.roomStates[target.id].status === 'completed') completeCurrentRoom(state, effects);
        break;
      }
      case 'reveal_secret': {
        const exit = state.graph.exits.find(candidate => candidate.id === command.exitId && candidate.fromRoomId === node.id && candidate.kind === 'secret');
        if (!exit) throw new Error('No secret exit matches this room');
        const target = nodeFor(state, exit.toRoomId);
        if (target.access !== 'secret') throw new Error('Secret exit target is not authored as secret');
        if (!state.revealedSecretRoomIds.includes(target.id)) {
          state.revealedSecretRoomIds.push(target.id);
          state.revealedSecretRoomIds.sort();
          effects.push({ type: 'secret_revealed', roomId: target.id, exitId: exit.id });
        }
        break;
      }
      case 'resolve_room_choice': {
        if (runtime.status !== 'active' || (node.completion.type !== 'party_choice' && node.completion.type !== 'actor_choices')) {
          throw new Error('Room does not accept choices');
        }
        if (!state.activeActorIds.includes(command.actorId)) throw new Error('Actor is not active in this run');
        const choice = node.choices.find(candidate => candidate.id === command.choiceId);
        if (!choice) throw new Error('Unknown room choice');
        if (runtime.choiceSelections.some(selection => selection.actorId === command.actorId)
          || (node.completion.type === 'party_choice' && runtime.choiceSelections.length > 0)) {
          throw new Error('Choice already resolved');
        }
        runtime.choiceSelections.push({ actorId: command.actorId, choiceId: choice.id });
        effects.push({ type: 'choice_resolved', roomId: node.id, actorId: command.actorId, choiceId: choice.id, effectIds: [...choice.effectIds] });
        if (node.completion.type === 'party_choice' || runtime.choiceSelections.length >= node.completion.requiredActorCount) {
          completeCurrentRoom(state, effects);
        }
        break;
      }
      case 'create_relic_offer': {
        if (!state.activeActorIds.includes(command.actorId)) throw new Error('Actor is not active in this run');
        if (state.relicOffers.length >= RUN_LIMITS.maxRelicOffers) throw new Error('Run relic offer limit reached');
        if (state.relicOffers.some(offer => offer.actorId === command.actorId && offer.sourceId === command.sourceId)) {
          throw new Error('Relic offer already exists for this source');
        }
        const offer = relicRegistry.createOffer({
          runSeed: state.seed,
          actorId: command.actorId,
          sourceId: command.sourceId,
          count: command.count,
          ownedRelicIds: state.relicsByActorId[command.actorId] || [],
        });
        state.relicOffers.push(offer);
        effects.push({ type: 'relic_offer_created', offer: cloneData(offer) });
        break;
      }
      case 'choose_relic': {
        const offer = state.relicOffers.find(candidate => candidate.id === command.offerId && candidate.actorId === command.actorId);
        if (!offer || offer.chosenRelicId) throw new Error('Relic offer is unavailable');
        if (!offer.relicIds.includes(command.relicId)) throw new Error('Relic was not offered');
        const owned = state.relicsByActorId[command.actorId] || [];
        state.relicsByActorId[command.actorId] = relicRegistry.grant(owned, command.relicId);
        offer.chosenRelicId = command.relicId;
        effects.push({ type: 'relic_granted', actorId: command.actorId, relicId: command.relicId });
        break;
      }
      case 'set_active_actors': {
        state.activeActorIds = actorIds(command.actorIds);
        for (const actorId of state.activeActorIds) state.relicsByActorId[actorId] ||= [];
        if (node.objective?.type === 'timed_escape' && runtime.objectiveState?.type === 'timed_escape') {
          runtime.objectiveState = reduceObjective(node.objective, runtime.objectiveState, { type: 'active_actors_changed', actorIds: state.activeActorIds });
          settleObjective(state, effects);
        }
        break;
      }
      case 'fail_run': {
        if (!command.reason || command.reason.length > 128) throw new Error('Invalid run failure reason');
        failCurrentRun(state, command.reason, effects);
        break;
      }
    }
  } catch (error) {
    return reject(current, error instanceof Error ? error.message : 'invalid_command');
  }

  state.lastCommandSequence = command.sequence;
  state.revision++;
  return { accepted: true, state: cloneData(state), effects: cloneData(effects) };
}

export class DungeonRunController {
  private state: DungeonRunState;
  private readonly relicRegistry: RelicRegistry;

  constructor(initialState: DungeonRunState, relicRegistry: RelicRegistry) {
    this.state = cloneData(initialState);
    this.relicRegistry = relicRegistry;
  }

  static create(
    generated: GeneratedDungeonRun,
    activeActorIds: ActorId[],
    relicRegistry: RelicRegistry,
    authorityEpoch = 1,
  ): DungeonRunController {
    return new DungeonRunController(createDungeonRunState(generated, activeActorIds, authorityEpoch), relicRegistry);
  }

  getSnapshot(): DungeonRunState {
    return cloneData(this.state);
  }

  /**
   * Read-only hot-path view for the owning game loop. Never send this object
   * over the network or retain it across dispatches; those boundaries must use
   * getSnapshot(). Avoiding a JSON clone here keeps HUD reads out of the 60 Hz
   * allocation path while dispatch() remains the only writer.
   */
  getStateView(): Readonly<DungeonRunState> {
    return this.state;
  }

  dispatch(command: DungeonRunCommand): DungeonRunTransition {
    const transition = reduceDungeonRun(this.state, command, this.relicRegistry);
    if (transition.accepted) this.state = cloneData(transition.state);
    return transition;
  }
}
