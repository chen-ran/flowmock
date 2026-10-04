// Ported from Floway packages/protocols/src/common/sse.ts (MIT). See NOTICE.md.

export interface SseFrame {
  type: 'sse';
  event?: string;
  data: string;
}

export interface SseCommentFrame {
  type: 'sse-comment';
  comment: string;
}

export interface EventFrame<TEvent> {
  type: 'event';
  event: TEvent;
}

export interface DoneFrame {
  type: 'done';
}

export type SseWritableFrame = SseFrame | SseCommentFrame;

export type ProtocolFrame<TEvent> = EventFrame<TEvent> | DoneFrame;

export const sseFrame = (data: string, event?: string): SseFrame => ({
  type: 'sse',
  event,
  data,
});

export const sseCommentFrame = (comment: string): SseCommentFrame => ({
  type: 'sse-comment',
  comment,
});

export const eventFrame = <TEvent>(event: TEvent): EventFrame<TEvent> => ({
  type: 'event',
  event,
});

export const doneFrame = (): DoneFrame => ({ type: 'done' });

// Serializes one frame in the canonical `field: value` spelling. Multi-line
// data is split across `data:` lines as the EventSource grammar requires.
// https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
export const encodeSseFrame = (frame: SseWritableFrame): string => {
  if (frame.type === 'sse-comment') {
    return `${frame.comment.split(/\r\n|\r|\n/).map(line => `: ${line}`).join('\n')}\n\n`;
  }
  const eventLine = frame.event === undefined ? '' : `event: ${frame.event}\n`;
  const dataLines = frame.data.split(/\r\n|\r|\n/).map(line => `data: ${line}\n`).join('');
  return `${eventLine}${dataLines}\n`;
};
