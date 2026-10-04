// Ported from Floway apps/web/__tests__/i18n/language_preference_test.ts (MIT). See NOTICE.md.
import { describe, expect, it } from 'vitest';

import {
  clearStoredLanguage,
  flowmockLanguageStorageKey,
  storeLanguage,
  storedLanguage,
} from '../../src/i18n/language-preference.ts';
import { stubLocalStorage } from '../local-storage-stub.ts';

describe('language preference', () => {
  const storage = stubLocalStorage();

  it('has no preference by default', () => {
    expect(storedLanguage()).toBeNull();
  });

  it('round-trips a supported language', () => {
    storeLanguage('zh-Hans');

    expect(storage.get(flowmockLanguageStorageKey)).toBe('zh-Hans');
    expect(storedLanguage()).toBe('zh-Hans');
  });

  it('ignores an unsupported stored language', () => {
    storage.set(flowmockLanguageStorageKey, 'ko-KR');

    expect(storedLanguage()).toBeNull();
  });

  it('clears a stored language', () => {
    storeLanguage('en');
    clearStoredLanguage();

    expect(storedLanguage()).toBeNull();
  });
});

describe('language preference storage key', () => {
  it('is FlowMock\'s own', () => {
    expect(flowmockLanguageStorageKey).toBe('flowmock-language');
  });
});
