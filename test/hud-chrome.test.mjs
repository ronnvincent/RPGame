/**
 * The chrome around the game.
 *
 * The top right of the screen was a row of eleven controls - gold, BGM, SFX,
 * MIC, VOICE, QUESTS, MAP, RANK, TOWN, BAG, FULLSCREEN - which wrapped onto a
 * second line on narrow screens and read as a web toolbar rather than a game.
 * None of it is touched during a fight. It is one button and a number now, and
 * everything else moved behind the menu.
 *
 * The other half of "looks like a web page" was emoji. The icon packs cover
 * things that exist in the world, so those are used as real art; the system
 * controls that have no art are drawn as one flat glyph set.
 */
import { readFileSync, existsSync } from 'node:fs';

const hud = readFileSync('src/sideview/ui/GameHUD.ts', 'utf8');

let failures = 0;
const check = (l, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };

console.log('\n=== HUD CHROME ===\n');

// --- The top right is one button ---------------------------------------
const topRight = hud.slice(
  hud.indexOf('<div class="hud-top-right">'),
  hud.indexOf('</div>', hud.indexOf('<div class="hud-top-right">') + 400),
);
const buttonsInBar = (topRight.match(/<button/g) || []).length;
check(`the top bar holds one button, not eleven (found ${buttonsInBar})`, buttonsInBar === 1);
check('and it is the menu', /id="hud-menu-btn"/.test(topRight));
check('gold stays, because it is a number not a control', /hud-gold-text/.test(topRight));

// --- Nothing was dropped, only moved ------------------------------------
const moved = ['toggle-quests-btn', 'toggle-map-btn', 'toggle-rank-btn', 'toggle-inv-btn',
  'return-town-btn', 'toggle-mic-btn', 'toggle-voice-btn', 'toggle-music-btn',
  'toggle-sfx-btn', 'toggle-fullscreen-btn'];
const menu = hud.slice(hud.indexOf('<div class="pause-back"'), hud.indexOf('<!-- Mini Quest Tracker -->'));
moved.forEach(id => check(`${id} moved into the menu rather than being deleted`, menu.includes(`id="${id}"`)));
check('the menu can be closed the two ways a player will try',
  /pause-close-btn/.test(hud) && /e\.code !== 'Escape'/.test(hud));
check('and Escape belongs to the lobby while the lobby is open',
  /coopLobby\?\.isOpen/.test(hud));

// --- No emoji -----------------------------------------------------------
const isEmoji = ch => {
  const c = ch.codePointAt(0);
  return (c >= 0x1f000 && c <= 0x1faff) || (c >= 0x2600 && c <= 0x27bf) || c === 0x2b50;
};
const stray = [...hud].filter(isEmoji);
check(`no emoji left in the HUD (found ${stray.length})`, stray.length === 0);

// --- The glyph set is real and every reference resolves ------------------
const table = hud.slice(hud.indexOf('GLYPHS: Record<string, string>'), hud.indexOf('public static glyph('));
const defined = new Set([...table.matchAll(/^\s{4}([a-zA-Z]+):\s*'/gm)].map(m => m[1]));
check(`the drawn set exists (${defined.size} glyphs)`, defined.size >= 15);

const used = [...hud.matchAll(/GameHUD\.glyph\(\s*'([a-zA-Z]+)'/g)].map(m => m[1]);
const ternary = [...hud.matchAll(/GameHUD\.glyph\([^)]*\?\s*'([a-zA-Z]+)'\s*:\s*'([a-zA-Z]+)'/g)]
  .flatMap(m => [m[1], m[2]]);
const allUsed = [...new Set([...used, ...ternary])];
const unknown = allUsed.filter(n => !defined.has(n));
check(`every glyph asked for is one that exists (${allUsed.length} used, ${unknown.length} unknown)`,
  unknown.length === 0);
if (unknown.length) console.log('        unknown:', unknown.join(', '));

// A glyph is markup, so it must never be assigned as text.
check('no glyph is written into textContent, where it would show as source',
  !/textContent\s*=\s*[^;]*GameHUD\.glyph/.test(hud));

// --- Real art paths are real -------------------------------------------
const art = [...hud.matchAll(/src="(\/assets\/[^"]+\.png)"/g)].map(m => m[1]);
const missing = [...new Set(art)].filter(a => !existsSync('public' + a));
check(`every icon the menu points at exists on disk (${new Set(art).size} paths)`, missing.length === 0);
if (missing.length) console.log('        missing:', missing.join(', '));

console.log(failures ? `\nHUD CHROME FAILURES: ${failures}\n` : '\nHUD CHROME OK\n');
process.exitCode = failures ? 1 : 0;
