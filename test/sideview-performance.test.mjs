import assert from 'node:assert/strict';
import test from 'node:test';
import { rolldown } from 'rolldown';

import { inspectSideViewPerformanceBudget } from '../tools/check-sideview-performance.mjs';

class DeferredImage {
  static instances = [];

  width = 0;
  height = 0;
  naturalWidth = 0;
  naturalHeight = 0;
  complete = false;
  onload = null;
  onerror = null;
  _src = '';

  constructor() {
    DeferredImage.instances.push(this);
  }

  set src(value) { this._src = value; }
  get src() { return this._src; }

  resolve(width = 64, height = 64) {
    this.width = width;
    this.height = height;
    this.naturalWidth = width;
    this.naturalHeight = height;
    this.complete = true;
    this.onload?.();
  }
}

let reducedMotion = false;
const fakeDocument = {
  hidden: false,
  visibilityState: 'visible',
  documentElement: { classList: { contains: name => name === 'input-reduced-motion' && reducedMotion } },
};
globalThis.window = globalThis;
globalThis.Image = DeferredImage;
globalThis.document = fakeDocument;

const bundle = await rolldown({ input: 'test/performance-budget-fixture.ts', platform: 'browser' });
const generated = await bundle.generate({ format: 'esm' });
await bundle.close();
const code = generated.output.find((chunk) => chunk.type === 'chunk')?.code;
assert.ok(code, 'performance fixture should bundle');
const runtime = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

function resolvePendingImages() {
  for (const image of DeferredImage.instances) {
    if (image.src && !image.complete) image.resolve();
  }
}

test('module boot performs zero image requests and common warm-up stays tiny', async () => {
  assert.equal(DeferredImage.instances.filter((image) => image.src).length, 0);
  const particleSystem = new runtime.ParticleSystem();
  particleSystem.warmVfx();
  const firstWarmCount = DeferredImage.instances.filter((image) => image.src).length;
  particleSystem.warmVfx();

  const inspection = await inspectSideViewPerformanceBudget();
  assert.ok(inspection.cataloguePathCount > inspection.commonPaths.length * 20);
  assert.deepEqual(inspection.missing, []);
  assert.equal(firstWarmCount, inspection.commonPaths.length);
  assert.ok(firstWarmCount <= inspection.budgets.bootImageRequests);
  assert.ok(inspection.commonBytes <= inspection.budgets.bootImageBytes);
  assert.equal(DeferredImage.instances.filter((image) => image.src).length, firstWarmCount);
});

test('selected-class VFX warming is bounded and spread across background batches', async () => {
  const particleSystem = new runtime.ParticleSystem();
  const selectedSkills = [{
    vfx: {
      cast: 'fx_slash_h',
      ultimate: 'ult_circle_blast',
    },
  }];
  const ids = runtime.vfxIdsForSkills(selectedSkills);
  const expectedPaths = runtime.imagePathsForVfxIds(ids);
  const before = runtime.sprites.getPerformanceMetrics().imageRequests;

  particleSystem.warmSkillVfx(selectedSkills);
  let metrics = runtime.sprites.getPerformanceMetrics();
  assert.equal(metrics.imageRequests, before, 'class warm-up must not burst requests synchronously');
  assert.equal(metrics.backgroundWarmQueued, expectedPaths.length);

  await new Promise(resolve => setTimeout(resolve, 100));
  metrics = runtime.sprites.getPerformanceMetrics();
  assert.equal(metrics.imageRequests, before + expectedPaths.length);
  assert.equal(metrics.backgroundWarmQueued, 0);
  assert.ok(expectedPaths.length < runtime.allVfxImagePaths().length / 10);
});

test('loaded VFX waits for asynchronous decode before becoming draw-ready', async () => {
  let decodeCalls = 0;
  let finishDecode;
  const image = runtime.sprites.getImage('/synthetic/decode-gate.png');
  image.decode = () => {
    decodeCalls++;
    return new Promise(resolve => { finishDecode = resolve; });
  };
  image.resolve();

  assert.equal(decodeCalls, 1);
  assert.equal(runtime.sprites.arePathsReady(['/synthetic/decode-gate.png']), false);
  finishDecode();
  await Promise.resolve();
  assert.equal(runtime.sprites.arePathsReady(['/synthetic/decode-gate.png']), true);
});

