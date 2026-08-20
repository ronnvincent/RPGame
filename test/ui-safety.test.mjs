import test from 'node:test';
import assert from 'node:assert/strict';
import { rolldown } from 'rolldown';

const bundle = await rolldown({ input: 'src/sideview/ui/UiSafety.ts', platform: 'browser' });
const generated = await bundle.generate({ format: 'esm' });
await bundle.close();
const code = generated.output.find(chunk => chunk.type === 'chunk')?.code;
assert.ok(code, 'UI safety module should bundle');
const ui = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('HTML template values are escaped without corrupting ordinary RPG copy', () => {
  assert.equal(ui.escapeHtml(`Grimjaw & <script>alert("x")</script> '`),
    'Grimjaw &amp; &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &#39;');
  assert.equal(ui.escapeHtml('Arch-Lich Malakar'), 'Arch-Lich Malakar');
  assert.equal(ui.escapeHtml(null), '');
});

test('only normalized local asset paths cross into UI markup', () => {
  assert.equal(ui.safeLocalAssetPath('/assets/runtime/ui/panel.png'), '/assets/runtime/ui/panel.png');
  assert.equal(ui.safeLocalAssetPath('javascript:alert(1)', '/fallback.png'), '/fallback.png');
  assert.equal(ui.safeLocalAssetPath('//tracker.example/a.png', '/fallback.png'), '/fallback.png');
  assert.equal(ui.safeLocalAssetPath('/assets/%2e%2e/secret.png', '/fallback.png'), '/fallback.png');
});

test('percentages remain finite and inside visual bounds', () => {
  assert.equal(ui.clampPercent(-5), 0);
  assert.equal(ui.clampPercent(42.5), 42.5);
  assert.equal(ui.clampPercent(120), 100);
  assert.equal(ui.clampPercent(Number.NaN), 0);
});
