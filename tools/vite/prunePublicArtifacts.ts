import { readdirSync, rmSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

const SOURCE_ONLY_DIRECTORIES = new Set([
  '.git',
  '.godot',
  '.idea',
  '__MACOSX',
  'shader_cache',
]);

const SOURCE_ONLY_EXTENSIONS = new Set([
  '.ase',
  '.aseprite',
  '.blend',
  '.bz2',
  '.cache',
  '.cfg',
  '.ctex',
  '.docx',
  '.gdignore',
  '.gdshader',
  '.godot',
  '.import',
  '.iml',
  '.kra',
  '.md5',
  '.name',
  '.node',
  '.oggvorbisstr',
  '.pdf',
  '.psd',
  '.spritedesc',
  '.spritepos',
  '.swf',
  '.tps',
  '.tres',
  '.tscn',
  '.xcf',
  '.zip',
]);

function sourceOnlyFile(name: string): boolean {
  // License/credit documents remain deployable even when the original pack
  // supplied them as PDF; performance cleanup must never erase legal notices.
  if (/license|licence|credit|attribution/i.test(name)) return false;
  return name === '.DS_Store'
    || name.startsWith('._')
    || SOURCE_ONLY_EXTENSIONS.has(extname(name).toLowerCase());
}

/**
 * Vite copies `public/` verbatim. Asset packs also contain editor sources,
 * platform metadata and engine caches that a browser cannot consume. Preserve
 * those originals in the repository, but remove them from generated `dist/`.
 */
export function prunePublicArtifacts(): Plugin {
  let outputRoot = '';

  return {
    name: 'prune-source-only-public-artifacts',
    apply: 'build',
    configResolved(config: ResolvedConfig) {
      outputRoot = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (!outputRoot) return;

      const verifiedRoot = resolve(outputRoot);
      let removedFiles = 0;
      let removedBytes = 0;

      const removeTree = (target: string) => {
        const verifiedTarget = resolve(target);
        if (!verifiedTarget.startsWith(`${verifiedRoot}${sep}`)) {
          throw new Error(`Refusing to prune outside build output: ${verifiedTarget}`);
        }
        const measure = (path: string): number => {
          const stat = statSync(path);
          if (stat.isFile()) {
            removedFiles++;
            return stat.size;
          }
          return readdirSync(path).reduce((sum, child) => sum + measure(resolve(path, child)), 0);
        };
        removedBytes += measure(verifiedTarget);
        rmSync(verifiedTarget, { recursive: true, force: true });
      };

      const walk = (directory: string) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const target = resolve(directory, entry.name);
          if (entry.isDirectory()) {
            if (SOURCE_ONLY_DIRECTORIES.has(entry.name)) removeTree(target);
            else walk(target);
          } else if (entry.isFile() && sourceOnlyFile(entry.name)) {
            removeTree(target);
          }
        }
      };

      walk(verifiedRoot);
      if (removedFiles) {
        const megabytes = (removedBytes / (1024 * 1024)).toFixed(2);
        console.log(`[build] excluded ${removedFiles} source-only asset files (${megabytes} MB)`);
      }
    },
  };
}
