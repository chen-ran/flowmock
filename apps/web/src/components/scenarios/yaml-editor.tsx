import { type ComponentProps, Suspense, useEffect, useState } from 'react';

import { api, callApi } from '../../api/client.ts';
import { useTranslation } from '../../i18n/translation.ts';
import { LazyYamlEditor } from '@flowmock/ui/controls/lazy-editors.ts';
import { ContentLoadingScreen } from '@flowmock/ui/controls/loading-screen.tsx';
import type { YamlMarker } from '@flowmock/ui/controls/yaml-editor.tsx';

type Schema = NonNullable<ComponentProps<typeof LazyYamlEditor>['schema']>;

// The scenario schema is the server's own, so the editor validates against the
// version it will be saved to. It is fetched once per page load; a failed fetch
// is tried again by the next editor, which works without one meanwhile.
let schemaRequest: Promise<Schema | null> | null = null;
const loadSchema = () => {
  schemaRequest ??= callApi(() => api.schema.scenario.$get()).then(result => {
    if (result.error) {
      schemaRequest = null;
      return null;
    }
    return result.data as Schema;
  });
  return schemaRequest;
};

const useScenarioSchema = () => {
  const [schema, setSchema] = useState<Schema | null>(null);
  useEffect(() => {
    let live = true;
    void loadSchema().then(loaded => { if (live) setSchema(loaded); });
    return () => { live = false; };
  }, []);
  return schema;
};

export function ScenarioYamlEditor({ markers, onChange, value }: {
  markers: readonly YamlMarker[];
  onChange: (value: string) => void;
  value: string;
}) {
  const { t } = useTranslation();
  const schema = useScenarioSchema();
  return <Suspense fallback={<ContentLoadingScreen label={t('scenarios.editor.loadingEditor')} />}>
    <LazyYamlEditor label={t('scenarios.editor.yaml')} markers={markers} onChange={onChange} schema={schema ?? undefined} value={value} />
  </Suspense>;
}