test('adaptive quality ignores one spike then scales disposable VFX after sustained slow frames', () => {
  const particleSystem = new runtime.ParticleSystem();
  particleSystem.recordFrameTime(45);
  assert.equal(particleSystem.getPerformanceMetrics().quality.adaptive, 'high');

  for (let frame = 0; frame < 16; frame += 1) particleSystem.recordFrameTime(40);
  let metrics = particleSystem.getPerformanceMetrics();
  assert.equal(metrics.quality.adaptive, 'low');
  assert.equal(metrics.images.effectsQuality, 'low');

  particleSystem.addImpactBurst(0, 0, 100, '#fff', 'holy');
  metrics = particleSystem.getPerformanceMetrics();
  assert.equal(metrics.active.particles, 45);
  assert.equal(metrics.effectiveBudgets.particles, 160);
});

test('simulation time does not double-sample adaptive quality', () => {
  const particleSystem = new runtime.ParticleSystem();

  // Ultimate cinematics deliberately scale simulation dt. Quality must only
  // react to the wall-clock samples supplied by the outer requestAnimationFrame
  // loop, otherwise slow motion can look like a fast device (or be counted twice).
  for (let frame = 0; frame < 24; frame += 1) particleSystem.update(0.05);

  const metrics = particleSystem.getPerformanceMetrics();
  assert.equal(metrics.quality.adaptive, 'high');
  assert.equal(metrics.quality.frameTimeEmaMs, 16.67);
});

test('reduced-motion mode suppresses afterimages and full-screen motion effects', () => {
  reducedMotion = true;
  try {
    const particleSystem = new runtime.ParticleSystem();
    particleSystem.addGhostTrail(0, 0, 1, 'warrior');
    particleSystem.addScreenFlash('#fff');
    particleSystem.triggerScreenShake(20, 1);

    assert.equal(particleSystem.ghostTrails.length, 0);
    assert.equal(particleSystem.screenFlashes.length, 0);
    assert.equal(particleSystem.screenShakeTime, 0);
    assert.equal(particleSystem.getPerformanceMetrics().quality.effective, 'low');
  } finally {
    reducedMotion = false;
  }
});

test('first-use VFX waits for its frames, shows a fallback, then releases retained images', () => {
  resolvePendingImages();
  const particleSystem = new runtime.ParticleSystem();
  const before = runtime.sprites.getPerformanceMetrics();

  particleSystem.playVfx('ult_nuclear', 100, 100);
  const whileLoading = particleSystem.getPerformanceMetrics();
  assert.equal(whileLoading.active.spriteVfx, 1);
  assert.ok(whileLoading.active.particles > 0, 'procedural fallback should be immediately visible');
  assert.ok(whileLoading.images.retainedImages >= 10);

  particleSystem.update(1);
  assert.equal(particleSystem.getPerformanceMetrics().active.spriteVfx, 1, 'loading must not consume animation time');
  resolvePendingImages();
  particleSystem.update(1);

  const after = particleSystem.getPerformanceMetrics();
  assert.equal(after.active.spriteVfx, 0);
  assert.equal(after.images.retainedImages, 0);
  assert.ok(after.images.imageRequests >= before.imageRequests + 10);
});

test('decoded image cache is deduplicated and bounded by LRU eviction', () => {
  const first = runtime.sprites.getImage('/synthetic/shared.png');
  const second = runtime.sprites.getImage('/synthetic/shared.png');
  assert.equal(first, second);

  for (let index = 0; index < 400; index += 1) {
    runtime.sprites.getImage(`/synthetic/cache-${index}.png`);
  }
  const metrics = runtime.sprites.getPerformanceMetrics();
  assert.ok(metrics.residentImages <= runtime.SpriteManager.MAX_RESIDENT_IMAGES);
  assert.ok(metrics.decodedImagePixels <= runtime.SpriteManager.MAX_DECODED_IMAGE_PIXELS);
  assert.ok(metrics.decodedImageBytes <= runtime.SpriteManager.MAX_DECODED_IMAGE_BYTES);
  assert.ok(metrics.evictions > 0);
});

