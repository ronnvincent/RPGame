/**
 * Fullscreen on phones, as far as the platform allows.
 *
 * A page cannot put itself into fullscreen on load: every browser requires the
 * request to come from a user gesture, and iOS Safari has no Fullscreen API on
 * iPhone at all. So this checks the two routes that do work - asking on the
 * first tap, and a manifest that makes the installed game chrome-free - rather
 * than pretending the direct one exists.
 */
import { readFileSync, existsSync } from 'node:fs';

let failures = 0;
const check = (l, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failures++; };

const fs_ = readFileSync('src/sideview/ui/Fullscreen.ts', 'utf8');
const html = readFileSync('index.html', 'utf8');
const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));

// The gesture route.
check('the request rides the first gesture', /addEventListener\(e, attempt/.test(fs_));
check('several gesture types are covered', /'pointerdown', 'touchend', 'click', 'keydown'/.test(fs_));
check('a refusal is retried on the next gesture rather than given up on',
      /if \(!ok\) done = false/.test(fs_));
check('it only runs on phones', /isMobile\(\)/.test(fs_));
check('leaving fullscreen is not fought', /not reinstalled/.test(fs_));
check('landscape is locked once fullscreen', /lock\?\.\('landscape'\)/.test(fs_));
check('and a refused lock does not fail the fullscreen', /not supported, or the device/.test(fs_));

// The install route, which is the only one that works on an iPhone.
check('the manifest is linked', /rel="manifest"/.test(html));
check('it asks for fullscreen', manifest.display === 'fullscreen');
check('and landscape', manifest.orientation === 'landscape');
check('with an apple touch icon for iOS', /apple-touch-icon/.test(html));
check('and the iOS web-app meta tags', /apple-mobile-web-app-capable/.test(html));

// Android will not offer to install without these sizes.
for (const size of [192, 512]) {
  const file = `public/icon-${size}.png`;
  const present = existsSync(file);
  check(`icon-${size}.png exists`, present);
  if (present) {
    const b = readFileSync(file);
    check(`icon-${size}.png really is ${size}x${size}`, b.readUInt32BE(16) === size && b.readUInt32BE(20) === size);
  }
  check(`the manifest lists ${size}`, manifest.icons.some((i) => i.sizes === `${size}x${size}`));
}
check('at least one icon is maskable', manifest.icons.some((i) => /maskable/.test(i.purpose || '')));

console.log('');
console.log(failures === 0 ? 'FULLSCREEN OK' : `FULLSCREEN FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
