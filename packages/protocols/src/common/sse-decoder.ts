// Incremental EventSource decoder that keeps the exact source text of every
// block it dispatches. Replay re-emits an unmodified frame from that text, so
// a recording keeps its upstream spelling (`data:` with or without the space,
// CRLF line ends, interleaved comments) down to the byte.
//
// Grammar: https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation

export interface DecodedSseEvent {
  type: 'sse';
  event?: string;
  id?: string;
  data: string;
  // Source text from the end of the previous dispatched block through this
  // block's terminating blank line. Blank lines and field-only blocks that
  // dispatch nothing fold into the next block's raw text.
  raw: string;
}

export interface DecodedSseComment {
  type: 'sse-comment';
  comment: string;
  raw: string;
}

export type DecodedSseBlock = DecodedSseEvent | DecodedSseComment;

export interface SseDecoderFlush {
  blocks: DecodedSseBlock[];
  // Source text after the last dispatched block that formed no block of its
  // own, e.g. trailing blank lines or a field line with no data.
  trailing: string;
}

interface PendingFields {
  event?: string;
  id?: string;
  data: string[] | null;
  comments: string[];
}

const emptyFields = (): PendingFields => ({ data: null, comments: [] });

export class SseDecoder {
  private buffer = '';
  private scan = 0;
  private fields: PendingFields = emptyFields();

  feed(text: string): DecodedSseBlock[] {
    this.buffer += text;
    return this.drain(false);
  }

  // Ends the stream. A final data line is consumable even when the peer
  // closes without the terminating blank line, matching what EventSource
  // clients built on eventsource-parser observe.
  flush(): SseDecoderFlush {
    const blocks = this.drain(true);
    if (this.scan < this.buffer.length) {
      this.applyLine(this.buffer.slice(this.scan));
      this.scan = this.buffer.length;
    }
    const finalBlock = this.dispatch(this.buffer);
    if (finalBlock) {
      blocks.push(finalBlock);
      this.buffer = '';
    }
    const trailing = this.buffer;
    this.buffer = '';
    this.scan = 0;
    this.fields = emptyFields();
    return { blocks, trailing };
  }

  private drain(eof: boolean): DecodedSseBlock[] {
    const blocks: DecodedSseBlock[] = [];
    while (true) {
      const lineEnd = this.nextLineEnd(eof);
      if (lineEnd === null) break;
      const line = this.buffer.slice(this.scan, lineEnd.contentEnd);
      this.scan = lineEnd.next;
      if (line === '') {
        const block = this.dispatch(this.buffer.slice(0, this.scan));
        if (block) {
          blocks.push(block);
          this.buffer = this.buffer.slice(this.scan);
          this.scan = 0;
        }
        continue;
      }
      this.applyLine(line);
    }
    return blocks;
  }

  private nextLineEnd(eof: boolean): { contentEnd: number; next: number } | null {
    for (let index = this.scan; index < this.buffer.length; index++) {
      const char = this.buffer[index];
      if (char === '\n') return { contentEnd: index, next: index + 1 };
      if (char === '\r') {
        // A trailing CR may be the first half of a CRLF split across chunks.
        if (index + 1 === this.buffer.length) {
          return eof ? { contentEnd: index, next: index + 1 } : null;
        }
        return { contentEnd: index, next: this.buffer[index + 1] === '\n' ? index + 2 : index + 1 };
      }
    }
    return null;
  }

  private applyLine(line: string): void {
    if (line.startsWith(':')) {
      this.fields.comments.push(stripOneLeadingSpace(line.slice(1)));
      return;
    }
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : stripOneLeadingSpace(line.slice(colon + 1));
    switch (field) {
    case 'event':
      this.fields.event = value;
      return;
    case 'data':
      (this.fields.data ??= []).push(value);
      return;
    case 'id':
      if (!value.includes('\0')) this.fields.id = value;
      return;
    default:
      // `retry` and unknown fields carry no frame content; their text stays
      // in the block's raw span.
      return;
    }
  }

  private dispatch(raw: string): DecodedSseBlock | null {
    const fields = this.fields;
    if (fields.data !== null) {
      this.fields = emptyFields();
      return {
        type: 'sse',
        ...(fields.event !== undefined && fields.event !== '' ? { event: fields.event } : {}),
        ...(fields.id !== undefined ? { id: fields.id } : {}),
        data: fields.data.join('\n'),
        raw,
      };
    }
    if (fields.comments.length > 0) {
      this.fields = emptyFields();
      return { type: 'sse-comment', comment: fields.comments.join('\n'), raw };
    }
    // A block with neither data nor comments dispatches nothing; its event
    // or id fields reset with it, as the grammar specifies.
    this.fields = emptyFields();
    return null;
  }
}

const stripOneLeadingSpace = (value: string): string => (value.startsWith(' ') ? value.slice(1) : value);

// Convenience for already-complete text, e.g. a recorded body.
export const decodeSseText = (text: string): SseDecoderFlush => {
  const decoder = new SseDecoder();
  const blocks = decoder.feed(text);
  const flushed = decoder.flush();
  return { blocks: [...blocks, ...flushed.blocks], trailing: flushed.trailing };
};
