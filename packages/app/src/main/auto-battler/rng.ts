// Seeded PRNG (Mulberry32). Deterministic, small state (32-bit uint).

export type RngState = number;

export function createSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

export function nextRng(state: RngState): { value: number; state: RngState } {
  let t = (state + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: (state + 0x6d2b79f5) >>> 0 };
}

export class Rng {
  private state: RngState;

  constructor(seed: RngState) {
    this.state = seed >>> 0;
  }

  getState(): RngState {
    return this.state;
  }

  setState(state: RngState): void {
    this.state = state >>> 0;
  }

  next(): number {
    const r = nextRng(this.state);
    this.state = r.state;
    return r.value;
  }

  nextInt(min: number, maxExclusive: number): number {
    return Math.floor(this.next() * (maxExclusive - min)) + min;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.nextInt(0, arr.length)];
  }

  // Weighted pick by odds array — odds must sum to ~1.
  weightedIndex(weights: readonly number[]): number {
    const total = weights.reduce((a, b) => a + b, 0);
    const target = this.next() * total;
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i];
      if (target <= acc) return i;
    }
    return weights.length - 1;
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }
}
