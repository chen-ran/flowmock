// Adapted from Floway apps/web/src/components/upstream-editor/models-yaml-editor.tsx (MIT). See NOTICE.md.
import * as monaco from 'monaco-editor';
import { configureMonacoYaml } from 'monaco-yaml';
import type { MonacoYamlOptions, SchemasSettings } from 'monaco-yaml';
import { useEffect, useRef } from 'react';

import { registerMonacoWorker } from './monaco-workers.ts';
import YamlWorker from './yaml.worker.ts?worker';
import { monospaceStack } from '../font-stacks.ts';
import { DARK_SCHEME_QUERY, useMediaQuery } from '../lib/use-media-query.ts';

registerMonacoWorker('yaml', () => new YamlWorker());

const yamlOptions = {
  completion: true,
  enableSchemaRequest: false,
  format: { enable: true, printWidth: 120 },
  hover: true,
  validate: true,
  yamlVersion: '1.2',
} as const satisfies MonacoYamlOptions;

const monacoYaml = configureMonacoYaml(monaco, yamlOptions);

// The language service holds one schema table for every model, and update
// replaces it whole, so each mounted editor's schema is kept here and the full
// table is published whenever one arrives or leaves.
const schemas = new Map<string, SchemasSettings>();
const publishSchemas = () => monacoYaml.update({ ...yamlOptions, schemas: [...schemas.values()] });

// Monaco keys its models by URI in one process-wide registry, so each mount
// takes a name of its own and two editors can never contend for one buffer.
let modelSerial = 0;

// Monaco's built-in themes, picked off the one query the rest of the app's
// scheme follows.
const monacoTheme = (dark: boolean) => dark ? 'vs-dark' : 'vs';

// A problem found outside the editor -- by the server, say -- underlined where
// it lies. Lines and columns are 1-based; the end column is exclusive.
export interface YamlMarker {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
}

// Kept apart from the language service's own markers, so publishing these
// never clears the schema's diagnostics or the other way round.
const MARKER_OWNER = 'flowmock';

export default function YamlEditor({ label, markers, onChange, schema, value }: {
  label: string;
  markers?: readonly YamlMarker[];
  onChange: (value: string) => void;
  /** Validates, completes and documents the document while it is edited. */
  schema?: SchemasSettings['schema'];
  value: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const initialRef = useRef({ label, schema, value });
  const onChangeRef = useRef(onChange);
  const dark = useMediaQuery(DARK_SCHEME_QUERY);
  const initialDarkRef = useRef(dark);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const serial = modelSerial++;
    const uri = monaco.Uri.parse(`file:///flowmock/yaml-${serial}.yaml`);
    const model = monaco.editor.createModel(initialRef.current.value, 'yaml', uri);
    // The same monospace tokens the body viewer reads.
    // https://microsoft.github.io/monaco-editor/typedoc/interfaces/editor.IStandaloneEditorConstructionOptions.html
    const style = getComputedStyle(container);
    const padding = Number.parseFloat(style.getPropertyValue('--spacingVerticalS'));
    const editor = monaco.editor.create(container, {
      ariaLabel: initialRef.current.label,
      automaticLayout: true,
      fontFamily: monospaceStack,
      fontSize: Number.parseFloat(style.getPropertyValue('--flowmock-font-size-mono')),
      formatOnPaste: true,
      formatOnType: true,
      minimap: { enabled: false },
      model,
      padding: { top: padding, bottom: padding },
      scrollBeyondLastLine: false,
      tabSize: 2,
      theme: monacoTheme(initialDarkRef.current),
    });
    editorRef.current = editor;
    const subscription = model.onDidChangeContent(() => onChangeRef.current(model.getValue()));
    return () => {
      subscription.dispose();
      editor.dispose();
      model.dispose();
      editorRef.current = null;
      if (schemas.delete(uri.toString())) void publishSchemas();
    };
  }, []);

  useEffect(() => {
    const uri = editorRef.current?.getModel()?.uri.toString();
    if (uri === undefined) return;
    if (schema === undefined) {
      if (schemas.delete(uri)) void publishSchemas();
      return;
    }
    // The schema's own id names a document of its own: the language service
    // reads a fragment as a pointer into the schema and fails to resolve it.
    schemas.set(uri, { fileMatch: [uri], schema, uri: uri.replace(/\.yaml$/, '.schema.json') });
    void publishSchemas();
  }, [schema]);

  useEffect(() => {
    editorRef.current?.updateOptions({ ariaLabel: label });
  }, [label]);

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(model, MARKER_OWNER, (markers ?? []).map(marker => ({
      startLineNumber: marker.line,
      startColumn: marker.column,
      endLineNumber: marker.endLine,
      endColumn: marker.endColumn,
      message: marker.message,
      severity: monaco.MarkerSeverity.Error,
    })));
  }, [markers]);

  useEffect(() => {
    editorRef.current?.updateOptions({ theme: monacoTheme(dark) });
  }, [dark]);

  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (model && model.getValue() !== value) model.setValue(value);
  }, [value]);

  return <div className="h-full min-h-0 min-w-0 w-full" ref={containerRef} />;
}
