// API shape ported from Floway packages/protocols/src/common/parse-sse.ts
// (MIT); the decoding is FlowMock's own SseDecoder. See NOTICE.md.

import { type DecodedSseBlock, SseDecoder } from './sse-decoder.ts';
import { type SseFrame, sseFrame } from './sse.ts';

interface ParseSSEStreamOptions {
  signal?: AbortSignal;
}

// Yields every block, comments included, as it completes.
export const decodeSSEStream = async function* (body: ReadableStream<Uint8Array>, options: ParseSSEStreamOptions = {}): AsyncGenerator<DecodedSseBlock> {
  const reader = body.getReader();
  const { signal } = options;
  const decoder = new TextDecoder();
  const sse = new SseDecoder();
  let cancelPromise: Promise<void> | undefined;

  const cancelReader = (reason?: unknown): Promise<void> => {
    cancelPromise ??= reader.cancel(reason).catch(() => {});
    return cancelPromise;
  };
  const cancelReaderOnAbort = () => {
    void cancelReader(signal?.reason);
  };

  if (signal?.aborted) {
    await cancelReader(signal.reason);
    return;
  }
  signal?.addEventListener('abort', cancelReaderOnAbort, { once: true });

  try {
    while (true) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (signal?.aborted) return;
      if (done) break;
      yield* sse.feed(decoder.decode(value, { stream: true }));
    }
    const finalChunk = decoder.decode();
    if (finalChunk) yield* sse.feed(finalChunk);
    yield* sse.flush().blocks;
  } finally {
    signal?.removeEventListener('abort', cancelReaderOnAbort);
    await (cancelPromise ?? reader.cancel());
  }
};

// Data-bearing frames only, the shape protocol parsers consume.
export const parseSSEStream = async function* (body: ReadableStream<Uint8Array>, options: ParseSSEStreamOptions = {}): AsyncGenerator<SseFrame> {
  for await (const block of decodeSSEStream(body, options)) {
    if (block.type === 'sse') yield sseFrame(block.data, block.event);
  }
};
