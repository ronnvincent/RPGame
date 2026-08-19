/**
 * What is on screen, and when.
 *
 * The complaint was that everything is crammed into one screen at once. Three
 * changes answer it: the status readouts became one plate instead of six loose
 * pieces, chrome steps back when nothing is threatening you, and the party -
 * which had no representation at all - got a rail, so the downed and revive
 * system is legible without walking into the body.
 */
import { readFileSync } from 'node:fs';

const hud = readFileSync('src/sideview/ui/GameHUD.ts', 'utf8');
const engine = readFileSync('src/sideview/engine/SideViewEngine.ts', 'utf8');
const net = readFileSync('src/sideview/network/NetworkManager.ts', 'utf8');

let failures = 0;
const check = (l, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };

console.log('\n=== HUD LAYOUT ===\n');

// --- One plate ----------------------------------------------------------
const plate = hud.slice(
  hud.indexOf('<div class="player-status-panel">'),
  hud.indexOf('<!-- Who else is here.'),
);
check('gold moved into the plate', /plate-gold/.test(plate) && /hud-gold-text/.test(plate));
check('and Power with it', /plate-power/.test(plate) && /hud-power/.test(plate));
check('EXP is a hairline, not a third framed bar',
  /plate-exp/.test(plate) && !/sprite-bar-exp/.test(plate));
check('HP and MP keep their frames, because those are read mid-fight',
  (plate.match(/sprite-bar-frame/g) || []).length === 2);
// The ID was put on the HUD by explicit request - you read it out to a friend
// to be invited - so decluttering moves it, it does not remove it. It lost its
// own row and joined the plate's footer beside the gold and Power.
check('the player ID is still on screen without opening anything',
  /plate-id/.test(plate) && /hud-id-text/.test(plate));
check('but it no longer costs a row of its own', !/hud-id-row/.test(hud));
check('and it is refreshed if the account is created later',
  /idText.textContent !== shortId/.test(hud));

// --- Chrome steps back --------------------------------------------------
check('the engine reports how dangerous the moment is', /public threatLevel\(\)/.test(engine));
check('a boss counts louder than a mob', /e\.type === 'boss'/.test(engine));
check('being down is treated as the loudest state', /if \(p\.downed\) return 2/.test(engine));
check('a lull inside a fight does not dim the HUD',
  /lastHurtAt\) < 3500/.test(engine) && /this\.lastHurtAt = performance\.now\(\)/.test(engine));
check('town is always calm', /if \(this\.isTownMode\) return 0/.test(engine));

check('the HUD carries that level as a class', /hud-calm|hud-alert|hud-boss/.test(hud));
check('readouts dim further than controls do', /hud-calm .player-status-panel[\s\S]{0,220}opacity: 0\.38/.test(hud)
  && /hud-calm .skills-hotbar[\s\S]{0,120}opacity: 0\.72/.test(hud));
check('coming back is faster than fading out',
  /hud-alert .player-status-panel[\s\S]{0,240}transition: opacity 0\.08s/.test(hud));
check('the class is only written when it changes, or the fade never runs',
  /if \(this\.threatClass === cls\) return;/.test(hud));

// --- Two control schemes were on screen at once -------------------------
// The joystick, TALK, JUMP and DASH had no display rule anywhere, so on a
// desktop they were drawn on top of a layout that already has keys for all
// four. Verified in the browser: hidden at 1280x800, shown at 812x375.
const gateAt = hud.indexOf('Touch controls are for touch.');
check('touch controls are hidden by default', gateAt !== -1
  && /\.mobile-joystick-area,\s*\n\s*\.mobile-action-hub \{\s*\n\s*display: none;/.test(hud));
check('and come back for a finger, or a window small enough to need them',
  /@media \(hover: none\) and \(pointer: coarse\), \(max-width: 860px\)/.test(hud));
check('the gate sits below both base rules, or the cascade would undo it',
  gateAt > hud.indexOf('.mobile-action-hub {\n        position: absolute;'));

// --- The party rail -----------------------------------------------------
check('allies have a rail', /ally-rail/.test(hud) && /paintAllyRail/.test(hud));
check('it shows their health', /ally-hp-fill/.test(hud));
check('and flags who is down', /is-down/.test(hud) && /ally-down-tag/.test(hud));
check('the rail hides itself when you are alone', /has-allies/.test(hud));
check('and is not rebuilt every frame, which would kill the bar transition',
  /if \(key !== this\.allyKey\)/.test(hud));

// The rail needs data that was being sent but thrown away on arrival.
check('health rides the move packet', /hpPct: Math\.max\(0, Math\.min\(100/.test(net));
check('and is applied when it arrives', /existing\.hpPct = data\.hpPct/.test(net));
check('as is downed - it was sent but never applied, so the marker never drew',
  /existing\.downed = !!data\.downed/.test(net));

console.log(failures ? `\nHUD LAYOUT FAILURES: ${failures}\n` : '\nHUD LAYOUT OK\n');
process.exitCode = failures ? 1 : 0;
