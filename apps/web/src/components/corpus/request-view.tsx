import { Suspense, useEffect, useState } from 'react';

import { authFetch } from '../../api/client.ts';
import { useTranslation } from '../../i18n/translation.ts';
import { errorMessage } from '../../lib/error-message.ts';
import { EmptyStateLine } from '@flowmock/ui/controls/empty-state.tsx';
import { PANEL_STACK_CLASS } from '@flowmock/ui/controls/layout.ts';
import { LazyBodyEditor } from '@flowmock/ui/controls/lazy-editors.ts';
import { ContentLoadingScreen } from '@flowmock/ui/controls/loading-screen.tsx';
import { OutcomeMessageBar } from '@flowmock/ui/controls/outcome-message-bar.tsx';
import { Panel } from '@flowmock/ui/controls/panel.tsx';
import { SectionHeader } from '@flowmock/ui/controls/section-header.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Table, TableBody, TableCell, TableRow } = fluentComponents;

export function HeadersTable({ headers, label }: { headers: ReadonlyArray<readonly [string, string]>; label: string }) {
  const { t } = useTranslation();
  if (headers.length === 0) return <EmptyStateLine>{t('corpus.detail.noHeaders')}</EmptyStateLine>;
  return <Table aria-label={label} size="small">
    <TableBody>
      {headers.map(([name, value], index) => <TableRow key={`${name}-${index}`}>
        <TableCell className="w-[220px] font-mono">{name}</TableCell>
        <TableCell className="font-mono break-all">{value}</TableCell>
      </TableRow>)}
    </TableBody>
  </Table>;
}

const EDITOR_CLASS = 'h-[320px]';

// The request as the client sent it, credentials already redacted by the
// recorder.
export function RequestView({ request }: { request: { method: string; path: string; headers: ReadonlyArray<readonly [string, string]>; body: unknown } }) {
  const { t } = useTranslation();
  const body = request.body === null || request.body === undefined ? '' : JSON.stringify(request.body, null, 2);
  return <Panel className={PANEL_STACK_CLASS}>
    <SectionHeader description={<code>{`${request.method} ${request.path}`}</code>} level={2} title={t('corpus.detail.request')} />
    <HeadersTable headers={request.headers} label={t('corpus.detail.requestHeaders')} />
    <Panel className={EDITOR_CLASS} padding="flush">
      <Suspense fallback={<ContentLoadingScreen label={t('common.loading')} />}>
        <LazyBodyEditor emptyText={t('corpus.detail.noBody')} json label={t('corpus.detail.requestBody')} text={body} />
      </Suspense>
    </Panel>
  </Panel>;
}

// The response bytes exactly as recorded, fetched only when the detail page is
// open: a stream can run to megabytes the list never needs.
export function ResponseView({ headers, json, recordingId, status }: { headers: ReadonlyArray<readonly [string, string]>; json: boolean; recordingId: string; status: number }) {
  const { t } = useTranslation();
  const [body, setBody] = useState<{ id: string; text: string | null; error: string | null } | null>(null);
  useEffect(() => {
    let current = true;
    void (async () => {
      try {
        const response = await authFetch(`/api/recordings/${encodeURIComponent(recordingId)}/body`);
        const text = await response.text();
        if (current) setBody(response.ok ? { id: recordingId, text, error: null } : { id: recordingId, text: null, error: `HTTP ${response.status}` });
      } catch (error) {
        if (current) setBody({ id: recordingId, text: null, error: errorMessage(error) });
      }
    })();
    return () => { current = false; };
  }, [recordingId]);
  const shown = body?.id === recordingId ? body : null;

  return <Panel className={PANEL_STACK_CLASS}>
    <SectionHeader description={<code>{String(status)}</code>} level={2} title={t('corpus.detail.response')} />
    <HeadersTable headers={headers} label={t('corpus.detail.responseHeaders')} />
    {shown?.error && <OutcomeMessageBar title={t('corpus.detail.bodyFailed')}>{shown.error}</OutcomeMessageBar>}
    {!shown?.error && <Panel className={EDITOR_CLASS} padding="flush">
      {shown === null
        ? <ContentLoadingScreen label={t('common.loading')} />
        : <Suspense fallback={<ContentLoadingScreen label={t('common.loading')} />}>
            <LazyBodyEditor emptyText={t('corpus.detail.noBody')} json={json} label={t('corpus.detail.responseBody')} text={shown.text ?? ''} />
          </Suspense>}
    </Panel>}
  </Panel>;
}
