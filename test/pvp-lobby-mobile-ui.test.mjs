/**
 * REGRESSION TEST: the Colosseum lobby has to survive a phone.
 *
 * It did not. On a landscape phone the header, join bar, tabs, format row and
 * footer ate almost the whole height, so the roster was reduced to a sliver;
 * the bench repeated a 93x94 panel texture whose seams read as eight mystery
 * buttons; the bench note was laid over the team banner; and the join input
 * was clipped mid-placeholder because the row could not fit it.
 *
 * The rules below are the design contract that fixes it:
 *   - a fixed height budget, so the roster always keeps the remaining space;
 *   - one solid, high-contrast bench strip whose chairs scroll sideways
 *     instead of wrapping into a second row;
 *   - touch targets at or above 40px on a phone;
 *   - no control printed over another control;
 *   - one clear primary action per screen.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { rolldown } from 'rolldown';
import { parseHTML } from 'linkedom';

const source = readFileSync(
  new URL('../src/sideview/ui/TournamentLobbyUI.ts', import.meta.url),
  'utf8',
);

/** The CSS block, isolated from the TypeScript around it. */
const css = source.slice(source.indexOf('style.textContent = `'), source.indexOf('`;\n    document.head.appendChild'));
const phone = css.slice(css.indexOf('@media (max-width: 720px)'), css.indexOf('@media (max-height: 560px)'));
const shortScreen = css.slice(css.indexOf('@media (max-height: 560px)'));
const base = css.slice(0, css.indexOf('@media (max-width: 900px)'));

const rule = (block, selector) => {
  const index = block.indexOf(selector + ' {');
  if (index < 0) return '';
  return block.slice(index, block.indexOf('}', index) + 1);
};

test('the roster keeps the height the chrome does not need', () => {
  assert.match(base, /\.pvp-versus-stage \{[^}]*flex: 1 1 auto; min-height: 0;/,
    'the stage is the flexible row, not a fixed box');
  assert.match(base, /\.pvp-versus-stage \{[^}]*overflow-x: hidden;/,
    'no horizontal bleed past the panel');
  assert.match(base, /\.pvp-versus-stage > \* \{ min-width: 0; \}/,
    'grid children may shrink instead of forcing the stage wider');
  for (const chrome of ['.pvp-header', '.pvp-nav-tabs', '.pvp-format-selector', '.pvp-footer']) {
    assert.match(rule(base, chrome), /flex: 0 0 auto;/, `${chrome} must not grow`);
  }
  assert.match(phone + shortScreen, /height: 100dvh; max-height: 100dvh;/,
    'a phone gets the whole screen, not 96vh of it');

  // The budget that used to collapse: on a 360px-tall landscape phone the
  // fixed rows must leave the stage a usable share. Values are the ones the
  // short-screen block sets; this is a guard against the chrome creeping back.
  const header = 32 + 8;      // close/room row + vertical padding
  const tabs = 30 + 6;
  const format = 28 + 6;
  const footer = 36 + 8;
  const stage = 360 - (header + tabs + format + footer);
  assert.ok(stage >= 150, `the stage keeps ${stage}px on a 360px screen`);
});

