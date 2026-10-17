/**
 * REGRESSION TEST: a downed player gets a camera, not a cutscene.
 *
 * Two things were broken. First, dying in the Colosseum ran the dungeon
 * bleed-out path, so `onRunLost` fired and threw the player back to town mid-
 * series - which also made the spectator camera unreachable, because nobody
 * was ever down long enough to use it. Second, the camera itself was a fixed
 * director cut: no panning, no zoom, no pause, no way to choose a fighter.
 *
 * The camera maths is pure and tested directly. The engine checks run a real
 * 2v2 practice bout: a bot ally is the fighter the spectator follows, the
 * free camera clamps to the arena, and pause freezes the local simulation.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { rolldown } from 'rolldown';

const engineSource = readFileSync(
  new URL('../src/sideview/engine/SideViewEngine.ts', import.meta.url),
  'utf8',
);
const gameSource = readFileSync(
  new URL('../src/sideview/SideViewGame.ts', import.meta.url),
  'utf8',
);
const barSource = readFileSync(
  new URL('../src/sideview/ui/PvpSpectatorBar.ts', import.meta.url),
  'utf8',
);

// ---------------------------------------------------------------------------
// Browser shims (the engine boots far enough to simulate without a canvas).
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

const bundle = await rolldown({ input: 'test/pvp-spectator-fixture.ts', platform: 'browser' });
const generated = await bundle.generate({ format: 'esm' });
await bundle.close();
const code = generated.output.find(chunk => chunk.type === 'chunk')?.code;
assert.ok(code, 'spectator fixture should bundle');
const {
  SideViewEngine,
  TournamentMatch,
  CHARACTER_CLASSES,
  network,
  SPECTATOR_VIEW,
  blendCamera,
  cameraXForFocus,
  clampCameraX,
  createSpectatorView,
  focusSpectatorOn,
  lockSpectatorTarget,
  nudgeSpectatorZoom,
  panSpectatorView,
  setSpectatorFollow,
  setSpectatorZoom,
  wheelZoomSteps,
} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

const LOCAL_ID = 'spectate_local';
const classDef = CHARACTER_CLASSES.find(c => c.id === 'warrior') || CHARACTER_CLASSES[0];

function practiceMatch(format = '2v2') {
  const match = new TournamentMatch({
    format,
    roundsToWin: 2,
    roundDurationSec: 180,
    mapTheme: 'tournament_colosseum',
  });
  match.setupTeamsFromLobby(
    [{ actorId: LOCAL_ID, name: 'Watcher', classId: 'warrior', team: 'red' }],
    LOCAL_ID,
    format,
    { [LOCAL_ID]: 'red' },
    'red',
  );
  return match;
}

/** A 2v2 practice bout, already past its countdown. */
function livePractice() {
  const engine = new SideViewEngine(classDef);
  engine.canvasWidth = 900;
  engine.canvasHeight = 500;
  engine.pvpTeam = 'red';
  let runLost = 0;
  engine.onRunLost = () => { runLost += 1; };
  const match = practiceMatch('2v2');
  engine.startTournament(match);
  match.startMatch();
  match.update(3.1);
  return { engine, match, runLost: () => runLost };
}

function killPlayer(engine) {
  engine.receivePvpHit({
    attackerActorId: 'blue_bot_0',
    attackerName: 'Gladiator Marcus',
    attackerTeam: 'blue',
    damage: 999999,
    isCrit: false,
    hitX: 100,
    hitY: 300,
  });
}

// ---------------------------------------------------------------------------
// Pure camera maths.
// ---------------------------------------------------------------------------
test('zoom stays inside the range and steps are multiplicative', () => {
  const view = createSpectatorView();
  setSpectatorZoom(view, 10);
  assert.equal(view.zoom, SPECTATOR_VIEW.maxZoom);
  setSpectatorZoom(view, 0.01);
  assert.equal(view.zoom, SPECTATOR_VIEW.minZoom);

  setSpectatorZoom(view, 1);
  nudgeSpectatorZoom(view, 1);
  assert.ok(Math.abs(view.zoom - 1.12) < 1e-9, `expected 1.12, got ${view.zoom}`);
  nudgeSpectatorZoom(view, -2);
  assert.ok(Math.abs(view.zoom - 0.89) < 0.01);
});

