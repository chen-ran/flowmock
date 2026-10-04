// Non-cryptographic 64-bit content hashing for fingerprints and RNG seeding.
// Two independently seeded 32-bit lanes (MurmurHash3-style mixing) keep the
// collision rate negligible for corpus-sized key spaces while staying
// synchronous and runtime-independent.

const mixLane = (input: string, seed: number): number => {
  let h = seed >>> 0;
  for (let index = 0; index < input.length; index++) {
    let k = input.charCodeAt(index);
    k = Math.imul(k, 0xcc9e2d51);
    k = (k << 15) | (k >>> 17);
    k = Math.imul(k, 0x1b873593);
    h ^= k;
    h = (h << 13) | (h >>> 19);
    h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  }
  h ^= input.length;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};

// 16 lowercase hex characters.
export const hashString = (input: string): string =>
  mixLane(input, 0x9747b28c).toString(16).padStart(8, '0') + mixLane(input, 0x2f1c5a3d).toString(16).padStart(8, '0');

// JSON with object keys sorted, so semantically equal values hash equally.
export const stableStringify = (value: unknown): string => {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, v]) => `${JSON.stringify(key)}:${stableStringify(v)}`).join(',')}}`;
};

export const hashValue = (value: unknown): string => hashString(stableStringify(value));
