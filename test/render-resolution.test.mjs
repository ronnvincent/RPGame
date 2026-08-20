import assert from 'node:assert/strict';
import test from 'node:test';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'test/render-resolution-fixture.ts', platform: 'browser' });
const generated = await bundle.generate({ format: 'esm' });
await bundle.close();
const code = generated.output.find((chunk) => chunk.type === 'chunk')?.code;
assert.ok(code, 'render-resolution fixture should bundle');
const runtime = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('adaptive tiers reduce high-DPR desktop fill rate without going below CSS resolution', () => {
  assert.equal(runtime.canvasDprForQuality(3, false, 'high'), 2);
  assert.equal(runtime.canvasDprForQuality(3, false, 'medium'), 1.75);
  assert.equal(runtime.canvasDprForQuality(3, false, 'low'), 1.5);
  assert.equal(runtime.canvasDprForQuality(1, false, 'low'), 1);
});

test('coarse-pointer devices use a tighter mobile DPR ladder', () => {
  assert.equal(runtime.canvasDprForQuality(3, true, 'high'), 1.5);
  assert.equal(runtime.canvasDprForQuality(3, true, 'medium'), 1.25);
  assert.equal(runtime.canvasDprForQuality(3, true, 'low'), 1);
});