test('the wheel means the same thing on pixels, lines and pages', () => {
  // Scrolling down zooms out, scrolling up zooms in.
  assert.equal(wheelZoomSteps(100), -1);
  assert.equal(wheelZoomSteps(-100), 1);
  assert.equal(wheelZoomSteps(3, 1), -1);
  assert.equal(wheelZoomSteps(0.75, 2), -1);
  assert.equal(wheelZoomSteps(5000), -3, 'a violent trackpad flick is clamped');
  assert.equal(wheelZoomSteps(0), 0);
  assert.equal(wheelZoomSteps(Number.NaN), 0);
});

test('a free camera clamps to the arena and drops its lock when panned', () => {
  const view = createSpectatorView();
  lockSpectatorTarget(view, 'red_bot_1');
  assert.equal(view.mode, 'free');
  assert.equal(view.lockedTargetId, 'red_bot_1');

  panSpectatorView(view, 400, 3600);
  assert.equal(view.lockedTargetId, null, 'dragging is taking the wheel back');
  assert.equal(view.focusX, 400);

  focusSpectatorOn(view, -500, 3600);
  assert.equal(view.focusX, 0);
  focusSpectatorOn(view, 99999, 3600);
  assert.equal(view.focusX, 3600);

  setSpectatorFollow(view, true);
  assert.equal(view.mode, 'auto');
  assert.equal(view.lockedTargetId, null);
});

test('the camera never shows past the arena, and a narrow arena parks at zero', () => {
  assert.equal(clampCameraX(-40, 900, 3600), 0);
  assert.equal(clampCameraX(5000, 900, 3600), 2700);
  assert.equal(clampCameraX(1200, 900, 3600), 1200);
  assert.equal(clampCameraX(50, 4000, 3600), 0, 'a viewport wider than the arena cannot pan');
  assert.equal(cameraXForFocus(1800, 900, 3600), 1350);
});

test('camera motion is frame-rate independent', () => {
  let fine = 0;
  for (let i = 0; i < 20; i += 1) fine = blendCamera(fine, 1000, 1 / 60, 6);
  let coarse = 0;
  for (let i = 0; i < 10; i += 1) coarse = blendCamera(coarse, 1000, 1 / 30, 6);
  assert.ok(Math.abs(fine - coarse) < 1, `${fine} vs ${coarse}`);
});

// ---------------------------------------------------------------------------
// Dying in the arena.
// ---------------------------------------------------------------------------
test('a Colosseum death no longer ends the run', () => {
  const { engine, match, runLost } = livePractice();
  killPlayer(engine);
  assert.equal(engine.player.downed, true, 'the player is down');
  assert.equal(engine.player.hp, 0);

  for (let i = 0; i < 120; i += 1) engine.update(1 / 60);
  assert.equal(engine.player.downed, true, 'the arena keeps the player down, not dead');
  assert.equal(engine.runOver, false);
  assert.equal(runLost(), 0, 'onRunLost must not fire in a tournament');
  assert.equal(match.status, 'active', 'the ally is still fighting, so the round goes on');
});

test('the downed player spectates the ally that is still standing', () => {
  const { engine } = livePractice();
  assert.equal(engine.pvpSpectating, false, 'nothing to spectate while alive');
  killPlayer(engine);
  engine.update(1 / 60);

  assert.equal(engine.pvpSpectating, true);
  assert.equal(engine.spectateTargetName(), 'Paladin Roland');
  assert.equal(engine.spectateTargetTeam(), 'red');
  assert.equal(engine.pvpCanPause, true, 'practice runs locally and can be frozen');
});

test('the camera can be taken anywhere in the arena and zoomed', () => {
  const { engine } = livePractice();
  killPlayer(engine);
  engine.update(1 / 60);
  // Freeze the bout: the camera is supposed to keep moving while paused, and
  // a live fight would otherwise end the round mid-test.
  assert.equal(engine.toggleSpectatorPause(), true);

  const start = engine.cameraX;
  engine.panSpectatorCamera(600);
  for (let i = 0; i < 30; i += 1) engine.update(1 / 60);
  assert.ok(engine.cameraX > start, `expected the camera to move right, ${start} -> ${engine.cameraX}`);
  assert.equal(engine.spectatorMode, 'free');

  // Drag maths converts screen pixels through the renderer's scale.
  const beforeDrag = engine.cameraX;
  engine.panSpectatorCameraBy(-900 * 1.8);
  for (let i = 0; i < 40; i += 1) engine.update(1 / 60);
  assert.ok(engine.cameraX < beforeDrag, 'dragging the other way moves back');

  // Far past either end, the camera clamps to the arena.
  engine.panSpectatorCamera(999999);
  for (let i = 0; i < 120; i += 1) engine.update(1 / 60);
  assert.ok(engine.cameraX <= engine.arenaWidth - engine.canvasWidth + 1);
  engine.panSpectatorCamera(-999999);
  for (let i = 0; i < 120; i += 1) engine.update(1 / 60);
  assert.ok(engine.cameraX < 0.5, `expected the left edge, got ${engine.cameraX}`);

  engine.setSpectatorZoom(999);
  assert.equal(engine.spectatorZoom, SPECTATOR_VIEW.maxZoom);
  engine.nudgeSpectatorZoom(-1);
  assert.ok(engine.spectatorZoom < SPECTATOR_VIEW.maxZoom);
});

