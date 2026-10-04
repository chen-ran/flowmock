import { describe, expect, it } from 'vitest';

import { decodeSseText, SseDecoder } from '../../src/common/sse-decoder.ts';
import { ALL_FIXTURES, anthropicText, fixtureBodyText, geminiSseText } from '@flowmock/test-fixtures';

const decodeInPieces = (pieces: readonly string[]) => {
  const decoder = new SseDecoder();
  const blocks = pieces.flatMap(piece => decoder.feed(piece));
  const flushed = decoder.flush();
  return { blocks: [...blocks, ...flushed.blocks], trailing: flushed.trailing };
};

describe('SseDecoder', () => {
  it('decodes named events and keeps each block\'s exact source text', () => {
    const text = 'event: message_start\ndata: {"a":1}\n\nevent: ping\ndata: {"type": "ping"}\n\n';
    const { blocks, trailing } = decodeSseText(text);
    expect(blocks).toEqual([
      { type: 'sse', event: 'message_start', data: '{"a":1}', raw: 'event: message_start\ndata: {"a":1}\n\n' },
      { type: 'sse', event: 'ping', data: '{"type": "ping"}', raw: 'event: ping\ndata: {"type": "ping"}\n\n' },
    ]);
    expect(trailing).toBe('');
  });

  it('joins multi-line data, strips one leading space, and accepts every line terminator', () => {
    const { blocks } = decodeSseText('data:first\r\ndata:  second\rdata: third\n\r\n');
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: 'sse', data: 'first\n second\nthird' });
  });

  it('dispatches comment-only blocks as comments and ignores comments inside events', () => {
    const { blocks } = decodeSseText(': keep-alive\n\n: note\ndata: x\n\n');
    expect(blocks).toEqual([
      { type: 'sse-comment', comment: 'keep-alive', raw: ': keep-alive\n\n' },
      { type: 'sse', data: 'x', raw: ': note\ndata: x\n\n' },
    ]);
  });

  it('folds blank lines and data-less blocks into the next block\'s raw text', () => {
    const { blocks } = decodeSseText('\n\nevent: orphan\n\ndata: y\n\n');
    expect(blocks).toEqual([{ type: 'sse', data: 'y', raw: '\n\nevent: orphan\n\ndata: y\n\n' }]);
  });

  it('waits for the byte after a trailing CR before ending the line', () => {
    const decoder = new SseDecoder();
    expect(decoder.feed('data: a\r')).toEqual([]);
    expect(decoder.feed('\n\r\n')).toEqual([{ type: 'sse', data: 'a', raw: 'data: a\r\n\r\n' }]);
  });

  it('dispatches a final event the peer closed without a blank line', () => {
    const { blocks, trailing } = decodeInPieces(['data: one\n\n', 'data: two']);
    expect(blocks.map(block => block.type === 'sse' && block.data)).toEqual(['one', 'two']);
    expect(trailing).toBe('');
  });

  it('reports source text that formed no block as trailing', () => {
    expect(decodeSseText('data: one\n\nevent: x\n\n\n').trailing).toBe('event: x\n\n\n');
  });

  it.each(ALL_FIXTURES.filter(fixture => fixture.response.headers['content-type']?.startsWith('text/event-stream')).map(fixture => [fixture.id, fixture] as const))(
    'round-trips %s: raw spans concatenate back to the body at every split point',
    (_id, fixture) => {
      const body = fixtureBodyText(fixture);
      const whole = decodeSseText(body);
      expect(whole.blocks.map(block => block.raw).join('') + whole.trailing).toBe(body);
      for (let at = 0; at <= body.length; at += 7) {
        const split = decodeInPieces([body.slice(0, at), body.slice(at)]);
        expect(split.blocks).toEqual(whole.blocks);
      }
    },
  );

  it('preserves CRLF spelling in Gemini blocks', () => {
    const { blocks } = decodeSseText(fixtureBodyText(geminiSseText));
    expect(blocks[0].raw.endsWith('\r\n\r\n')).toBe(true);
  });

  it('decodes the Anthropic fixture into its event sequence', () => {
    const { blocks } = decodeSseText(fixtureBodyText(anthropicText));
    expect(blocks.map(block => block.type === 'sse' ? block.event : block.type)).toEqual([
      'message_start', 'content_block_start', 'ping',
      'content_block_delta', 'content_block_delta', 'content_block_delta', 'content_block_delta', 'content_block_delta',
      'content_block_stop', 'message_delta', 'message_stop',
    ]);
  });
});
