import { hashString, stableStringify } from '../hash.ts';
import type { Protocol } from '@flowmock/protocols/common';

export interface Fingerprint {
  // Hash of the whole conversation.
  fingerprint: string;
  // Cumulative hash after each segment: equal entries at position k mean the
  // two conversations agree on their first k + 1 segments.
  prefixHashes: string[];
}

export const fingerprintSegments = (protocol: Protocol, segments: readonly unknown[]): Fingerprint => {
  const prefixHashes: string[] = [];
  let running = hashString(protocol);
  for (const segment of segments) {
    running = hashString(`${running}\u0000${stableStringify(segment)}`);
    prefixHashes.push(running);
  }
  return { fingerprint: running, prefixHashes };
};

// Number of leading segments two conversations share.
export const commonPrefixLength = (left: readonly string[], right: readonly string[]): number => {
  // Cumulative hashes agree on a prefix exactly when they agree at its end,
  // so a binary search finds the boundary.
  let low = 0;
  let high = Math.min(left.length, right.length);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (left[middle - 1] === right[middle - 1]) low = middle;
    else high = middle - 1;
  }
  return low;
};

// A session the client did not name is identified by its header and first
// turn: two runs of the same task land in the same session, two different
// tasks running side by side do not.
export const deriveSessionId = (protocol: Protocol, segments: readonly unknown[]): string =>
  `auto-${hashString(`${protocol}\u0000${stableStringify(segments.slice(0, 2))}`)}`;