test('cycling follows another fighter, and the director resumes on demand', () => {
  const { engine } = livePractice();
  killPlayer(engine);
  engine.update(1 / 60);
  const first = engine.spectateTargetName();

  engine.cycleSpectateTarget(1);
  assert.equal(engine.spectatorMode, 'free');
  const second = engine.spectateTargetName();
  assert.notEqual(second, first, 'the next fighter is somebody else');
  assert.ok(engine.spectateTargetTeam());

  engine.toggleSpectatorFollow();
  assert.equal(engine.spectatorMode, 'auto');
});

test('pause freezes a practice bout and nothing else', () => {
  const { engine, match } = livePractice();
  killPlayer(engine);
  for (let i = 0; i < 30; i += 1) engine.update(1 / 60);

  const before = match.roundTimeRemaining;
  const botPositions = match.fighters.filter(f => f.isBot).map(f => Math.round(f.x));
  assert.equal(engine.toggleSpectatorPause(), true);
  assert.equal(engine.pvpPaused, true);

  for (let i = 0; i < 60; i += 1) engine.update(1 / 60);
  assert.equal(match.roundTimeRemaining, before, 'the round clock is stopped');
  assert.deepEqual(
    match.fighters.filter(f => f.isBot).map(f => Math.round(f.x)),
    botPositions,
    'the bots are frozen too',
  );

  assert.equal(engine.toggleSpectatorPause(), false);
  for (let i = 0; i < 60; i += 1) engine.update(1 / 60);
  assert.ok(match.roundTimeRemaining < before, 'time moves again after resuming');
});

test('a live bout cannot be paused, because the other player keeps playing', () => {
  const engine = new SideViewEngine(classDef);
  engine.canvasWidth = 900;
  engine.pvpTeam = 'red';
  const match = new TournamentMatch({
    format: '2v2',
    roundsToWin: 2,
    roundDurationSec: 180,
    mapTheme: 'tournament_colosseum',
  });
  match.setupTeamsFromLobby(
    [
      { actorId: LOCAL_ID, name: 'Watcher', classId: 'warrior', team: 'red' },
      { actorId: 'mate_real', name: 'Ally', classId: 'mage', team: 'red' },
      { actorId: 'foe_real', name: 'Rival', classId: 'archer', team: 'blue' },
    ],
    LOCAL_ID,
    '2v2',
    { [LOCAL_ID]: 'red', mate_real: 'red', foe_real: 'blue' },
    'red',
  );
  network.remotePlayers.mate_real = {
    actorId: 'mate_real',
    classId: 'mage',
    name: 'Ally',
    x: 700,
    y: 0,
    facing: 1,
    isGrounded: true,
    isAttacking: false,
    animState: 'idle',
    isTownMode: false,
    team: 'red',
    hpPct: 80,
  };
  network.remotePlayers.foe_real = {
    actorId: 'foe_real',
    classId: 'archer',
    name: 'Rival',
    x: 2600,
    y: 0,
    facing: -1,
    isGrounded: true,
    isAttacking: false,
    animState: 'idle',
    isTownMode: false,
    team: 'blue',
    hpPct: 70,
  };

  engine.startTournament(match);
  match.startMatch();
  match.update(3.1);
  killPlayer(engine);
  engine.update(1 / 60);

  assert.equal(engine.pvpSpectating, true);
  assert.equal(engine.pvpCanPause, false, 'no bots means this is a real match');
  assert.equal(engine.toggleSpectatorPause(), false);
  assert.equal(engine.pvpPaused, false);

  delete network.remotePlayers.mate_real;
  delete network.remotePlayers.foe_real;
});

