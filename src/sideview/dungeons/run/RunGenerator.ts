import { SeededRng, normalizeSeed } from './SeededRng';
import { validateObjectiveDefinition } from './ObjectiveRegistry';
import {
  BranchRuleDefinition,
  DungeonRoomExit,
  DungeonRoomNode,
  DungeonRunContent,
  GeneratedDungeonRun,
  isManifestSpriteId,
  RoomKind,
  RoomPoolDefinition,
  RoomSpriteDefinition,
  RoomTemplateDefinition,
  RunBlueprintDefinition,
  RUN_LIMITS,
} from './RunTypes';

export interface GenerateDungeonRunInput {
  blueprint: RunBlueprintDefinition;
  content: DungeonRunContent;
  seed: number | string;
  runId?: string;
}

function cloneData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function integerRange(min: number, max: number, label: string, limit: number): void {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < min || max > limit) {
    throw new Error(`${label} must be an integer range within 0..${limit}`);
  }
}

function validateSprites(templateId: string, sprites: RoomSpriteDefinition): void {
  const ids = [
    sprites.groundSpriteId,
    sprites.entryDoorSpriteId,
    sprites.exitDoorSpriteId,
    sprites.lockedExitSpriteId,
    sprites.secretExitSpriteId,
    sprites.objectiveMarkerSpriteId,
    sprites.roomIconSpriteId,
    ...sprites.backgroundLayers.map(layer => layer.spriteId),
    ...sprites.foregroundLayers.map(layer => layer.spriteId),
  ];
  if (ids.some(id => !isManifestSpriteId(id))) throw new Error(`Room ${templateId} contains a path or invalid sprite id`);
  for (const layer of [...sprites.backgroundLayers, ...sprites.foregroundLayers]) {
    if (!Number.isFinite(layer.depth) || !Number.isInteger(layer.parallaxPermille)
      || layer.parallaxPermille < 0 || layer.parallaxPermille > 1_000) {
      throw new Error(`Room ${templateId} has an invalid sprite layer`);
    }
  }
}

function validateTemplate(template: RoomTemplateDefinition): void {
  if (!template.id || !template.sceneId) throw new Error('Room templates require stable id and sceneId');
  if (!Number.isSafeInteger(template.weight) || template.weight < 1) throw new Error(`Room ${template.id} has invalid weight`);
  if (!Number.isInteger(template.maxPerRun) || template.maxPerRun < 1 || template.maxPerRun > RUN_LIMITS.maxRooms) {
    throw new Error(`Room ${template.id} has invalid maxPerRun`);
  }
  validateSprites(template.id, template.sprites);
  if (template.enemyGroupIds.length > RUN_LIMITS.maxObjectiveEntities || template.worldObjectIds.length > RUN_LIMITS.maxObjectiveEntities) {
    throw new Error(`Room ${template.id} exceeds content reference limits`);
  }
  if (template.choices.length > RUN_LIMITS.maxRoomChoices) throw new Error(`Room ${template.id} has too many choices`);
  const choiceIds = new Set<string>();
  for (const choice of template.choices) {
    if (!choice.id || choiceIds.has(choice.id) || !choice.titleKey || !choice.descriptionKey
      || !isManifestSpriteId(choice.iconSpriteId) || choice.effectIds.length > 8
      || choice.effectIds.some(effectId => !effectId || effectId.length > 128)) {
      throw new Error(`Room ${template.id} has an invalid choice`);
    }
    choiceIds.add(choice.id);
  }
  if (template.completion.type === 'objective' && !template.objective) throw new Error(`Room ${template.id} needs an objective`);
  if ((template.completion.type === 'party_choice' || template.completion.type === 'actor_choices') && !template.choices.length) {
    throw new Error(`Room ${template.id} needs authored choices`);
  }
  if (template.completion.type === 'actor_choices'
    && (!Number.isInteger(template.completion.requiredActorCount) || template.completion.requiredActorCount < 1
      || template.completion.requiredActorCount > RUN_LIMITS.maxActors)) {
    throw new Error(`Room ${template.id} has invalid requiredActorCount`);
  }
  if (template.objective) {
    validateObjectiveDefinition(template.objective);
    const requiredObjects = template.objective.type === 'defend_relic'
      ? [template.objective.targetObjectId]
      : template.objective.type === 'destroy_nests'
        ? template.objective.nestObjectIds
        : template.objective.type === 'timed_escape'
          ? [template.objective.exitTriggerId]
          : [];
    if (requiredObjects.some(id => !template.worldObjectIds.includes(id))) {
      throw new Error(`Room ${template.id} objective references a missing world object`);
    }
  }
}

