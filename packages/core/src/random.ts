// Seeded randomness. Every random decision the engine makes draws from a
// stream derived from (seed, purpose, session, call index), so a run replays
// identically when the client sends the same `x-flowmock-seed`.

import { hashString } from './hash.ts';

export interface Rng {
  // Uniform in [0, 1).
  next(): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  // Standard normal via Box-Muller.
  normal(): number;
}

// sfc32: small, fast, and well distributed for simulation purposes.
// https://pracrand.sourceforge.net/RNG_engines.txt
const sfc32 = (a: number, b: number, c: number, d: number): (() => number) => () => {
  a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
  let t = (a + b) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  d = (d + 1) | 0;
  t = (t + d) | 0;
  c = (c + t) | 0;
  return (t >>> 0) / 4294967296;
};

export const createRng = (...parts: ReadonlyArray<string | number>): Rng => {
  const key = parts.join('\u0000');
  const words = [hashString(`${key}#a`), hashString(`${key}#b`)].flatMap(hex => [Number.parseInt(hex.slice(0, 8), 16), Number.parseInt(hex.slice(8, 16), 16)]);
  const next = sfc32(words[0], words[1], words[2], words[3]);
  // Discard the first outputs; sfc32 needs a few rounds to mix its state.
  for (let i = 0; i < 12; i++) next();
  let spare: number | null = null;
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: items => {
      if (items.length === 0) throw new RangeError('Cannot pick from an empty list');
      return items[Math.floor(next() * items.length)];
    },
    normal: () => {
      if (spare !== null) {
        const value = spare;
        spare = null;
        return value;
      }
      let u = 0;
      while (u === 0) u = next();
      const v = next();
      const radius = Math.sqrt(-2 * Math.log(u));
      spare = radius * Math.sin(2 * Math.PI * v);
      return radius * Math.cos(2 * Math.PI * v);
    },
  };
};

// A random seed for requests that did not ask for one. The trace records it
// so the run can still be reproduced.
export const freshSeed = (): string => {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
};
