// Adapted from Floway apps/web/__tests__/i18n/locale_loading_test.ts (MIT). See NOTICE.md.
import i18next from 'i18next';
import { describe, expect, it } from 'vitest';

import { initI18n } from '../../src/i18n/init.ts';
import type { SupportedLanguage } from '../../src/i18n/languages.ts';

const appLocales = {
  'en': { translation: { common: { loading: 'Loading…' }, page: { title: 'Recordings' } } },
  'zh-Hans': { translation: { common: { loading: '加载中…' }, page: { title: '录制' } } },
};
const requested: SupportedLanguage[] = [];

// The setup file has already booted the global instance for the control
// suites, so this boot gets an instance of its own. happy-dom reports en-US,
// which leaves zh-Hans as the language nothing in this run has loaded.
const instance = i18next.createInstance();
const { i18n, setLanguage } = await initI18n({
  instance,
  loadLocale: async language => {
    requested.push(language);
    return await Promise.resolve(appLocales[language]);
  },
  shell: { translation: { common: { loading: 'Loading…' } } },
});

describe('initI18n', () => {
  it('boots with the visitor\'s bundle merged with the control strings', () => {
    expect(requested).toEqual(['en']);
    expect(i18n.t('page.title')).toBe('Recordings');
    expect(i18n.t('ui.common.cancel')).toBe('Cancel');
  });

  it('fetches a bundle the session has not seen before switching to it', async () => {
    expect(i18n.hasResourceBundle('zh-Hans', 'translation')).toBe(false);

    await setLanguage('zh-Hans');

    expect(requested).toEqual(['en', 'zh-Hans']);
    expect(i18n.language).toBe('zh-Hans');
    expect(i18n.t('page.title')).toBe('录制');
    expect(i18n.t('ui.common.cancel')).toBe('取消');
    expect(document.documentElement.lang).toBe('zh-Hans');
  });

  it('switches back without fetching again', async () => {
    await setLanguage('en');

    expect(requested).toEqual(['en', 'zh-Hans']);
    expect(i18n.t('ui.common.cancel')).toBe('Cancel');
  });

  it('formats every interpolation, and throws on a number that names no format', () => {
    i18n.addResource('en', 'translation', 'page.bytes', '{{size, bytes}}');
    i18n.addResource('en', 'translation', 'page.bare', '{{size}}');
    expect(i18n.t('page.bytes', { size: 1536 })).toBe('1.5 KB');
    expect(() => i18n.t('page.bare', { size: 2048 })).toThrow(/names no format/);
  });

  it('refuses to initialize twice', async () => {
    await expect(initI18n({ instance, loadLocale: async () => await Promise.resolve(appLocales.en), shell: {} })).rejects.toThrow(/once/);
  });
});
