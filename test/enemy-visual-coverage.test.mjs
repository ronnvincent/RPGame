import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  ENEMY_VISUAL_BY_NAME,
  ENEMY_VISUAL_SOURCES,
  resolveEnemyVisual,
} from '../src/sideview/maps/EnemyVisualRegistry.ts';

const dungeonSource = readFileSync('src/sideview/dungeons/DungeonManager.ts', 'utf8');

function authoredDungeons() {
  const tableStart = dungeonSource.indexOf('export const DUNGEONS');
  const tableEnd = dungeonSource.indexOf('/**\n * Builds wave N', tableStart);
  const table = dungeonSource.slice(tableStart, tableEnd);
  const starts = [...table.matchAll(/\n  \{\r?\n    id: '([^']+)'/g)];
  return starts.map((match, index) => {
    const chunk = table.slice(match.index, starts[index + 1]?.index ?? table.length);
    const title = chunk.match(/\n    name: '([^']+)'/)?.[1]
      || chunk.match(/\n    name: "([^"]+)"/)?.[1]
      || match[1];
    const enemies = [...chunk.matchAll(/\{ name: '([^']+)', type: '(mob|elite|boss)'/g)]
      .map((enemy) => ({ name: enemy[1], type: enemy[2] }));
    return { id: match[1], title, enemies };
  });
}

function publicFile(path) {
  return join(process.cwd(), 'public', path.replace(/^\//, ''));
}

test('every authored enemy resolves to licensed real art with complete local evidence', () => {
  for (const source of Object.values(ENEMY_VISUAL_SOURCES)) {
    assert.equal(source.license, 'CC0-1.0');
    assert.match(source.sourceUrl, /^https:\/\//);
    assert.ok(existsSync(publicFile(source.licenseEvidence)), `missing license evidence: ${source.licenseEvidence}`);
  }

  for (const [name, profile] of Object.entries(ENEMY_VISUAL_BY_NAME)) {
    assert.ok(profile.requiredAssets.length > 0, `${name} visual needs at least one real source file`);
    assert.ok(ENEMY_VISUAL_SOURCES[profile.sourceId], `${name} references an unknown asset source`);
    for (const asset of profile.requiredAssets) {
      assert.ok(existsSync(publicFile(asset)), `${name} visual asset is missing: ${asset}`);
      assert.doesNotMatch(asset, /nightborne|tiny-rpg/i, `${name} must not depend on art without local license evidence`);
    }
  }

  const dungeons = authoredDungeons();
  assert.equal(dungeons.length, 12, 'the visual audit must cover all twelve dungeon definitions');
  for (const dungeon of dungeons) {
    const normalSilhouettes = new Set();
    const bossSilhouettes = new Set();
    for (const template of dungeon.enemies) {
      const visual = resolveEnemyVisual(template.name);
      assert.ok(visual, `${dungeon.title}: no exact visual mapping for ${template.name}`);
      if (template.type === 'boss') bossSilhouettes.add(visual.silhouetteId);
      else normalSilhouettes.add(visual.silhouetteId);
    }
    assert.ok(normalSilhouettes.size >= 3, `${dungeon.title} needs at least three non-boss silhouettes`);
    assert.ok(bossSilhouettes.size >= 1, `${dungeon.title} needs a boss silhouette`);
    for (const boss of bossSilhouettes) {
      assert.ok(!normalSilhouettes.has(boss), `${dungeon.title} boss must read differently from rank-and-file enemies`);
    }
  }
});

test('elite and endless-wave name decorations preserve the exact family mapping', () => {
  assert.equal(resolveEnemyVisual('Elite Green Slime')?.id, resolveEnemyVisual('Green Slime')?.id);
  assert.equal(resolveEnemyVisual('Celestial Arbiter (Wave 20)')?.id, resolveEnemyVisual('Celestial Arbiter')?.id);
});

test('wolf and hound encounters map exactly to the licensed Pixel Wolf strips', () => {
  const expected = {
    'Dusk Wolf': { id: 'opengameart-pixel-wolf', species: 'wolf', silhouetteId: 'wolf' },
    'Ridge Prowler': { id: 'opengameart-ridge-prowler', species: 'wolf', silhouetteId: 'ridge-wolf' },
    'Magma Hound': { id: 'opengameart-magma-hound', species: 'hound', silhouetteId: 'magma-hound' },
    'Alpha Greymane': { id: 'opengameart-alpha-greymane', species: 'wolf', silhouetteId: 'alpha-wolf' },
  };
  const expectedAssets = [
    '/assets/runtime/monsters/opengameart-pixel-wolf/wolf-tail.png',
    '/assets/runtime/monsters/opengameart-pixel-wolf/wolf-run.png',
  ];

  for (const [name, identity] of Object.entries(expected)) {
    const visual = resolveEnemyVisual(name);
    assert.ok(visual, `${name} needs an exact visual`);
    assert.equal(visual.id, identity.id);
    assert.equal(visual.species, identity.species);
    assert.equal(visual.silhouetteId, identity.silhouetteId);
    assert.equal(visual.renderer, 'runtime-strip');
    assert.equal(visual.sourceId, 'opengameart-pixel-wolf');
    assert.equal(visual.intentionalFallback, undefined, `${name} must not remain a rat fallback`);
    assert.deepEqual(visual.requiredAssets, expectedAssets);
    assert.ok(Object.values(visual.animations).every(({ src }) => expectedAssets.includes(src)));
  }
});
