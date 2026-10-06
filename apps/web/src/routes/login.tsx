// Adapted from Floway apps/web/src/routes/home.tsx (MIT). See NOTICE.md.
import { redirect, useLoaderData } from 'react-router';

import type { Route } from './+types/login';
import { api, callApi } from '../api/client.ts';
import { LoginForm, type LoginActionData } from '../components/login-form.tsx';
import { useTranslation } from '../i18n/translation.ts';
import { useAuthStore } from '../stores/auth-store.ts';
import { SCROLLPORT_FILL_CLASS } from '@flowmock/ui/controls/layout.ts';
import { ScrollArea } from '@flowmock/ui/controls/scroll-area.tsx';

// A browser already let in -- by a session, or by a server started without an
// admin key -- has nothing to sign in to. A server that does not answer keeps
// the form on screen with the failure, since the reader may be about to start
// it.
export async function clientLoader() {
  const access = await useAuthStore.getState().initialize();
  if (access) throw redirect('/');
  const error = useAuthStore.getState().error;
  return { failure: error && { status: error.status, message: error.message } };
}

export async function clientAction({ request }: Route.ClientActionArgs): Promise<LoginActionData | Response> {
  const key = String((await request.formData()).get('key') ?? '');
  const result = await callApi(() => api.auth.login.$post({ json: { key } }));
  if (result.data) {
    useAuthStore.getState().primeFromLogin(result.data.token);
    throw redirect('/');
  }
  switch (result.error.status) {
  case 401: return { ok: false, field: 'auth.login.invalidKey' };
  case 429: return { ok: false, form: 'auth.login.rateLimited' };
  case 0: return { ok: false, form: 'auth.login.unreachable' };
  default: return { ok: false, form: 'auth.login.failed', detail: result.error.message };
  }
}

export default function Login() {
  const { t } = useTranslation();
  const { failure } = useLoaderData<typeof clientLoader>();
  const serverError = failure && (failure.status === 0 ? t('auth.login.unreachable') : `${t('auth.login.failed')} ${failure.message}`);
  return (
    <ScrollArea axes="vertical" className="h-[100dvh]" contentClassName="h-full" noTabIndex>
      <main className={`grid ${SCROLLPORT_FILL_CLASS} place-items-center p-6 max-[520px]:p-4`}>
        <LoginForm serverError={serverError} />
      </main>
    </ScrollArea>
  );
}
