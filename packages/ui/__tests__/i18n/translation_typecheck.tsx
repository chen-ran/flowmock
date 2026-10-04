// Adapted from Floway apps/web/__tests__/i18n/translation_typecheck.tsx (MIT). See NOTICE.md.
// Checked by tsc, not run: every @ts-expect-error below fails the typecheck
// once the boundary stops rejecting what it names.
import { createTranslation } from '../../src/i18n/translation.tsx';
import type { TFunction, TranslationKey } from '../../src/i18n/translation.tsx';

// The shape an app's as-const English translation has.
type AppTranslation = {
  common: { loading: 'Loading…' };
  recordings: {
    unavailable: 'Recording {{id}} is unavailable';
    size: 'Stored in {{size, bytes}}';
    count_one: '{{count, count}} recording';
    count_other: '{{count, count}} recordings';
    named: 'Using <strong>{{name}}</strong>';
  };
};

const { Trans } = createTranslation<AppTranslation>();
declare const t: TFunction<AppTranslation>;

// The control strings arrive merged with the app's own.
t('ui.common.cancel');
t('common.loading');
t('recordings.unavailable', { id: 'rec_1' });
t('recordings.size', { size: 30 });
t('recordings.count', { count: 2 });

const key: TranslationKey<AppTranslation> = 'recordings.count';
void key;

declare const dynamicKey: string;
t(dynamicKey, { anything: true });

declare const mixedInterpolationKey: 'ui.common.cancel' | 'recordings.named';
t(mixedInterpolationKey, { name: 'key' });

// @ts-expect-error -- A string without placeholders does not accept a values object.
t('ui.common.cancel', {});
// @ts-expect-error -- A bare placeholder requires its string value.
t('recordings.unavailable');
// @ts-expect-error -- A bare placeholder cannot receive a number.
t('recordings.unavailable', { id: 1 });
// @ts-expect-error -- A formatted placeholder requires its number value.
t('recordings.size');
// @ts-expect-error -- A numeric format cannot receive a string.
t('recordings.size', { size: '30' });
// @ts-expect-error -- A plural base requires the count that selects its form.
t('recordings.count');
// @ts-expect-error -- Plural selection requires a numeric count.
t('recordings.count', { count: '2' });
// @ts-expect-error -- A literal absent from the catalogue is a typo, not a dynamic key.
t('ui.common.cacnel');
// @ts-expect-error -- Every member of a union must belong to the catalogue.
t('ui.common.cancel' as 'ui.common.cancel' | 'ui.common.cacnel');
// @ts-expect-error -- Values must satisfy every possible member of a union key.
t(mixedInterpolationKey);

void <Trans i18nKey="recordings.named" values={{ name: 'key' }} />;
void <Trans count={2} i18nKey="recordings.count" />;

// @ts-expect-error -- Trans uses the same string interpolation contract as t.
void <Trans i18nKey="recordings.named" values={{ name: 1 }} />;
// @ts-expect-error -- A plural Trans requires the count that selects its form.
void <Trans i18nKey="recordings.count" />;
// @ts-expect-error -- Trans plural selection requires a numeric count.
void <Trans count="2" i18nKey="recordings.count" />;
// @ts-expect-error -- The count prop owns plural interpolation; values must not duplicate it.
void <Trans count={2} i18nKey="recordings.count" values={{ count: 2 }} />;
// @ts-expect-error -- Trans accepts catalogue keys only.
void <Trans i18nKey="ui.common.cacnel" />;

// The package's own instance knows only the control strings.
const { useTranslation: useUiTranslation } = createTranslation();
const useUiOnly = () => {
  const { t: uiT } = useUiTranslation();
  uiT('ui.copy.action');
  // @ts-expect-error -- An app key is not part of the control catalogue.
  uiT('common.loading');
};
void useUiOnly;
