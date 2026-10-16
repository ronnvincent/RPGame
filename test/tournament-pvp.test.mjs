import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TournamentMatch,
  calculatePvpDamage,
  applyPvpCrowdControl,
  getNormalizedPvpBaseHp,
  PVP_DAMAGE_MULTIPLIER,
  PVP_MAX_CC_DURATION_SEC,
  TOURNAMENT_FORMAT_TEAM_SIZES,
} from '../src/sideview/pvp/TournamentSystem.ts';
import { MAPS } from '../src/sideview/engine/MapLibrary.ts';

test('tournament team sizes match formats (1v1, 2v2, 3v3, 4v4)', () => {
  assert.equal(TOURNAMENT_FORMAT_TEAM_SIZES['1v1'], 1);
  assert.equal(TOURNAMENT_FORMAT_TEAM_SIZES['2v2'], 2);
  assert.equal(TOURNAMENT_FORMAT_TEAM_SIZES['3v3'], 3);
  assert.equal(TOURNAMENT_FORMAT_TEAM_SIZES['4v4'], 4);

  for (const fmt of ['1v1', '2v2', '3v3', '4v4']) {
    const match = new TournamentMatch({ format: fmt });
    match.setupTeams('TestHero', 'warrior', fmt);
    const red = match.fighters.filter(f => f.team === 'red');
    const blue = match.fighters.filter(f => f.team === 'blue');
    assert.equal(red.length, TOURNAMENT_FORMAT_TEAM_SIZES[fmt]);
    assert.equal(blue.length, TOURNAMENT_FORMAT_TEAM_SIZES[fmt]);
  }
});

test('stat normalization ensures competitive baseline HP across classes', () => {
  const warriorHp = getNormalizedPvpBaseHp('warrior');
  const knightHp = getNormalizedPvpBaseHp('heroknight');
  const wizardHp = getNormalizedPvpBaseHp('wizard');
  const rogueHp = getNormalizedPvpBaseHp('nightborne');

  assert.equal(warriorHp, 1550);
  assert.equal(knightHp, 1800);
  assert.equal(wizardHp, 1350);
  assert.equal(rogueHp, 1550);
});

test('pvp damage calculations apply 0.22 multiplier, crit ceiling, and anti-burst shield', () => {
  const target = {
    id: 'enemy_1',
    name: 'Gladiator',
    team: 'blue',
    isLocal: false,
    isBot: true,
    className: 'warrior',
    maxHp: 1550,
    currentHp: 1550,
    kills: 0,
    damageDealt: 0,
    isAlive: true,
    x: 1000,
    y: 0,
    antiBurstUntil: 0,
    recentDamageTaken: [],
    ccCount: 0,
    lastCcTime: 0,
    ccImmunityUntil: 0,
  };

  // Raw damage of 1000 with 0.22 multiplier against 30 DEF
  const result = calculatePvpDamage(1000, false, target, 0);
  assert.equal(result.finalDamage, Math.round(1000 * PVP_DAMAGE_MULTIPLIER));
  assert.equal(result.triggeredAntiBurst, false);
  assert.equal(result.wasMitigated, false);

  // Massive burst damage exceeding 35% of maxHp (1550 * 0.35 = 542.5)
  // Simulate 3500 raw damage which produces > 550 net damage
  const burstResult = calculatePvpDamage(3500, false, target, 100);
  assert.equal(burstResult.triggeredAntiBurst, true);
  assert.ok(target.antiBurstUntil > 100);

  // Subsequent hit within anti-burst window receives 30% reduction
  const protectedResult = calculatePvpDamage(1000, false, target, 150);
  assert.ok(protectedResult.finalDamage < result.finalDamage);
});

