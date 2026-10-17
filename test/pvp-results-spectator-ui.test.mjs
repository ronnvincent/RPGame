/**
 * The bench gets a scoreboard, not a receipt.
 *
 * A spectator did not fight, so the card must not offer a rematch vote, must
 * not print a purse, and must not claim a rating change. This renders the real
 * card with `spectator: true` and checks what is actually on screen.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { rolldown } from 'rolldown';
import { parseHTML } from 'linkedom';

const { document, window } = parseHTML('<!doctype html><html><head></head><body></body></html>');
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.Event = window.Event;
globalThis.localStorage = {
  getItem: () => null,
  setItem() {},
  removeItem() {},
  clear() {},
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
  } catch {}
}

const bundle = await rolldown({ input: 'test/pvp-results-card-fixture.ts', platform: 'browser' });
const generated = await bundle.generate({ format: 'esm' });
await bundle.close();
const code = generated.output.find(chunk => chunk.type === 'chunk')?.code;
assert.ok(code, 'results fixture should bundle');
const { PvpResultsUI } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
);

const summary = {
  winningTeam: 'blue',
  redScore: 0,
  blueScore: 2,
  rounds: [
    { roundNumber: 1, winner: 'blue', reason: 'wipe', redScore: 0, blueScore: 1 },
    { roundNumber: 2, winner: 'blue', reason: 'wipe', redScore: 0, blueScore: 2 },
  ],
  rows: [
    { id: 'r1', name: 'Crimson One', team: 'red', className: 'warrior', isLocal: false, isBot: false, kills: 0, deaths: 2, damageDealt: 400, damageTaken: 1800 },
    { id: 'b1', name: 'Azure One', team: 'blue', className: 'archer', isLocal: false, isBot: false, kills: 2, deaths: 0, damageDealt: 1800, damageTaken: 400 },
  ],
  mvp: { id: 'b1', name: 'Azure One', team: 'blue', className: 'archer', isLocal: false, isBot: false, kills: 2, deaths: 0, damageDealt: 1800, damageTaken: 400 },
  localTeam: 'red',
  localWon: false,
  suddenDeathRounds: 0,
  format: '2v2',
};
const record = {
  matches: 8, wins: 4, losses: 4, winStreak: 0, bestStreak: 2,
  roundsWon: 9, roundsLost: 11, mvps: 1, suddenDeathWins: 0,
  lastWinDay: '', title: '', rating: 1120, updatedAt: 0,
};

const host = document.createElement('div');
document.body.appendChild(host);
const card = new PvpResultsUI(
  host,
  {
    summary,
    record,
    rewards: { base: 0, rounds: 0, mvp: 0, streak: 0, firstWin: 0, total: 0 },
    title: 'Challenger',
    newTitle: null,
    localName: 'Watcher',
    spectator: true,
  },
  () => {},
);
card.open();

const root = host.querySelector('.pvp-res-card');
assert.ok(root, 'the card renders');
const text = root.textContent.replace(/\s+/g, ' ');
assert.match(text, /MATCH COMPLETE/, 'a spectator sees a match result, not a defeat');
assert.doesNotMatch(text, /DEFEAT/, 'watching a loss is not the player\'s loss');
assert.match(text, /SPECTATOR/, 'the record block names the bench');
assert.match(text, /No rating change/);
assert.match(text, /You watched this bout from the bench/);
assert.doesNotMatch(text, /Total gold/, 'no purse table is printed');
assert.doesNotMatch(text, /\+\d/, 'no gold figure is printed');
assert.equal(root.querySelector('[data-action="vote"]')?.hasAttribute('hidden'), true,
  'a spectator does not vote on a rematch');
assert.ok(root.querySelector('[data-action="town"]'), 'the spectator can still leave');
card.close();
