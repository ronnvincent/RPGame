/**
 * Test suite for:
 * 1. Equipment movement speed rebalancing (no hyper-speed, soft-cap, max ceiling 10.5)
 * 2. Survive mode continuous mob reinforcements across all 12 dungeon maps
 * 3. Survive mode timer completion and auto-advance to next chamber
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { rolldown } from 'rolldown';

let passed = 0;
let failed = 0;

function check(title, condition, detail = '') {
  if (condition) {
    console.log(`  PASS  ${title}`);
    passed++;
  } else {
    console.error(`  FAIL  ${title} ${detail}`);
    failed++;
  }
}

// Shim globals for bundle loading
class FakeImage {
  width = 64;
  height = 64;
  complete = true;
  onload = null;
  onerror = null;
  set src(val) { this._src = val; queueMicrotask(() => this.onload?.()); }
  get src() { return this._src || ''; }
}
const storage = new Map();
globalThis.window = globalThis;
globalThis.location = { hostname: 'localhost', origin: 'http://localhost' };
globalThis.Image = FakeImage;
globalThis.localStorage = {
  getItem: key => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
  clear: () => storage.clear(),
};

console.log('Bundling runtime fixture for testing...');
const bundle = await rolldown({
  input: 'test/zone-runtime-fixture.ts',
  platform: 'browser',
});
const generated = await bundle.generate({ format: 'esm' });
await bundle.close();
const code = generated.output.find(chunk => chunk.type === 'chunk')?.code;

mkdirSync('dist', { recursive: true });
writeFileSync('dist/test-bundle.mjs', code, 'utf8');

const {
  DUNGEONS,
  spawnSurviveWaveReinforcements,
  ITEM_DATABASE,
  rollAffixes,
  MONSTER_CARDS,
  SideViewEngine,
  CHARACTER_CLASSES,
} = await import('../dist/test-bundle.mjs');

console.log('\n=== 1. EQUIPMENT MOVEMENT SPEED REBALANCE TESTS ===\n');

// 1. Check all items in ITEM_DATABASE with speed
const speedItems = ITEM_DATABASE.filter(item => item.stats && typeof item.stats.speed === 'number');
check('items with speed stat are cataloged', speedItems.length > 0);

for (const item of speedItems) {
  const spd = item.stats.speed;
  check(
    `Item [${item.id}] speed is balanced (got ${spd}, max allowed 1.2)`,
    spd <= 1.2 && spd >= 0.1,
    `Value: ${spd}`,
  );
}

// 2. Check affixes
const affixesSrc = readFileSync('src/sideview/items/darkrise/affixes.ts', 'utf8');
check(
  'of_swiftness affix is balanced to <= 0.6',
  /id:\s*'of_swiftness'[^\n]*min:\s*0\.\d+,\s*max:\s*0\.[4-6]/.test(affixesSrc),
);

// Test rolling of_swiftness affixes
let foundSwiftness = false;
for (let i = 0; i < 200; i++) {
  const affs = rollAffixes('mythical');
  const swift = affs.find(a => a.id === 'of_swiftness');
  if (swift) {
    foundSwiftness = true;
    assert(swift.value <= 0.6 && swift.value >= 0.2, `Rolled invalid swiftness value: ${swift.value}`);
  }
}
check('rolled of_swiftness affixes fall within [0.2, 0.6]', foundSwiftness);

// 3. Check monster cards
const hadrikCard = MONSTER_CARDS.find(c => c.id === 'card_hadrik');
const greymaneCard = MONSTER_CARDS.find(c => c.id === 'card_greymane');
check('Card of Hadrik speed balanced (<= 0.8)', Boolean(hadrikCard && hadrikCard.stats?.speed <= 0.8));
check('Card of Greymane speed balanced (<= 0.5)', Boolean(greymaneCard && greymaneCard.stats?.speed <= 0.5));

// 4. SideViewEngine speed soft-cap and ceiling in live engine
const warriorClass = CHARACTER_CLASSES.find(c => c.id === 'warrior') || CHARACTER_CLASSES[0];
const engine = new SideViewEngine(warriorClass);
const baseSpeed = engine.player.baseSpeed;
check('engine player base speed is reasonable', baseSpeed >= 4.0 && baseSpeed <= 8.0);

// Equip boots with normal speed bonus
const boots = ITEM_DATABASE.find(i => i.id === 'boots_windwalker');
engine.player.equipment.boots = boots;
engine.recomputeStats();
check(
  `equipping Windwalker boots gives gentle agile boost (base ${baseSpeed} -> total ${engine.player.totalSpeed})`,
  engine.player.totalSpeed > baseSpeed && engine.player.totalSpeed <= baseSpeed + 1.0,
);

// Equip stacked extreme gear (+50 speed) to verify hard ceiling (max 10.5)
engine.player.equipment.boots = {
  ...boots,
  stats: { speed: 50 },
  affixes: [{ id: 'of_swiftness', label: 'of Swiftness', stat: 'speed', value: 20 }],
};
engine.recomputeStats();
check(
  `stacked gear (+70 speed) clamped to max 10.5 speed ceiling (got ${engine.player.totalSpeed})`,
  engine.player.totalSpeed === 10.5,
);

console.log('\n=== 2. SURVIVE MODE CONTINUOUS REINFORCEMENTS ACROSS ALL 12 MAPS ===\n');

check('All 12 dungeons are loaded in catalog', DUNGEONS.length === 12);

for (let dIdx = 0; dIdx < DUNGEONS.length; dIdx++) {
  const dungeon = DUNGEONS[dIdx];
  const waveIndex = 0;
  const arenaWidth = 1400;
  const playerX = 500;
  const groundY = 350;

  // Test survive wave reinforcements
  const reinforcements = spawnSurviveWaveReinforcements(
    dungeon,
    waveIndex,
    arenaWidth,
    playerX,
    groundY,
    3,
    dIdx * 10 + 1,
  );

  check(
    `[Map ${dIdx + 1}/12: ${dungeon.name}] Spawns 3 survive reinforcements safely`,
    reinforcements.length === 3,
  );

  for (const enemy of reinforcements) {
    assert(enemy.id.includes('surv'), `Enemy id must indicate survive reinforcement: ${enemy.id}`);
    assert(enemy.hp > 0, `Enemy HP must be positive: ${enemy.hp}`);
    assert(enemy.atk > 0, `Enemy ATK must be positive: ${enemy.atk}`);
    assert(enemy.maxHp === enemy.hp, 'Enemy maxHp should match hp');
    const dist = Math.abs(enemy.x - playerX);
    assert(dist >= 150, `Enemy spawned too close to player (${dist}px)`);
  }
}

console.log('\n=== 3. SURVIVE MODE PROGRESSION & AUTO-ADVANCE WATCHDOG ===\n');

const sideViewGameSrc = readFileSync('src/sideview/SideViewGame.ts', 'utf8');

check(
  'SideViewGame imports spawnSurviveWaveReinforcements',
  /import\s*\{[^}]*spawnSurviveWaveReinforcements[^}]*\}\s*from\s*'\.\/dungeons\/DungeonManager'/.test(sideViewGameSrc),
);

check(
  'SideViewGame tracks surviveReinforcementTimer',
  /surviveReinforcementTimer/.test(sideViewGameSrc),
);

check(
  'SideViewGame continuously spawns reinforcements while survive objective is active',
  /node\.objective\?\.type\s*===\s*'survive'[\s\S]{1,1200}spawnSurviveWaveReinforcements/.test(sideViewGameSrc),
);

check(
  'SideViewGame does not advance room early just because livingEnemies is 0 during survive',
  /node\.objective\?\.type\s*!==\s*'survive'\s*&&\s*livingEnemies\s*===\s*0/.test(sideViewGameSrc),
);

check(
  'SideViewGame dispatches advance_time and clears remaining mobs when survive timer completes',
  /node\.objective\.type\s*===\s*'survive'[\s\S]{1,300}advance_time[\s\S]{1,300}enemy\.isDead\s*=\s*true/.test(sideViewGameSrc),
);

check(
  'SideViewGame auto-advances to next chamber with "Wave Survived!" toast',
  /Wave Survived! Advancing to/.test(sideViewGameSrc),
);

console.log(`\nResults: ${passed} PASSED, ${failed} FAILED\n`);
process.exit(failed === 0 ? 0 : 1);
