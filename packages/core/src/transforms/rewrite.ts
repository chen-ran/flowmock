import type { DraftFrame, ReplayDraft } from '../plan/types.ts';
import type { ProtocolAdapter } from '../protocols/adapter.ts';
import type { Rng } from '../random.ts';
import type { RewriteOptions } from '../scenario/schema.ts';

const HEX = '0123456789abcdef';
const DIGITS = '0123456789';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// A fresh identifier in the same format: the type prefix (`msg_`,
// `chatcmpl-`, `resp_`, `toolu_`, ...) is kept and every other character is
// replaced by a random one of the same class, so lengths, alphabets and hex
// shapes survive.
export const rewriteId = (id: string, rng: Rng): string => {
  const match = /^([A-Za-z]+[_-])(.+)$/.exec(id);
  const prefix = match ? match[1] : '';
  const rest = match ? match[2] : id;
  const hex = /^[0-9a-f]+$/.test(rest);
  let next = '';
  for (const char of rest) {
    if (hex) next += HEX[rng.int(0, 15)];
    else if (DIGITS.includes(char)) next += DIGITS[rng.int(0, 9)];
    else if (LOWER.includes(char)) next += LOWER[rng.int(0, 25)];
    else if (UPPER.includes(char)) next += UPPER[rng.int(0, 25)];
    else next += char;
  }
  return next === rest ? rewriteId(id, rng) : prefix + next;
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const reparse = (frame: DraftFrame): void => {
  if (frame.data === null || frame.done) return;
  try {
    frame.json = JSON.parse(frame.data) as unknown;
  } catch {
    frame.json = undefined;
  }
};

// Applies a text substitution to a frame's wire text and payload alike.
// Identifiers never contain characters JSON escapes, so the substitution is
// exact on both.
const substitute = (frame: DraftFrame, apply: (text: string) => string): boolean => {
  const raw = apply(frame.raw);
  if (raw === frame.raw) return false;
  frame.raw = raw;
  if (frame.data !== null) frame.data = apply(frame.data);
  reparse(frame);
  if (frame.origin === 'recorded') frame.origin = 'rewritten';
  return true;
};

export interface RewriteContext {
  adapter: ProtocolAdapter;
  rng: Rng;
  requestModel: string | null;
  // Unix seconds.
  nowSeconds: number;
}

export const applyRewrite = (draft: ReplayDraft, options: RewriteOptions, context: RewriteContext): void => {
  if (draft.fidelity === 'raw') {
    draft.provenance.push({ transform: 'rewrite', detail: 'skipped: raw fidelity replays recorded bytes' });
    return;
  }
  const { adapter } = context;
  const notes: string[] = [];

  if (options.ids) {
    const ids = new Set<string>();
    for (const frame of draft.frames) adapter.collectIds(frame.json, ids);
    for (const id of ids) draft.idMap.set(id, rewriteId(id, context.rng));
    if (draft.idMap.size > 0) {
      const pattern = new RegExp([...draft.idMap.keys()].sort((left, right) => right.length - left.length).map(escapeRegExp).join('|'), 'g');
      let touched = 0;
      for (const frame of draft.frames) if (substitute(frame, text => text.replace(pattern, id => draft.idMap.get(id) ?? id))) touched++;
      notes.push(`${draft.idMap.size} ids in ${touched} frames`);
    }
  }

  const recordedModel = draft.source.responseModel;
  const wantsModel = options.model === 'always' || (options.model === 'auto' && context.requestModel !== null && context.requestModel !== draft.source.recordingModel);
  if (wantsModel && context.requestModel !== null && recordedModel !== null && recordedModel !== context.requestModel) {
    const pattern = new RegExp(`("${escapeRegExp(adapter.modelKey)}"\\s*:\\s*)"${escapeRegExp(recordedModel)}"`, 'g');
    const replacement = JSON.stringify(context.requestModel);
    let touched = 0;
    for (const frame of draft.frames) if (substitute(frame, text => text.replace(pattern, (_match, key: string) => key + replacement))) touched++;
    if (touched > 0) notes.push(`model ${recordedModel} -> ${context.requestModel}`);
  }

  if (options.created && adapter.timeKeys.length > 0) {
    const keys = adapter.timeKeys.map(escapeRegExp).join('|');
    const finder = new RegExp(`"(?:${keys})"\\s*:\\s*(\\d{9,11})\\b`, 'g');
    let base: number | null = null;
    for (const frame of draft.frames) {
      for (const match of frame.raw.matchAll(finder)) base = Math.min(base ?? Infinity, Number(match[1]));
    }
    if (base !== null) {
      const shift = context.nowSeconds - base;
      // Only values near the recorded timestamps move; a number that merely
      // sits under the same key inside tool arguments stays put.
      const window = 30 * 86_400;
      const pattern = new RegExp(`("(?:${keys})"\\s*:\\s*)(\\d{9,11})\\b`, 'g');
      for (const frame of draft.frames) {
        substitute(frame, text => text.replace(pattern, (match, key: string, value: string) => (Math.abs(Number(value) - base!) <= window ? key + String(Number(value) + shift) : match)));
      }
      notes.push(`timestamps shifted by ${shift}s`);
    }
  }

  draft.provenance.push({ transform: 'rewrite', detail: notes.length > 0 ? notes.join('; ') : 'nothing to rewrite' });
};
