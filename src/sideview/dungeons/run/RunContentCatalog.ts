/**
 * Authored dungeon-run catalogue.
 *
 * Every visual field is a `GameplaySpriteManifest` id. There are intentionally
 * no image paths, terrain atlas references, colors, emojis, or draw callbacks.
 */
import {
  COMBAT_FEEDBACK_SPRITES,
  ELEMENT_REACTION_SPRITES,
  ENEMY_ROLE_SPRITES,
  EXPLORATION_SPRITES,
  GameplaySpriteId,
  HAZARD_SPRITES,
  OBJECTIVE_SPRITES,
} from '../../assets/GameplaySpriteManifest';
import {
  DungeonRunContent,
  RelicDefinition,
  RoomSpriteDefinition,
  RoomTemplateDefinition,
  RunBlueprintDefinition,
} from './RunTypes';

const BASE_ROOM_SPRITES: RoomSpriteDefinition = {
  backgroundLayers: [],
  groundSpriteId: HAZARD_SPRITES['moving-platform'].body,
  foregroundLayers: [],
  entryDoorSpriteId: EXPLORATION_SPRITES['branching-route'],
  exitDoorSpriteId: EXPLORATION_SPRITES['branching-route'],
  lockedExitSpriteId: EXPLORATION_SPRITES['secret-room'],
  secretExitSpriteId: EXPLORATION_SPRITES['secret-room'],
  objectiveMarkerSpriteId: COMBAT_FEEDBACK_SPRITES['area-telegraph'],
  roomIconSpriteId: EXPLORATION_SPRITES['branching-route'],
};

function roomSprites(marker: GameplaySpriteId, icon: GameplaySpriteId = marker): RoomSpriteDefinition {
  return { ...BASE_ROOM_SPRITES, objectiveMarkerSpriteId: marker, roomIconSpriteId: icon };
}

