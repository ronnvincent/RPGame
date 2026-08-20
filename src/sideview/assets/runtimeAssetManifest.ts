export const RUNTIME_ASSET_MANIFEST_URL = '/assets/runtime/manifest.json' as const;

export type RuntimeAssetCategory = 'ui' | 'maps' | 'vfx' | 'monsters';
export type RuntimeAssetPreloadTier = 'core' | 'zone' | 'on-demand';
export type RuntimePreloadTier = RuntimeAssetPreloadTier;
export type ApprovedRuntimeAssetLicense = 'CC0-1.0';

export interface RuntimeAssetBudgets {
  totalBytes: number;
  perFileBytes: number;
  byPreloadTier: Record<RuntimeAssetPreloadTier, number>;
}

export interface RuntimeAssetPolicy {
  allowedLicenses: readonly ApprovedRuntimeAssetLicense[];
  allowedAssetExtensions: readonly string[];
  budgets: RuntimeAssetBudgets;
}

export interface RuntimeAssetRetrieval {
  date: string;
  method: 'official-download';
  archiveFile: string;
  archiveBytes: number;
  archiveSha256: string;
}

export interface RuntimeAssetLicense {
  spdx: ApprovedRuntimeAssetLicense;
  url: string;
  attributionRequired: boolean;
  noticePath: string;
}

export interface RuntimeAssetPack {
  id: string;
  title: string;
  creator: string;
  version: string;
  sourceUrl: string;
  retrieval: RuntimeAssetRetrieval;
  license: RuntimeAssetLicense;
  selectedAssetGroups: readonly string[];
}

export interface RuntimeAssetGroup {
  id: string;
  packId: string;
  category: RuntimeAssetCategory;
  preload: RuntimeAssetPreloadTier;
  role: string;
  sourceSelection: string;
  pixelArt: boolean;
  files: readonly string[];
}

export interface RuntimeAssetManifest {
  schemaVersion: 1;
  generatedAt: string;
  policy: RuntimeAssetPolicy;
  packs: readonly RuntimeAssetPack[];
  assetGroups: readonly RuntimeAssetGroup[];
}

export interface RuntimeAssetFilter {
  category?: RuntimeAssetCategory;
  preload?: RuntimeAssetPreloadTier;
  packId?: string;
}

const CATEGORIES: readonly RuntimeAssetCategory[] = ['ui', 'maps', 'vfx', 'monsters'];
const PRELOAD_TIERS: readonly RuntimeAssetPreloadTier[] = ['core', 'zone', 'on-demand'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isRuntimeAssetPack(value: unknown): value is RuntimeAssetPack {
  if (!isRecord(value) || !isRecord(value.retrieval) || !isRecord(value.license)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.creator === 'string' &&
    typeof value.version === 'string' &&
    typeof value.sourceUrl === 'string' &&
    typeof value.retrieval.date === 'string' &&
    value.retrieval.method === 'official-download' &&
    typeof value.retrieval.archiveFile === 'string' &&
    isPositiveInteger(value.retrieval.archiveBytes) &&
    typeof value.retrieval.archiveSha256 === 'string' &&
    value.license.spdx === 'CC0-1.0' &&
    typeof value.license.url === 'string' &&
    typeof value.license.attributionRequired === 'boolean' &&
    typeof value.license.noticePath === 'string' &&
    isStringArray(value.selectedAssetGroups)
  );
}

function isRuntimeAssetGroup(value: unknown): value is RuntimeAssetGroup {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === 'string' &&
    typeof value.packId === 'string' &&
    CATEGORIES.includes(value.category as RuntimeAssetCategory) &&
    PRELOAD_TIERS.includes(value.preload as RuntimeAssetPreloadTier) &&
    typeof value.role === 'string' &&
    typeof value.sourceSelection === 'string' &&
    typeof value.pixelArt === 'boolean' &&
    isStringArray(value.files) &&
    value.files.length > 0
  );
}

export function isRuntimeAssetManifest(value: unknown): value is RuntimeAssetManifest {
  if (!isRecord(value) || !isRecord(value.policy) || !isRecord(value.policy.budgets)) {
    return false;
  }

  const budgets = value.policy.budgets;
  if (!isRecord(budgets.byPreloadTier)) return false;

  return (
    value.schemaVersion === 1 &&
    typeof value.generatedAt === 'string' &&
    isStringArray(value.policy.allowedLicenses) &&
    value.policy.allowedLicenses.every((license) => license === 'CC0-1.0') &&
    isStringArray(value.policy.allowedAssetExtensions) &&
    isPositiveInteger(budgets.totalBytes) &&
    isPositiveInteger(budgets.perFileBytes) &&
    PRELOAD_TIERS.every((tier) => isPositiveInteger(budgets.byPreloadTier[tier])) &&
    Array.isArray(value.packs) &&
    value.packs.length > 0 &&
    value.packs.every(isRuntimeAssetPack) &&
    Array.isArray(value.assetGroups) &&
    value.assetGroups.length > 0 &&
    value.assetGroups.every(isRuntimeAssetGroup)
  );
}

export async function loadRuntimeAssetManifest(
  url: string = RUNTIME_ASSET_MANIFEST_URL,
): Promise<RuntimeAssetManifest> {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Unable to load runtime asset manifest (${response.status} ${response.statusText})`);
  }

  const manifest: unknown = await response.json();
  if (!isRuntimeAssetManifest(manifest)) {
    throw new Error('Runtime asset manifest does not match schema version 1');
  }

  return manifest;
}

export function getRuntimeAssetFiles(
  manifest: RuntimeAssetManifest,
  filter: RuntimeAssetFilter = {},
): string[] {
  const files = manifest.assetGroups
    .filter((group) => !filter.category || group.category === filter.category)
    .filter((group) => !filter.preload || group.preload === filter.preload)
    .filter((group) => !filter.packId || group.packId === filter.packId)
    .flatMap((group) => group.files);

  return [...new Set(files)];
}
