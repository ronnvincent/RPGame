/**
 * REGRESSION TEST: the Colosseum can be played with nobody else online.
 *
 * A PvP room requires a second player, so the mode was unplayable exactly when
 * a new player had the time to learn it. Practice is a local 1v1 against one
 * arena bot: same map, same damage path, same results card, tagged BOT on the
 * scoreboard.
 *
 * The bot walk/attack timing is pure and tested directly; the integration
 * checks run the real engine so the bot dies through the ordinary damage path
 * and the round settles from the health the player actually removed.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { rolldown } from 'rolldown';

const engineSource = readFileSync(
  new URL('../src/sideview/engine/SideViewEngine.ts', import.meta.url),
  'utf8',
);
const lobbySource = readFileSync(
  new URL('../src/sideview/ui/TournamentLobbyUI.ts', import.meta.url),
  'utf8',
);

// ---------------------------------------------------------------------------
// Browser shims: the engine only needs an Image constructor, a window and
// localStorage to boot without a canvas.
// ---------------------------------------------------------------------------
const storage = new Map();
globalThis.window = globalThis;
globalThis.location = { hostname: 'localhost', origin: 'http://localhost' };
globalThis.localStorage = {
  getItem: key => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
  clear: () => storage.clear(),
};
globalThis.requestAnimationFrame = cb => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = id => clearTimeout(id);

class FakeImage {
  width = 93;
  height = 94;
  naturalWidth = 93;
  naturalHeight = 94;
  complete = true;
  onload = null;

  set src(value) {
    this._src = value;
    queueMicrotask(() => this.onload?.());
  }

  get src() {
    return this._src || '';
  }

  decode() {
    return Promise.resolve();
  }
}
globalThis.Image = FakeImage;

const bundle = await rolldown({ input: 'test/pvp-practice-fixture.ts', platform: 'browser' });
const generated = await bundle.generate({ format: 'esm' });
await bundle.close();
const code = generated.output.find(chunk => chunk.type === 'chunk')?.code;
assert.ok(code, 'practice fixture should bundle');
const {
  SideViewEngine,
  TournamentMatch,
  CHARACTER_CLASSES,
  network,
  stepArenaBot,
  createArenaBot,
  resetArenaBot,
  ARENA_BOT,
} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

const LOCAL_ID = 'practice_local';
const classDef = CHARACTER_CLASSES.find(c => c.id === 'warrior') || CHARACTER_CLASSES[0];

function practiceMatch() {
  const match = new TournamentMatch({
    format: '1v1',
    roundsToWin: 2,
    roundDurationSec: 180,
    mapTheme: 'tournament_colosseum',
  });
  match.setupTeamsFromLobby(
    [{ actorId: LOCAL_ID, name: 'Practicer', classId: 'warrior', team: 'red' }],
    LOCAL_ID,
    '1v1',
    { [LOCAL_ID]: 'red' },
    'red',
  );
  return match;
}

function startPractice() {
  const engine = new SideViewEngine(classDef);
  const match = practiceMatch();
  engine.pvpTeam = 'red';
  engine.startTournament(match);
  match.startMatch();
  match.update(3.1);
  // A round cannot be settled by a wipe during its opening grace window.
  match.update(1);
  return { engine, match, botId: match.fighters.find(f => f.isBot).id };
}

function fighterShell(overrides = {}) {
  return {
    id: 'blue_bot_0',
    name: 'Gladiator Marcus',
    team: 'blue',
    isLocal: false,
    isBot: true,
    className: 'warrior',
    maxHp: 1550,
    currentHp: 1550,
    kills: 0,
    deaths: 0,
    damageDealt: 0,
    damageTaken: 0,
    isAlive: true,
    x: 2950,
    y: 0,
    antiBurstUntil: 0,
    recentDamageTaken: [],
    ccCount: 0,
    lastCcTime: 0,
    ccImmunityUntil: 0,
    ...overrides,
  };
}

test('the bot walks into reach, then swings on a cooldown', () => {
  const bot = createArenaBot(fighterShell(), 2000);
  const player = { x: 1600, downed: false, hp: 1500 };

  const first = stepArenaBot(bot, player, 1 / 60);
  assert.equal(first.attack, false, 'it does not swing during the engage pause');
  assert.equal(bot.moving, false);

  // Let the reaction delay expire, then walk for two seconds.
  const frames = Math.ceil(ARENA_BOT.engageDelay * 60) + 120;
  let attacks = 0;
  for (let i = 0; i < frames; i += 1) {
    const step = stepArenaBot(bot, player, 1 / 60);
    if (step.attack) {
      attacks += 1;
      assert.equal(step.damage, ARENA_BOT.damage);
    }
  }
  assert.ok(bot.x < 2000, 'the bot closes the distance');
  assert.ok(
    Math.abs(bot.x - player.x) <= ARENA_BOT.attackRange + 1,
    `the bot stands in reach, got ${Math.round(bot.x)} vs ${player.x}`,
  );
  assert.ok(attacks >= 1, 'it swings once in reach');
  assert.ok(attacks <= 3, 'and respects the cooldown instead of swinging every frame');
});

test('a downed bot and a downed player are both left alone', () => {
  const bot = createArenaBot(fighterShell({ currentHp: 0 }), 1000);
  bot.downed = true;
  assert.deepEqual(stepArenaBot(bot, { x: 1000, downed: false, hp: 100 }, 1), { attack: false, damage: 0 });

  resetArenaBot(bot);
  assert.equal(bot.downed, false);
  assert.equal(bot.x, bot.spawnX);
  assert.deepEqual(
    stepArenaBot(bot, { x: 1000, downed: true, hp: 0 }, 1),
    { attack: false, damage: 0 },
    'a bot must not hit a corpse',
  );
});

test('starting a practice match spawns one opponent and endTournament clears it', () => {
  const { engine, match, botId } = startPractice();
  const bot = match.fighters.find(f => f.isBot);
  assert.ok(bot, 'the empty blue side is filled with a bot');
  assert.equal(network.remotePlayers[botId]?.team, 'blue', 'the bot is rendered as a blue fighter');
  assert.equal(network.remotePlayers[botId]?.isTownMode, false);

  engine.endTournament(false);
  assert.equal(network.remotePlayers[botId], undefined, 'the synthetic remote does not leak into town');
});

test('a cleared remote table does not heal a wounded bot', () => {
  const { engine, match, botId } = startPractice();
  const remote = network.remotePlayers[botId];
  engine.applyPvpAttackHitToRemotePlayer(botId, remote, 500, false, 'Test Slash');
  const fighter = match.fighters.find(f => f.id === botId);
  const woundedHp = fighter.currentHp;
  assert.ok(woundedHp < fighter.maxHp, 'the opening hit lands');

  // Leaving the lobby answers with a room reset that empties the table a
  // frame or two after the bout begins.
  delete network.remotePlayers[botId];
  engine.update(1 / 60);

  const rebuilt = network.remotePlayers[botId];
  assert.ok(rebuilt, 'the missing opponent is redrawn');
  assert.ok(
    rebuilt.hpPct <= Math.ceil((woundedHp / fighter.maxHp) * 100),
    `the rebuilt bar says ${rebuilt.hpPct}% with ${woundedHp}/${fighter.maxHp} left`,
  );
  assert.ok(fighter.currentHp <= woundedHp + 1, 'the wounded bot is not healed');
});

test('the bot hurts the player through the ordinary incoming-damage path', () => {
  const { engine, match, botId } = startPractice();
  const botFighter = match.fighters.find(f => f.id === botId);
  engine.player.x = botFighter.x - 60;
  engine.player.hp = 1500;
  const before = engine.player.hp;

  for (let i = 0; i < 240; i += 1) engine.update(1 / 60);
  assert.ok(engine.player.hp < before, 'standing next to a bot costs health');
  assert.ok(engine.player.hp > 0, 'a few seconds is not a one-shot');
  const local = match.fighters.find(f => f.isLocal);
  assert.ok(local.damageTaken > 0, 'the damage lands on the results row too');
});

test('killing the bot settles the round, and the second kill hands over the results card', async () => {
  const { engine, match, botId } = startPractice();
  let summary = null;
  engine.onPvpMatchEnded = value => { summary = value; };

  const remote = network.remotePlayers[botId];
  for (let i = 0; i < 60 && remote.hpPct > 0; i += 1) {
    engine.applyPvpAttackHitToRemotePlayer(botId, remote, 5000, false, 'Test Slash');
  }
  engine.update(1 / 60);
  assert.equal(match.status, 'round_end');
  assert.equal(match.redScore, 1);

  // The round break runs on a real 2.6 s timer; the countdown after it is
  // driven by frames. Wait out the former, then feed the latter.
  await new Promise(resolve => setTimeout(resolve, 2800));
  for (let i = 0; i < 120 && match.status !== 'active'; i += 1) engine.update(0.1);
  assert.equal(match.status, 'active', 'round two starts after the break');
  // Round two has an opening grace window before a wipe can settle it.
  engine.update(1);
  const roundTwoBot = network.remotePlayers[botId];
  for (let i = 0; i < 60 && roundTwoBot.hpPct > 0; i += 1) {
    engine.applyPvpAttackHitToRemotePlayer(botId, roundTwoBot, 5000, false, 'Test Slash');
  }
  engine.update(1 / 60);
  assert.equal(match.status, 'match_end');
  assert.equal(match.redScore, 2);

  // The handoff to the results card runs on a real 1.6 s beat so the winning
  // frame can be seen; it is not frame-driven.
  await new Promise(resolve => setTimeout(resolve, 1750));
  assert.ok(summary, 'the match hands over to the results card');
  assert.equal(summary.winningTeam, 'red');
  assert.equal(summary.mvp?.name, 'Practicer');
  assert.ok(summary.rows.some(row => row.isBot), 'the bot is on the card, tagged by isBot');
});

test('practice is a local lobby action, and the server still refuses a one-sided room', () => {
  assert.match(lobbySource, /data-action="practice-bots"/);
  assert.match(lobbySource, /private startPracticeMatch\(\): void \{/);
  assert.match(lobbySource, /const format = this\.currentFormat;/,
    'practice uses the format selected in the lobby');
  assert.match(lobbySource, /format,\s*roundsToWin: 2,[\s\S]{0,80}roundDurationSec: PVP_ROUND_DURATION_SEC/,
    'practice uses the same 3-minute round as a real bout');
  assert.match(lobbySource, /network\.leaveLobby\(\);[\s\S]{0,160}this\.onStartMatchCb\(match\);/,
    'the room is left before the local match starts');
  assert.match(engineSource, /private syncPracticeBots\(match: TournamentMatch\): void \{/);
  assert.match(engineSource, /private updatePracticeBots\(dt: number\): void \{/);
  assert.match(engineSource, /if \(this\.arenaBots\.length === 0\) return;/,
    'a real match pays nothing for a feature it never uses');

  const serverSource = readFileSync(new URL('../server/index.js', import.meta.url), 'utf8');
  assert.match(serverSource, /Colosseum battles require at least 1 player on Crimson \(Red\) and 1 on Azure \(Blue\)!/,
    'bots are a practice feature, not a way to fake a two-player room');
});
