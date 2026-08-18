/**
 * A heal or buff reaches the whole party, and knockback follows the blow.
 *
 * Support skills only ever touched the caster, so healing in a party healed
 * nobody who needed it and a defence buff protected one person. And knockback
 * was a flat 3.5 on every hit including the basic attack - the one you use
 * continuously - so monsters were shoved out of reach faster than they could
 * walk back in.
 */
import { readFileSync } from 'node:fs';
import { io } from 'socket.io-client';

const URL = process.env.COOP_TEST_URL || 'http://localhost:3001';
const SLOW = !!process.env.COOP_TEST_URL;
const T = ms => (SLOW ? ms * 3 : ms);
const RUN = Math.random().toString(36).slice(2, 8);
const A = { uuid: `uuid-psa-${RUN}`, name: 'Cleric', shortId: `PA${RUN}`.toUpperCase(), classId: 'priest', level: 10 };
const B = { uuid: `uuid-psb-${RUN}`, name: 'Tank', shortId: `PB${RUN}`.toUpperCase(), classId: 'warrior', level: 10 };

let failures = 0;
const check = (l, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };
const connect = () => new Promise(r => { const s = io(URL, { forceNew: true, reconnection: false }); s.on('connect', () => r(s)); });
const waitFor = (s, ev, ms = T(1500)) => new Promise(res => {
  const t = setTimeout(() => res(null), ms);
  s.once(ev, d => { clearTimeout(t); res(d); });
});

const run = async () => {
  console.log('\n=== PARTY SUPPORT ===\n');

  const a = await connect(); a.emit('register_player', A);
  const b = await connect(); b.emit('register_player', B);
  await new Promise(r => setTimeout(r, T(250)));

  a.emit('create_lobby', { dungeonId: 'goblin_catacombs', minLevel: 1, ...A });
  const lobby = await waitFor(a, 'lobby_update');
  b.emit('accept_invite', { roomId: lobby.roomId, ...B });
  await new Promise(r => setTimeout(r, T(400)));

  // A heal cast by one reaches the other.
  const gotHeal = waitFor(b, 'remote_party_support');
  a.emit('party_support', { kind: 'heal', amount: 260, casterName: 'Cleric' });
  const heal = await gotHeal;
  check('an ally receives the heal', !!heal && heal.kind === 'heal');
  check('with the amount intact', !!heal && heal.amount === 260);
  check('and who cast it', !!heal && heal.casterName === 'Cleric');

  // So does a buff.
  const gotBuff = waitFor(b, 'remote_party_support');
  a.emit('party_support', { kind: 'buff', stat: 'def', multiplier: 2, duration: 7, casterName: 'Cleric' });
  const buff = await gotBuff;
  check('an ally receives the buff', !!buff && buff.kind === 'buff' && buff.stat === 'def');

  // The caster must not receive their own relay twice.
  const echo = await waitFor(a, 'remote_party_support', T(500));
  check('the caster does not get their own support echoed back', echo === null);

  [a, b].forEach(s => s.close());

  // Knockback is derived from the damage rather than fixed.
  const engine = readFileSync('src/sideview/engine/SideViewEngine.ts', 'utf8');
  const kb = engine.match(/const knockback = Math\.min\(([\d.]+), ([\d.]+) \+ finalDamage \/ ([\d.]+)\)/);
  check('knockback scales with damage instead of being flat', !!kb);
  if (kb) {
    const [, cap, base, div] = kb.map(Number);
    const light = Math.min(cap, base + 30 / div);   // a basic attack
    const heavy = Math.min(cap, base + 600 / div);  // an ultimate
    console.log(`        basic attack ~${light.toFixed(2)}, ultimate ~${heavy.toFixed(2)} (was a flat 3.5)`);
    check('a basic attack barely shoves', light < 1.5);
    check('an ultimate still throws', heavy > 2.5);
  }

  console.log('');
  console.log(failures === 0 ? 'PARTY SUPPORT OK' : `PARTY SUPPORT FAILURES: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch(e => { console.error(e); process.exit(1); });
