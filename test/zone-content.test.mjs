import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { MAPS } from '../src/sideview/engine/MapLibrary.ts';
import {
  ZONE_CONTENT,
  buildZoneHazards,
  buildZonePlatforms,
  getVisibleZoneDecorations,
  getZoneSpawnLayout,
} from '../src/sideview/maps/ZoneContent.ts';

const THEMES = [
  'town', 'catacombs', 'crypt', 'inferno', 'void', 'swamp', 'mountain',
  'underwater', 'caves', 'sunlit_vale', 'emerald_ridge', 'castle_approach', 'endless',
];

function publicFile(path) {
  return join(process.cwd(), 'public', path.replace(/^\//, ''));
}

test('all selectable themes have authored parallax, grounding, and overlay content', () => {
  assert.deepEqual(Object.keys(ZONE_CONTENT).sort(), [...THEMES].sort());

  for (const theme of THEMES) {
    const map = MAPS[theme];
    const zone = ZONE_CONTENT[theme];
    assert.ok(map, `${theme} must have its own MapLibrary entry`);
    assert.ok(map.layers.length >= 3, `${theme} needs at least three parallax layers`);
    assert.ok(map.ground || map.floor, `${theme} must register visible ground`);
    assert.equal(zone.planes.length, 3, `${theme} needs background, gameplay-back, and foreground planes`);
    assert.deepEqual(new Set(zone.planes.map((plane) => plane.plane)), new Set(['background', 'gameplay-back', 'foreground']));
    assert.ok(new Set(zone.planes.map((plane) => plane.parallax)).size >= 3, `${theme} plane depths must differ`);
    assert.ok(zone.ground.note.length > 12, `${theme} needs an explicit grounding contract`);

    const landmarks = zone.decorations.filter((item) => item.landmark);
    assert.equal(landmarks.length, 1, `${theme} needs one named landmark`);
    assert.ok(
      getVisibleZoneDecorations(theme, 'background', 0, 900).some((item) => item.landmark),
      `${theme} landmark must establish identity in the opening camera`,
    );
    assert.equal(getVisibleZoneDecorations(theme, 'foreground', 100_000, 900).length, 0, `${theme} foreground culling must reject distant props`);

    if (zone.battle) {
      assert.ok(zone.platforms.length >= 2 || zone.flatArenaRationale, `${theme} needs platforms or an explicit flat-arena reason`);
      assert.ok(zone.hazard, `${theme} needs an environmental hazard`);
      assert.ok(zone.hazard.telegraph.length > 20, `${theme} hazard needs a readable telegraph`);
      assert.ok(zone.hazard.damageCooldownMs >= 500, `${theme} hazard must throttle repeat damage`);
      assert.ok(buildZoneHazards(theme, 620).length >= 1, `${theme} hazard anchors must fit the arena`);
    } else {
      assert.equal(zone.hazard, undefined, 'town must remain a safe social space');
      assert.ok(zone.flatArenaRationale, 'town needs an accessibility rationale for its flat route');
    }

    const platforms = buildZonePlatforms(theme, 620);
    for (const platform of platforms) {
      assert.ok(platform.x >= 0 && platform.x + platform.width <= 3600);
      assert.ok(platform.y < 620 && platform.height > 0);
    }

    let preloadBytes = 0;
    for (const asset of zone.preload.assets) {
      const path = publicFile(asset);
      assert.ok(existsSync(path), `${theme} preload asset is missing: ${asset}`);
      preloadBytes += statSync(path).size;
    }
    assert.ok(preloadBytes <= zone.preload.maxBytes, `${theme} zone overlay exceeds its local preload budget`);
  }

  assert.notDeepEqual(MAPS.endless.layers, MAPS.void.layers, 'Endless must not silently reuse the Void map definition');
});

test('all 13 zones exclude legacy terrain atlas props while retaining named RPG landmarks', () => {
  assert.equal(THEMES.length, 13);
  const legacyTerrainPath = /(?:^|[/\\])terr(?:ain|ian)(?:[/\\]|\.png$)/i;

  for (const theme of THEMES) {
    const zone = ZONE_CONTENT[theme];
    const runtimePaths = [
      ...zone.preload.assets,
      ...zone.decorations.flatMap((decoration) => decoration.asset ? [decoration.asset] : []),
    ];

    assert.equal(zone.decorations.filter((decoration) => decoration.landmark).length, 1, `${theme} landmark`);
    assert.equal(
      zone.decorations.filter((decoration) => decoration.asset && decoration.rect).length,
      0,
      `${theme} must not generate scattered atlas props`,
    );
    for (const assetPath of runtimePaths) {
      assert.doesNotMatch(assetPath, legacyTerrainPath, `${theme} still references ${assetPath}`);
    }
  }
});

test('wave spawn layouts are deterministic, bounded, and party-safe', () => {
  for (const theme of THEMES.filter((name) => name !== 'town')) {
    const first = getZoneSpawnLayout(theme, 7, 3600);
    const repeat = getZoneSpawnLayout(theme, 7, 3600);
    assert.deepEqual(first, repeat, `${theme} wave placement must be reproducible`);
    assert.ok(first.party.length >= 1 && first.enemies.length >= 3);
    for (const enemyX of first.enemies) {
      assert.ok(enemyX >= 0 && enemyX <= 3480, `${theme} enemy spawn must remain in bounds`);
      const nearestParty = Math.min(...first.party.map((partyX) => Math.abs(enemyX - partyX)));
      assert.ok(nearestParty >= first.minimumSeparation, `${theme} enemy spawn violates party safe space`);
    }
  }
});
