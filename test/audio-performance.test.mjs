import assert from 'node:assert/strict';
import test from 'node:test';
import { rolldown } from 'rolldown';

class FakeAudioParam {
  value = 1;
  setValueAtTime() {}
  setTargetAtTime() {}
}

class FakeAudioNode {
  disconnected = false;
  connect() { return this; }
  disconnect() { this.disconnected = true; }
}

class FakeAudioContext {
  static instances = [];
  static decodeHook = null;
  state = 'running';
  currentTime = 10;
  destination = new FakeAudioNode();
  sources = [];

  constructor() { FakeAudioContext.instances.push(this); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  createGain() {
    const node = new FakeAudioNode();
    node.gain = new FakeAudioParam();
    return node;
  }
  createDynamicsCompressor() {
    const node = new FakeAudioNode();
    for (const key of ['threshold', 'knee', 'ratio', 'attack', 'release']) node[key] = new FakeAudioParam();
    return node;
  }
  createBufferSource() {
    const source = new FakeAudioNode();
    source.buffer = null;
    source.playbackRate = { value: 1 };
    source.onended = null;
    source.start = () => {};
    source.stop = () => {};
    this.sources.push(source);
    return source;
  }
  decodeAudioData(arrayBuffer) {
    return FakeAudioContext.decodeHook
      ? FakeAudioContext.decodeHook(arrayBuffer)
      : Promise.resolve({ duration: 0.2 });
  }
}

globalThis.window = globalThis;
globalThis.AudioContext = FakeAudioContext;
const successfulFetch = async () => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  arrayBuffer: async () => new ArrayBuffer(8),
});
globalThis.fetch = successfulFetch;

const flushAsyncWork = async () => {
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
};

const bundle = await rolldown({ input: 'test/audio-performance-fixture.ts', platform: 'browser' });
const generated = await bundle.generate({ format: 'esm' });
await bundle.close();
const code = generated.output.find(chunk => chunk.type === 'chunk')?.code;
assert.ok(code, 'audio performance fixture should bundle');
const runtime = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('same-frame hit sounds are coalesced and concurrent one-shots are bounded', async () => {
  const manager = new runtime.AudioManager();
  await Promise.all(Array.from({ length: 50 }, () => manager.playSFX('/synthetic/hit_same.ogg')));
  const settledHitMetrics = manager.getPerformanceMetrics();
  assert.equal(settledHitMetrics.activeOneShots, 1);
  assert.equal(settledHitMetrics.pendingBuffers, 0);
  assert.equal(settledHitMetrics.activeLoads, 0);
  assert.equal(settledHitMetrics.queuedLoads, 0);
  assert.ok(settledHitMetrics.peakConcurrentLoads <= settledHitMetrics.loadBudget);

  const context = FakeAudioContext.instances.at(-1);
  context.sources.forEach(source => source.onended?.());
  assert.equal(manager.getPerformanceMetrics().activeOneShots, 0);

  await Promise.all(Array.from(
    { length: 40 },
    (_, index) => manager.playSFX(`/synthetic/voice-${index}.ogg`),
  ));
  assert.equal(manager.getPerformanceMetrics().activeOneShots, 24);
  assert.equal(context.sources.length, 25, 'one coalesced hit plus the 24-source hard ceiling');

  context.sources.forEach(source => source.onended?.());
  assert.equal(manager.getPerformanceMetrics().activeOneShots, 0);
  assert.ok(context.sources.every(source => source.disconnected));
});

test('a transient load failure settles and the same sound can be retried', async () => {
  const manager = new runtime.AudioManager();
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('temporary network failure');
    return successfulFetch();
  };
  console.warn = () => {};

  try {
    await manager.playSFX('/synthetic/retry.ogg');
    assert.equal(attempts, 1);
    assert.equal(manager.getPerformanceMetrics().pendingBuffers, 0);
    assert.equal(manager.getPerformanceMetrics().activeLoads, 0);

    await manager.playSFX('/synthetic/retry.ogg');
    assert.equal(attempts, 2);
    assert.equal(manager.getPerformanceMetrics().decodedBuffers, 1);
    assert.equal(manager.getPerformanceMetrics().activeOneShots, 1);
    assert.equal(manager.getPerformanceMetrics().pendingBuffers, 0);
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    FakeAudioContext.instances.at(-1)?.sources.forEach(source => source.onended?.());
  }
});

