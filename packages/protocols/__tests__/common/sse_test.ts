import { describe, expect, it } from 'vitest';

import { decodeSseText } from '../../src/common/sse-decoder.ts';
import { encodeSseFrame, sseCommentFrame, sseFrame } from '../../src/common/sse.ts';

describe('encodeSseFrame', () => {
  it('writes the event line before the data lines', () => {
    expect(encodeSseFrame(sseFrame('{"a":1}', 'message_start'))).toBe('event: message_start\ndata: {"a":1}\n\n');
  });

  it('splits multi-line data and comments so the decoder reads them back', () => {
    const encoded = encodeSseFrame(sseFrame('a\nb')) + encodeSseFrame(sseCommentFrame('x\ny'));
    expect(decodeSseText(encoded).blocks).toMatchObject([
      { type: 'sse', data: 'a\nb' },
      { type: 'sse-comment', comment: 'x\ny' },
    ]);
  });
});
