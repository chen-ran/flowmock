import { describe, expect, it } from 'vitest';

import weakNetwork from '../../../../../examples/scenarios/weak-network-429.yaml?raw';
import { problemMarkers, problemsOf } from '../../../src/components/scenarios/markers.ts';

const lineOf = (source: string, text: string) => source.split('\n').findIndex(line => line.includes(text)) + 1;

describe('problem markers', () => {
  it('marks a wrong value where it is written', () => {
    const [marker] = problemMarkers(weakNetwork, problemsOf('invalid', { error: { issues: [{ path: ['network', 'jitterMs'], message: 'Too small' }] } }));
    expect(marker).toEqual({ line: lineOf(weakNetwork, 'jitterMs: 40'), column: 13, endLine: lineOf(weakNetwork, 'jitterMs: 40'), endColumn: 15, message: 'network.jitterMs: Too small' });
  });

  it('marks a value inside a flow mapping', () => {
    const [marker] = problemMarkers(weakNetwork, problemsOf('invalid', { error: { issues: [{ path: ['timing', 'ttftMs', 'p95'], message: 'p95 must be >= p50' }] } }));
    const line = lineOf(weakNetwork, 'ttftMs:');
    const column = weakNetwork.split('\n')[line - 1]!.indexOf('3000') + 1;
    expect(marker).toMatchObject({ line, column, endLine: line, endColumn: column + 4 });
  });

  it('marks a wrong mapping on the key it sits under', () => {
    const [marker] = problemMarkers(weakNetwork, problemsOf('invalid', { error: { issues: [{ path: ['timing', 'ttftMs'], message: 'Invalid input' }] } }));
    const line = lineOf(weakNetwork, 'ttftMs:');
    expect(marker).toMatchObject({ line, column: 3, endColumn: 9 });
  });

  it('marks a missing field on the nearest key that holds it', () => {
    const [marker] = problemMarkers(weakNetwork, problemsOf('invalid', { error: { issues: [{ path: ['network', 'fragmentation', 'gapMs'], message: 'Required' }] } }));
    expect(marker).toMatchObject({ line: lineOf(weakNetwork, 'fragmentation:'), column: 3 });
  });

  it('marks text that is not YAML from the position the parser stopped', () => {
    const source = 'name: x\ntiming: { mode: [\n';
    expect(problemMarkers(source, problemsOf('scenario is not valid YAML', { error: { position: { line: 2, col: 9 } } })))
      .toEqual([{ line: 2, column: 9, endLine: 2, endColumn: 18, message: 'scenario is not valid YAML' }]);
  });

  it('marks where the document starts when the server could not place the problem', () => {
    const line = lineOf(weakNetwork, 'name: weak-network-429');
    expect(problemMarkers(weakNetwork, problemsOf('unknown transform', undefined))).toEqual([{ line, column: 1, endLine: line, endColumn: 'name: weak-network-429'.length + 1, message: 'unknown transform' }]);
  });
});
