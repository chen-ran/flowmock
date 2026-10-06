import { isMap, isScalar, isSeq, LineCounter, type Node, parseDocument } from 'yaml';

import type { YamlMarker } from '@flowmock/ui/controls/yaml-editor.tsx';

// What the server says is wrong with a scenario it refused: the fields of a
// well-formed document, or the place where the text stopped being YAML.
export interface ScenarioIssue {
  path: Array<string | number>;
  message: string;
}

export interface ScenarioProblems {
  message: string;
  issues: ScenarioIssue[];
  position: { line: number; col: number } | null;
}

const isIssue = (value: unknown): value is ScenarioIssue =>
  typeof value === 'object' && value !== null
  && Array.isArray((value as ScenarioIssue).path) && typeof (value as ScenarioIssue).message === 'string';

// Reads the problems out of a refused save or preview's error body, which
// carries them beside its message when the server could place them.
export const problemsOf = (message: string, raw: unknown): ScenarioProblems => {
  const error = (raw as { error?: { issues?: unknown; position?: unknown } } | undefined)?.error;
  const position = error?.position as { line?: unknown; col?: unknown } | undefined;
  return {
    message,
    issues: Array.isArray(error?.issues) ? error.issues.filter(isIssue) : [],
    position: typeof position?.line === 'number' && typeof position.col === 'number' ? { line: position.line, col: position.col } : null,
  };
};

// The node an issue's path leads to, as far as the document spells it: a
// missing field is marked on the nearest mapping key that holds it, a wrong
// value on the value itself, and a wrong mapping or list on the key it sits
// under, so the mark stays on one line.
const rangeOf = (contents: unknown, path: ReadonlyArray<string | number>): [number, number] | null => {
  let node = contents as Node | null;
  let key: Node | null = null;
  for (const segment of path) {
    if (isMap(node)) {
      const pair = node.items.find(item => isScalar(item.key) && String(item.key.value) === String(segment));
      if (!pair) break;
      key = pair.key as Node;
      node = pair.value as Node | null;
    } else if (isSeq(node) && typeof segment === 'number' && node.items[segment] !== undefined) {
      key = null;
      node = node.items[segment] as Node;
    } else {
      break;
    }
  }
  const target = isScalar(node) || key === null ? node : key;
  return target?.range ? [target.range[0], target.range[1]] : null;
};

// Places the problems in the source as editor markers. A mark that would run
// over several lines stops at the end of its first.
export const problemMarkers = (source: string, problems: ScenarioProblems): YamlMarker[] => {
  const lines = source.split('\n');
  const lineEnd = (line: number) => (lines[line - 1]?.length ?? 0) + 1;
  if (problems.position) {
    const { line, col } = problems.position;
    return [{ line, column: col, endLine: line, endColumn: Math.max(col + 1, lineEnd(line)), message: problems.message }];
  }
  const counter = new LineCounter();
  const document = parseDocument(source, { lineCounter: counter });
  const issues = problems.issues.length > 0 ? problems.issues : [{ path: [], message: problems.message }];
  return issues.map(issue => {
    const range = rangeOf(document.contents, issue.path);
    const start = counter.linePos(range?.[0] ?? 0);
    const end = counter.linePos(range?.[1] ?? 0);
    const sameLine = range !== null && end.line === start.line && end.col > start.col;
    return {
      line: start.line,
      column: range === null ? 1 : start.col,
      endLine: start.line,
      endColumn: sameLine ? end.col : lineEnd(start.line),
      message: issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
    };
  });
};
