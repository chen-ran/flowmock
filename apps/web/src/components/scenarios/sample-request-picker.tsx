import { useState } from 'react';

import { api, callApi } from '../../api/client.ts';
import type { RecordingSummary } from '../../api/types.ts';
import { useTranslation } from '../../i18n/translation.ts';
import { compactDateTime } from '../../lib/format-time.ts';
import { NO_READING } from '../../lib/no-reading.ts';
import { useLocale } from '../../lib/use-locale.ts';
import { PROTOCOLS, type Protocol } from '@flowmock/protocols/common';
import { ChoiceGroup } from '@flowmock/ui/controls/choice-group.tsx';
import { Dropdown, Input, Textarea } from '@flowmock/ui/controls/fluent-form-controls.tsx';
import { TWO_COLUMN_FORM_CLASS } from '@flowmock/ui/controls/layout.ts';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Field, Option } = fluentComponents;

// The request a preview plans for, as a client would send it.
export interface SampleRequest {
  protocol: Protocol;
  path: string;
  body: unknown;
  transport: 'http' | 'ws';
  // The recording it was taken from, if any.
  recordingId: string | null;
}

// Where each protocol's requests are sent. Gemini reads the model and the
// streaming choice from the path, so the preview needs it whole.
// https://ai.google.dev/api/generate-content#method:-models.streamgeneratecontent
const DEFAULT_PATHS: Record<Protocol, string> = {
  'anthropic-messages': '/v1/messages',
  'openai-chat-completions': '/v1/chat/completions',
  'openai-responses': '/v1/responses',
  'gemini-generate-content': '/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse',
};

const DEFAULT_BODIES: Record<Protocol, unknown> = {
  'anthropic-messages': { model: 'claude-sonnet-4-5', max_tokens: 1024, stream: true, messages: [{ role: 'user', content: 'Hello' }] },
  'openai-chat-completions': { model: 'gpt-4.1', stream: true, messages: [{ role: 'user', content: 'Hello' }] },
  'openai-responses': { model: 'gpt-4.1', stream: true, input: 'Hello' },
  'gemini-generate-content': { contents: [{ role: 'user', parts: [{ text: 'Hello' }] }] },
};

const FIRST_PROTOCOL: Protocol = 'anthropic-messages';

// The request the paste form opens with, already a valid one to preview.
export const defaultPastedRequest = (): SampleRequest =>
  ({ protocol: FIRST_PROTOCOL, path: DEFAULT_PATHS[FIRST_PROTOCOL], body: structuredClone(DEFAULT_BODIES[FIRST_PROTOCOL]), transport: 'http', recordingId: null });

const recordingLabel = (recording: RecordingSummary, locale: string) =>
  `${recording.model ?? NO_READING} · ${recording.protocol} · ${compactDateTime(recording.createdAt, locale)}`;

function PastedRequest({ onChange }: { onChange: (value: SampleRequest | null) => void }) {
  const { t } = useTranslation();
  const [protocol, setProtocol] = useState<Protocol>(FIRST_PROTOCOL);
  const [path, setPath] = useState(DEFAULT_PATHS[protocol]);
  const [text, setText] = useState(JSON.stringify(DEFAULT_BODIES[protocol], null, 2));
  const [invalid, setInvalid] = useState(false);

  const publish = (next: { protocol: Protocol; path: string; text: string }) => {
    let body: unknown;
    try {
      body = JSON.parse(next.text);
    } catch {
      setInvalid(true);
      onChange(null);
      return;
    }
    setInvalid(false);
    onChange({ protocol: next.protocol, path: next.path, body, transport: 'http', recordingId: null });
  };

  return <div className="grid gap-3">
    <div className={`${TWO_COLUMN_FORM_CLASS} gap-3`}>
      <Field label={t('scenarios.preview.protocol')}>
        <Dropdown
          onOptionSelect={(_, data) => {
            const next = data.optionValue as Protocol;
            const nextText = JSON.stringify(DEFAULT_BODIES[next], null, 2);
            setProtocol(next);
            setPath(DEFAULT_PATHS[next]);
            setText(nextText);
            publish({ protocol: next, path: DEFAULT_PATHS[next], text: nextText });
          }}
          selectedOptions={[protocol]}
          value={protocol}
        >
          {PROTOCOLS.map(item => <Option key={item} value={item}>{item}</Option>)}
        </Dropdown>
      </Field>
      <Field label={t('scenarios.preview.path')}>
        <Input className="font-mono" onChange={(_, data) => { setPath(data.value); publish({ protocol, path: data.value, text }); }} value={path} />
      </Field>
    </div>
    <Field
      label={t('scenarios.preview.body')}
      validationMessage={invalid ? t('scenarios.preview.bodyInvalid') : undefined}
      validationState={invalid ? 'error' : undefined}
    >
      <Textarea className="font-mono" onChange={(_, data) => { setText(data.value); publish({ protocol, path, text: data.value }); }} rows={8} value={text} />
    </Field>
  </div>;
}

// Picks the request to preview: one the corpus recorded, or one pasted in. The
// caller starts from defaultPastedRequest() when the corpus is empty.
export function SampleRequestPicker({ onChange, recordings }: {
  onChange: (value: SampleRequest | null) => void;
  recordings: readonly RecordingSummary[];
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const [source, setSource] = useState<'corpus' | 'pasted'>(recordings.length > 0 ? 'corpus' : 'pasted');
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (id: string) => {
    setPicked(id);
    setError(null);
    onChange(null);
    const result = await callApi(() => api.recordings[':id'].$get({ param: { id } }));
    if (result.error) {
      setError(result.error.message);
      return;
    }
    const recording = result.data;
    onChange({ protocol: recording.protocol, path: recording.request.path, body: recording.request.body, transport: recording.transport, recordingId: recording.id });
  };

  const pickedRecording = recordings.find(item => item.id === picked);
  return <div className="grid gap-3">
    <ChoiceGroup
      ariaLabel={t('scenarios.preview.requestSource')}
      items={[
        { value: 'corpus', label: t('scenarios.preview.fromCorpus'), disabled: recordings.length === 0 },
        { value: 'pasted', label: t('scenarios.preview.pasted') },
      ]}
      onChange={value => {
        setSource(value as 'corpus' | 'pasted');
        setPicked(null);
        setError(null);
        onChange(value === 'pasted' ? defaultPastedRequest() : null);
      }}
      value={source}
    />
    {source === 'corpus'
      ? <Field
          label={t('scenarios.preview.recording')}
          validationMessage={error ?? undefined}
          validationState={error ? 'error' : undefined}
        >
          <Dropdown
            onOptionSelect={(_, data) => { if (data.optionValue) void pick(data.optionValue); }}
            placeholder={t('scenarios.preview.pickRecording')}
            selectedOptions={picked === null ? [] : [picked]}
            value={pickedRecording ? recordingLabel(pickedRecording, locale) : ''}
          >
            {recordings.map(item => <Option key={item.id} text={recordingLabel(item, locale)} value={item.id}>{recordingLabel(item, locale)}</Option>)}
          </Dropdown>
        </Field>
      : <PastedRequest onChange={onChange} />}
  </div>;
}
