/** Small deterministic RNG used only for run generation and authored offers. */

const NON_ZERO_FALLBACK = 0x6d2b79f5;

export function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function normalizeSeed(seed: number | string): number {
  const normalized = typeof seed === 'string' ? stableHash(seed) : (Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0);
  return normalized || NON_ZERO_FALLBACK;
}

export function deriveSeed(seed: number, namespace: string): number {
  return normalizeSeed(`${normalizeSeed(seed)}:${namespace}`);
}

export class SeededRng {
  private state: number;

  constructor(seed: number | string) {
    this.state = normalizeSeed(seed);
  }

  snapshot(): number {
    return this.state >>> 0;
  }

  nextUint32(): number {
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0 || NON_ZERO_FALLBACK;
    return this.state;
  }

  nextFloat(): number {
    return this.nextUint32() / 0x1_0000_0000;
  }

  int(minInclusive: number, maxInclusive: number): number {
    const min = Math.ceil(minInclusive);
    const max = Math.floor(maxInclusive);
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max < min) {
      throw new Error(`Invalid deterministic integer range: ${minInclusive}..${maxInclusive}`);
    }
    const span = max - min + 1;
    if (span === 1) return min;
    if (span > 0x1_0000_0000) throw new Error('Deterministic integer range exceeds uint32 capacity');

    const limit = Math.floor(0x1_0000_0000 / span) * span;
    let value = this.nextUint32();
    while (value >= limit) value = this.nextUint32();
    return min + (value % span);
  }

  chancePermille(chancePermille: number): boolean {
    if (!Number.isInteger(chancePermille) || chancePermille < 0 || chancePermille > 1_000) {
      throw new Error(`chancePermille must be an integer from 0 to 1000, received ${chancePermille}`);
    }
    return chancePermille === 1_000 || (chancePermille > 0 && this.int(1, 1_000) <= chancePermille);
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) throw new Error('Cannot pick from an empty deterministic collection');
    return values[this.int(0, values.length - 1)];
  }

  shuffle<T>(values: readonly T[]): T[] {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index--) {
      const swapIndex = this.int(0, index);
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }
}
