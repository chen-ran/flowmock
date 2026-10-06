import type en from './locales/en.ts';
import { createTranslation } from '@flowmock/ui/i18n';

// The app's typed boundary: its own English strings merged with the controls'
// ui namespace. Every key and interpolation value a call site passes is checked
// against those strings.
export const { useTranslation, Trans } = createTranslation<typeof en['translation']>();
