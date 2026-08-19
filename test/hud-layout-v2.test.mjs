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
// Compare the two values rather than pin them: the depth is a taste call that
// has already been retuned once, but "readouts step back further than controls"
// is the rule, and a control that looks disabled is worse than a busy screen.
const opacityAfter = (marker) => {
  const i = hud.indexOf(marker);
  const m = i === -1 ? null : hud.slice(i, i + 300).match(/opacity: ([0-9.]+)/);
  return m ? Number(m[1]) : NaN;
};
const calmReadouts = opacityAfter('.hud-calm .player-status-panel');
const calmControls = opacityAfter('.hud-calm .skills-hotbar');
check(`readouts dim further than controls do (${calmReadouts} vs ${calmControls})`,
  calmReadouts < calmControls);
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

// --- The skill ring is the layout everywhere -----------------------------
// The ring lived inside the phone breakpoint, so anything wider than 860px got
// a flat strip of labelled buttons. Measured in the browser: at 1280x800 and
// at 812x375 no two slot circles touch and none leaves the screen.
const ringAt = hud.indexOf('The skill ring.');
check('the ring is in the base sheet, not a breakpoint', ringAt !== -1);
check('and it wins over the strip, which stays as the fallback',
  ringAt > hud.indexOf('.skills-hotbar {'));
check('slots are placed individually, which is what makes it a ring',
  /\.hotbar-slot\[data-skill-idx="5"\] \{[^}]*bottom: calc/.test(hud));
check('the potion joins the ring where there is no joystick to sit beside',
  /@media \(hover: hover\) and \(pointer: fine\) and \(min-width: 861px\)/.test(hud));

// --- Anything you can press has to say so --------------------------------
// #game-hud-overlay is pointer-events: none and every interactive piece has to
// hand it back. The menu did not, so it opened, looked correct, and not one
// button in it could be pressed - including CLOSE. Confirmed by hit test in the
// browser: the point at the centre of CLOSE now resolves to CLOSE.
const ruleBody = (selector) => {
  const needle = '      ' + selector + ' {';
  const i = hud.indexOf(needle);
  if (i === -1) return '';
  const close = hud.indexOf(String.fromCharCode(10) + '      }', i);
  return hud.slice(i, close === -1 ? i + 400 : close);
};
['.pause-back', '.qc-wheel'].forEach(sel =>
  check(`${sel} takes pointer events back from the overlay`,
    /pointer-events: auto/.test(ruleBody(sel))));

// --- Movement is not a skill ---------------------------------------------
// Jump, dash and talk were threaded through the skill arc - jump came within
// 5px of a skill - so one thumb had two unrelated kinds of action in one shape.
// Measured after the move: at 812x375, 667x375 and 568x320 the tightest pair is
// two skills in the arc, and nothing overlaps.
// Base indentation, not breakpoint indentation. The ring moved to the base
// sheet while these stayed inside the 860px query, so on a touch device wider
// than that the arc applied and the hub did not - jump, dash and talk fell back
// to a flex column against the right edge, on top of the skills. Measured after
// the move at 1024x768, 1180x820, 812x375 and 568x320: jump sits 268px from the
// right edge at every one, and nothing overlaps.
const offsetOf = (cls) => {
  const needle = '      .' + cls + ' {';
  for (let i = hud.indexOf(needle); i !== -1; i = hud.indexOf(needle, i + 1)) {
    const m = hud.slice(i, i + 300).match(/right: calc\(([0-9]+)px/);
    if (m) return Number(m[1]);
  }
  return NaN;
};
const utility = ['jump-touch-btn', 'dash-touch-btn', 'touch-talk-btn'].map(offsetOf);
check('the utility buttons share one column', new Set(utility).size === 1 && Number.isFinite(utility[0]));
check('and that column is clear of the skill arc, which reaches 191px',
  utility[0] > 191 + 58);

// --- Stepping back, not vanishing ----------------------------------------
check(`a calm HUD is still readable (readouts at ${calmReadouts})`,
  calmReadouts >= 0.6 && calmReadouts < 1);

// --- The menu tiles all look the same -----------------------------------
// .inv-btn paints a blue button image, and only the tiles that also carried
// .inv-btn-quest repainted over it - so Bag, which had neither, looked
// permanently selected. Confirmed in the browser: Quests and Bag now compute to
// the same background, image and border.
const menuBlock = hud.slice(hud.indexOf('<div class="pause-back"'), hud.indexOf('<!-- Mini Quest Tracker -->'));
check('no menu control carries a legacy button class', !/class="[^"]*inv-btn/.test(menuBlock));
check('and every tile is styled by one class', (menuBlock.match(/class="pause-tile"/g) || []).length >= 8);

// --- Town does not dim ---------------------------------------------------
// The threat level in town is always 0, so the HUD sat stepped back the whole
// time you were in the one place you stand around reading it.
check('town is exempt from the fade, in a state of its own', /isTownMode \? 'hud-town'/.test(hud) && /\.hud-town \.player-status-panel/.test(hud));
check('and the state is cleared with the others', /'hud-boss', 'hud-town'/.test(hud));

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
