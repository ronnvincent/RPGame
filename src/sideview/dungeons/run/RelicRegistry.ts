import { deriveSeed, SeededRng, stableHash } from './SeededRng';
import {
  ActorId,
  isManifestSpriteId,
  RelicDefinition,
  RelicId,
  RelicOfferState,
  RUN_LIMITS,
} from './RunTypes';

export interface CreateRelicOfferInput {
  runSeed: number;
  actorId: ActorId;
  sourceId: string;
  count: number;
  ownedRelicIds: RelicId[];
}

export class RelicRegistry {
  private readonly definitions: RelicDefinition[];
  private readonly byId: ReadonlyMap<RelicId, RelicDefinition>;

  constructor(definitions: readonly RelicDefinition[]) {
    if (!definitions.length) throw new Error('Relic registry cannot be empty');
    const sorted = [...definitions].sort((a, b) => a.id.localeCompare(b.id));
    const ids = new Set<string>();
    for (const definition of sorted) {
      if (!definition.id || ids.has(definition.id)) throw new Error(`Duplicate or invalid relic id: ${definition.id}`);
      ids.add(definition.id);
      if (!isManifestSpriteId(definition.iconSpriteId)) throw new Error(`Relic ${definition.id} uses a non-manifest sprite id`);
      if (!Number.isSafeInteger(definition.offerWeight) || definition.offerWeight < 1) throw new Error(`Relic ${definition.id} has invalid offerWeight`);
      if (!Number.isInteger(definition.maxStacks) || definition.maxStacks < 1 || definition.maxStacks > RUN_LIMITS.maxRelicsPerActor) {
        throw new Error(`Relic ${definition.id} has invalid maxStacks`);
      }
      for (const effect of definition.effects) {
        for (const value of Object.values(effect)) {
          if (typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Relic ${definition.id} has a non-finite effect value`);
        }
      }
    }
    for (const definition of sorted) {
      for (const incompatibleId of definition.incompatibleRelicIds) {
        if (!ids.has(incompatibleId)) throw new Error(`Relic ${definition.id} references unknown incompatible relic ${incompatibleId}`);
      }
    }
    this.definitions = sorted;
    this.byId = new Map(sorted.map(definition => [definition.id, definition]));
  }

  get(id: RelicId): RelicDefinition | undefined {
    return this.byId.get(id);
  }

  list(): RelicDefinition[] {
    return this.definitions.map(definition => ({ ...definition, tags: [...definition.tags], incompatibleRelicIds: [...definition.incompatibleRelicIds], effects: definition.effects.map(effect => ({ ...effect })) }));
  }

  canGrant(ownedRelicIds: readonly RelicId[], relicId: RelicId): boolean {
    const definition = this.byId.get(relicId);
    if (!definition) return false;
    if (ownedRelicIds.filter(id => id === relicId).length >= definition.maxStacks) return false;
    return !ownedRelicIds.some(ownedId => {
      const owned = this.byId.get(ownedId);
      return definition.incompatibleRelicIds.includes(ownedId) || Boolean(owned?.incompatibleRelicIds.includes(relicId));
    });
  }

  createOffer(input: CreateRelicOfferInput): RelicOfferState {
    if (!Number.isInteger(input.count) || input.count < 1 || input.count > RUN_LIMITS.maxRelicOfferSize) {
      throw new Error(`Relic offer count must be 1..${RUN_LIMITS.maxRelicOfferSize}`);
    }
    const rng = new SeededRng(deriveSeed(input.runSeed, `relic:${input.actorId}:${input.sourceId}`));
    const candidates = this.definitions.filter(definition => this.canGrant(input.ownedRelicIds, definition.id));
    const relicIds: RelicId[] = [];
    while (candidates.length && relicIds.length < input.count) {
      const totalWeight = candidates.reduce((sum, definition) => sum + definition.offerWeight, 0);
      let roll = rng.int(1, totalWeight);
      let selectedIndex = 0;
      for (; selectedIndex < candidates.length; selectedIndex++) {
        roll -= candidates[selectedIndex].offerWeight;
        if (roll <= 0) break;
      }
      relicIds.push(candidates[selectedIndex].id);
      candidates.splice(selectedIndex, 1);
    }
    if (!relicIds.length) throw new Error(`No eligible relics for actor ${input.actorId}`);
    const hash = stableHash(`${input.runSeed}:${input.actorId}:${input.sourceId}`).toString(16).padStart(8, '0');
    return { id: `offer:${hash}`, actorId: input.actorId, sourceId: input.sourceId, relicIds };
  }

  grant(ownedRelicIds: readonly RelicId[], relicId: RelicId): RelicId[] {
    if (!this.canGrant(ownedRelicIds, relicId)) throw new Error(`Relic ${relicId} cannot be granted`);
    if (ownedRelicIds.length >= RUN_LIMITS.maxRelicsPerActor) throw new Error('Actor relic limit reached');
    return [...ownedRelicIds, relicId];
  }
}
