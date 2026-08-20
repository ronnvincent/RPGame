import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { validateRuntimeAssets } from '../tools/check-runtime-assets.mjs';

test('curated runtime assets have approved licenses, valid paths, and bounded preload cost', async () => {
  const result = await validateRuntimeAssets();

  assert.deepEqual(result.errors, [], result.errors.join('\n'));
  assert.equal(result.counts.packs, 7, 'all curated Kenney, LuizMelo, and OpenGameArt packs should be documented');
  assert.equal(result.counts.assetGroups, 13, 'the manifest should expose the curated groups');
  assert.equal(result.counts.files, 77, 'every selected runtime PNG should be validated');
  assert.equal(result.counts.licenseNotices, 7, 'each source pack should retain a local license notice');
  assert.ok(result.totalBytes > 0 && result.totalBytes <= 700_000);
  assert.ok(result.bytesByTier.core > 0 && result.bytesByTier.core <= 50_000);
  assert.ok(result.bytesByTier.zone > 0 && result.bytesByTier.zone <= 25_000);
  assert.ok(result.bytesByTier['on-demand'] > 0 && result.bytesByTier['on-demand'] <= 600_000);
  assert.ok(result.bytesByCategory.monsters > 0 && result.bytesByCategory.monsters <= 80_000);
  assert.equal(
    result.totalBytes,
    result.bytesByTier.core + result.bytesByTier.zone + result.bytesByTier['on-demand'],
    'each runtime asset should belong to exactly one preload tier',
  );
});

test('OpenGameArt Pixel Wolf keeps official direct-download evidence for every selected local file', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/assets/runtime/manifest.json', import.meta.url), 'utf8'));
  const pack = manifest.packs.find(({ id }) => id === 'opengameart-pixel-wolf');
  const group = manifest.assetGroups.find(({ id }) => id === 'pixel-wolf-canines');

  assert.equal(pack.sourceUrl, 'https://opengameart.org/content/pixel-wolf');
  assert.equal(pack.license.spdx, 'CC0-1.0');
  assert.equal(pack.license.attributionRequired, false);
  assert.equal(pack.retrieval.method, 'official-direct-download');
  assert.deepEqual(
    pack.retrieval.directFiles.map(({ assetPath }) => assetPath).sort(),
    [...group.files].sort(),
    'each selected canine file needs direct official provenance and digest coverage',
  );
});
