import { type Document, isCollection, isMap, isPair, isScalar, isSeq, parseDocument, visit, type YAMLMap, type YAMLSeq } from 'yaml';

// The part of a scenario the form edits, read straight off the YAML: a field
// the document leaves out is undefined here too, so the form can show the
// server's default without writing it into the document.
export type SelectionMode = 'match' | 'sequence' | 'sample' | 'match-then-sample';

export type Distribution =
  | number
  | { dist: 'fixed'; value?: number }
  | { dist: 'uniform'; min?: number; max?: number }
  | { dist: 'normal'; mean?: number; sd?: number; p50?: number; p95?: number }
  | { dist: 'lognormal'; p50?: number; p95?: number };

export type TimingForm =
  | { mode: 'recorded'; scale?: number }
  | { mode: 'synthetic'; ttftMs?: Distribution; tps?: Distribution; jitterMs?: number };

export interface NetworkForm {
  latencyMs?: number;
  headersDelayMs?: number;
  jitterMs?: number;
  bandwidthKBps?: number;
  fragmentation?: { maxBytes?: number; minBytes?: number; gapMs?: number };
  stalls?: { probability?: number; durationMs?: [number, number] };
}

export type FaultType = 'http_error' | 'stream_error_event' | 'interrupt' | 'concurrency_limit';

export interface FaultRuleForm {
  when?: { callIndex?: number | number[] | { from?: number; to?: number }; everyN?: number; probability?: number; [key: string]: unknown };
  inject: { type: FaultType; [key: string]: unknown };
}

export interface ScenarioForm {
  name?: string;
  description?: string;
  selection?: { mode?: SelectionMode; cassette?: string; [key: string]: unknown };
  timing?: TimingForm;
  network?: NetworkForm;
  faults?: FaultRuleForm[];
}

const FORM_KEYS = ['name', 'description', 'selection', 'timing', 'network', 'faults'] as const;

export type ParsedScenario = { form: ScenarioForm; error: null } | { form: null; error: string };

// Reads the form's fields out of a source. A source that is not YAML, or is not
// a mapping, has no form until it is fixed in the editor.
export const scenarioToForm = (source: string): ParsedScenario => {
  const document = parseDocument(source);
  if (document.errors.length > 0) return { form: null, error: document.errors[0]!.message };
  const value: unknown = document.toJS();
  if (value === null || value === undefined) return { form: {}, error: null };
  if (typeof value !== 'object' || Array.isArray(value)) return { form: null, error: 'the scenario is not a mapping' };
  const record = value as Record<string, unknown>;
  return { form: Object.fromEntries(FORM_KEYS.filter(key => record[key] !== undefined).map(key => [key, record[key]])) as ScenarioForm, error: null };
};

type Path = Array<string | number>;
type Leaf = string | number | boolean | null;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// A field the form sets to undefined is a field it leaves out.
const defined = (value: Record<string, unknown>) => Object.entries(value).filter(([, item]) => item !== undefined);

// Every leaf of a value, keyed by its path. An empty object or array is a leaf
// of its own, so clearing the last field of a section is still a change.
const leaves = (value: unknown, path: Path = [], into = new Map<string, { path: Path; value: unknown }>()) => {
  if (Array.isArray(value) && value.length > 0) value.forEach((item, index) => leaves(item, [...path, index], into));
  else if (isPlainObject(value) && defined(value).length > 0) for (const [key, item] of defined(value)) leaves(item, [...path, key], into);
  else into.set(JSON.stringify(path), { path, value });
  return into;
};

// A scalar as YAML spells it: plain where that reads back as the same string,
// quoted otherwise.
const scalarText = (value: Leaf): string => {
  if (typeof value !== 'string') return String(value);
  const plain = /^[A-Za-z_][A-Za-z0-9_.\/-]*$/.test(value) && !/^(true|false|null|yes|no|on|off|~)$/i.test(value);
  return plain ? value : JSON.stringify(value);
};

const isLeafValue = (value: unknown): value is Leaf =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value);

// yaml pads every flow collection of a document alike -- `{ a: 1 }` and
// `[ 1, 2 ]`, or neither -- where hand-written YAML, the examples included,
// pads its mappings and not its sequences. So a collection the source wrote in
// flow style is laid out again with the padding it was written with.
// https://eemeli.org/yaml/#tostring-options
const pad = (node: YAMLMap | YAMLSeq, padding: string) => {
  const toString = node.toString.bind(node);
  node.toString = (ctx, onComment, onChompKeep) => toString(ctx && { ...ctx, flowCollectionPadding: padding }, onComment, onChompKeep);
};

// A value set through setIn stays a plain JS value until it is written.
const isPlain = (value: unknown) => isScalar(value) || value === null || typeof value !== 'object';

// What the form adds is written the way the examples are: a mapping or list of
// plain values, or of collections so written, goes on one line, while a
// top-level section and an entry of a list keep a block of their own.
const layOut = (document: Document, source: string) => {
  const added: Array<{ node: YAMLMap | YAMLSeq; path: readonly unknown[] }> = [];
  visit(document, {
    Collection(_, node, path) {
      if (!node.range) added.push({ node, path });
      else if (node.flow) pad(node, source[node.range[0] + 1] === ' ' ? ' ' : '');
    },
  });
  // Children before their parents, so a parent sees what its children became.
  for (const { node, path } of added.reverse()) {
    if (path.filter(isCollection).length <= 1 || isSeq(path.at(-1))) continue;
    const values: unknown[] = node.items.map(item => (isPair(item) ? item.value : item));
    if (values.length === 0 || !values.every(value => isPlain(value) || (isCollection(value) && value.flow))) continue;
    node.flow = true;
    pad(node, isMap(node) ? ' ' : '');
  }
};

