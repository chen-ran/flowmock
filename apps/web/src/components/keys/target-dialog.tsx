import { DeleteRegular } from '@fluentui/react-icons';
import { useState } from 'react';

import { api, callApi } from '../../api/client.ts';
import type { RecordingTarget } from '../../api/types.ts';
import { useTranslation } from '../../i18n/translation.ts';
import { useDangerTextClass } from '@flowmock/ui/controls/danger.ts';
import { DialogShell } from '@flowmock/ui/controls/dialog-shell.tsx';
import { Input } from '@flowmock/ui/controls/fluent-form-controls.tsx';
import { OutcomeMessageBar } from '@flowmock/ui/controls/outcome-message-bar.tsx';
import { SecretInput } from '@flowmock/ui/controls/secret-input.tsx';
import { TooltipIconButton } from '@flowmock/ui/controls/tooltip-icon-button.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Button, DialogActions, DialogTitle, Field, Text } = fluentComponents;

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

// The server takes an http or https origin, with an optional path prefix the
// client's request path is appended to.
export const isHttpUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

interface HeaderRow {
  name: string;
  value: string;
  // Stored on the server, whose value this page only ever sees masked. Left
  // empty, the row keeps it.
  stored: boolean;
}

export function TargetDialog({ onOpenChange, onSaved, open, target }: {
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  open: boolean;
  target: RecordingTarget | null;
}) {
  const { t } = useTranslation();
  const dangerText = useDangerTextClass();
  const [id, setId] = useState(target?.id ?? '');
  const [name, setName] = useState(target?.name ?? '');
  const [baseUrl, setBaseUrl] = useState(target?.baseUrl ?? '');
  const [headers, setHeaders] = useState<HeaderRow[]>(
    target ? Object.keys(target.headers).map(header => ({ name: header, value: '', stored: true })) : [{ name: 'x-api-key', value: '', stored: false }],
  );
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const idError = ID_PATTERN.test(id) ? null : t('keys.targets.dialog.idInvalid');
  const urlError = isHttpUrl(baseUrl) ? null : t('keys.targets.dialog.urlInvalid');
  const headerError = headers.some(row => row.name.trim() === '' || (!row.stored && row.value === '')) ? t('keys.targets.dialog.headerIncomplete') : null;
  const update = (index: number, patch: Partial<HeaderRow>) => setHeaders(rows => rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));

  const save = async () => {
    setSubmitted(true);
    if (idError || urlError || headerError) return;
    setSaving(true);
    const json = {
      id,
      ...(name.trim() && { name: name.trim() }),
      baseUrl,
      headers: Object.fromEntries(headers.map(row => [row.name.trim(), row.stored && row.value === '' ? null : row.value])),
    };
    const result = await callApi(() => api.targets.$post({ json }));
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    onSaved();
  };

  const fieldState = (message: string | null) => (submitted && message ? { validationMessage: message, validationState: 'error' as const } : {});

  return <DialogShell
    actions={<DialogActions>
      <Button onClick={() => onOpenChange(false)}>{t('keys.dialog.cancel')}</Button>
      <Button appearance="primary" disabledFocusable={saving} type="submit">{t('keys.dialog.save')}</Button>
    </DialogActions>}
    onOpenChange={(_, data) => onOpenChange(data.open)}
    onSubmit={() => void save()}
    open={open}
    title={<DialogTitle>{target ? t('keys.targets.dialog.editTitle') : t('keys.targets.dialog.createTitle')}</DialogTitle>}
  >
    <Field label={t('keys.targets.list.id')} {...fieldState(idError)}>
      <Input onChange={(_, data) => setId(data.value.trim())} placeholder="anthropic" readOnly={target !== null} value={id} />
    </Field>
    <Field label={t('keys.targets.list.name')}>
      <Input onChange={(_, data) => setName(data.value)} value={name} />
    </Field>
    <Field hint={t('keys.targets.dialog.urlHint')} label={t('keys.targets.list.baseUrl')} {...fieldState(urlError)}>
      <Input onChange={(_, data) => setBaseUrl(data.value.trim())} placeholder="https://api.anthropic.com" value={baseUrl} />
    </Field>
    <div className="grid gap-2">
      <Text weight="semibold">{t('keys.targets.list.headers')}</Text>
      <Text className="text-fui-fg2" size={200}>{t('keys.targets.dialog.headersHint')}</Text>
      {headers.map((row, index) => <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] gap-2 items-center" key={index}>
        <Input aria-label={t('keys.targets.dialog.headerName')} onChange={(_, data) => update(index, { name: data.value })} placeholder="x-api-key" readOnly={row.stored} value={row.name} />
        <SecretInput
          aria-label={t('keys.targets.dialog.headerValue')}
          onChange={(_, data) => update(index, { value: data.value })}
          placeholder={row.stored ? t('keys.targets.dialog.keepValue') : t('keys.targets.dialog.headerValue')}
          value={row.value}
        />
        <TooltipIconButton icon={<DeleteRegular />} label={t('keys.targets.dialog.removeHeader')} onClick={() => setHeaders(rows => rows.filter((_, at) => at !== index))} />
      </div>)}
      <div><Button onClick={() => setHeaders(rows => [...rows, { name: '', value: '', stored: false }])} size="small">{t('keys.targets.dialog.addHeader')}</Button></div>
      {submitted && headerError && <Text className={dangerText} size={200}>{headerError}</Text>}
    </div>
    {error && <OutcomeMessageBar onDismiss={() => setError(null)} title={t('keys.dialog.saveFailed')}>{error}</OutcomeMessageBar>}
  </DialogShell>;
}
