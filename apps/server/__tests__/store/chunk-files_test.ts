import { describe, expect, it } from 'vitest';

import { decodeChunks, encodeChunks } from '../../src/store/chunk-files.ts';

describe('chunk files', () => {
  it('round-trips chunk timing and bytes exactly', () => {
    const chunks = [
      { t: 0.125, bytes: new Uint8Array([]) },
      { t: 905.5, bytes: new TextEncoder().encode('data: {"x":"你好"}\n\n') },
      { t: 1_000_000, bytes: new Uint8Array([0, 255, 13, 10]) },
    ];
    expect(decodeChunks(encodeChunks(chunks))).toEqual(chunks);
  });

  it('rejects foreign or truncated files', () => {
    expect(() => decodeChunks(new TextEncoder().encode('nope'))).toThrow(/Not a FlowMock chunk file/);
    const encoded = encodeChunks([{ t: 1, bytes: new Uint8Array([1, 2, 3]) }]);
    expect(() => decodeChunks(encoded.subarray(0, encoded.length - 1))).toThrow(/Truncated/);
  });
});
