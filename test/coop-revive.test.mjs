/**
 * Going down, and being picked up.
 *
 * Death used to be instant and final: onRunLost sent you to town while your
 * party fought on, and a teammate could do nothing but watch. The rescue is
 * the moment people remember a co-op run for, and it could not happen.
 *
 * The socket half runs against a live server; the rules half reads the engine.
 */
import { io } from 'socket.io-client';
import { readFileSync } from 'node:fs';

const URL = process.env.COOP_TEST_URL || 'http://localhost:3001';
const SLOW = !!process.env.COOP_TEST_URL;
const T = ms => (SLOW ? ms * 3 : ms);
const RUN = Math.random().toString(36).slice(2, 8);
const A = { uuid: `uuid-rva-${RUN}`, name: 'Faller', shortId: `RA${RUN}`.toUpperCase(), classId: 'knight', level: 10 };
const B = { uuid: `uuid-rvb-${RUN}`, name: 'Rescuer', shortId: `RB${RUN}`.toUpperCase(), classId: 'priest', level: 10 };

let failures = 0;
const check = (l, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };
const connect = () => new Promise(r => {
  const s = io(URL, { forceNew: true, reconnection: false });
  s.on('connect', () => r(s));
});
const waitFor = (s, ev, ms = T(2000)) => new Promise(res => {
  const t = setTimeout(() => res(null), ms);
  s.once(ev, d => { clearTimeout(t); res(d); });
});

const engine = readFileSync('src/sideview/engine/SideViewEngine.ts', 'utf8');
const hud = readFileSync('src/sideview/ui/GameHUD.ts', 'utf8');
const game = readFileSync('src/sideview/SideViewGame.ts', 'utf8');

const run = async () => {
  console.log('\n=== DOWNED & REVIVE ===\n');

  // --- The rules -------------------------------------------------------
  check(
    'a killing blow downs you instead of ending the run',
    /p\.downed = true/.test(engine) && /downTimer = SideViewEngine\.BLEED_OUT_SECONDS/.test(engine),
  );
  check(
    'but only when somebody could actually reach you',
    /canBeRevived\(\)[\s\S]{0,220}network\.isPartied/.test(engine),
  );
  check(
    'and only once a run, so dying keeps a cost',
    /revivesUsed \|\| 0\) < 1/.test(engine),
  );
  check(
    'bleeding out ends the run after all',
    /tickDowned[\s\S]{0,600}this\.runOver = true;[\s\S]{0,60}onRunLost/.test(engine),
  );
  check(
    'a downed player cannot move, jump, dash or cast',
    (engine.match(/this\.player\.downed \|\| this\.playerStatusMagnitude\('stun'\)/g) || []).length >= 3
      && /castSkillFromMechanics[\s\S]{0,260}p\.downed/.test(engine),
  );
  check(
    'and cannot be finished off while helpless',
    /applyIncomingPlayerDamage[\s\S]{0,700}p\.downed[\s\S]{0,160}iframeTimer > 0/.test(engine),
  );
  check(
    'the rescue is a hold, not a tap',
    /REVIVE_HOLD_SECONDS/.test(engine) && /reviveHold \+= dt/.test(engine),
  );
  check(
    'walking away loses the progress',
    /if \(!target \|\| !holding[\s\S]{0,140}this\.reviveHold = 0/.test(engine),
  );
  check('teammates can see who is down', /drawDownedMarkers/.test(engine));
  check('and you can see your own timer', /paintDownedOverlay/.test(hud));
  check(
    'the phone can revive too, without a new button',
    /touch-revive-btn/.test(hud) && /touchReviveHeld/.test(hud) && /touchReviveHeld/.test(game),
  );
  check(
    'the tally and the one rescue reset when a run starts',
    /resetRunStats\(\)/.test(game) && /resetRunStats\(\)[\s\S]{0,400}revivesUsed = 0/.test(engine),
  );

  // --- The relay -------------------------------------------------------
  const a = await connect(); a.emit('register_player', A);
  const b = await connect(); b.emit('register_player', B);
  await new Promise(r => setTimeout(r, T(250)));

  const lobbied = waitFor(a, 'lobby_update', T(2500));
  a.emit('create_lobby', { dungeonId: 'goblin_catacombs', minLevel: 999, ...A });
  const lobby = await lobbied;
  const roomId = lobby?.roomId || lobby?.room?.roomId;
  check('a party exists to be rescued in', !!roomId);

  const joined = waitFor(a, 'lobby_update', T(2500));
  b.emit('accept_invite', { roomId, ...B });
  await joined;

  // The fall is announced to the party, not just to the person who fell.
  const heardFall = waitFor(b, 'remote_party_support', T(2000));
  a.emit('party_support', { kind: 'downed', casterName: A.name });
  const fall = await heardFall;
  check('the party is told when someone goes down', fall?.kind === 'downed' && fall?.casterName === A.name);

  // The pick-up is targeted: everyone hears it, only the right person stands up.
  const heardRevive = waitFor(a, 'remote_party_support', T(2000));
  b.emit('party_support', { kind: 'revive', targetSocketId: a.id, casterName: B.name });
  const rev = await heardRevive;
  check('a revive names who it is for', rev?.kind === 'revive' && rev?.targetSocketId === a.id);
  check('and says who did it, so the credit lands', rev?.casterName === B.name);

  a.close(); b.close();
  console.log(failures ? `\nREVIVE FAILURES: ${failures}\n` : '\nREVIVE OK\n');
  process.exitCode = failures ? 1 : 0;
};

run().catch(e => { console.error(e); process.exitCode = 1; });
