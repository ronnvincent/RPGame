import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { resolve } from 'node:path';

import {
  COMBAT_FEEDBACK_SPRITES,
  ELEMENT_REACTION_SPRITES,
  ENEMY_ROLE_SPRITES,
  EXCLUDED_GAMEPLAY_ASSETS,
  EXPLORATION_SPRITES,
  FREE_SPRITE_SOURCES,
  GAMEPLAY_SPRITES,
  HAZARD_SPRITES,
  OBJECTIVE_SPRITES,
  getGameplaySpriteFiles,
  isGameplaySpriteId,
  validateGameplaySpriteManifest,
} from '../src/sideview/assets/GameplaySpriteManifest.ts';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const publicFile = (webPath) => resolve(projectRoot, 'public', webPath.replace(/^\//, ''));

function readPngSize(webPath) {
  const bytes = readFileSync(publicFile(webPath));
  assert.deepEqual(
    [...bytes.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
    `${webPath} must be a real PNG file`,
  );
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function spriteReferences(value) {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(spriteReferences);
}

test('gameplay sprite catalogue resolves only to bundled free PNG assets', () => {
  assert.deepEqual(validateGameplaySpriteManifest(), []);

  for (const [sourceId, source] of Object.entries(FREE_SPRITE_SOURCES)) {
    assert.ok(
      source.license === 'CC0-1.0' || source.license === 'Public-Domain',
      `${sourceId} must have a redistribution-safe license`,
    );
    assert.ok(existsSync(publicFile(source.evidencePath)), `${sourceId} is missing local license evidence`);
    assert.ok(source.assetRoots.length > 0, `${sourceId} must declare an asset root`);
  }

  for (const [spriteId, clip] of Object.entries(GAMEPLAY_SPRITES)) {
    const source = FREE_SPRITE_SOURCES[clip.sourceId];
    const paths = getGameplaySpriteFiles(spriteId);
    assert.ok(paths.length > 0, `${spriteId} must use an image or animation frames`);

    for (const webPath of paths) {
      assert.match(webPath, /^\/assets\/.*\.png$/i, `${spriteId} must use a bundled PNG`);
      assert.ok(source.assetRoots.some((root) => webPath.startsWith(root)), `${spriteId} escapes its licensed source root`);
      assert.ok(existsSync(publicFile(webPath)), `${spriteId} is missing ${webPath}`);
      assert.ok(!(webPath in EXCLUDED_GAMEPLAY_ASSETS), `${spriteId} uses explicitly excluded ${webPath}`);
      readPngSize(webPath);
    }

    if (clip.layout.kind === 'strip') {
      const { width, height } = readPngSize(clip.src);
      assert.ok(clip.layout.frameWidth * clip.layout.frameCount <= width, `${spriteId} strip exceeds PNG width`);
      assert.ok(clip.layout.frameHeight <= height, `${spriteId} strip exceeds PNG height`);
    } else if (clip.layout.kind === 'grid') {
      const { width, height } = readPngSize(clip.src);
      assert.ok(clip.layout.frameWidth * clip.layout.columns <= width, `${spriteId} grid exceeds PNG width`);
      assert.ok(clip.layout.frameHeight * clip.layout.rows <= height, `${spriteId} grid exceeds PNG height`);
      assert.ok(clip.layout.frameCount <= clip.layout.columns * clip.layout.rows, `${spriteId} has too many grid frames`);
    } else if (clip.layout.kind === 'atlas') {
      const { width, height } = readPngSize(clip.src);
      assert.ok(clip.layout.x + clip.layout.width <= width, `${spriteId} atlas crop exceeds PNG width`);
      assert.ok(clip.layout.y + clip.layout.height <= height, `${spriteId} atlas crop exceeds PNG height`);
    }
  }
});

test('all requested gameplay systems are represented by sprite ids, not placeholders', () => {
  assert.deepEqual(Object.keys(ENEMY_ROLE_SPRITES).sort(), [
    'assassin', 'healer', 'ranged-sniper', 'shield-tank', 'summoner',
  ]);
  assert.deepEqual(Object.keys(OBJECTIVE_SPRITES).sort(), [
    'defend-relic', 'destroy-nests', 'escort-npc', 'survive-waves', 'timed-escape',
  ]);
  assert.deepEqual(Object.keys(HAZARD_SPRITES).sort(), [
    'breakable-bridge', 'explosive-barrel', 'falling-rocks', 'moving-platform', 'traps',
  ]);
  assert.deepEqual(Object.keys(ELEMENT_REACTION_SPRITES).sort(), [
    'burn-explosion', 'curse-lifesteal', 'freeze-shatter', 'wet-lightning-chain',
  ]);

  const references = spriteReferences({
    ENEMY_ROLE_SPRITES,
    OBJECTIVE_SPRITES,
    HAZARD_SPRITES,
    ELEMENT_REACTION_SPRITES,
    EXPLORATION_SPRITES,
    COMBAT_FEEDBACK_SPRITES,
  });
  assert.ok(references.length > 0);
  for (const spriteId of references) {
    assert.ok(isGameplaySpriteId(spriteId), `feature references unknown sprite ${spriteId}`);
    assert.doesNotMatch(spriteId, /emoji|procedural|canvas|shape/i);
  }
  assert.doesNotMatch(JSON.stringify({ GAMEPLAY_SPRITES, references }), /\p{Extended_Pictographic}/u);
});

test('destroy-nest uses a bounded atlas crop and banned terrain or hive art stays unavailable', () => {
  const nest = GAMEPLAY_SPRITES['objective.root-nest'];
  assert.equal(nest.src, '/assets/swamp/props.png');
  assert.deepEqual(nest.layout, { kind: 'atlas', x: 56, y: 4, width: 64, height: 32 });

  const atlasSize = readPngSize(nest.src);
  assert.ok(nest.layout.width < atlasSize.width || nest.layout.height < atlasSize.height, 'nest must not draw the whole atlas');
  assert.equal(
    EXCLUDED_GAMEPLAY_ASSETS['/assets/runtime/maps/pixel-platformer/terrain.png'],
    'The shared terrain atlas is not used for encounter props.',
  );
  assert.equal(
    EXCLUDED_GAMEPLAY_ASSETS['/assets/high-forest/Assets/Hive.png'],
    'No local license evidence is bundled for the High Forest pack.',
  );

  const selectedPaths = Object.keys(GAMEPLAY_SPRITES).flatMap(getGameplaySpriteFiles);
  assert.ok(!selectedPaths.some((path) => /(?:^|\/)terrain\.png$/i.test(path)));
  assert.ok(!selectedPaths.includes('/assets/high-forest/Assets/Hive.png'));
});