const ROOM_TEMPLATES: RoomTemplateDefinition[] = [
  {
    id: 'run-entry-skirmish', kind: 'combat', weight: 100, maxPerRun: 1, sceneId: 'run-entry',
    sprites: roomSprites(COMBAT_FEEDBACK_SPRITES['melee-telegraph'], ENEMY_ROLE_SPRITES.assassin.idle),
    enemyGroupIds: ['encounter.entry-skirmish'], worldObjectIds: [], choices: [], tags: ['entry', 'formation'],
    objective: { id: 'objective.kill-entry', type: 'kill_all', spawnGroupIds: ['encounter.entry-skirmish'] },
    completion: { type: 'objective' },
  },
  {
    id: 'run-defend-relic', kind: 'objective', weight: 100, maxPerRun: 1, sceneId: 'run-defend-relic',
    sprites: roomSprites(OBJECTIVE_SPRITES['defend-relic'].active, OBJECTIVE_SPRITES['defend-relic'].primary),
    enemyGroupIds: ['encounter.relic-siege'], worldObjectIds: ['object.ancient-relic'], choices: [], tags: ['defend', 'waves'],
    objective: {
      id: 'objective.defend-relic', type: 'defend_relic', targetObjectId: 'object.ancient-relic',
      durationMs: 45_000, maxHp: 1_200, spawnGroupIds: ['encounter.relic-siege'],
    },
    completion: { type: 'objective' },
  },
  {
    id: 'run-escort-sage', kind: 'objective', weight: 100, maxPerRun: 1, sceneId: 'run-escort-sage',
    sprites: roomSprites(OBJECTIVE_SPRITES['escort-npc'].active, OBJECTIVE_SPRITES['escort-npc'].primary),
    enemyGroupIds: ['encounter.escort-ambush'], worldObjectIds: ['checkpoint.escort-a', 'checkpoint.escort-b', 'checkpoint.escort-c'],
    choices: [], tags: ['escort', 'ambush'],
    objective: {
      id: 'objective.escort-sage', type: 'escort', escortActorId: 'actor.escort-sage', maxHp: 900,
      checkpointIds: ['checkpoint.escort-a', 'checkpoint.escort-b', 'checkpoint.escort-c'],
      spawnGroupIds: ['encounter.escort-ambush'],
    },
    completion: { type: 'objective' },
  },
  {
    id: 'run-survive-ward', kind: 'objective', weight: 100, maxPerRun: 1, sceneId: 'run-survive-ward',
    sprites: roomSprites(OBJECTIVE_SPRITES['survive-waves'].active, OBJECTIVE_SPRITES['survive-waves'].primary),
    enemyGroupIds: ['encounter.survival-waves'], worldObjectIds: ['object.survival-ward'], choices: [], tags: ['survive', 'waves'],
    objective: { id: 'objective.survive-ward', type: 'survive', durationMs: 60_000, spawnGroupIds: ['encounter.survival-waves'] },
    completion: { type: 'objective' },
  },
  {
    id: 'run-destroy-nests', kind: 'objective', weight: 100, maxPerRun: 1, sceneId: 'run-destroy-nests',
    sprites: roomSprites(OBJECTIVE_SPRITES['destroy-nests'].active, OBJECTIVE_SPRITES['destroy-nests'].primary),
    enemyGroupIds: ['encounter.nest-defenders'], worldObjectIds: ['object.nest-a', 'object.nest-b', 'object.nest-c'],
    choices: [], tags: ['destroy', 'summoners'],
    objective: {
      id: 'objective.destroy-nests', type: 'destroy_nests',
      nestObjectIds: ['object.nest-a', 'object.nest-b', 'object.nest-c'], spawnGroupIds: ['encounter.nest-defenders'],
    },
    completion: { type: 'objective' },
  },
  {
    id: 'run-timed-escape', kind: 'escape', weight: 100, maxPerRun: 1, sceneId: 'run-timed-escape',
    sprites: roomSprites(OBJECTIVE_SPRITES['timed-escape'].active, OBJECTIVE_SPRITES['timed-escape'].primary),
    enemyGroupIds: ['encounter.escape-pursuit'], worldObjectIds: ['trigger.escape-gate'], choices: [], tags: ['escape', 'timed'],
    objective: {
      id: 'objective.timed-escape', type: 'timed_escape', durationMs: 35_000,
      exitTriggerId: 'trigger.escape-gate', participation: 'all_active',
    },
    completion: { type: 'objective' },
  },
  {
    id: 'run-elite-formation', kind: 'elite', weight: 100, maxPerRun: 1, sceneId: 'run-elite-formation',
    sprites: roomSprites('elite.bulwark', ENEMY_ROLE_SPRITES['shield-tank'].idle),
    enemyGroupIds: ['encounter.elite-formation'], worldObjectIds: [], choices: [], tags: ['elite', 'guard-break'],
    objective: { id: 'objective.kill-elite', type: 'kill_all', spawnGroupIds: ['encounter.elite-formation'] },
    completion: { type: 'objective' },
  },
  {
    id: 'run-miniboss-arena', kind: 'miniboss', weight: 100, maxPerRun: 1, sceneId: 'run-miniboss-arena',
    sprites: roomSprites('miniboss.enrage', ENEMY_ROLE_SPRITES.summoner.idle),
    enemyGroupIds: ['encounter.miniboss'], worldObjectIds: [], choices: [], tags: ['miniboss', 'phase-mechanics'],
    objective: { id: 'objective.kill-miniboss', type: 'kill_all', spawnGroupIds: ['encounter.miniboss'] },
    completion: { type: 'objective' },
  },
  {
    id: 'run-boss-sanctum', kind: 'boss', weight: 100, maxPerRun: 1, sceneId: 'run-boss-sanctum',
    sprites: roomSprites('miniboss.nova', ENEMY_ROLE_SPRITES.summoner.idle),
    enemyGroupIds: ['encounter.run-boss'], worldObjectIds: [], choices: [], tags: ['boss', 'multi-phase'],
    objective: { id: 'objective.kill-boss', type: 'kill_all', spawnGroupIds: ['encounter.run-boss'] },
    completion: { type: 'objective' },
  },
  {
    id: 'run-event-well', kind: 'event', weight: 100, maxPerRun: 2, sceneId: 'run-event-well',
    sprites: roomSprites(EXPLORATION_SPRITES.event), enemyGroupIds: [], worldObjectIds: ['object.event-well'], tags: ['event'],
    choices: [
      { id: 'event.drink', titleKey: 'run.event.well.drink.title', descriptionKey: 'run.event.well.drink.description', iconSpriteId: ELEMENT_REACTION_SPRITES['curse-lifesteal'].payoff, effectIds: ['effect.restore-party', 'effect.apply-curse-risk'] },
      { id: 'event.leave', titleKey: 'run.event.well.leave.title', descriptionKey: 'run.event.well.leave.description', iconSpriteId: EXPLORATION_SPRITES.event, effectIds: [] },
    ],
    completion: { type: 'party_choice' },
  },
  {
    id: 'run-treasure-vault', kind: 'treasure', weight: 100, maxPerRun: 2, sceneId: 'run-treasure-vault',
    sprites: roomSprites(EXPLORATION_SPRITES.treasure), enemyGroupIds: [], worldObjectIds: ['object.treasure-chest'], tags: ['treasure'],
    choices: [
      { id: 'treasure.open', titleKey: 'run.treasure.open.title', descriptionKey: 'run.treasure.open.description', iconSpriteId: EXPLORATION_SPRITES.treasure, effectIds: ['effect.roll-treasure'] },
    ],
    completion: { type: 'party_choice' },
  },
  {
    id: 'run-risk-shrine', kind: 'shrine', weight: 100, maxPerRun: 2, sceneId: 'run-risk-shrine',
    sprites: roomSprites(EXPLORATION_SPRITES['risk-reward-shrine']), enemyGroupIds: [], worldObjectIds: ['object.risk-shrine'], tags: ['shrine', 'risk-reward'],
    choices: [
      { id: 'shrine.power', titleKey: 'run.shrine.power.title', descriptionKey: 'run.shrine.power.description', iconSpriteId: EXPLORATION_SPRITES['relic-choice'], effectIds: ['effect.offer-relic', 'effect.raise-elite-risk'] },
      { id: 'shrine.safety', titleKey: 'run.shrine.safety.title', descriptionKey: 'run.shrine.safety.description', iconSpriteId: OBJECTIVE_SPRITES['defend-relic'].active, effectIds: ['effect.restore-party'] },
    ],
    completion: { type: 'party_choice' },
  },
];
export const DUNGEON_RUN_CONTENT: DungeonRunContent = {
  roomTemplates: ROOM_TEMPLATES,
  roomPools: [
    { id: 'pool.entry', templateIds: ['run-entry-skirmish'] },
    {
      id: 'pool.middle',
      templateIds: [
        'run-defend-relic', 'run-escort-sage', 'run-survive-ward', 'run-destroy-nests',
        'run-timed-escape', 'run-elite-formation', 'run-miniboss-arena',
      ],
    },
    { id: 'pool.finale', templateIds: ['run-boss-sanctum'] },
    { id: 'pool.event', templateIds: ['run-event-well'] },
    { id: 'pool.treasure', templateIds: ['run-treasure-vault'] },
    { id: 'pool.shrine', templateIds: ['run-risk-shrine'] },
    { id: 'pool.secret', templateIds: ['run-event-well', 'run-treasure-vault', 'run-risk-shrine'] },
  ],
};