function poolById(pools: RoomPoolDefinition[]): Map<string, RoomPoolDefinition> {
  const map = new Map<string, RoomPoolDefinition>();
  for (const pool of pools) {
    if (!pool.id || map.has(pool.id) || !pool.templateIds.length) throw new Error(`Invalid or duplicate room pool ${pool.id}`);
    map.set(pool.id, pool);
  }
  return map;
}

export function validateRunDefinition(blueprint: RunBlueprintDefinition, content: DungeonRunContent): void {
  if (!blueprint.id || !blueprint.dungeonId || !blueprint.contentVersion) throw new Error('Run blueprint identity is incomplete');
  if (content.roomTemplates.length === 0 || content.roomTemplates.length > RUN_LIMITS.maxRooms * 4) throw new Error('Room template catalog is empty or unbounded');
  const templates = new Map<string, RoomTemplateDefinition>();
  for (const template of content.roomTemplates) {
    if (templates.has(template.id)) throw new Error(`Duplicate room template ${template.id}`);
    validateTemplate(template);
    templates.set(template.id, template);
  }
  const pools = poolById(content.roomPools);
  for (const pool of pools.values()) {
    for (const templateId of pool.templateIds) if (!templates.has(templateId)) throw new Error(`Pool ${pool.id} references unknown room ${templateId}`);
  }
  integerRange(blueprint.criticalPath.minRooms, blueprint.criticalPath.maxRooms, 'criticalPath rooms', RUN_LIMITS.maxCriticalRooms);
  if (blueprint.criticalPath.minRooms < 2 || blueprint.criticalPath.requiredKinds.length > blueprint.criticalPath.minRooms - 2) {
    throw new Error('Critical path cannot fit its required room kinds');
  }
  for (const poolId of [blueprint.criticalPath.entryPoolId, blueprint.criticalPath.middlePoolId, blueprint.criticalPath.finalePoolId]) {
    if (!pools.has(poolId)) throw new Error(`Blueprint references unknown pool ${poolId}`);
  }
  const middleKinds = new Set((pools.get(blueprint.criticalPath.middlePoolId)?.templateIds || []).map(id => templates.get(id)?.kind));
  for (const kind of blueprint.criticalPath.requiredKinds) if (!middleKinds.has(kind)) throw new Error(`Middle pool cannot provide required ${kind} room`);

  if (blueprint.branches.length > RUN_LIMITS.maxBranches) throw new Error('Too many branch rules');
  let maximumRooms = blueprint.criticalPath.maxRooms;
  let maximumBranches = 0;
  for (const rule of blueprint.branches) {
    validateBranchRule(rule, pools, templates);
    maximumRooms += rule.maxCount * rule.maxLength;
    maximumBranches += rule.maxCount;
  }
  if (maximumRooms > RUN_LIMITS.maxRooms || maximumBranches > RUN_LIMITS.maxBranches) throw new Error('Blueprint can exceed run graph limits');
}

