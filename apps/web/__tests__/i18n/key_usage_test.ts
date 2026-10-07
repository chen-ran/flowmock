// Ported from Floway apps/web/__tests__/i18n/key_usage_test.ts (MIT). See NOTICE.md.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SNIPPET_IDS } from '../../src/components/keys/client-snippets.tsx';
import { ORIGINS } from '../../src/components/requests/trace-view.tsx';
import { FAULT_TYPES } from '../../src/components/scenarios/form/model.ts';
import { END_MODES } from '../../src/components/scenarios/plan-timeline.tsx';
import en from '../../src/i18n/locales/en.ts';
import { STREAM_STATUSES } from '../../src/lib/use-server-events.ts';
import { isPlural, leafEntries, pluralBase } from '@flowmock/ui/i18n';

const SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');
const LOCALES_DIR = join(SOURCE_ROOT, 'i18n', 'locales');

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return path === LOCALES_DIR ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });

// A key is recognised by its own shape rather than by its call site: a quoted
// string whose first segment is one of the top-level namespaces is a
// translation key wherever it appears, in a t() call, a const or a table. A
// template key resolves from a value this test cannot know; where that value
// ranges over a list the app exports, the list is checked below.
const NAMESPACES = Object.keys(en.translation);
const LITERAL_KEY = new RegExp(`['"\`]((?:${NAMESPACES.join('|')})\\.[a-zA-Z][a-zA-Z0-9_.]*)['"\`]`, 'g');

// Any string literal spelling a key counts as a use, and a template key
// contributes its literal prefix. The net is loose on purpose: a key it wrongly
// clears stays in the file, where a key it wrongly accused would fail a build
// over a string in use.
const ANY_STRING = /['"`]([a-zA-Z][a-zA-Z0-9_.]*)['"`]/g;
const TEMPLATE_KEY_PREFIX = new RegExp(`\`((?:${NAMESPACES.join('|')})\\.(?:[a-zA-Z0-9_.]*\\.)?)\\$\\{`, 'g');

// Both scans read code only: a key quoted in a comment is prose.
const STRING_OR_COMMENT = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
const withoutComments = (source: string) =>
  source.replace(STRING_OR_COMMENT, token => (token.startsWith('//') || token.startsWith('/*') ? ' ' : token));

// Only a key-shaped literal can clear a longer key by prefix.
const KEY_STEM = new RegExp(`^(?:${NAMESPACES.join('|')})\\.`);

describe('translation key usage', () => {
  const defined = new Set(leafEntries(en.translation).keys());
  const pluralBases = new Set([...defined].filter(isPlural).map(pluralBase));
  const resolves = (key: string) => defined.has(key) || pluralBases.has(key);

  it('has a string behind every literal key the app asks for', () => {
    const unresolved: string[] = [];
    for (const file of sourceFiles(SOURCE_ROOT)) {
      const source = withoutComments(readFileSync(file, 'utf8'));
      for (const [, key] of source.matchAll(LITERAL_KEY)) {
        if (resolves(key!) || [...defined].some(leaf => leaf.startsWith(`${key}.`))) continue;
        unresolved.push(`${key} (${file.slice(SOURCE_ROOT.length + 1)})`);
      }
    }
    // An unresolved key renders as the key itself, which reads as a broken
    // label rather than as an error, so nothing else catches this.
    expect(unresolved).toEqual([]);
  });

  it('has a consumer for every string it defines', () => {
    const used = new Set<string>();
    const templatePrefixes = new Set<string>();
    for (const file of sourceFiles(SOURCE_ROOT)) {
      const source = withoutComments(readFileSync(file, 'utf8'));
      for (const [, key] of source.matchAll(ANY_STRING)) used.add(key!);
      for (const [, prefix] of source.matchAll(TEMPLATE_KEY_PREFIX)) templatePrefixes.add(prefix!);
    }
    const orphaned = [...defined].filter(key => {
      if (used.has(key) || used.has(pluralBase(key))) return false;
      if ([...templatePrefixes].some(prefix => key.startsWith(prefix))) return false;
      return ![...used].some(literal => KEY_STEM.test(literal) && literal.length < key.length && key.startsWith(literal));
    });
    // A string nothing asks for survives every rename and deletion of the
    // surface it belonged to, and both locales keep translating it.
    expect(orphaned).toEqual([]);
  });

  it('scans the source tree it claims to', () => {
    const files = sourceFiles(SOURCE_ROOT);
    expect(files.length).toBeGreaterThan(50);
    expect(files.some(file => file.startsWith(LOCALES_DIR))).toBe(false);
  });

  it.each([
    ['scenarios.form.faults.types', FAULT_TYPES],
    ['scenarios.preview.endModes', END_MODES],
    ['requests.origins', ORIGINS],
    ['monitor.status', STREAM_STATUSES],
    ['keys.snippets.clients', SNIPPET_IDS],
  ])('covers every member of the list behind %s.*', (prefix, members) => {
    expect([...members].filter(member => !resolves(`${prefix}.${member}`))).toEqual([]);
  });
});
