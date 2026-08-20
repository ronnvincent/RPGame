import test from 'node:test';
import assert from 'node:assert/strict';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'src/sideview/network/NetworkCadence.ts', platform: 'browser' });
const generated = await bundle.generate({ format: 'esm' });
await bundle.close();
const code = generated.output.find(chunk => chunk.type === 'chunk')?.code;
assert.ok(code, 'network cadence module should bundle');
const net = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('identical snapshots collapse to a bounded heartbeat', () => {
  const cadence = new net.PayloadCadence(500);
  assert.equal(cadence.shouldSend('idle', 1_000), true);
  assert.equal(cadence.shouldSend('idle', 1_050), false);
  assert.equal(cadence.shouldSend('idle', 1_499), false);
  assert.equal(cadence.shouldSend('idle', 1_500), true);
  assert.equal(cadence.shouldSend('run', 1_510), true, 'state transitions are immediate');
  cadence.reset();
  assert.equal(cadence.shouldSend('run', 1_520), true, 'room transitions force a fresh state');
});

test('network coordinates are finite and quantized below visible pixel precision', () => {
  assert.equal(net.quantizeNetworkCoordinate(10.12), 10);
  assert.equal(net.quantizeNetworkCoordinate(10.14), 10.25);
  assert.equal(net.quantizeNetworkCoordinate(Number.NaN), 0);
  assert.equal(net.quantizeNetworkCoordinate(3.37, 0.5), 3.5);
});

test('remote coordinates ease between packets but snap across teleports', () => {
  const eased = net.smoothNetworkCoordinate(0, 100, 1 / 60);
  assert.ok(eased > 20 && eased < 30, `expected one smooth frame, got ${eased}`);
  assert.equal(net.smoothNetworkCoordinate(0, 500, 1 / 60), 500);
  assert.equal(net.smoothNetworkCoordinate(Number.NaN, 35, 1 / 60), 35);
});
