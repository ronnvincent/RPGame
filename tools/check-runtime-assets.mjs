import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = resolve(TOOL_DIR, '..');
const PUBLIC_PREFIX = '/assets/runtime/';
const APPROVED_LICENSES = new Set(['CC0-1.0']);
const APPROVED_CATEGORIES = new Set(['ui', 'maps', 'vfx', 'monsters']);
const APPROVED_PRELOAD_TIERS = new Set(['core', 'zone', 'on-demand']);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const HARD_BUDGET_CEILINGS = {
  totalBytes: 1_000_000,
  perFileBytes: 256_000,
  byPreloadTier: {
    core: 150_000,
    zone: 250_000,
    'on-demand': 750_000,
  },
};

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function hasUniqueStrings(values) {
  return Array.isArray(values) && values.every((value) => typeof value === 'string') && new Set(values).size === values.length;
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function isHttpsUrl(value, expectedHost) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (!expectedHost || url.hostname === expectedHost || url.hostname.endsWith(`.${expectedHost}`));
  } catch {
    return false;
  }
}

function isInside(parent, candidate) {
  const relativePath = relative(parent, candidate);
  return relativePath === '' || (!relativePath.startsWith(`..${sep}`) && relativePath !== '..' && !relativePath.includes(':'));
}

function publicPathToFile(publicDir, publicPath) {
  const relativePath = publicPath.startsWith('/') ? publicPath.slice(1) : publicPath;
  return resolve(publicDir, ...relativePath.split('/'));
}

function toPosixPath(value) {
  return value.split(sep).join('/');
}

async function fileExists(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function walkFiles(root) {
  const files = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  }

  await visit(root);
  return files;
}

function checkBudgetPolicy(policy, errors) {
  if (!isRecord(policy)) {
    errors.push('manifest.policy must be an object');
    return null;
  }

  if (!hasUniqueStrings(policy.allowedLicenses) || policy.allowedLicenses.length === 0) {
    errors.push('manifest.policy.allowedLicenses must be a non-empty array of unique strings');
  } else {
    for (const license of policy.allowedLicenses) {
      if (!APPROVED_LICENSES.has(license)) {
        errors.push(`manifest policy includes unapproved license: ${license}`);
      }
    }
  }

  if (!hasUniqueStrings(policy.allowedAssetExtensions) || policy.allowedAssetExtensions.length !== 1 || policy.allowedAssetExtensions[0] !== '.png') {
    errors.push('manifest.policy.allowedAssetExtensions must contain only .png');
  }

  if (!isRecord(policy.budgets) || !isRecord(policy.budgets.byPreloadTier)) {
    errors.push('manifest.policy.budgets and byPreloadTier must be objects');
    return null;
  }

  const budgets = policy.budgets;
  for (const [name, ceiling] of [
    ['totalBytes', HARD_BUDGET_CEILINGS.totalBytes],
    ['perFileBytes', HARD_BUDGET_CEILINGS.perFileBytes],
  ]) {
    if (!isPositiveInteger(budgets[name])) {
      errors.push(`manifest.policy.budgets.${name} must be a positive integer`);
    } else if (budgets[name] > ceiling) {
      errors.push(`manifest.policy.budgets.${name} exceeds the validator ceiling of ${ceiling} bytes`);
    }
  }

  for (const tier of APPROVED_PRELOAD_TIERS) {
    const value = budgets.byPreloadTier[tier];
    const ceiling = HARD_BUDGET_CEILINGS.byPreloadTier[tier];
    if (!isPositiveInteger(value)) {
      errors.push(`manifest.policy.budgets.byPreloadTier.${tier} must be a positive integer`);
    } else if (value > ceiling) {
      errors.push(`manifest.policy.budgets.byPreloadTier.${tier} exceeds the validator ceiling of ${ceiling} bytes`);
    }
  }

  return budgets;
}