export const DEFAULT_DUNGEON_RUN_BLUEPRINT: RunBlueprintDefinition = {
  id: 'sideview-rpg-run-v1',
  dungeonId: 'authored-sideview-run',
  contentVersion: '1.0.0',
  criticalPath: {
    minRooms: 7,
    maxRooms: 8,
    entryPoolId: 'pool.entry',
    middlePoolId: 'pool.middle',
    finalePoolId: 'pool.finale',
    requiredKinds: ['objective', 'elite', 'miniboss', 'escape'],
  },
  branches: [
    {
      id: 'branch.event', poolId: 'pool.event', minCount: 1, maxCount: 1, minLength: 1, maxLength: 1,
      minSourceDepth: 1, maxSourceDepth: 5, chancePermille: 1_000, access: 'normal', requiredKinds: ['event'],
    },
    {
      id: 'branch.treasure', poolId: 'pool.treasure', minCount: 1, maxCount: 1, minLength: 1, maxLength: 1,
      minSourceDepth: 1, maxSourceDepth: 5, chancePermille: 1_000, access: 'normal', requiredKinds: ['treasure'],
    },
    {
      id: 'branch.shrine', poolId: 'pool.shrine', minCount: 1, maxCount: 1, minLength: 1, maxLength: 1,
      minSourceDepth: 1, maxSourceDepth: 5, chancePermille: 1_000, access: 'normal', requiredKinds: ['shrine'],
    },
    {
      id: 'branch.secret', poolId: 'pool.secret', minCount: 1, maxCount: 1, minLength: 1, maxLength: 1,
      minSourceDepth: 1, maxSourceDepth: 5, chancePermille: 1_000, access: 'secret', requiredKinds: [],
    },
  ],
};