test('HTTP failures reject before reading or decoding the response body', async () => {
  const manager = new runtime.AudioManager();
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  let bodyReads = 0;
  let decodes = 0;
  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    statusText: 'Unavailable',
    arrayBuffer: async () => {
      bodyReads += 1;
      return new ArrayBuffer(8);
    },
  });
  FakeAudioContext.decodeHook = async () => {
    decodes += 1;
    return { duration: 0.2 };
  };
  console.warn = () => {};

  try {
    await manager.playSFX('/synthetic/http-failure.ogg');
    assert.equal(bodyReads, 0);
    assert.equal(decodes, 0);
    assert.deepEqual(manager.getPerformanceMetrics(), {
      activeOneShots: 0,
      oneShotBudget: 24,
      decodedBuffers: 0,
      pendingBuffers: 0,
      activeLoads: 0,
      queuedLoads: 0,
      peakConcurrentLoads: 1,
      loadBudget: 4,
    });
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    FakeAudioContext.decodeHook = null;
  }
});

test('muting while a sound is loading prevents source creation after decode', async () => {
  const manager = new runtime.AudioManager();
  const originalFetch = globalThis.fetch;
  let releaseBody;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    arrayBuffer: () => new Promise(resolve => { releaseBody = resolve; }),
  });

  try {
    const play = manager.playSFX('/synthetic/mute-during-load.ogg');
    await flushAsyncWork();
    assert.equal(typeof releaseBody, 'function');
    manager.soundEnabled = false;
    releaseBody(new ArrayBuffer(8));
    await play;

    const context = FakeAudioContext.instances.at(-1);
    assert.equal(context.sources.length, 0);
    assert.equal(manager.getPerformanceMetrics().activeOneShots, 0);
    assert.equal(manager.getPerformanceMetrics().decodedBuffers, 1);
    assert.equal(manager.getPerformanceMetrics().pendingBuffers, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetch and decode work uses its own four-load concurrency budget', async () => {
  const manager = new runtime.AudioManager();
  let activeDecodes = 0;
  let peakDecodes = 0;
  let startedDecodes = 0;
  const releases = [];
  FakeAudioContext.decodeHook = () => {
    activeDecodes += 1;
    startedDecodes += 1;
    peakDecodes = Math.max(peakDecodes, activeDecodes);
    return new Promise(resolve => {
      releases.push(() => {
        activeDecodes -= 1;
        resolve({ duration: 0.2 });
      });
    });
  };

  try {
    const plays = Array.from(
      { length: 12 },
      (_, index) => manager.playSFX(`/synthetic/concurrent-${index}.ogg`),
    );

    while (startedDecodes < 12) {
      await flushAsyncWork();
      assert.ok(activeDecodes <= 4);
      assert.ok(releases.length > 0, 'queued decodes should make forward progress');
      releases.splice(0).forEach(release => release());
    }
    releases.splice(0).forEach(release => release());
    await Promise.all(plays);

    const metrics = manager.getPerformanceMetrics();
    assert.equal(peakDecodes, 4);
    assert.equal(metrics.peakConcurrentLoads, 4);
    assert.equal(metrics.loadBudget, 4);
    assert.equal(metrics.pendingBuffers, 0);
    assert.equal(metrics.activeLoads, 0);
    assert.equal(metrics.queuedLoads, 0);
    assert.equal(metrics.activeOneShots, 12);

    FakeAudioContext.instances.at(-1).sources.forEach(source => source.onended?.());
  } finally {
    FakeAudioContext.decodeHook = null;
  }
});

test('selected-class and shared combat sounds warm before the remainder', () => {
  const manager = new runtime.AudioManager();
  const scheduled = [];
  const originalSetTimeout = window.setTimeout;
  window.setTimeout = (_callback, delay) => { scheduled.push(delay); return scheduled.length; };
  try {
    manager.warmSounds([{ sound: 'ult_storm' }]);
  } finally {
    window.setTimeout = originalSetTimeout;
  }

  assert.ok(scheduled.length > 20);
  assert.ok(scheduled.slice(0, 5).every(delay => delay <= 140));
  assert.ok(scheduled[5] >= 250, 'non-priority catalogue decoding starts after the first fight-critical set');
});