test('oversized decoded images obey the pixel budget after load and active retention release', () => {
  const unretainedPaths = Array.from({ length: 4 }, (_, index) => `/synthetic/oversized-${index}.png`);
  for (const assetPath of unretainedPaths) runtime.sprites.getImage(assetPath);
  for (const image of DeferredImage.instances.filter((entry) => unretainedPaths.includes(entry.src))) {
    image.resolve(4_096, 4_096);
  }

  let metrics = runtime.sprites.getPerformanceMetrics();
  assert.ok(metrics.decodedImagePixels <= runtime.SpriteManager.MAX_DECODED_IMAGE_PIXELS);
  assert.ok(metrics.decodedHighWaterPixels > runtime.SpriteManager.MAX_DECODED_IMAGE_PIXELS);

  const retainedPaths = ['/synthetic/retained-huge-a.png', '/synthetic/retained-huge-b.png'];
  runtime.sprites.retainPaths(retainedPaths);
  for (const image of DeferredImage.instances.filter((entry) => retainedPaths.includes(entry.src))) {
    image.resolve(4_096, 4_096);
  }
  metrics = runtime.sprites.getPerformanceMetrics();
  assert.ok(
    metrics.decodedImagePixels > runtime.SpriteManager.MAX_DECODED_IMAGE_PIXELS,
    'two active retained sheets may temporarily exceed the global budget',
  );

  runtime.sprites.releasePaths(retainedPaths);
  metrics = runtime.sprites.getPerformanceMetrics();
  assert.ok(metrics.decodedImagePixels <= runtime.SpriteManager.MAX_DECODED_IMAGE_PIXELS);
  assert.equal(metrics.retainedImages, 0);
});

test('particles, floating text, and projectiles are capped and pooled', () => {
  const particleSystem = new runtime.ParticleSystem();
  particleSystem.addImpactBurst(0, 0, 1_000);
  for (let index = 0; index < 120; index += 1) {
    particleSystem.addFloatingText(0, 0, String(index));
  }
  for (let index = 0; index < 160; index += 1) {
    particleSystem.addProjectile(0, 0, 1, 0, 'arrow', 1);
  }

  let metrics = particleSystem.getPerformanceMetrics();
  assert.equal(metrics.active.particles, runtime.PARTICLE_BUDGETS.particles);
  assert.equal(metrics.active.floatingTexts, runtime.PARTICLE_BUDGETS.floatingTexts);
  assert.equal(metrics.active.projectiles, runtime.PARTICLE_BUDGETS.projectiles);

  for (const particle of particleSystem.particles) particle.alpha = 0;
  fakeDocument.hidden = true;
  fakeDocument.visibilityState = 'hidden';
  particleSystem.update(3);
  fakeDocument.hidden = false;
  fakeDocument.visibilityState = 'visible';
  metrics = particleSystem.getPerformanceMetrics();
  assert.equal(metrics.active.particles, 0);
  assert.equal(metrics.active.floatingTexts, 0);
  assert.equal(metrics.active.projectiles, 0);
  assert.ok(metrics.pools.particles <= runtime.PARTICLE_BUDGETS.particlePool);
  assert.ok(metrics.pools.floatingTexts <= runtime.PARTICLE_BUDGETS.floatingTextPool);
  assert.ok(metrics.pools.projectiles <= runtime.PARTICLE_BUDGETS.projectilePool);

  particleSystem.addImpactBurst(0, 0, 10);
  particleSystem.addFloatingText(0, 0, 'reuse');
  particleSystem.addProjectile(0, 0, 1, 0, 'arrow', 1);
  metrics = particleSystem.getPerformanceMetrics();
  assert.ok(metrics.reused.particles > 0);
  assert.ok(metrics.reused.floatingTexts > 0);
  assert.ok(metrics.reused.projectiles > 0);
});

