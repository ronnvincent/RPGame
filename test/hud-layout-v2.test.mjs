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
// The utility column stays outside the compact skill fan.
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
check('and that column is clear of the skill fan, which reaches 239px',
  utility[0] > 239);

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

// --- Compact attack fan --------------------------------------------------
// The former 175px radius made the attack feel detached from its abilities.
// A 100px radius with a wider angular sweep keeps 58px neighbours apart while
// moving the large primary action into the same thumb cluster.
check('the skills use the compact 100px-radius fan',
  /tight 100px-radius fan/.test(hud));
const attackRule = (() => {
  const marker = hud.indexOf('The Main Attack Button');
  const i = hud.indexOf('      .hotbar-slot[data-skill-idx="0"] {', marker);
  return i === -1 ? '' : hud.slice(i, i + 500);
})();
check('and the attack is pulled left into that fan', /right: calc\(67px/.test(attackRule));

const fanPlacements = [
  { idx: 0, right: 67, bottom: 27, width: 86, height: 86 },
  { idx: 1, right: 181, bottom: 41, width: 58, height: 58 },
  { idx: 2, right: 162, bottom: 100, width: 58, height: 58 },
  { idx: 3, right: 112, bottom: 136, width: 58, height: 58 },
  { idx: 4, right: 50, bottom: 136, width: 58, height: 58 },
  { idx: 5, right: 0, bottom: 100, width: 58, height: 58 },
];
const sharedSkillRuleStart = hud.indexOf('.hotbar-slot[data-skill-idx="1"],');
const sharedSkillRule = sharedSkillRuleStart === -1 ? '' : hud.slice(sharedSkillRuleStart, sharedSkillRuleStart + 400);
const sharedSkillWidth = Number(sharedSkillRule.match(/width: ([0-9]+)px/)?.[1]);
const sharedSkillHeight = Number(sharedSkillRule.match(/height: ([0-9]+)px/)?.[1]);
const fanCoordinateMarker = hud.indexOf('Five 58px skills on a tight 100px-radius fan');
const declaredFanPlacement = (idx) => {
  const selector = `.hotbar-slot[data-skill-idx="${idx}"]`;
  const start = hud.indexOf(`${selector} {`, idx === 0 ? hud.indexOf('The Main Attack Button') : fanCoordinateMarker);
  const body = start === -1 ? '' : hud.slice(start, start + 500).split('}')[0];
  const number = (property) => Number(body.match(new RegExp(`${property}: calc\\(([0-9]+)px`))?.[1]);
  const size = (property) => Number(body.match(new RegExp(`${property}: ([0-9]+)px`))?.[1]);
  return {
    idx,
    right: number('right'),
    bottom: number('bottom'),
    width: idx === 0 ? size('width') : sharedSkillWidth,
    height: idx === 0 ? size('height') : sharedSkillHeight,
  };
};
check('all six attack-fan coordinates are locked to the compact layout',
  JSON.stringify(fanPlacements.map(({ idx }) => declaredFanPlacement(idx))) === JSON.stringify(fanPlacements));
check('the 568px safe-area fallback lifts the potion clear of the utility column',
  /@media \(max-width: 600px\) \{[\s\S]{0,180}\.potion-slot \{[\s\S]{0,100}bottom: calc\(208px \+ env\(safe-area-inset-bottom\)\)/.test(hud));

const rectsForViewport = ({ width, height, safeLeft = 0, safeRight = 0, safeBottom = 0 }) => {
  const rectangle = (name, left, top, rectWidth, rectHeight, group) => ({
    name, left, top, right: left + rectWidth, bottom: top + rectHeight,
    width: rectWidth, height: rectHeight, group,
  });
  const controls = fanPlacements.map((placement) => rectangle(
    `skill-${placement.idx}`,
    width - safeRight - placement.right - placement.width,
    height - safeBottom - placement.bottom - placement.height,
    placement.width,
    placement.height,
    'fan',
  ));
  const joystickBottom = Math.max(20, safeBottom);
  controls.push(rectangle('joystick', Math.max(20, safeLeft), height - joystickBottom - 140, 140, 140, 'left'));
  const potionBottom = width <= 600 ? 208 + safeBottom : Math.max(20, safeBottom) + 22;
  controls.push(rectangle('potion', 176 + safeLeft, height - potionBottom - 58, 58, 58, 'left'));
  [
    ['jump', 28, 54, 54],
    ['dash', 92, 50, 50],
    ['talk', 156, 50, 50],
  ].forEach(([name, bottom, rectWidth, rectHeight]) => controls.push(rectangle(
    name,
    width - safeRight - 268 - rectWidth,
    height - safeBottom - bottom - rectHeight,
    rectWidth,
    rectHeight,
    'utility',
  )));
  return controls;
};
const rectanglesOverlap = (a, b) => a.left < b.right && a.right > b.left
  && a.top < b.bottom && a.bottom > b.top;
const circlesOverlap = (a, b) => {
  const dx = (a.left + a.width / 2) - (b.left + b.width / 2);
  const dy = (a.top + a.height / 2) - (b.top + b.height / 2);
  return Math.hypot(dx, dy) < (a.width + b.width) / 2;
};
[
  { label: '568x320', width: 568, height: 320 },
  { label: '568x320 with side gutters', width: 568, height: 320, safeLeft: 20, safeRight: 20, safeBottom: 20 },
  { label: '667x375 with side gutters', width: 667, height: 375, safeLeft: 20, safeRight: 20 },
  { label: '812x375 notched phone', width: 812, height: 375, safeLeft: 44, safeRight: 44, safeBottom: 21 },
].forEach((viewport) => {
  const controls = rectsForViewport(viewport);
  const inBounds = controls.every((control) => control.left >= 0 && control.top >= 0
    && control.right <= viewport.width && control.bottom <= viewport.height);
  let collision = '';
  for (let i = 0; i < controls.length && !collision; i += 1) {
    for (let j = i + 1; j < controls.length; j += 1) {
      const a = controls[i];
      const b = controls[j];
      const overlaps = a.group === 'fan' && b.group === 'fan'
        ? circlesOverlap(a, b)
        : rectanglesOverlap(a, b);
      if (overlaps) { collision = `${a.name}/${b.name}`; break; }
    }
  }
  check(`${viewport.label} keeps every touch target on-screen`, inBounds);
  check(`${viewport.label} keeps touch targets separate${collision ? ` (${collision})` : ''}`, !collision);
});

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