export const RUN_RELIC_DEFINITIONS: RelicDefinition[] = [
  {
    id: 'relic.storm-conduit', nameKey: 'run.relic.storm-conduit.name', descriptionKey: 'run.relic.storm-conduit.description',
    iconSpriteId: ELEMENT_REACTION_SPRITES['wet-lightning-chain'].payoff, rarity: 'rare', offerWeight: 28, maxStacks: 1,
    tags: ['lightning', 'combo'], incompatibleRelicIds: [], effects: [{ type: 'status_combo', comboId: 'wet-lightning-chain', powerPermille: 350 }],
  },
  {
    id: 'relic.ember-heart', nameKey: 'run.relic.ember-heart.name', descriptionKey: 'run.relic.ember-heart.description',
    iconSpriteId: ELEMENT_REACTION_SPRITES['burn-explosion'].payoff, rarity: 'rare', offerWeight: 28, maxStacks: 1,
    tags: ['fire', 'combo'], incompatibleRelicIds: [], effects: [{ type: 'status_combo', comboId: 'burn-explosion', powerPermille: 350 }],
  },
  {
    id: 'relic.glacier-shard', nameKey: 'run.relic.glacier-shard.name', descriptionKey: 'run.relic.glacier-shard.description',
    iconSpriteId: ELEMENT_REACTION_SPRITES['freeze-shatter'].payoff, rarity: 'rare', offerWeight: 28, maxStacks: 1,
    tags: ['ice', 'combo'], incompatibleRelicIds: [], effects: [{ type: 'status_combo', comboId: 'freeze-shatter', powerPermille: 350 }],
  },
  {
    id: 'relic.blood-oath', nameKey: 'run.relic.blood-oath.name', descriptionKey: 'run.relic.blood-oath.description',
    iconSpriteId: ELEMENT_REACTION_SPRITES['curse-lifesteal'].payoff, rarity: 'rare', offerWeight: 28, maxStacks: 1,
    tags: ['curse', 'combo'], incompatibleRelicIds: [], effects: [{ type: 'status_combo', comboId: 'curse-lifesteal', powerPermille: 300 }],
  },
  {
    id: 'relic.guardian-sigil', nameKey: 'run.relic.guardian-sigil.name', descriptionKey: 'run.relic.guardian-sigil.description',
    iconSpriteId: COMBAT_FEEDBACK_SPRITES['guard-break'], rarity: 'uncommon', offerWeight: 55, maxStacks: 3,
    tags: ['guard'], incompatibleRelicIds: ['relic.glass-edge'], effects: [{ type: 'flat_stat', statId: 'guard-capacity', amount: 18 }],
  },
  {
    id: 'relic.glass-edge', nameKey: 'run.relic.glass-edge.name', descriptionKey: 'run.relic.glass-edge.description',
    iconSpriteId: COMBAT_FEEDBACK_SPRITES.parry, rarity: 'legendary', offerWeight: 12, maxStacks: 1,
    tags: ['damage', 'risk'], incompatibleRelicIds: ['relic.guardian-sigil'],
    effects: [
      { type: 'multiply_stat', statId: 'attack', multiplierPermille: 1_450 },
      { type: 'multiply_stat', statId: 'max-hp', multiplierPermille: 700 },
    ],
  },
];