const sameJson = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

const resizeFaults = (document: Document, before: readonly FaultRuleForm[], after: readonly FaultRuleForm[] | undefined) => {
  if (after === undefined || after.length === 0) {
    document.delete('faults');
    return;
  }
  if (before.length > 0 && after.length > before.length && sameJson(after.slice(0, before.length), before)) {
    for (const rule of after.slice(before.length)) document.addIn(['faults'], document.createNode(rule));
    return;
  }
  const removed = before.findIndex((_, index) => sameJson([...before.slice(0, index), ...before.slice(index + 1)], after));
  if (after.length === before.length - 1 && removed !== -1) {
    document.deleteIn(['faults', removed]);
    return;
  }
  document.set('faults', document.createNode(after));
};

// Writes the form back into the source. A change to a value the document
// already spells is made in place, byte for byte, so comments, flow style and
// every untouched line survive. A change of shape -- a field added or removed,
// a timing mode switched, a fault added -- goes through the document model,
// which keeps comments and fields the form does not cover but may re-lay the
// lines it touches.
export const applyForm = (source: string, next: ScenarioForm): string => {
  const current = scenarioToForm(source);
  if (current.form === null) throw new Error(`The scenario must parse before the form can change it: ${current.error}`);
  const before = leaves(current.form);
  const after = leaves(next);
  const document = parseDocument(source);

  const splices: Array<{ start: number; end: number; text: string }> = [];
  let reshaped = false;
  for (const [key, { path, value }] of after) {
    const previous = before.get(key);
    if (previous && JSON.stringify(previous.value) === JSON.stringify(value)) continue;
    const node = document.getIn(path, true);
    if (previous && isLeafValue(value) && isScalar(node) && node.range) {
      splices.push({ start: node.range[0], end: node.range[1], text: scalarText(value) });
    } else {
      reshaped = true;
    }
  }
  for (const key of before.keys()) if (!after.has(key)) reshaped = true;

  if (!reshaped) {
    return splices.sort((a, b) => b.start - a.start).reduce((text, splice) => text.slice(0, splice.start) + splice.text + text.slice(splice.end), source);
  }

  // Rules are matched by position, so one removed from the middle would read
  // as every later rule changing. A list that gained rules at its end or lost
  // one is edited as such, leaving the rules it kept as they are written; any
  // other change of length writes the list whole.
  const faultsResized = (current.form.faults?.length ?? 0) !== (next.faults?.length ?? 0);
  if (faultsResized) resizeFaults(document, current.form.faults ?? [], next.faults);
  const untouched = (path: Path) => !(faultsResized && path[0] === 'faults');

  // Removals first: a value that changes kind (a number becoming a
  // distribution) is removed before its new fields are set beneath it. A map
  // or list a removal leaves empty goes with it, up to the section.
  for (const [key, { path }] of before) {
    if (after.has(key) || !untouched(path)) continue;
    document.deleteIn(path);
    for (let parent = path.slice(0, -1); parent.length > 0; parent = parent.slice(0, -1)) {
      const node = document.getIn(parent, true) as { items?: unknown[] } | undefined;
      if (!node?.items || node.items.length > 0) break;
      document.deleteIn(parent);
    }
  }
  for (const [key, { path, value }] of after) {
    const previous = before.get(key);
    if (!untouched(path) || (previous && JSON.stringify(previous.value) === JSON.stringify(value))) continue;
    document.setIn(path, value);
  }
  layOut(document, source);
  return document.toString({ lineWidth: 0 });
};

type CallIndex = NonNullable<NonNullable<FaultRuleForm['when']>['callIndex']>;

// A trigger's call numbers as one line of text: `3`, `1, 4, 7`, or a range
// `2-5`, `5-` or `-5`.
export const callIndexText = (value: CallIndex | undefined): string => {
  if (value === undefined) return '';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.join(', ');
  return `${value.from ?? ''}-${value.to ?? ''}`;
};

const callNumber = (text: string): number | null => (/^\d+$/.test(text) && Number(text) > 0 ? Number(text) : null);

// Undefined for an empty line, null for one that is not call numbers.
export const parseCallIndex = (text: string): CallIndex | undefined | null => {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const range = /^(\d*)\s*-\s*(\d*)$/.exec(trimmed);
  if (range) {
    const [from, to] = [range[1] ? callNumber(range[1]) : undefined, range[2] ? callNumber(range[2]) : undefined];
    if (from === null || to === null || (from === undefined && to === undefined)) return null;
    return { ...(from !== undefined && { from }), ...(to !== undefined && { to }) };
  }
  const numbers = trimmed.split(/\s*,\s*/).map(callNumber);
  if (numbers.some(number => number === null)) return null;
  return numbers.length === 1 ? numbers[0]! : numbers as number[];
};