test('cosmetic projectiles are evicted before gameplay carriers at the shared cap', () => {
  const particleSystem = new runtime.ParticleSystem();
  const carriers = Array.from({ length: 6 }, (_, index) => (
    particleSystem.addProjectile(index, 0, 1, 0, 'arrow', 10)
  ));
  for (let index = 0; index < runtime.PARTICLE_BUDGETS.projectiles; index += 1) {
    particleSystem.addProjectile(index, 0, 1, 0, 'arrow', 0, false, false, '#fff', 8, false, { visualOnly: true });
  }

  assert.equal(particleSystem.projectiles.length, runtime.PARTICLE_BUDGETS.projectiles);
  assert.ok(carriers.every(carrier => particleSystem.projectiles.includes(carrier)));
  assert.equal(particleSystem.projectiles.filter(projectile => projectile.visualOnly).length, 90);

  const gameplayOnly = new runtime.ParticleSystem();
  const gameplay = Array.from({ length: runtime.PARTICLE_BUDGETS.projectiles }, (_, index) => (
    gameplayOnly.addProjectile(index, 0, 1, 0, 'arrow', 10)
  ));
  const rejectedCosmetic = gameplayOnly.addProjectile(
    0, 0, 1, 0, 'arrow', 0, false, false, '#fff', 8, false, { visualOnly: true },
  );

  assert.ok(gameplay.every(projectile => gameplayOnly.projectiles.includes(projectile)));
  assert.equal(gameplayOnly.projectiles.includes(rejectedCosmetic), false);
  assert.equal(gameplayOnly.projectiles.some(projectile => projectile.visualOnly), false);
});

test('hot VFX lists are compacted in place to avoid per-frame garbage', () => {
  const particleSystem = new runtime.ParticleSystem();
  particleSystem.addImpactBurst(0, 0, 20);
  particleSystem.addFloatingText(0, 0, 'stable-array');
  particleSystem.addProjectile(0, 0, 1, 0, 'arrow', 1);

  const particles = particleSystem.particles;
  const texts = particleSystem.floatingTexts;
  const projectiles = particleSystem.projectiles;
  particleSystem.update(1 / 60);

  assert.equal(particleSystem.particles, particles);
  assert.equal(particleSystem.floatingTexts, texts);
  assert.equal(particleSystem.projectiles, projectiles);
});

test('particle ceiling overwrites and recycles in O(1) without replacing the hot array', () => {
  const particleSystem = new runtime.ParticleSystem();
  particleSystem.addImpactBurst(0, 0, runtime.PARTICLE_BUDGETS.particles + 80);
  const particles = particleSystem.particles;
  particleSystem.addImpactBurst(0, 0, runtime.PARTICLE_BUDGETS.particles + 80);

  const metrics = particleSystem.getPerformanceMetrics();
  assert.equal(particleSystem.particles, particles);
  assert.equal(particleSystem.particles.length, runtime.PARTICLE_BUDGETS.particles);
  assert.ok(metrics.pools.particles > 0 || metrics.reused.particles > 0);
});

test('high-quality particle blur is capped and never leaks to ordinary particles', () => {
  const particleSystem = new runtime.ParticleSystem();
  for (let index = 0; index < 80; index += 1) {
    particleSystem.particles.push({
      x: index,
      y: 0,
      vx: 0,
      vy: 0,
      size: 2,
      color: '#fff',
      alpha: 1,
      decay: 0.01,
      type: 'holy',
    });
  }
  particleSystem.particles.push({
    x: 100,
    y: 0,
    vx: 0,
    vy: 0,
    size: 2,
    color: '#fff',
    alpha: 1,
    decay: 0.01,
    type: 'circle',
  });

  const blurAtFill = [];
  const ctx = {
    shadowBlur: 0,
    save() {},
    restore() {},
    beginPath() {},
    arc() {},
    fill() { blurAtFill.push(this.shadowBlur); },
  };
  particleSystem.draw(ctx);

  assert.equal(blurAtFill.filter(value => value > 0).length, 48);
  assert.equal(blurAtFill.at(-1), 0, 'ordinary particles must not inherit a previous glow blur');
});

test('cinematic flashes draw only the visible screen-space rectangle', () => {
  const particleSystem = new runtime.ParticleSystem();
  particleSystem.addScreenFlash('#fff', 0.8, 0.05);
  const fills = [];
  const ctx = {
    save() {},
    restore() {},
    fillRect(...args) { fills.push(args); },
  };

  particleSystem.drawScreenOverlays(ctx, 960, 540);
  assert.deepEqual(fills, [[0, 0, 960, 540]]);
});

test('visual-only projectile streams do not multiply procedural trails', () => {
  const particleSystem = new runtime.ParticleSystem();
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    particleSystem.addProjectile(0, 0, 1, 0, 'arrow', 0, false, true, '#fff', 10, true, { visualOnly: true });
    particleSystem.update(1 / 60);
    assert.equal(particleSystem.particles.length, 0);

    particleSystem.addProjectile(0, 0, 1, 0, 'arrow', 10);
    particleSystem.update(1 / 60);
    assert.ok(particleSystem.particles.length > 0, 'damage-bearing projectiles retain readable trails');
  } finally {
    Math.random = originalRandom;
  }
});