test('pvp crowd control applies diminishing returns and grants 3s immunity on 3rd CC', () => {
  const target = {
    id: 'target_cc',
    name: 'Target',
    team: 'blue',
    isLocal: false,
    isBot: true,
    className: 'warrior',
    maxHp: 1550,
    currentHp: 1550,
    kills: 0,
    damageDealt: 0,
    isAlive: true,
    x: 1000,
    y: 0,
    antiBurstUntil: 0,
    recentDamageTaken: [],
    ccCount: 0,
    lastCcTime: 0,
    ccImmunityUntil: 0,
  };

  let now = 10000;
  // 1st CC: full duration capped at PVP_MAX_CC_DURATION_SEC (2.5s)
  const cc1 = applyPvpCrowdControl(3.0, target, now);
  assert.equal(cc1.allowedDurationSec, PVP_MAX_CC_DURATION_SEC);
  assert.equal(cc1.isImmune, false);
  assert.equal(target.ccCount, 1);

  // 2nd CC: within 6s window -> halved duration (1.0s max CC halved = 0.5s)
  now += 1500;
  const cc2 = applyPvpCrowdControl(2.0, target, now);
  assert.equal(cc2.allowedDurationSec, 0.5);
  assert.equal(cc2.isImmune, false);
  assert.equal(target.ccCount, 2);

  // 3rd CC: within window -> rejected and triggers 3.0s CC immunity
  now += 1500;
  const cc3 = applyPvpCrowdControl(2.0, target, now);
  assert.equal(cc3.allowedDurationSec, 0);
  assert.equal(cc3.isImmune, true);
  assert.ok(target.ccImmunityUntil >= now + 3000);

  // 4th CC attempted during immunity window is rejected
  now += 1000;
  const cc4 = applyPvpCrowdControl(2.0, target, now);
  assert.equal(cc4.allowedDurationSec, 0);
  assert.equal(cc4.isImmune, true);
});

test('tournament match flow manages round wipes, scoring, and champion coronation', () => {
  const match = new TournamentMatch({ format: '1v1', roundsToWin: 2, roundDurationSec: 90 });
  match.setupTeams('TestHero', 'warrior', '1v1');
  match.startMatch();

  assert.equal(match.status, 'countdown');
  assert.equal(match.currentRound, 1);
  assert.equal(match.redScore, 0);
  assert.equal(match.blueScore, 0);

  // Countdown elapses
  match.update(3.1);
  assert.equal(match.status, 'active');

  // Blue player wiped
  const blue = match.fighters.find(f => f.team === 'blue');
  blue.currentHp = 0;
  blue.isAlive = false;

  match.update(0.1);
  assert.equal(match.status, 'round_end');
  assert.equal(match.redScore, 1);
  assert.equal(match.blueScore, 0);
  assert.equal(match.matchWinner, null);

  // Round 2
  match.currentRound = 2;
  match.startRoundCountdown();
  match.update(3.1);
  assert.equal(match.status, 'active');

  // Blue wiped again in Round 2
  const blue2 = match.fighters.find(f => f.team === 'blue');
  blue2.currentHp = 0;
  blue2.isAlive = false;
  match.update(0.1);

  assert.equal(match.status, 'match_end');
  assert.equal(match.redScore, 2);
  assert.equal(match.matchWinner, 'red');
  assert.equal(match.bannerText, 'CHAMPION OF THE ARENA!');
});

test('tournament_arena map is registered with 7 Gothicvania parallax layers and proper grounding', () => {
  const arenaMap = MAPS['tournament_arena'];
  assert.ok(arenaMap, 'tournament_arena must exist in MAPS');
  assert.equal(arenaMap.layers.length, 7, 'tournament_arena should have 7 parallax layers');
  assert.ok(arenaMap.floor, 'floor configuration must be specified');
  assert.equal(arenaMap.floor.top, '#4a3852');
  assert.equal(arenaMap.floor.body, '#150f1c');
  const townLayer = arenaMap.layers[arenaMap.layers.length - 1];
  assert.equal(townLayer.anchor, 'horizon', 'town layer must anchor to horizon for clean 1:1 pixel art');
});