export async function validateRuntimeAssets({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const errors = [];
  const warnings = [];
  const publicDir = resolve(repoRoot, 'public');
  const runtimeDir = resolve(publicDir, 'assets', 'runtime');
  const manifestPath = resolve(runtimeDir, 'manifest.json');
  const counts = { packs: 0, assetGroups: 0, files: 0, licenseNotices: 0 };
  const bytesByTier = { core: 0, zone: 0, 'on-demand': 0 };
  const bytesByCategory = { ui: 0, maps: 0, vfx: 0, monsters: 0 };
  let totalBytes = 0;
  let manifest;

  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    errors.push(`unable to read ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
    return { errors, warnings, counts, bytesByTier, bytesByCategory, totalBytes };
  }

  if (!isRecord(manifest)) {
    errors.push('runtime manifest root must be an object');
    return { errors, warnings, counts, bytesByTier, bytesByCategory, totalBytes };
  }

  if (manifest.schemaVersion !== 1) errors.push('runtime manifest schemaVersion must be 1');
  if (!isIsoDate(manifest.generatedAt)) errors.push('runtime manifest generatedAt must be a real YYYY-MM-DD date');
  const budgets = checkBudgetPolicy(manifest.policy, errors);

  const packs = Array.isArray(manifest.packs) ? manifest.packs : [];
  const assetGroups = Array.isArray(manifest.assetGroups) ? manifest.assetGroups : [];
  if (!Array.isArray(manifest.packs) || packs.length === 0) errors.push('runtime manifest must contain at least one pack');
  if (!Array.isArray(manifest.assetGroups) || assetGroups.length === 0) errors.push('runtime manifest must contain at least one asset group');
  counts.packs = packs.length;
  counts.assetGroups = assetGroups.length;

  const packIds = new Set();
  const packGroups = new Map();
  const referencedNotices = new Set();
  const directDownloads = [];

  for (const [index, pack] of packs.entries()) {
    const label = isRecord(pack) && typeof pack.id === 'string' ? pack.id : `packs[${index}]`;
    if (!isRecord(pack)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    if (typeof pack.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pack.id)) {
      errors.push(`${label}.id must be a kebab-case string`);
    } else if (packIds.has(pack.id)) {
      errors.push(`duplicate pack id: ${pack.id}`);
    } else {
      packIds.add(pack.id);
    }
    for (const field of ['title', 'creator', 'version']) {
      if (typeof pack[field] !== 'string' || pack[field].trim() === '') errors.push(`${label}.${field} must be a non-empty string`);
    }
    const expectedSourceHost = pack.id === 'luizmelo-monsters-creatures-fantasy-2'
      ? 'luizmelo.itch.io'
      : pack.id === 'opengameart-pixel-wolf'
      ? 'opengameart.org'
      : 'kenney.nl';
    if (!isHttpsUrl(pack.sourceUrl, expectedSourceHost)) {
      errors.push(`${label}.sourceUrl must be an official HTTPS ${expectedSourceHost} URL`);
    }

    if (!isRecord(pack.retrieval)) {
      errors.push(`${label}.retrieval must be an object`);
    } else {
      if (!isIsoDate(pack.retrieval.date)) errors.push(`${label}.retrieval.date must be a real YYYY-MM-DD date`);
      if (pack.retrieval.method === 'official-download') {
        if (typeof pack.retrieval.archiveFile !== 'string' || !/^[a-z0-9_-]+\.zip$/i.test(pack.retrieval.archiveFile)) {
          errors.push(`${label}.retrieval.archiveFile must name the downloaded ZIP without a path`);
        }
        if (!isPositiveInteger(pack.retrieval.archiveBytes)) errors.push(`${label}.retrieval.archiveBytes must be a positive integer`);
        if (typeof pack.retrieval.archiveSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(pack.retrieval.archiveSha256)) {
          errors.push(`${label}.retrieval.archiveSha256 must be a lowercase SHA-256 digest`);
        }
      } else if (pack.retrieval.method === 'official-direct-download') {
        if (!Array.isArray(pack.retrieval.directFiles) || pack.retrieval.directFiles.length === 0) {
          errors.push(`${label}.retrieval.directFiles must be a non-empty array`);
        } else {
          const directPaths = new Set();
          for (const [fileIndex, directFile] of pack.retrieval.directFiles.entries()) {
            const fileLabel = `${label}.retrieval.directFiles[${fileIndex}]`;
            if (!isRecord(directFile)) {
              errors.push(`${fileLabel} must be an object`);
              continue;
            }
            if (typeof directFile.assetPath !== 'string' || !/^\/assets\/runtime\/(ui|maps|vfx|monsters)\/[a-z0-9][a-z0-9/_-]*\.png$/i.test(directFile.assetPath)) {
              errors.push(`${fileLabel}.assetPath must be a safe runtime PNG path`);
            } else if (directPaths.has(directFile.assetPath)) {
              errors.push(`${label}.retrieval.directFiles contains a duplicate asset path: ${directFile.assetPath}`);
            } else {
              directPaths.add(directFile.assetPath);
            }
            if (!isHttpsUrl(directFile.downloadUrl, expectedSourceHost)) {
              errors.push(`${fileLabel}.downloadUrl must be an official HTTPS ${expectedSourceHost} URL`);
            }
            if (!isPositiveInteger(directFile.bytes)) errors.push(`${fileLabel}.bytes must be a positive integer`);
            if (typeof directFile.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(directFile.sha256)) {
              errors.push(`${fileLabel}.sha256 must be a lowercase SHA-256 digest`);
            }
            directDownloads.push({ label: fileLabel, ...directFile });
          }
        }
      } else {
        errors.push(`${label}.retrieval.method must be official-download or official-direct-download`);
      }
    }

    if (!isRecord(pack.license)) {
      errors.push(`${label}.license must be an object`);
    } else {
      if (!APPROVED_LICENSES.has(pack.license.spdx)) errors.push(`${label} uses unapproved license: ${String(pack.license.spdx)}`);
      if (!isHttpsUrl(pack.license.url)) errors.push(`${label}.license.url must be HTTPS`);
      if (pack.license.attributionRequired !== false) errors.push(`${label}.license.attributionRequired must be false for this CC0 collection`);
      const noticePath = pack.license.noticePath;
      if (typeof noticePath !== 'string' || !/^\/assets\/runtime\/licenses\/[a-z0-9._-]+\.txt$/i.test(noticePath)) {
        errors.push(`${label}.license.noticePath must point to a TXT file under /assets/runtime/licenses`);
      } else {
        referencedNotices.add(noticePath);
        const noticeFile = publicPathToFile(publicDir, noticePath);
        if (!isInside(runtimeDir, noticeFile) || !(await fileExists(noticeFile))) {
          errors.push(`${label} license notice is missing: ${noticePath}`);
        } else {
          const notice = await readFile(noticeFile, 'utf8');
          if (!notice.includes('CC0-1.0') || !notice.includes('creativecommons.org/publicdomain/zero/1.0')) {
            errors.push(`${label} license notice does not identify CC0-1.0 and its canonical URL`);
          }
        }
      }
    }

    if (!hasUniqueStrings(pack.selectedAssetGroups) || pack.selectedAssetGroups.length === 0) {
      errors.push(`${label}.selectedAssetGroups must be a non-empty array of unique strings`);
      packGroups.set(pack.id, new Set());
    } else {
      packGroups.set(pack.id, new Set(pack.selectedAssetGroups));
    }
  }

  const groupIds = new Set();
  const manifestFiles = new Set();
  const discoveredPackGroups = new Map([...packIds].map((id) => [id, new Set()]));

  for (const [index, group] of assetGroups.entries()) {
    const label = isRecord(group) && typeof group.id === 'string' ? group.id : `assetGroups[${index}]`;
    if (!isRecord(group)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    if (typeof group.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(group.id)) {
      errors.push(`${label}.id must be a kebab-case string`);
    } else if (groupIds.has(group.id)) {
      errors.push(`duplicate asset group id: ${group.id}`);
    } else {
      groupIds.add(group.id);
    }
    if (typeof group.packId !== 'string' || !packIds.has(group.packId)) {
      errors.push(`${label}.packId does not reference a declared pack`);
    } else {
      discoveredPackGroups.get(group.packId)?.add(group.id);
    }
    if (!APPROVED_CATEGORIES.has(group.category)) errors.push(`${label}.category must be ui, maps, vfx, or monsters`);
    if (!APPROVED_PRELOAD_TIERS.has(group.preload)) errors.push(`${label}.preload must be core, zone, or on-demand`);
    if (typeof group.role !== 'string' || group.role.trim() === '') errors.push(`${label}.role must be a non-empty string`);
    if (typeof group.sourceSelection !== 'string' || group.sourceSelection.trim() === '') errors.push(`${label}.sourceSelection must be a non-empty string`);
    if (typeof group.pixelArt !== 'boolean') errors.push(`${label}.pixelArt must be boolean`);
    if (!hasUniqueStrings(group.files) || group.files.length === 0) {
      errors.push(`${label}.files must be a non-empty array of unique paths`);
      continue;
    }

    for (const publicPath of group.files) {
      if (!/^\/assets\/runtime\/(ui|maps|vfx|monsters)\/[a-z0-9][a-z0-9/_-]*\.png$/i.test(publicPath)) {
        errors.push(`${label} has unsafe runtime asset path: ${publicPath}`);
        continue;
      }
      const pathCategory = publicPath.split('/')[3];
      if (pathCategory !== group.category) errors.push(`${label} category does not match its path: ${publicPath}`);
      if (extname(publicPath).toLowerCase() !== '.png') errors.push(`${label} contains a non-PNG runtime asset: ${publicPath}`);
      if (manifestFiles.has(publicPath)) {
        errors.push(`runtime asset appears more than once in the manifest: ${publicPath}`);
        continue;
      }
      manifestFiles.add(publicPath);

      const file = publicPathToFile(publicDir, publicPath);
      if (!isInside(runtimeDir, file)) {
        errors.push(`runtime asset escapes its root: ${publicPath}`);
        continue;
      }
      if (!(await fileExists(file))) {
        errors.push(`manifest runtime asset is missing: ${publicPath}`);
        continue;
      }

      const fileStat = await stat(file);
      counts.files += 1;
      totalBytes += fileStat.size;
      if (APPROVED_PRELOAD_TIERS.has(group.preload)) bytesByTier[group.preload] += fileStat.size;
      if (APPROVED_CATEGORIES.has(group.category)) bytesByCategory[group.category] += fileStat.size;
      if (budgets && isPositiveInteger(budgets.perFileBytes) && fileStat.size > budgets.perFileBytes) {
        errors.push(`${publicPath} is ${fileStat.size} bytes and exceeds the per-file budget of ${budgets.perFileBytes}`);
      }

      const signature = (await readFile(file)).subarray(0, PNG_SIGNATURE.length);
      if (!signature.equals(PNG_SIGNATURE)) errors.push(`${publicPath} has a .png extension but not a PNG signature`);
    }
  }

  for (const packId of packIds) {
    const declared = packGroups.get(packId) ?? new Set();
    const discovered = discoveredPackGroups.get(packId) ?? new Set();
    for (const id of declared) {
      if (!discovered.has(id)) errors.push(`${packId}.selectedAssetGroups references missing or foreign group: ${id}`);
    }
    for (const id of discovered) {
      if (!declared.has(id)) errors.push(`${packId}.selectedAssetGroups omits manifest group: ${id}`);
    }
  }

  for (const directFile of directDownloads) {
    if (!manifestFiles.has(directFile.assetPath)) {
      errors.push(`${directFile.label}.assetPath is not declared by an asset group: ${directFile.assetPath}`);
      continue;
    }
    const file = publicPathToFile(publicDir, directFile.assetPath);
    if (!isInside(runtimeDir, file) || !(await fileExists(file))) continue;
    const contents = await readFile(file);
    if (contents.byteLength !== directFile.bytes) {
      errors.push(`${directFile.label}.bytes is ${directFile.bytes}, but the local file is ${contents.byteLength} bytes`);
    }
    const digest = createHash('sha256').update(contents).digest('hex');
    if (digest !== directFile.sha256) {
      errors.push(`${directFile.label}.sha256 does not match the local file: ${directFile.assetPath}`);
    }
  }

  if (budgets) {
    if (isPositiveInteger(budgets.totalBytes) && totalBytes > budgets.totalBytes) {
      errors.push(`runtime assets total ${totalBytes} bytes and exceed the ${budgets.totalBytes}-byte budget`);
    }
    for (const tier of APPROVED_PRELOAD_TIERS) {
      const budget = budgets.byPreloadTier?.[tier];
      if (isPositiveInteger(budget) && bytesByTier[tier] > budget) {
        errors.push(`${tier} assets total ${bytesByTier[tier]} bytes and exceed the ${budget}-byte budget`);
      }
    }
  }

  try {
    const filesOnDisk = await walkFiles(runtimeDir);
    for (const file of filesOnDisk) {
      const relativePath = toPosixPath(relative(runtimeDir, file));
      if (relativePath === 'manifest.json') continue;
      if (relativePath.startsWith('licenses/')) {
        if (!/^licenses\/[a-z0-9._-]+\.txt$/i.test(relativePath)) {
          errors.push(`unsafe file in runtime license directory: ${relativePath}`);
          continue;
        }
        const publicPath = `${PUBLIC_PREFIX}${relativePath}`;
        counts.licenseNotices += 1;
        if (!referencedNotices.has(publicPath)) errors.push(`unreferenced runtime license notice: ${publicPath}`);
        continue;
      }

      const publicPath = `${PUBLIC_PREFIX}${relativePath}`;
      if (!manifestFiles.has(publicPath)) errors.push(`unmanifested runtime file: ${publicPath}`);
      if (extname(relativePath).toLowerCase() !== '.png') errors.push(`unsafe runtime asset extension: ${publicPath}`);
    }
  } catch (error) {
    errors.push(`unable to enumerate runtime assets: ${error instanceof Error ? error.message : String(error)}`);
  }

  for (const publicPath of manifestFiles) {
    if (!publicPath.startsWith(PUBLIC_PREFIX)) errors.push(`manifest asset is outside runtime prefix: ${publicPath}`);
  }

  return { errors, warnings, counts, bytesByTier, bytesByCategory, totalBytes };
}

function formatBytes(value) {
  return `${value.toLocaleString('en-US')} bytes`;
}

async function runCli() {
  const result = await validateRuntimeAssets();
  if (result.errors.length > 0) {
    console.error(`Runtime asset validation failed with ${result.errors.length} error(s):`);
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Runtime assets valid: ${result.counts.packs} packs, ${result.counts.assetGroups} groups, ` +
      `${result.counts.files} PNG files, ${result.counts.licenseNotices} notices, ${formatBytes(result.totalBytes)}.`,
  );
  console.log(
    `Preload bytes: core=${formatBytes(result.bytesByTier.core)}, ` +
      `zone=${formatBytes(result.bytesByTier.zone)}, on-demand=${formatBytes(result.bytesByTier['on-demand'])}.`,
  );
}

const isDirectRun = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isDirectRun) await runCli();