test('runtime reduced-motion override immediately clears motion-heavy VFX', () => {
  const particleSystem = new runtime.ParticleSystem();
  particleSystem.addGhostTrail(0, 0, 1, 'warrior');
  particleSystem.addScreenFlash('#fff');
  particleSystem.triggerScreenShake(8, 1);

  particleSystem.setReducedMotion(true);
  assert.equal(particleSystem.getVfxQuality(), 'low');
  assert.equal(particleSystem.ghostTrails.length, 0);
  assert.equal(particleSystem.screenFlashes.length, 0);
  assert.equal(particleSystem.screenShakeTime, 0);
});

test('Dragon Descent keeps its avatar but quality-bounds secondary fire waves', async () => {
  const high = new runtime.ParticleSystem();
  const highCalls = { lash: 0, line: 0, ground: 0, burst: 0 };
  high.addFlameLash = () => { highCalls.lash += 1; };
  high.addFireLine = () => { highCalls.line += 1; };
  high.addGroundExplosion = () => { highCalls.ground += 1; };
  high.addImpactBurst = () => { highCalls.burst += 1; };
  high.spawnDragonDescent(100, 100, 1);
  await new Promise(resolve => setTimeout(resolve, 290));
  high.cancelDelayedTasks();
  assert.equal(high.dragonAvatars.length, 1);
  assert.deepEqual(highCalls, { lash: 3, line: 3, ground: 1, burst: 3 });

  const low = new runtime.ParticleSystem();
  low.setReducedMotion(true);
  const lowCalls = { lash: 0, line: 0, ground: 0, burst: 0 };
  low.addFlameLash = () => { lowCalls.lash += 1; };
  low.addFireLine = () => { lowCalls.line += 1; };
  low.addGroundExplosion = () => { lowCalls.ground += 1; };
  low.addImpactBurst = () => { lowCalls.burst += 1; };
  low.spawnDragonDescent(100, 100, 1);
  await new Promise(resolve => setTimeout(resolve, 20));
  low.cancelDelayedTasks();
  assert.equal(low.dragonAvatars.length, 1);
  assert.deepEqual(lowCalls, { lash: 1, line: 0, ground: 1, burst: 1 });
});

test('queued Dragon Descent waves obey a live reduced-motion downgrade', async () => {
  const particleSystem = new runtime.ParticleSystem();
  const calls = { lash: 0, line: 0, ground: 0, burst: 0 };
  particleSystem.addFlameLash = () => { calls.lash += 1; };
  particleSystem.addFireLine = () => { calls.line += 1; };
  particleSystem.addGroundExplosion = () => { calls.ground += 1; };
  particleSystem.addImpactBurst = () => { calls.burst += 1; };

  particleSystem.spawnDragonDescent(100, 100, 1);
  await new Promise(resolve => setTimeout(resolve, 20));
  particleSystem.setReducedMotion(true);
  await new Promise(resolve => setTimeout(resolve, 270));
  particleSystem.cancelDelayedTasks();

  assert.deepEqual(calls, { lash: 1, line: 1, ground: 1, burst: 1 });
});

test('hidden documents discard disposable visuals but keep gameplay projectiles ticking', () => {
  const particleSystem = new runtime.ParticleSystem();
  particleSystem.addImpactBurst(0, 0, 20);
  particleSystem.addFloatingText(0, 0, 'hidden');
  const projectile = particleSystem.addProjectile(0, 0, 1, 0, 'arrow', 1);
  fakeDocument.hidden = true;
  fakeDocument.visibilityState = 'hidden';
  particleSystem.update(0.1);
  fakeDocument.hidden = false;
  fakeDocument.visibilityState = 'visible';

  const metrics = particleSystem.getPerformanceMetrics();
  assert.equal(metrics.active.particles, 0);
  assert.equal(metrics.active.floatingTexts, 0);
  assert.equal(metrics.active.projectiles, 1);
  assert.ok(projectile.x > 0);
  assert.equal(metrics.hiddenUpdates, 1);
});
