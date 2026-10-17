/**
 * REGRESSION TEST: every lobby chair is a chair you can actually take.
 *
 * The old grid ignored the seat a player had picked, so tapping the second or
 * third slot in your own team did nothing: the handler only knew about teams,
 * and "switch to the team you are already on" was a no-op. Only the first open
 * chair ever responded.
 *
 * This renders the real lobby against a DOM and taps it like a player would:
 * an empty chair must send its own index, an occupied chair must ask for a
 * swap, and the spectator bench must sit above both teams.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { rolldown } from 'rolldown';
import { parseHTML } from 'linkedom';

const lobbySource = readFileSync(
  new URL('../src/sideview/ui/TournamentLobbyUI.ts', import.meta.url),
  'utf8',
);

const { document, window } = parseHTML('<!doctype html><html><head></head><body></body></html>');
const storage = new Map();
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.Event = window.Event;
globalThis.KeyboardEvent = window.KeyboardEvent;
globalThis.localStorage = {
  getItem: key => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
  clear: () => storage.clear(),
};
window.localStorage = globalThis.localStorage;
globalThis.requestAnimationFrame = cb => setTimeout(cb, 0);
window.requestAnimationFrame = globalThis.requestAnimationFrame;
globalThis.matchMedia = () => ({ matches: true, addEventListener() {} });
window.matchMedia = globalThis.matchMedia;
if (!globalThis.navigator?.clipboard) {
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText() {} } },
      configurable: true,
    });
  } catch {
    // Node's navigator is read-only on some versions; the lobby only copies
    // text when the room code is tapped.
  }
}

const bundle = await rolldown({ input: 'test/pvp-lobby-seat-fixture.ts', platform: 'browser' });
const generated = await bundle.generate({ format: 'esm' });
await bundle.close();
const code = generated.output.find(chunk => chunk.type === 'chunk')?.code;
assert.ok(code, 'lobby fixture should bundle');
const { TournamentLobbyUI, network } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
);

const calls = [];
network.pickPvpSeat = (seat, slot) => calls.push([seat, slot]);
network.getActorId = () => 'me';

function mountLobby(members, overrides = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const engine = {
    player: { name: 'Me', characterClass: { id: 'warrior' }, level: 7, power: 100 },
  };
  const ui = new TournamentLobbyUI(host, engine, () => {});
  ui.currentFormat = overrides.format || '3v3';
  ui.overlay = document.createElement('div');
  ui.state = {
    roomId: 'room-seats',
    roomCode: '4242',
    dungeonId: 'tournament_colosseum',
    maxPlayers: 6,
    started: false,
    isPvp: true,
    pvpFormat: ui.currentFormat,
    pvpTeams: Object.fromEntries(members.filter(m => m.seat !== 'spectator').map(m => [m.actorId, m.seat])),
    pvpSeats: Object.fromEntries(members.map(m => [m.actorId, m.slot])),
    pvpBenchSize: 2,
    members,
  };
  ui.render();
  return ui;
}

const member = (id, name, seat, slot, extra = {}) => ({
  actorId: id,
  uuid: id,
  name,
  socketId: `socket-${id}`,
  shortId: id.toUpperCase(),
  classId: 'warrior',
  level: 7,
  power: 100,
  team: seat === 'spectator' ? 'red' : seat,
  seat,
  slot,
  ready: false,
  isHost: id === 'me',
  online: true,
  ...extra,
});

const LINEUP = [
  member('me', 'Me', 'red', 0),
  member('mate', 'Mate', 'red', 2, { classId: 'mage' }),
  member('foe', 'Foe', 'blue', 1, { classId: 'archer' }),
  member('bench', 'Bench', 'spectator', 0, { classId: 'priest' }),
];

test('the bench is the top row of the stage, above both teams', () => {
  const ui = mountLobby(LINEUP);
  const stage = ui.overlay.querySelector('.pvp-versus-stage');
  const bench = ui.overlay.querySelector('.pvp-spectator-bench');
  assert.ok(bench, 'the bench renders');
  assert.equal(stage.firstElementChild, bench, 'the bench is the first row of the stage');
  assert.match(lobbySource, /\.pvp-spectator-bench \{[^}]*grid-column: 1 \/ -1;/,
    'the bench spans the full width above the columns');
  assert.ok(bench.textContent.includes('Bench'), 'a seated spectator is named');
  assert.ok(bench.querySelectorAll('.pvp-bench-chair.is-open').length >= 1, 'open chairs are offered');
});

test('a player sits in the chair they chose, not the next one in line', () => {
  const ui = mountLobby(LINEUP);
  const cards = ui.overlay.querySelectorAll('.pvp-col-red .pvp-fighter-card');
  assert.equal(cards.length, 3);
  assert.ok(cards[0].textContent.includes('Me'), 'seat 1 holds the host');
  assert.ok(cards[1].classList.contains('pvp-empty-slot'), 'seat 2 is open');
  assert.ok(cards[2].textContent.includes('Mate'), 'seat 3 holds the player who picked it');
  assert.equal(ui.state.members.find(m => m.actorId === 'mate').slot, 2);
});

test('tapping any chair sends that chair, and a taken chair is a swap', () => {
  calls.length = 0;
  const ui = mountLobby(LINEUP);

  const middle = ui.overlay.querySelectorAll('.pvp-col-red .pvp-fighter-card')[1];
  middle.querySelector('[data-action="pick-seat"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.deepEqual(calls.at(-1), ['red', 1], 'the empty middle chair is its own target');
  assert.equal(ui.state.members.find(m => m.actorId === 'me').slot, 1,
    'the local snapshot answers the tap immediately');

  const mateCard = Array.from(ui.overlay.querySelectorAll('.pvp-fighter-card'))
    .find(card => card.textContent.includes('Mate'));
  mateCard.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.deepEqual(calls.at(-1), ['red', 2], 'a taken chair asks for a swap, not a no-op');

  const blueSeat = ui.overlay.querySelector('.pvp-col-blue .pvp-fighter-card')?.closest('[data-seat]');
  assert.ok(blueSeat, 'the enemy chair is tappable too');
});

test('the bench can be taken and left, and it says so when you are on it', () => {
  calls.length = 0;
  const ui = mountLobby(LINEUP);

  const openBench = ui.overlay.querySelector('.pvp-bench-chair.is-open');
  openBench.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.deepEqual(calls.at(-1), ['spectator', 1], 'an open bench chair sends its index');

  const benchLineup = [
    member('me', 'Me', 'spectator', 0),
    member('mate', 'Mate', 'red', 0),
    member('foe', 'Foe', 'blue', 0),
    member('other', 'Other', 'spectator', 1),
  ];
  const onBench = mountLobby(benchLineup);
  assert.ok(onBench.overlay.querySelector('.pvp-bench-note'), 'the bench explains how to drop back in');
  const teamChair = onBench.overlay.querySelector('.pvp-col-red .pvp-empty-slot');
  teamChair.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.deepEqual(calls.at(-1), ['red', 1], 'a benched player can take a team chair');

  // A fresh render: tap somebody else's bench chair to swap with them.
  const onBenchAgain = mountLobby(benchLineup);
  const otherChair = Array.from(onBenchAgain.overlay.querySelectorAll('.pvp-bench-chair.is-taken'))
    .find(chair => chair.textContent.includes('Other'));
  otherChair.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.deepEqual(calls.at(-1), ['spectator', 1], 'and can swap seats on the bench');
});
