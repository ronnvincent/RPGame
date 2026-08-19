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
const game = readFileSync('src/sideview/SideViewGame.ts', 'utf8');
const map = readFileSync('src/sideview/ui/WorldMapUI.ts', 'utf8');

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
check('nothing else is up there - even the gold moved into the plate',
  !/hud-gold-text/.test(topRight) && /plate-gold[\s\S]{0,200}hud-gold-text/.test(hud));

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

// A glyph is markup, so it must never be assigned as text. This shipped once:
// the Power chip built its string into a variable first, so a check for
// `textContent = ...glyph...` on one line saw nothing, and the whole <svg> tag
// printed across the status plate. Follow the variable.
const glyphVars = new Set(
  [...hud.matchAll(/(?:const|let)\s+([a-zA-Z_$][\w$]*)\s*=\s*[^;]*GameHUD\.glyph/g)].map(m => m[1]),
);
const leaked = [...glyphVars].filter(v =>
  new RegExp('textContent\\s*=\\s*' + v + '\\b').test(hud));
check(
  `no glyph reaches textContent, directly or through a variable (${glyphVars.size} carriers checked)`,
  !/textContent\s*=\s*[^;]*GameHUD\.glyph/.test(hud) && leaked.length === 0,
);
if (leaked.length) console.log('        leaked via:', leaked.join(', '));

// --- Real art paths are real -------------------------------------------
const art = [...hud.matchAll(/src="(\/assets\/[^"]+\.png)"/g)].map(m => m[1]);
const missing = [...new Set(art)].filter(a => !existsSync('public' + a));
check(`every icon the menu points at exists on disk (${new Set(art).size} paths)`, missing.length === 0);
if (missing.length) console.log('        missing:', missing.join(', '));

// --- The points can finally be spent -------------------------------------
// One point per level, five to a skill, +12% damage each - all of it computed,
// saved and loaded, with nowhere to spend a point. They simply accumulated.
check('there is a screen for skill points', /skills-back/.test(hud) && /toggle-skills-btn/.test(hud));
check('it spends through the engine rather than writing state itself',
  /this\.engine\.upgradeSkill\(id\)/.test(hud));
check('a capped skill or an empty pool disables the button', /pts > 0 && lvl < 5/.test(hud));
check('it redraws after a spend, so the count is never stale',
  /upgradeSkill\(id\)\) paintSkills\(\)/.test(hud));
check('and it takes pointer events back like every other panel',
  /skills-back[\s\S]{0,80}pause-back/.test(hud) || /class="pause-back" id="skills-back"/.test(hud));

// --- Nothing binds to window twice --------------------------------------
// render() rebuilds the HUD and re-runs both event setups, and it runs again
// on every equip and every item use. The markup is replaced so element
// listeners die with their elements, but window is not - so each equip added
// another Escape handler and another full set of joystick handlers. Three
// equips in and one Escape press toggled the menu four times.
const winBinds = [...hud.matchAll(/(.{0,28})window\.addEventListener\('(\w+)'/g)];
const ungated = winBinds.filter(m => !/globalsBound\) $/.test(m[1]));
check(`every window listener binds once (${winBinds.length} found, ${ungated.length} ungated)`,
  winBinds.length > 0 && ungated.length === 0);
if (ungated.length) console.log('        ungated:', ungated.map(m => m[2]).join(', '));
check('and the gate closes after both setups have run',
  /this\.globalsBound = true;/.test(hud));
check('the surviving joystick handler looks its elements up per event',
  /const live = <T extends HTMLElement>/.test(hud)
  && /const joystickKnob = live<HTMLElement>\('#joystick-knob'\)/.test(hud));

// --- One screen at a time -----------------------------------------------
// Screens closed each other by hand at each call site, so the routes that
// remembered worked and the routes that forgot left two stacked. Opening co-op
// from the world map was one: the lobby opened underneath the map, and you had
// to close the map yourself to reach what you had just asked for.
check('there is one route that opens a screen', /public showScreen\(/.test(game));
check('and it closes whatever else was open',
  /if \(which !== 'map'\) this\.worldMap\?\.close\(\)/.test(game)
  && /if \(which !== 'lobby'\) this\.coopLobby\?\.close\(\)/.test(game));
check('including the panels the HUD owns', /this\.hud\?\.closePanels\(\)/.test(game)
  && /public closePanels\(\)/.test(hud));

// The implementation is allowed to call open; nothing else is.
const body = game.slice(game.indexOf('public showScreen('), game.indexOf('public interactWithActiveNpc'));
const strayGame = [...game.matchAll(/this\.(worldMap|coopLobby)\?\.open\(/g)]
  .filter(m => !body.includes(m[0]));
const strayHud = [...hud.matchAll(/(worldMapUI|coopLobby)\?\.open\(/g)];
check(`no screen is opened outside that route (${strayGame.length + strayHud.length} strays)`,
  strayGame.length === 0 && strayHud.length === 0);

check('the map asks for the lobby rather than opening it itself',
  /this\.onOpenLobby\?\.\(\)/.test(map) && !/coopLobby/.test(map));

console.log(failures ? `\nHUD CHROME FAILURES: ${failures}\n` : '\nHUD CHROME OK\n');
process.exitCode = failures ? 1 : 0;