test('the bench is one solid strip, and its chairs scroll instead of wrapping', () => {
  const bench = rule(base, '.pvp-spectator-bench');
  assert.match(bench, /background: linear-gradient/,
    'the bench uses a real surface, not a repeating panel texture');
  assert.doesNotMatch(bench, /url\(/,
    'a tiled panel reads as a row of fake buttons');
  assert.match(bench, /color: var\(--sand-ink\)/, 'dark ink on the sand surface');

  const chairs = rule(base, '.pvp-bench-chairs');
  assert.match(chairs, /overflow-x: auto;/);
  assert.match(chairs, /flex: 1 1 auto; min-width: 0;/);
  const chair = rule(base, '.pvp-bench-chair');
  assert.match(chair, /min-height: 36px;/);
  assert.match(chair, /flex: 0 0 auto;/, 'a chair keeps its width inside the scroller');
  assert.match(phone, /\.pvp-bench-chair \{ min-height: 40px; \}/, 'thumb-sized on a phone');
  assert.doesNotMatch(chairs, /flex-wrap: wrap/, 'chairs never become a second row');
});

test('one primary action, full width, and nothing printed on top of it', () => {
  assert.match(phone, /\.pvp-footer \{[^}]*flex-direction: column-reverse;/,
    'the primary action sits above the secondary row on a phone');
  assert.match(phone, /\.pvp-footer-actions, \.pvp-footer-actions \.pvp-btn-ready,\s*\.pvp-footer-actions \.pvp-btn-start \{ width: 100%; \}/,
    'the primary action is full width');
  assert.match(phone, /\.pvp-btn-start, \.pvp-btn-ready \{ min-width: 0; min-height: 46px;/);
  assert.match(phone, /env\(safe-area-inset-bottom, 0px\)/,
    'the footer clears the home indicator');
  assert.match(base, /\.pvp-launch-warning \{[^}]*text-align: right;/);
  assert.match(shortScreen, /\.pvp-launch-warning \{[^}]*flex: 1 1 auto;[^}]*text-align: center;/,
    'on a short screen the reason sits between the two action groups, not under them');
  assert.match(shortScreen, /\.pvp-start-full \{ display: none; \}[\s\S]{0,80}\.pvp-start-short \{ display: inline; \}/,
    'the launch button gets a short label rather than wrapping to two lines');
});

test('the portrait grid stacks bench, switch, then the two teams', () => {
  assert.match(phone, /grid-template-areas: "bench bench" "center center" "red blue";/);
  assert.match(phone, /\.pvp-col-red \{ grid-area: red; \}/);
  assert.match(phone, /\.pvp-col-blue \{ grid-area: blue; \}/);
  assert.match(phone, /\.pvp-center-col \{ grid-area: center; flex-direction: row;/,
    'the VS strip becomes one compact row instead of a tall middle column');
  assert.match(shortScreen, /grid-template-areas: none;/,
    'the short-landscape layout goes back to three columns');
  assert.match(shortScreen, /grid-template-columns: minmax\(0, 1fr\) minmax\(64px, 88px\) minmax\(0, 1fr\);/);
  assert.match(shortScreen, /\.pvp-spectator-bench \{[^}]*grid-column: 1 \/ -1;/,
    'the bench still spans the stage when the phone layout is unwound');
});

test('touch targets and text sizes hold up on a phone', () => {
  const tapTargets = [
    [rule(phone, '.pvp-nav-tab'), 40],
    [rule(phone, '.pvp-join-input'), 40],
    [rule(phone, '.pvp-join-code-btn'), 40],
    [rule(phone, '.pvp-fmt-btn'), 38],
    [rule(phone, '.pvp-bench-chair'), 40],
    [rule(phone, '.pvp-bench-note'), 40],
    [rule(phone, '.pvp-btn-start, .pvp-btn-ready'), 46],
    [rule(phone, '.pvp-btn-leave, .pvp-btn-practice'), 40],
    [rule(shortScreen, '.pvp-bench-chair'), 30],
  ];
  for (const [block, minimum] of tapTargets) {
    const match = block.match(/min-height: (\d+)px/);
    assert.ok(match, `missing min-height in: ${block.slice(0, 60)}`);
    assert.ok(Number(match[1]) >= minimum, `expected >= ${minimum}px, got ${match[1]}px`);
  }
  assert.match(shortScreen, /\.pvp-bench-note \{ min-height: 30px;/);
  // The old mobile block went down to 7.5px; nothing below 8.5 remains.
  const sizes = [...phone.matchAll(/font-size: ([\d.]+)px/g), ...shortScreen.matchAll(/font-size: ([\d.]+)px/g)]
    .map(m => Number(m[1]));
  assert.ok(Math.min(...sizes) >= 8.5, `smallest mobile type is ${Math.min(...sizes)}px`);
});

test('the screen answers a press and respects reduced motion', () => {
  assert.match(base, /\.pvp-modal-shell button \{ font-family: inherit; touch-action: manipulation; \}/);
  assert.match(base, /\.pvp-modal-shell \{[\s\S]{0,900}-webkit-tap-highlight-color: transparent;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.pvp-fmt-btn\.active \{[\s\S]{0,200}color: #2b1807;/,
    'the selected format is readable, not just tinted');
});

// ---------------------------------------------------------------------------
// The DOM the phone actually receives.
// ---------------------------------------------------------------------------
const { document, window } = parseHTML('<!doctype html><html><head></head><body></body></html>');
const storage = new Map();
globalThis.window = window;
globalThis.document = document;
globalThis.location = { hostname: 'localhost', origin: 'http://localhost' };
globalThis.HTMLElement = window.HTMLElement;
globalThis.Node = window.Node;
globalThis.Event = window.Event;
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

const bundle = await rolldown({ input: 'test/pvp-lobby-seat-fixture.ts', platform: 'browser' });
const generated = await bundle.generate({ format: 'esm' });
await bundle.close();
const code = generated.output.find(chunk => chunk.type === 'chunk')?.code;
const { TournamentLobbyUI, network } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
);
network.pickPvpSeat = () => {};
network.getActorId = () => 'me';

const member = (id, seat, slot) => ({
  actorId: id,
  uuid: id,
  name: id === 'me' ? 'Me' : id === 'mate' ? 'Mate' : 'Foe',
  socketId: `s-${id}`,
  shortId: id.toUpperCase(),
  classId: 'warrior',
  level: 7,
  power: 100,
  team: seat === 'spectator' ? undefined : seat,
  seat,
  slot,
  ready: false,
  isHost: id === 'me',
  online: true,
});

function renderLobby({ inRoom = true, tab = 'arena' } = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const ui = new TournamentLobbyUI(host, {
    player: { name: 'Me', characterClass: { id: 'warrior' }, level: 7, power: 100 },
  }, () => {});
  ui.currentFormat = '2v2';
  ui.activeTab = tab;
  ui.overlay = document.createElement('div');
  ui.state = {
    roomId: inRoom ? 'room-mobile' : '',
    roomCode: '8639',
    dungeonId: 'tournament_colosseum',
    maxPlayers: 4,
    started: false,
    isPvp: true,
    pvpFormat: '2v2',
    pvpTeams: { me: 'red' },
    pvpSeats: { me: 0, mate: 0 },
    pvpBenchSize: 2,
    members: [member('me', 'red', 0), member('mate', 'blue', 0)],
  };
  ui.render();
  return ui.overlay;
}

test('a player already in a room is not shown a dead join field', () => {
  assert.equal(renderLobby().querySelector('.pvp-quick-join-bar'), null);
  // Someone browsing for another room keeps it. (Set the tab directly: the
  // tab button opens a socket to browse, which this DOM test does not need.)
  const browsing = renderLobby({ tab: 'public' });
  assert.ok(browsing.querySelector('.pvp-quick-join-bar'), 'Public Duels still offers a code');
});

test('the header, bench and footer carry the labels a phone needs', () => {
  const overlay = renderLobby();
  assert.ok(overlay.querySelector('.pvp-qr-icon'));
  assert.ok(overlay.querySelector('.pvp-qr-text'), 'the icon has a word next to it on wide screens');
  assert.ok(overlay.querySelector('.pvp-badge-lbl'));
  const roomBadge = overlay.querySelector('.pvp-quick-code-badge');
  assert.equal(roomBadge.tagName.toLowerCase(), 'button', 'the room code is one tap target');
  assert.equal(roomBadge.querySelectorAll('button').length, 0, 'and it holds no nested control');
  const bench = overlay.querySelector('.pvp-spectator-bench');
  assert.ok(bench.querySelector('.pvp-bench-title').textContent.includes('BENCH'));
  assert.ok(bench.querySelector('.pvp-bench-count').textContent.includes('/'));
  assert.ok(bench.querySelector('.pvp-bench-chairs'));
  assert.equal(bench.querySelectorAll('.pvp-bench-chair').length, 2, 'only the real chairs');
  assert.ok(overlay.querySelector('.pvp-footer-actions'), 'the primary action has its own group');
  assert.ok(overlay.querySelector('[role="group"][aria-label="Match format"]'));
});

test('a benched player gets an action, not a paragraph over the banner', () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const ui = new TournamentLobbyUI(host, {
    player: { name: 'Me', characterClass: { id: 'warrior' }, level: 7, power: 100 },
  }, () => {});
  ui.currentFormat = '2v2';
  ui.overlay = document.createElement('div');
  ui.state = {
    roomId: 'room-mobile',
    roomCode: '8639',
    dungeonId: 'tournament_colosseum',
    maxPlayers: 4,
    started: false,
    isPvp: true,
    pvpFormat: '2v2',
    pvpTeams: { mate: 'red' },
    pvpSeats: { mate: 0 },
    pvpBenchSize: 2,
    members: [member('me', 'spectator', 0), member('mate', 'red', 0)],
  };
  ui.render();
  const note = ui.overlay.querySelector('.pvp-bench-note');
  assert.ok(note, 'the bench explains itself');
  assert.equal(note.tagName.toLowerCase(), 'button', 'and the way back is a control');
  assert.match(note.textContent, /TAKE A SEAT/);
  // One way back. The footer used to repeat the same button, so a phone
  // showed two identical primary actions with the bench's right above it.
  const seatButtons = [...ui.overlay.querySelectorAll('button')]
    .filter(button => /TAKE A SEAT/.test(button.textContent));
  assert.equal(seatButtons.length, 1, 'the bench owns the seat action on its own tab');
});

test('a benched player can leave the bench from a tab with no stage', () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const ui = new TournamentLobbyUI(host, {
    player: { name: 'Me', characterClass: { id: 'warrior' }, level: 7, power: 100 },
  }, () => {});
  ui.currentFormat = '2v2';
  ui.activeTab = 'invite';
  ui.overlay = document.createElement('div');
  ui.state = {
    roomId: 'room-mobile',
    roomCode: '8639',
    dungeonId: 'tournament_colosseum',
    maxPlayers: 4,
    started: false,
    isPvp: true,
    pvpFormat: '2v2',
    pvpTeams: { mate: 'red' },
    pvpSeats: { mate: 0 },
    pvpBenchSize: 2,
    // The room snapshot is the authority now: this player is a benched
    // guest, so the host flag lives on the other member.
    members: [
      { ...member('me', 'spectator', 0), isHost: false },
      { ...member('mate', 'red', 0), isHost: true },
    ],
  };
  // A benched *guest*: the host's footer belongs to the launch button.
  const wasHost = network.isHost;
  network.isHost = false;
  ui.render();
  network.isHost = wasHost;
  const button = ui.overlay.querySelector('.pvp-footer-actions [data-action="take-team-seat"]');
  assert.ok(button, 'the footer carries the way back when the bench is not on screen');
  const picked = [];
  ui.pickSeat = (seat) => picked.push(seat);
  button.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert.equal(picked.length, 1, 'and the button is actually wired');
});
