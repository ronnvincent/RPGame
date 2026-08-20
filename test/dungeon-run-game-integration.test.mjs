import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const game = readFileSync('src/sideview/SideViewGame.ts', 'utf8');

test('SideViewGame owns a deterministic objective-driven run with a legacy fallback', () => {
  assert.match(game, /generateDungeonRun\(/);
  assert.match(game, /DungeonRunController\.create\(/);
  assert.match(game, /if \(!this\.initializeDungeonRun\(dungeon\)\) this\.spawnNextWave\(\)/);
  assert.match(game, /if \(!this\.runController && this\.engine\.isHost/);
  assert.match(game, /commandId: `\$\{before\.runId\}:\$\{before\.lastCommandSequence \+ 1\}/);
});

test('all six objective states are adapted to sprite-backed HUD progress', () => {
  for (const type of ['kill_all', 'defend_relic', 'escort', 'survive', 'destroy_nests', 'timed_escape']) {
    assert.match(game, new RegExp(`objective\\.type === '${type}'`), `missing ${type} HUD adapter`);
  }
  assert.match(game, /spriteId: node\.sprites\.objectiveMarkerSpriteId/);
  assert.match(game, /setDungeonRelics\(/);
  assert.doesNotMatch(game, /terrain\.png/i);
});

test('encounter simulation is host authoritative and routes damage through engine/network boundaries', () => {
  assert.match(game, /this\.encounter\.update\(dt/);
  assert.match(game, /this\.engine\.applyEncounterPlayerDamage\(/);
  assert.match(game, /network\.sendPlayerDamage\(/);
  assert.match(game, /this\.engine\.applyDamageToEnemy\(/);
  assert.match(game, /this\.engine\.setDungeonEncounterRuntime\(this\.encounter\)/);
  assert.match(game, /this\.engine\.onPlayerWorldHit =/);
  assert.match(game, /objectiveDamagePerSecond: Math\.max\(12, enemy\.atk \* 0\.18\)/);
  assert.match(game, /sourceEnemyId: damage\.sourceId/);
  assert.match(game, /profileId: 'ranged-shot'/);
  assert.match(game, /this\.engine\.onEnemyDefeatedEvent =/);
  assert.match(game, /spawnsSealed: !this\.engine\.hasPendingEnemyReinforcements\(\)/);
});

test('run time and snapshots are batched off the render-frame hot path', () => {
  assert.match(game, /private runTickAccumulatorMs = 0/);
  assert.match(game, /this\.runTickAccumulatorMs >= 250/);
  assert.match(game, /type: 'advance_time', deltaMs: elapsedMs \}, false/);
  assert.match(game, /this\.runController\.getStateView\(\)/);
  assert.match(game, /if \(requestImmediateSync\) this\.runSyncAccumulator/);
  assert.doesNotMatch(game, /type: 'advance_time', deltaMs: Math\.min\(1_000, Math\.max\(0, Math\.round\(dt/);
});

test('guest reconciliation uses the exact serialized boss, formation and spawn fields', () => {
  for (const field of [
    'isActive', 'spawnDelay', 'currentPhase', 'specialAttackTimer',
    'bossCastName', 'bossCastTimer', 'bossCastDuration',
    'formationId', 'formationSlotId', 'summonOwnerId', 'featureSpriteId',
  ]) {
    assert.match(game, new RegExp(`existing\\.${field} = inc\\.${field}`), `missing ${field} reconciliation`);
  }
  assert.doesNotMatch(game, /existing\.formation = inc\.formation/);
  assert.doesNotMatch(game, /existing\.bossCast = inc\.bossCast/);
});

test('run sync, reconnect state, combat defense, choices and parry priority are wired', () => {
  assert.match(game, /runState: this\.runController\?\.getSnapshot\(\)/);
  assert.match(game, /network\.onRunSync\(/);
  assert.match(game, /encounterSnapshot: this\.encounter\.snapshot\(\)/);
  assert.match(game, /this\.applyEncounterSnapshot\(encounterSnapshot\)/);
  assert.match(game, /this\.encounter\.applySnapshot\(snapshot\)/);
  assert.match(game, /this\.engine\.setRunRelics\(definitions\)/);
  assert.match(game, /network\.onCombatDefense\(/);
  assert.match(game, /applyRemoteCombatDefense\(result\)/);
  assert.match(game, /nearestDownedAlly\(\)/);
  assert.match(game, /showRunRoomChoices\(\)/);
  assert.match(game, /showRunRouteChoices\(\)/);
  assert.match(game, /return this\.engine\.parryPlayer\(\)/);
});
