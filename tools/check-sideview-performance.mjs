import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadVfxLibrary() {
  const bundle = await rolldown({
    input: path.join(root, 'src/sideview/engine/VfxLibrary.ts'),
    platform: 'browser',
  });
  const generated = await bundle.generate({ format: 'esm' });
  await bundle.close();
  const code = generated.output.find((chunk) => chunk.type === 'chunk')?.code;
  if (!code) throw new Error('VfxLibrary did not produce an executable bundle');
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

export async function inspectSideViewPerformanceBudget() {
  const vfx = await loadVfxLibrary();
  const commonPaths = vfx.imagePathsForVfxIds(vfx.COMMON_BOOT_VFX_IDS);
  const cataloguePaths = vfx.allVfxImagePaths();
  const missing = [];
  let commonBytes = 0;

  for (const assetPath of commonPaths) {
    if (!assetPath.startsWith('/assets/')) {
      missing.push(assetPath);
      continue;
    }
    const localPath = path.join(root, 'public', ...assetPath.split('/').filter(Boolean));
    try {
      commonBytes += (await stat(localPath)).size;
    } catch {
      missing.push(assetPath);
    }
  }

  return {
    commonIds: [...vfx.COMMON_BOOT_VFX_IDS],
    commonPaths,
    commonBytes,
    cataloguePathCount: cataloguePaths.length,
    missing,
    budgets: {
      bootImageRequests: 8,
      bootImageBytes: 256_000,
      residentImages: 256,
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await inspectSideViewPerformanceBudget();
  if (result.missing.length) {
    console.error(`Missing common VFX assets:\n${result.missing.join('\n')}`);
    process.exitCode = 1;
  } else if (
    result.commonPaths.length > result.budgets.bootImageRequests
    || result.commonBytes > result.budgets.bootImageBytes
  ) {
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}
