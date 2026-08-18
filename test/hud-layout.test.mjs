/**
 * The top bar cannot overlap itself.
 *
 * The player panel, the zone banner and the button row are three absolutely
 * positioned elements that knew nothing about each other. That held while the
 * row was short; adding the two voice buttons pushed it into the banner, which
 * is what the reported crowding was. Geometry, not taste, so it can be checked.
 */
import { readFileSync } from 'node:fs';

const hud = readFileSync('src/sideview/ui/GameHUD.ts', 'utf8');
const rule = (name) => {
  const at = hud.indexOf(`.${name} {`);
  if (at < 0) return '';
  return hud.slice(at, hud.indexOf('}', at));
};

let failures = 0;
const check = (l, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };

const banner = rule('dungeon-wave-banner');
const row = rule('hud-top-right');
const tracker = rule('mini-quest-tracker');

// The banner sits on its own line, on the left, where a right-anchored row
// cannot reach it however it wraps.
check('the banner is below the top row', /top:\s*5\dpx/.test(banner));
check('and left-aligned rather than centred', /left:\s*max\(8px/.test(banner) && /transform:\s*none/.test(banner));

// The row wraps instead of growing into the player panel.
check('the button row wraps', /flex-wrap:\s*wrap/.test(row));
check('and is capped clear of the player panel', /max-width:\s*calc\(100vw - 300px\)/.test(row));

// The tracker clears a two-line row.
check('the quest tracker clears a wrapped row', /top:\s*78px/.test(tracker));

// Worth stating: the row is what grew.
const buttons = (hud.match(/class="inv-btn[^"]*"/g) || []).length;
console.log(`\n  buttons in the top row: ${buttons}`);
check('the row is still a manageable size', buttons <= 12);

console.log('');
console.log(failures === 0 ? 'HUD LAYOUT OK' : `HUD LAYOUT FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
