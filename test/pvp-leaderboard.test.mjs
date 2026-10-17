/**
 * REGRESSION TEST: the Colosseum has a real board, not a local-only counter.
 *
 * A PvP record that lives only in localStorage disappears with the browser and
 * cannot rank anyone against anyone. The record now rides in the same cloud
 * save as gold, and `/api/leaderboard?sort=pvp` ranks the saves that have
 * fought at least one bout.
 *
 * Start the server (node server/index.js) before running.
 */
const BASE = (process.env.COOP_TEST_URL || 'http://localhost:3001') + '/api';
const RUN = Math.random().toString(36).slice(2, 8);

let failures = 0;
const check = (label, cond) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures++;
};

function identity(n) {
  return {
    uuid: `pvplb_${RUN}_${n}`,
    name: `Board${n}${RUN}`.slice(0, 20),
    shortId: `LB${RUN}${n}`.toUpperCase().slice(0, 16),
  };
}

async function register(who) {
  const res = await fetch(`${BASE}/register_guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: who.name, shortId: who.shortId, uuid: who.uuid }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`register failed: ${res.status} ${JSON.stringify(body)}`);
  return body.token;
}

async function save(who, token, pvp, level = 10) {
  const saveData = {
    playerState: {
      characterClass: { id: 'warrior', name: 'Warrior' },
      level,
      power: 1000 + level,
      pvp,
    },
    inventory: [],
    maxDungeonCleared: 2,
    lastUpdated: Date.now(),
  };
  const res = await fetch(`${BASE}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      uuid: who.uuid,
      saveData,
      power: 1000 + level,
      className: 'Warrior',
      level,
    }),
  });
  if (!res.ok) throw new Error(`save failed: ${res.status} ${await res.text()}`);
}

const board = async () => {
  const res = await fetch(`${BASE}/leaderboard?sort=pvp&limit=100`);
  const body = await res.json();
  if (!res.ok || !body.success) throw new Error(`leaderboard failed: ${res.status}`);
  return body.entries || [];
};

const run = async () => {
  console.log('\n=== PVP LEADERBOARD ===\n');

  const fighter = identity(1);
  const rookie = identity(2);

  const fighterToken = await register(fighter);
  const rookieToken = await register(rookie);

  await save(fighter, fighterToken, {
    matches: 9, wins: 6, losses: 3, bestStreak: 4, mvps: 2,
    roundsWon: 13, roundsLost: 8, winStreak: 1, suddenDeathWins: 1,
    lastWinDay: '2026-10-17', goldEarned: 12000,
  });
  // Never fought: a row of zeros on a PvP board says nothing about anyone.
  await save(rookie, rookieToken, {
    matches: 0, wins: 0, losses: 0, bestStreak: 0, mvps: 0,
    roundsWon: 0, roundsLost: 0, winStreak: 0, suddenDeathWins: 0,
    lastWinDay: '', goldEarned: 0,
  });

  const entries = await board();
  const mine = entries.find(e => e.shortId === fighter.shortId);
  const zero = entries.find(e => e.shortId === rookie.shortId);

  check('a saved record appears on the board', !!mine);
  check('wins are ranked from the save', !!mine && mine.wins === 6);
  check('bouts are shown beside the wins', !!mine && mine.matches === 9);
  check('the best streak travels with the record', !!mine && mine.bestStreak === 4);
  check('a player with no bouts is not ranked', !zero);
  check('the board is ordered by wins', entries.every((e, i) => i === 0 || entries[i - 1].wins >= e.wins));

  // The power board keeps working and carries the PvP figures too, so the
  // rankings UI can show a record without a second request.
  const powerRes = await fetch(`${BASE}/leaderboard?sort=power&limit=100`);
  const powerBody = await powerRes.json();
  const minePower = (powerBody.entries || []).find(e => e.shortId === fighter.shortId);
  check('the power board still ranks saves', powerRes.ok && powerBody.success && !!minePower);
  check('the power board carries the record as well', !!minePower && minePower.wins === 6);

  console.log(`\n${failures === 0 ? 'PVP LEADERBOARD OK' : failures + ' FAILURE(S)'}\n`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch(e => { console.error('ERROR:', e.message); process.exit(2); });
