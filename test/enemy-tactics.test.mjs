import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { isGameplaySpriteId } from '../src/sideview/assets/GameplaySpriteManifest.ts';
import {
  ELITE_MODIFIERS,
  ENEMY_FORMATIONS,
  ENEMY_ROLE_TACTICS,
  MINIBOSS_MECHANICS,
  buildFormation,
  chooseFormation,
  combineEliteStats,
  selectEliteModifiers,
  validateEnemyTactics,
} from '../src/sideview/dungeons/EnemyTactics.ts';

const roles = ['shield-tank', 'healer', 'ranged-sniper', 'summoner', 'assassin'];

test('role tactics and formations are complete, readable, and deterministic', () => {
  assert.deepEqual(validateEnemyTactics(), []);
  assert.deepEqual(Object.keys(ENEMY_ROLE_TACTICS).sort(), [...roles].sort());

  for (const [role, tactic] of Object.entries(ENEMY_ROLE_TACTICS)) {
    assert.ok(tactic.action.telegraphSeconds >= 0.3, `${role} action must be readable`);
    assert.ok(tactic.action.cooldownSeconds > tactic.action.telegraphSeconds, `${role} needs recovery between tells`);
    assert.ok(Object.values(tactic.sprites).every(isGameplaySpriteId), `${role} must use registered sprites`);
  }
  assert.equal(ENEMY_ROLE_TACTICS.summoner.action.maxActiveSummons, 2, 'summons need a strict performance cap');
  assert.ok(ENEMY_ROLE_TACTICS['shield-tank'].guard.capacity > 0);

  const covered = new Set(Object.values(ENEMY_FORMATIONS).flatMap(({ slots }) => slots.map(({ role }) => role)));
  assert.deepEqual([...covered].sort(), [...roles].sort());
  assert.equal(chooseFormation('run-alpha', 0), 'shield-wall', 'wave zero has one safe formation');
  for (let wave = 0; wave < 12; wave += 1) {
    const chosen = chooseFormation('run-alpha', wave);
    assert.ok(ENEMY_FORMATIONS[chosen].minimumWave <= wave);
    assert.equal(chooseFormation('run-alpha', wave), chosen, 'same seed and wave must replay identically');
  }

  const right = buildFormation('arcane-echelon', 900, 1, 'formation-seed');
  const rightReplay = buildFormation('arcane-echelon', 900, 1, 'formation-seed');
  const left = buildFormation('arcane-echelon', 900, -1, 'formation-seed');
  assert.deepEqual(rightReplay, right);
  assert.equal(new Set(right.map(({ id }) => id)).size, right.length, 'formation slot ids must be unique');
  for (let index = 0; index < right.length; index += 1) {
    assert.equal(right[index].worldX - 900, -(left[index].worldX - 900), 'facing must mirror formation offsets');
  }
  const seededPositions = new Set(
    Array.from({ length: 12 }, (_, seed) => JSON.stringify(buildFormation('arcane-echelon', 900, 1, seed).map(({ worldX }) => worldX))),
  );
  assert.ok(seededPositions.size > 1, 'different encounter seeds should vary spawn jitter');
});

test('elite choices are bounded, compatible, reproducible, and sprite-backed', () => {
  for (const role of roles) {
    for (let seed = 0; seed < 20; seed += 1) {
      const selected = selectEliteModifiers(seed, role, 2);
      assert.deepEqual(selectEliteModifiers(seed, role, 2), selected);
      assert.ok(selected.length <= 2, 'elite modifier count must remain bounded');
      assert.equal(new Set(selected).size, selected.length, 'elite modifiers may not repeat');

      for (const id of selected) {
        assert.ok(ELITE_MODIFIERS[id].allowedRoles.includes(role), `${id} cannot apply to ${role}`);
        for (const other of selected) {
          assert.ok(!ELITE_MODIFIERS[id].incompatibleWith.includes(other), `${id} conflicts with ${other}`);
        }
      }

      const combined = combineEliteStats(selected);
      for (const value of Object.values(combined)) assert.ok(Number.isFinite(value) && value > 0);
      assert.ok(combined.reward >= 1);
    }
  }
  assert.deepEqual(selectEliteModifiers('none', 'assassin', 0), []);

  for (const [id, modifier] of Object.entries(ELITE_MODIFIERS)) {
    assert.ok(isGameplaySpriteId(modifier.visualSprite), `${id} needs a registered sprite signature`);
  }
  for (const [id, mechanic] of Object.entries(MINIBOSS_MECHANICS)) {
    assert.ok(isGameplaySpriteId(mechanic.visualSprite), `${id} needs a registered sprite tell`);
    assert.ok(mechanic.telegraphSeconds >= 0.3, `${id} tell must remain dodgeable`);
  }
});

test('tactical data does not use random runtime state or emoji visuals', () => {
  const source = readFileSync(new URL('../src/sideview/dungeons/EnemyTactics.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Math\.random\s*\(/);
  assert.doesNotMatch(JSON.stringify({ ENEMY_ROLE_TACTICS, ELITE_MODIFIERS, MINIBOSS_MECHANICS }), /\p{Extended_Pictographic}/u);
});
