import { useRef } from 'react';
import { useLoaderData } from 'react-router';

import { requireAccess } from './guards.ts';
import { api, callApi } from '../api/client.ts';
import { setLanguage } from '../i18n/index.ts';
import { useTranslation } from '../i18n/translation.ts';
import { useAuthStore } from '../stores/auth-store.ts';
import { ConfirmDialog } from '@flowmock/ui/controls/confirm-dialog.tsx';
import { DashboardPageHeader } from '@flowmock/ui/controls/dashboard-page-header.tsx';
import { Dropdown } from '@flowmock/ui/controls/fluent-form-controls.tsx';
import { SECTION_STACK_CLASS } from '@flowmock/ui/controls/layout.ts';
import { SectionHeader } from '@flowmock/ui/controls/section-header.tsx';
import { SettingsCard } from '@flowmock/ui/controls/settings-card.tsx';
import { useDialogInvocation } from '@flowmock/ui/controls/use-dialog-invocation.ts';
import { fluentComponents } from '@flowmock/ui/fluent';
import { defaultLanguage, normalizeLanguage, storeLanguage, supportedLanguages, type SupportedLanguage } from '@flowmock/ui/i18n';

const { Button, Option, Text } = fluentComponents;

export async function clientLoader() {
  await requireAccess();
  const result = await callApi(() => api.settings.$get());
  if (result.error) throw new Error(result.error.message, { cause: result.error });
  return result.data;
}

// Named in themselves, the way a native reader knows them.
const languageNames: Record<SupportedLanguage, string> = {
  'en': 'English',
  'zh-Hans': '简体中文',
};

export default function Settings() {
  const settings = useLoaderData<typeof clientLoader>();
  const { i18n, t } = useTranslation();
  const via = useAuthStore(state => state.access?.via);
  const logout = useAuthStore(state => state.logout);
  const signOut = useDialogInvocation<void>();
  // Signing out leaves this page, so it waits for the dialog's exit; the exit
  // also runs on a dismissal, so only a confirmed one signs out.
  const signOutConfirmed = useRef(false);
  const language = normalizeLanguage(i18n.language) ?? defaultLanguage;
  const timeline = settings.timeline.persist
    ? t('settings.timeline.persistent', { days: settings.timeline.retainDays, entries: settings.timeline.maxEntries })
    : t('settings.timeline.memory');

  return <section className="dashboard-page">
    <DashboardPageHeader description={t('settings.description')} title={t('nav.settings')} />

    <div className={SECTION_STACK_CLASS}>
      <SectionHeader level={2} title={t('settings.sections.preferences')} />
      <SettingsCard
        action={<Dropdown
          aria-label={t('settings.language.label')}
          onOptionSelect={(_, data) => {
            const next = normalizeLanguage(data.optionValue);
            if (!next) return;
            void setLanguage(next).then(() => storeLanguage(next));
          }}
          selectedOptions={[language]}
          value={languageNames[language]}
        >
          {supportedLanguages.map(option => <Option key={option} value={option}>{languageNames[option]}</Option>)}
        </Dropdown>}
        description={t('settings.language.description')}
        header={t('settings.language.label')}
      />
      <Text className="text-fui-fg2" size={200}>{t('settings.appearance')}</Text>
    </div>

    <div className={SECTION_STACK_CLASS}>
      <SectionHeader level={2} title={t('settings.sections.server')} />
      <SettingsCard action={<Text>{settings.version}</Text>} header={t('settings.version')} />
      <SettingsCard
        description={settings.adminKey ? t('settings.access.protectedDescription') : t('settings.access.openDescription')}
        header={settings.adminKey ? t('settings.access.protected') : t('settings.access.open')}
      />
      <SettingsCard description={t('settings.timeline.description')} header={timeline} />
      {via === 'session' && <SettingsCard
        action={<Button onClick={() => { signOutConfirmed.current = false; signOut.open(); }}>{t('logout.label')}</Button>}
        description={t('settings.signOutDescription')}
        header={t('logout.label')}
      />}
    </div>

    {signOut.invocation && <ConfirmDialog
      actionIntent="primary"
      actionLabel={t('logout.action')}
      key={signOut.invocation.key}
      message={t('logout.message')}
      onConfirm={() => { signOutConfirmed.current = true; signOut.close(); }}
      onExited={() => { if (signOutConfirmed.current) void logout(); }}
      onOpenChange={open => { if (!open) signOut.close(); }}
      open={signOut.isOpen}
      title={t('logout.title')}
    />}
  </section>;
}
