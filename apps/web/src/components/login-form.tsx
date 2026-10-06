// Adapted from Floway apps/web/src/components/login-form.tsx (MIT). See NOTICE.md.
import { useState } from 'react';
import { useFetcher } from 'react-router';

import { LanguageSelector } from './language-selector.tsx';
import { FlowMockLogo } from './logo.tsx';
import { Trans, useTranslation } from '../i18n/translation.ts';
import { Input } from '@flowmock/ui/controls/fluent-form-controls.tsx';
import { CONTROL_ROW_CLASS } from '@flowmock/ui/controls/layout.ts';
import { OutcomeMessageBar } from '@flowmock/ui/controls/outcome-message-bar.tsx';
import { Panel } from '@flowmock/ui/controls/panel.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Button, Field } = fluentComponents;

// What a failed sign-in reports. A refused key belongs on the field it came
// from; anything else -- a rate limit, a server that did not answer -- is about
// the attempt, not the key, so it is reported beneath the form.
export type LoginActionData =
  | { ok: false; field: 'auth.login.invalidKey' }
  | { ok: false; form: 'auth.login.rateLimited' | 'auth.login.unreachable' | 'auth.login.failed'; detail?: string };

export function LoginForm({ serverError }: { serverError?: string | null }) {
  const { t } = useTranslation();
  const fetcher = useFetcher<LoginActionData>();
  const submitting = fetcher.state !== 'idle';
  const [key, setKey] = useState('');
  const [emptyKey, setEmptyKey] = useState(false);
  // The fetcher keeps its last response for as long as it lives, so a bar read
  // straight off it has no state a dismiss could clear. Each response is taken
  // into state during render, so the bar and the response it reports are
  // painted together.
  const [formError, setFormError] = useState<string | null>(serverError ?? null);
  const [reported, setReported] = useState(fetcher.data);
  if (reported !== fetcher.data) {
    setReported(fetcher.data);
    const data = fetcher.data;
    setFormError(data && 'form' in data ? `${t(data.form)}${data.detail ? ` ${data.detail}` : ''}` : null);
  }
  const keyError = emptyKey ? t('auth.login.keyRequired') : fetcher.data && 'field' in fetcher.data ? t(fetcher.data.field) : null;

  return (
    <Panel className="relative w-[min(440px,100%)]">
      <header className="flex items-center">
        <FlowMockLogo />
        <div className="ml-auto flex items-center gap-2"><LanguageSelector /></div>
      </header>

      {/* The Field carries 12px of its own above its label, so no gap is stated
          from the mark to it. */}
      <form
        className="mx-auto grid w-full max-w-full gap-5"
        onSubmit={event => {
          event.preventDefault();
          // The submit button stays focusable while in flight, so the form's
          // own submission path stays open.
          if (submitting) return;
          if (!key) {
            setEmptyKey(true);
            return;
          }
          void fetcher.submit({ key }, { method: 'post' });
        }}
      >
        <Field
          label={t('auth.login.adminKey')}
          validationMessage={keyError ?? undefined}
          validationState={keyError ? 'error' : undefined}
        >
          <Input
            autoComplete="current-password"
            autoFocus
            disabled={submitting}
            name="key"
            onChange={(_, data) => {
              setKey(data.value);
              setEmptyKey(false);
            }}
            placeholder={t('auth.login.adminKeyPlaceholder')}
            type="password"
            value={key}
          />
        </Field>

        {/* Full width so the submit sits flush under the field above it. */}
        <Button appearance="primary" className={`mt-3.5 w-full ${CONTROL_ROW_CLASS}`} disabledFocusable={submitting} type="submit">
          {t('auth.login.submit')}
        </Button>

        <p className="m-0 text-center text-fui-base200 leading-[var(--lineHeightBase300)] text-fui-fg2">
          <Trans components={{ variable: <code /> }} i18nKey="auth.login.hint" />
        </p>
      </form>

      {formError && (
        <OutcomeMessageBar className="mt-[18px]" onDismiss={() => setFormError(null)}>{formError}</OutcomeMessageBar>
      )}
    </Panel>
  );
}