function validateBranchRule(rule: BranchRuleDefinition, pools: Map<string, RoomPoolDefinition>, templates: Map<string, RoomTemplateDefinition>): void {
  if (!rule.id || !pools.has(rule.poolId)) throw new Error(`Branch ${rule.id} references an unknown pool`);
  integerRange(rule.minCount, rule.maxCount, `branch ${rule.id} count`, RUN_LIMITS.maxBranches);
  integerRange(rule.minLength, rule.maxLength, `branch ${rule.id} length`, RUN_LIMITS.maxBranchLength);
  if (rule.minLength < 1 || rule.requiredKinds.length > rule.maxLength) throw new Error(`Branch ${rule.id} cannot fit required kinds`);
  integerRange(rule.minSourceDepth, rule.maxSourceDepth, `branch ${rule.id} source depth`, RUN_LIMITS.maxCriticalRooms - 2);
  if (!Number.isInteger(rule.chancePermille) || rule.chancePermille < 0 || rule.chancePermille > 1_000) throw new Error(`Branch ${rule.id} has invalid chance`);
  const kinds = new Set((pools.get(rule.poolId)?.templateIds || []).map(id => templates.get(id)?.kind));
  for (const kind of rule.requiredKinds) if (!kinds.has(kind)) throw new Error(`Branch ${rule.id} pool cannot provide ${kind}`);
}

function weightedTemplate(
  rng: SeededRng,
  pool: RoomPoolDefinition,
  templates: Map<string, RoomTemplateDefinition>,
  usage: Map<string, number>,
  requiredKind?: RoomKind,
): RoomTemplateDefinition {
  const candidates = pool.templateIds
    .map(id => templates.get(id)!)
    .filter(template => (!requiredKind || template.kind === requiredKind) && (usage.get(template.id) || 0) < template.maxPerRun)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!candidates.length) throw new Error(`Room pool ${pool.id} exhausted${requiredKind ? ` for ${requiredKind}` : ''}`);
  const total = candidates.reduce((sum, template) => sum + template.weight, 0);
  let roll = rng.int(1, total);
  let selected = candidates[0];
  for (const candidate of candidates) {
    selected = candidate;
    roll -= candidate.weight;
    if (roll <= 0) break;
  }
  usage.set(selected.id, (usage.get(selected.id) || 0) + 1);
  return selected;
}

