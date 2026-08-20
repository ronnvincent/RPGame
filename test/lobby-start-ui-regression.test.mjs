import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'test/lobby-start-regression-fixture.ts', platform: 'browser' });
const generated = await bundle.generate({ format: 'esm' });
await bundle.close();
const code = generated.output.find(chunk => chunk.type === 'chunk')?.code;
assert.ok(code, 'lobby start fixture should bundle');
const fixture = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

const lobby = readFileSync('src/sideview/ui/CoopLobbyUI.ts', 'utf8');
const hud = readFileSync('src/sideview/ui/GameHUD.ts', 'utf8');
const server = readFileSync('server/index.js', 'utf8');

test('creating a party preserves the standing dungeon-start transition', () => {
  const result = fixture.exerciseLobbyStartFlow();
  assert.equal(result.launchedDungeon, 'goblin_catacombs');
  assert.equal(result.missingRoomResult, false);
  assert.equal(result.sentResult, true);
  assert.equal(result.events.filter(event => event === 'lobby_start').length, 1);
  assert.match(hud, /network\.createLobby\(d\.id, d\.minLevel \|\| 1\);/);
  assert.doesNotMatch(hud, /network\.createLobby\([^;]+\(\) => \{\}/);
});

test('party stage has no bonus banner or heavy sprite-covering card frame', () => {
  assert.doesNotMatch(lobby, /PartySynergy|cl-syn|this\.fact\('Bonus'/);
  assert.doesNotMatch(lobby, /clip-path:\s*polygon/);
  assert.match(lobby, /\.cl-crest-art\.cl-crest-hero \{[\s\S]{0,180}flex: 1 1 auto/);
  assert.match(lobby, /\.cl-crest-caption \{ flex: none/);
  assert.match(lobby, /\.cl-pane \{[\s\S]{0,180}border-image:/);
  assert.doesNotMatch(lobby, /\.cl-pane, \.cl-crest/);
});

test('start input is de-duplicated on client and server', () => {
  assert.match(lobby, /if \(target\?\.closest\('button'\)\) return;/);
  assert.match(server, /if \(!room \|\| room\.started\) return;/);
});
