import { describe, expect, it } from 'vitest';

import { decodeJsonArrayText, JsonArrayStreamDecoder } from '../../src/common/json-array-decoder.ts';
import { fixtureBodyText, geminiJsonArrayFunctionCall } from '@flowmock/test-fixtures';

describe('JsonArrayStreamDecoder', () => {
  const body = fixtureBodyText(geminiJsonArrayFunctionCall);

  it('dispatches each element with its separator and reports the closing bracket as trailing', () => {
    const { elements, trailing, closed } = decodeJsonArrayText(body);
    expect(elements).toHaveLength(2);
    expect(elements[0].raw.startsWith('[{')).toBe(true);
    expect(elements[1].raw.startsWith('\n,\r\n{')).toBe(true);
    expect(JSON.parse(elements[1].data)).toMatchObject({ candidates: [{ finishReason: 'STOP' }] });
    expect(trailing).toBe('\n]');
    expect(closed).toBe(true);
    expect(elements.map(element => element.raw).join('') + trailing).toBe(body);
  });

  it('produces identical elements at every split point', () => {
    const whole = decodeJsonArrayText(body);
    for (let at = 0; at <= body.length; at++) {
      const decoder = new JsonArrayStreamDecoder();
      const elements = [...decoder.feed(body.slice(0, at)), ...decoder.feed(body.slice(at))];
      expect(elements).toEqual(whole.elements);
    }
  });

  it('is not fooled by brackets and escaped quotes inside strings', () => {
    const text = '[{"text": "a ] } \\" [ {"}, {"b": [1, {"c": "]"}]}]';
    const { elements, closed } = decodeJsonArrayText(text);
    expect(elements.map(element => JSON.parse(element.data))).toEqual([{ text: 'a ] } " [ {' }, { b: [1, { c: ']' }] }]);
    expect(closed).toBe(true);
  });

  it('dispatches scalar elements at their delimiter', () => {
    const { elements } = decodeJsonArrayText('[1, "two", true]');
    expect(elements.map(element => element.data)).toEqual(['1', '"two"', 'true']);
  });

  it('leaves an unfinished element in trailing and reports the array open', () => {
    const { elements, trailing, closed } = decodeJsonArrayText('[{"a": 1}\n,\r\n{"b": ');
    expect(elements).toHaveLength(1);
    expect(trailing).toBe('\n,\r\n{"b": ');
    expect(closed).toBe(false);
  });

  it('rejects a body that is not an array', () => {
    expect(() => decodeJsonArrayText('{"error": {}}')).toThrow(/Expected a JSON array/);
  });
});