export function generateDungeonRun(input: GenerateDungeonRunInput): GeneratedDungeonRun {
  validateRunDefinition(input.blueprint, input.content);
  const seed = normalizeSeed(input.seed);
  const runId = input.runId || `run:${input.blueprint.id}:${seed.toString(16).padStart(8, '0')}`;
  const rng = new SeededRng(`${seed}:${input.blueprint.id}`);
  const templates = new Map(input.content.roomTemplates.map(template => [template.id, template]));
  const pools = poolById(input.content.roomPools);
  const usage = new Map<string, number>();
  const nodes: DungeonRoomNode[] = [];
  const exits: DungeonRoomExit[] = [];

  const addNode = (template: RoomTemplateDefinition, access: 'normal' | 'secret', depth: number): DungeonRoomNode => {
    if (nodes.length >= RUN_LIMITS.maxRooms) throw new Error('Generated room graph exceeded room limit');
    const id = `room:${String(nodes.length).padStart(2, '0')}`;
    const node: DungeonRoomNode = {
      id,
      templateId: template.id,
      kind: template.kind,
      access,
      depth,
      sceneId: `${template.sceneId}:${id}`,
      sprites: cloneData(template.sprites),
      enemyGroupIds: [...template.enemyGroupIds],
      worldObjectIds: [...template.worldObjectIds],
      choices: cloneData(template.choices),
      completion: cloneData(template.completion),
      tags: [...template.tags],
      ...(template.objective ? { objective: cloneData(template.objective) } : {}),
    };
    nodes.push(node);
    return node;
  };
  const addExit = (from: DungeonRoomNode, to: DungeonRoomNode, kind: DungeonRoomExit['kind']): void => {
    const fromCount = exits.filter(exit => exit.fromRoomId === from.id).length;
    if (fromCount >= RUN_LIMITS.maxExitsPerRoom) throw new Error(`Room ${from.id} exceeded exit limit`);
    exits.push({
      id: `exit:${String(exits.length).padStart(2, '0')}`,
      fromRoomId: from.id,
      toRoomId: to.id,
      kind,
      doorSpriteId: kind === 'secret' ? from.sprites.secretExitSpriteId : from.sprites.exitDoorSpriteId,
      lockedSpriteId: from.sprites.lockedExitSpriteId,
    });
  };

  const criticalCount = rng.int(input.blueprint.criticalPath.minRooms, input.blueprint.criticalPath.maxRooms);
  const middleSlots: Array<RoomKind | undefined> = [
    ...input.blueprint.criticalPath.requiredKinds,
    ...Array.from({ length: criticalCount - 2 - input.blueprint.criticalPath.requiredKinds.length }, () => undefined),
  ];
  const shuffledSlots = rng.shuffle(middleSlots);
  const criticalNodes: DungeonRoomNode[] = [];
  criticalNodes.push(addNode(weightedTemplate(rng, pools.get(input.blueprint.criticalPath.entryPoolId)!, templates, usage), 'normal', 0));
  for (let index = 0; index < shuffledSlots.length; index++) {
    criticalNodes.push(addNode(weightedTemplate(rng, pools.get(input.blueprint.criticalPath.middlePoolId)!, templates, usage, shuffledSlots[index]), 'normal', index + 1));
  }
  criticalNodes.push(addNode(weightedTemplate(rng, pools.get(input.blueprint.criticalPath.finalePoolId)!, templates, usage), 'normal', criticalCount - 1));
  for (let index = 0; index < criticalNodes.length - 1; index++) addExit(criticalNodes[index], criticalNodes[index + 1], 'critical');

  for (const rule of input.blueprint.branches) {
    let count = rule.minCount;
    for (let index = rule.minCount; index < rule.maxCount; index++) if (rng.chancePermille(rule.chancePermille)) count++;
    for (let branchIndex = 0; branchIndex < count; branchIndex++) {
      const sourceDepths = criticalNodes
        .map((_node, depth) => depth)
        .filter(depth => depth >= rule.minSourceDepth && depth <= Math.min(rule.maxSourceDepth, criticalNodes.length - 2)
          && exits.filter(exit => exit.fromRoomId === criticalNodes[depth].id).length < RUN_LIMITS.maxExitsPerRoom);
      if (!sourceDepths.length) throw new Error(`Branch ${rule.id} has no valid attachment point`);
      const sourceDepth = rng.pick(sourceDepths);
      const minimumLength = Math.max(rule.minLength, rule.requiredKinds.length);
      const length = rng.int(minimumLength, rule.maxLength);
      const slots: Array<RoomKind | undefined> = rng.shuffle([
        ...rule.requiredKinds,
        ...Array.from({ length: length - rule.requiredKinds.length }, () => undefined),
      ]);
      const branchNodes: DungeonRoomNode[] = slots.map((kind, index) => addNode(
        weightedTemplate(rng, pools.get(rule.poolId)!, templates, usage, kind),
        rule.access === 'secret' && index === 0 ? 'secret' : 'normal',
        sourceDepth + (index + 1) / (length + 1),
      ));
      addExit(criticalNodes[sourceDepth], branchNodes[0], rule.access === 'secret' ? 'secret' : 'branch');
      for (let index = 0; index < branchNodes.length - 1; index++) addExit(branchNodes[index], branchNodes[index + 1], 'branch');
      addExit(branchNodes[branchNodes.length - 1], criticalNodes[sourceDepth + 1], 'rejoin');
    }
  }

  return {
    schemaVersion: 1,
    contentVersion: input.blueprint.contentVersion,
    runId,
    dungeonId: input.blueprint.dungeonId,
    seed,
    graph: {
      entryRoomId: criticalNodes[0].id,
      finaleRoomId: criticalNodes[criticalNodes.length - 1].id,
      nodes,
      exits,
    },
  };
}