test('a pause never outlives the round it froze', () => {
  const { engine, match } = livePractice();
  killPlayer(engine);
  engine.update(1 / 60);
  assert.equal(engine.pvpCanPause, true);
  assert.equal(engine.toggleSpectatorPause(), true);

  // The round settles from a source the pause cannot stop (the server owns
  // the scoreboard). A pause that stayed on would freeze the handoff forever.
  match.resolveRoundEnd('blue', 'wipe');
  assert.equal(engine.pvpCanPause, false, 'a settled round is not pausable');
  assert.equal(engine.toggleSpectatorPause(), false);

  const bannerBefore = match.bannerTimer;
  engine.update(0.5);
  assert.equal(engine.pvpPaused, false, 'the stale pause releases itself');
  assert.ok(match.bannerTimer < bannerBefore, 'the handoff still runs');
});

// ---------------------------------------------------------------------------
// The bench: a spectator is a seat in the lobby, not a fighter in the ring.
// ---------------------------------------------------------------------------
function remote(id, team, x, hpPct = 100, name = id) {
  return {
    actorId: id,
    classId: 'warrior',
    name,
    x,
    y: 0,
    facing: team === 'red' ? 1 : -1,
    isGrounded: true,
    isAttacking: false,
    animState: 'idle',
    isTownMode: false,
    team,
    hpPct,
  };
}

function observerMatch(format = '2v2') {
  const match = new TournamentMatch({
    format,
    roundsToWin: 2,
    roundDurationSec: 180,
    mapTheme: 'tournament_colosseum',
  });
  match.setupTeamsFromLobby(
    [
      { actorId: 'red_one', uuid: 'red_one', name: 'Crimson One', classId: 'warrior', team: 'red', seat: 'red', slot: 0 },
      { actorId: 'blue_one', uuid: 'blue_one', name: 'Azure One', classId: 'archer', team: 'blue', seat: 'blue', slot: 0 },
      { actorId: LOCAL_ID, uuid: LOCAL_ID, name: 'Watcher', classId: 'warrior', team: 'red', seat: 'spectator', slot: 0 },
    ],
    LOCAL_ID,
    format,
    { red_one: 'red', blue_one: 'blue' },
    'red',
  );
  return match;
}

test('the lobby bench watches without taking a fighter slot', () => {
  const engine = new SideViewEngine(classDef);
  engine.canvasWidth = 900;
  engine.canvasHeight = 500;
  engine.pvpTeam = 'red';
  let runLost = 0;
  engine.onRunLost = () => { runLost += 1; };

  const match = observerMatch('2v2');
  assert.deepEqual(
    match.fighters.map(f => f.id).sort(),
    ['blue_one', 'red_one'],
    'the bench is not on the roster',
  );

  network.remotePlayers.red_one = remote('red_one', 'red', 700);
  network.remotePlayers.blue_one = remote('blue_one', 'blue', 2500, 60);

  engine.setPvpObserver(true);
  engine.startTournament(match);
  match.startMatch();
  match.update(3.1);

  assert.equal(engine.pvpObserver, true);
  assert.equal(engine.pvpSpectating, true, 'the bench is spectating before the bell');
  assert.equal(engine.player.downed, true);
  assert.equal(engine.player.hp, 0);
  assert.equal(engine.pvpCanPause, false, 'a live bout cannot be paused by an observer');
  assert.equal(
    match.fighters.some(f => f.isLocal),
    false,
    'the spectator never appears on the scoreboard',
  );

  // The director cuts across both teams: an observer has no side to follow.
  for (let i = 0; i < 90; i += 1) engine.update(1 / 60);
  assert.ok(engine.spectateTargetName().length > 0, 'the auto director finds someone to show');

  // Free camera and zoom still work from the bench.
  const before = engine.cameraX;
  engine.panSpectatorCamera(320);
  for (let i = 0; i < 30; i += 1) engine.update(1 / 60);
  assert.equal(engine.spectatorMode, 'free');
  assert.ok(engine.cameraX > before, 'the bench can pan the arena');

  // A stray hit must not turn the observer into a corpse again.
  engine.receivePvpHit({
    attackerActorId: 'blue_one',
    attackerName: 'Azure One',
    attackerTeam: 'blue',
    damage: 999999,
    isCrit: false,
    hitX: 400,
    hitY: 300,
  });
  assert.equal(engine.player.hp, 0);
  assert.equal(engine.player.downed, true);
  assert.equal(runLost, 0, 'the bench never triggers the dungeon loss path');

  // A new round keeps the bench on the bench.
  match.currentRound += 1;
  match.startRoundCountdown();
  engine.update(1 / 60);
  assert.equal(engine.player.downed, true, 'the spectator is not revived by the round bell');
  assert.equal(engine.player.hp, 0);
  assert.equal(engine.pvpSpectating, true);

  engine.endTournament(false);
  assert.equal(engine.pvpObserver, false, 'leaving the arena gives the player back');
  assert.equal(engine.player.downed, false, 'and stands them back up for town');
  assert.equal(engine.pvpSpectating, false);

  delete network.remotePlayers.red_one;
  delete network.remotePlayers.blue_one;
});

