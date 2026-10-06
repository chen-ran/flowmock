// Ported from Floway apps/web/src/components/language-selector.tsx (MIT). See NOTICE.md.
import type { MenuCheckedValueChangeData } from '@fluentui/react-components';
import { GlobeRegular } from '@fluentui/react-icons';

import { setLanguage } from '../i18n/index.ts';
import { useTranslation } from '../i18n/translation.ts';
import { fluentComponents } from '@flowmock/ui/fluent';
import { defaultLanguage, normalizeLanguage, storeLanguage, supportedLanguages, type SupportedLanguage } from '@flowmock/ui/i18n';

const {
  Button,
  Menu,
  MenuItemRadio,
  MenuList,
  MenuPopover,
  MenuTrigger,
} = fluentComponents;

// The languages are named in themselves, the way a native reader knows them; a
// translated label would tell a reader about their own language in someone
// else's. The control's accessible name is the one translated string here.
const languageNames: Record<SupportedLanguage, string> = {
  'en': 'English',
  'zh-Hans': '简体中文',
};

export function LanguageSelector({ className }: { className?: string }) {
  const { i18n, t } = useTranslation();
  const currentLanguage = normalizeLanguage(i18n.language) ?? defaultLanguage;

  const selectLanguage = async (next: SupportedLanguage) => {
    try {
      await setLanguage(next);
      storeLanguage(next);
    } catch {
      // The locale chunk could not be fetched; keep the current language.
    }
  };

  const onCheckedValueChange = (
    _e: unknown,
    data: Pick<MenuCheckedValueChangeData, 'checkedItems'>,
  ) => {
    const next = normalizeLanguage(data.checkedItems?.[0]);
    if (next) void selectLanguage(next);
  };

  return (
    <Menu checkedValues={{ language: [currentLanguage] }} onCheckedValueChange={onCheckedValueChange}>
      <MenuTrigger disableButtonEnhancement>
        <Button
          appearance="subtle"
          aria-label={t('common.language')}
          className={className}
          icon={<GlobeRegular />}
        />
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {supportedLanguages.map(language => (
            <MenuItemRadio key={language} name="language" value={language}>
              {languageNames[language]}
            </MenuItemRadio>
          ))}
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}
