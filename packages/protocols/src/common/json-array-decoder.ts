// Incremental decoder for a JSON array streamed one element at a time, the
// shape Gemini's `streamGenerateContent` returns when `alt=sse` is absent:
//
//   [{
//     "candidates": [...]
//   }
//   ,
//   {
//     ...
//   }
//   ]
//
// Each element is dispatched as soon as its closing bracket arrives, together
// with the exact source text since the previous element, so replay can
// re-emit an unmodified element byte for byte.
// https://ai.google.dev/api/generate-content#method:-models.streamgeneratecontent

export interface DecodedJsonElement {
  type: 'json-element';
  // The element's own JSON text.
  data: string;
  // Source text from the end of the previous element through the end of this
  // one: the opening `[` or the `,` separator plus surrounding whitespace.
  raw: string;
}

export interface JsonArrayDecoderFlush {
  elements: DecodedJsonElement[];
  // Source text after the last element: the closing `]`, whitespace, or an
  // element the peer never finished.
  trailing: string;
  // Whether the closing `]` arrived.
  closed: boolean;
}

type Phase = 'before-array' | 'between' | 'in-element' | 'after-array';

export class JsonArrayStreamDecoder {
  private buffer = '';
  private scan = 0;
  private phase: Phase = 'before-array';
  private elementStart = -1;
  private depth = 0;
  private inString = false;
  private escaped = false;
  private closed = false;

  feed(text: string): DecodedJsonElement[] {
    this.buffer += text;
    const elements: DecodedJsonElement[] = [];
    while (this.scan < this.buffer.length) {
      const char = this.buffer[this.scan];
      const index = this.scan;
      this.scan++;
      switch (this.phase) {
      case 'before-array':
        if (char === '[') this.phase = 'between';
        else if (!isJsonWhitespace(char)) throw new Error(`Expected a JSON array, found ${JSON.stringify(char)} at offset ${index}.`);
        break;
      case 'between':
        if (char === ']') {
          this.phase = 'after-array';
          this.closed = true;
        } else if (char !== ',' && !isJsonWhitespace(char)) {
          this.phase = 'in-element';
          this.elementStart = index;
          this.depth = 0;
          this.inString = false;
          this.escaped = false;
          const done = this.consumeElementChar(char);
          if (done) elements.push(this.takeElement(index + 1));
        }
        break;
      case 'in-element': {
        if (!this.inString && this.depth === 0 && (char === ',' || char === ']' || isJsonWhitespace(char))) {
          // End of a scalar element; the delimiter belongs to what follows
          // and is rescanned from the front of the remaining buffer.
          elements.push(this.takeElement(index));
          break;
        }
        const done = this.consumeElementChar(char);
        if (done) elements.push(this.takeElement(index + 1));
        break;
      }
      case 'after-array':
        break;
      }
    }
    return elements;
  }

  flush(): JsonArrayDecoderFlush {
    const trailing = this.buffer;
    const result = { elements: [], trailing, closed: this.closed };
    this.buffer = '';
    this.scan = 0;
    this.phase = 'before-array';
    this.closed = false;
    return result;
  }

  // Returns true when this character closes a container element.
  private consumeElementChar(char: string): boolean {
    if (this.inString) {
      if (this.escaped) this.escaped = false;
      else if (char === '\\') this.escaped = true;
      else if (char === '"') {
        this.inString = false;
        return this.depth === 0;
      }
      return false;
    }
    if (char === '"') {
      this.inString = true;
      return false;
    }
    if (char === '{' || char === '[') {
      this.depth++;
      return false;
    }
    if (char === '}' || char === ']') {
      this.depth--;
      return this.depth === 0;
    }
    return false;
  }

  private takeElement(end: number): DecodedJsonElement {
    const element: DecodedJsonElement = {
      type: 'json-element',
      data: this.buffer.slice(this.elementStart, end),
      raw: this.buffer.slice(0, end),
    };
    this.buffer = this.buffer.slice(end);
    this.scan = 0;
    this.phase = 'between';
    this.elementStart = -1;
    return element;
  }
}

const isJsonWhitespace = (char: string): boolean => char === ' ' || char === '\n' || char === '\r' || char === '\t';

export const decodeJsonArrayText = (text: string): JsonArrayDecoderFlush => {
  const decoder = new JsonArrayStreamDecoder();
  const elements = decoder.feed(text);
  const flushed = decoder.flush();
  return { elements, trailing: flushed.trailing, closed: flushed.closed };
};