test('seat order and the bench survive the trip into the match roster', () => {
  const match = new TournamentMatch({ format: '3v3', roundsToWin: 2, roundDurationSec: 180 });
  match.setupTeamsFromLobby(
    [
      { actorId: 'red_late', uuid: 'red_late', name: 'Late', classId: 'warrior', team: 'red', seat: 'red', slot: 2 },
      { actorId: 'red_first', uuid: 'red_first', name: 'First', classId: 'warrior', team: 'red', seat: 'red', slot: 0 },
      { actorId: 'blue_second', uuid: 'blue_second', name: 'Second', classId: 'archer', team: 'blue', seat: 'blue', slot: 1 },
      { actorId: 'bench_one', uuid: 'bench_one', name: 'Bench', classId: 'mage', team: 'red', seat: 'spectator', slot: 0 },
    ],
    'red_first',
    '3v3',
    { red_late: 'red', red_first: 'red', blue_second: 'blue' },
    'red',
  );

  assert.deepEqual(match.fighters.map(f => f.id), ['red_first', 'red_late', 'blue_second'],
    'fighters stand in seat order, and the bench stays out');
  assert.equal(match.fighters[0].x, 480, 'seat 0 takes the first spawn');
  assert.equal(match.fighters[1].x, 550, 'seat 2 is second in line, not last');
  assert.equal(match.fighters[0].isLocal, true);
});

// ---------------------------------------------------------------------------
// Wiring.
// ---------------------------------------------------------------------------
test('the engine draws the zoom, freezes on pause, and guards arena death', () => {
  assert.match(engineSource, /const spectatorZoom = this\.pvpSpectating \? this\.spectatorView\.zoom : 1;/);
  assert.match(engineSource, /this\.viewScale = zoom;/);
  assert.match(
    engineSource,
    /if \(this\.pvpPauseActive\) \{[\s\S]{0,600}?this\.updateSpectatorCamera\(dt\);\s*return;/,
    'a paused bout still runs the camera and nothing else',
  );
  const tick = engineSource.slice(engineSource.indexOf('private tickDowned'));
  assert.match(tick.slice(0, 1200), /if \(this\.inTournamentMode\) return;/,
    'bleed-out must not run inside the arena');
  assert.match(engineSource, /private fillPracticeAllies\(match: TournamentMatch\): void \{/);
});

test('the spectator bar uses project art, real buttons and a live state', () => {
  assert.match(barSource, /panel_brown\.png/);
  assert.match(barSource, /buttonSquare_brown\.png/);
  assert.match(barSource, /buttonLong_brown\.png/);
  assert.match(barSource, /role', 'toolbar'/);
  assert.match(barSource, /aria-label', 'Spectator camera controls'/);
  assert.match(barSource, /aria-label="Previous fighter"/);
  assert.match(barSource, /aria-label="Zoom in"/);
  assert.match(barSource, /aria-pressed/);
  assert.match(barSource, /Pause is available in a practice bout/);
  assert.match(barSource, /@media \(max-width: 480px\)/);
  assert.match(barSource, /prefers-reduced-motion/);
});

test('the game binds drag, pinch, wheel and keys without stealing HUD input', () => {
  assert.match(gameSource, /new PvpSpectatorBar\(this\.container/);
  assert.match(gameSource, /this\.setupSpectatorCameraInput\(\);/);
  assert.match(gameSource, /window\.addEventListener\('pointerdown', \(event: PointerEvent\) => \{[\s\S]{0,320}spectating\(\)/);
  assert.match(gameSource, /this\.engine\?\.panSpectatorCameraBy\(dx\)/);
  assert.match(gameSource, /wheelZoomSteps\(event\.deltaY, event\.deltaMode\)/);
  assert.match(gameSource, /this\.spectatorPointers\.size >= 2/);
  assert.match(gameSource, /event\.stopPropagation\(\);/);
  assert.match(gameSource, /if \(!this\.engine\.pvpPaused\) network\.updateRemotePlayers\(dt\);/);
  assert.match(gameSource, /case 'KeyP':/);
  assert.match(gameSource, /this\.spectatorBar\?\.close\(\);/);
});
