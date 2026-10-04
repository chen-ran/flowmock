import type { FixtureChunk } from '@flowmock/test-fixtures';

export const streamFromChunks = (chunks: readonly (string | Uint8Array)[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
      controller.close();
    },
  });
};

export const streamFromFixtureChunks = (chunks: readonly FixtureChunk[]): ReadableStream<Uint8Array> =>
  streamFromChunks(chunks.map(chunk => chunk.text));

export const collectAsync = async <T>(iterable: AsyncIterable<T>): Promise<T[]> => {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
};

// Splits UTF-8 bytes at every position, including inside multi-byte
// characters, to prove a decoder never depends on chunk boundaries.
export const splitBytesAt = (text: string, at: number): Uint8Array[] => {
  const bytes = new TextEncoder().encode(text);
  return [bytes.subarray(0, at), bytes.subarray(at)];
};
