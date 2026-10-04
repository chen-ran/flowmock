// Ported from Floway apps/web/__tests__/components/ui/loading-screen-styles_test.ts (MIT). See NOTICE.md.
import { describe, expect, it } from 'vitest';

import { loadingCss } from '../../src/controls/loading-screen.css.ts';

describe('the critical loading screen styles', () => {
  it('keep the ProgressRing track transparent before the WinUI stylesheet loads', () => {
    const provider = document.createElement('div');
    const loadingScreen = document.createElement('main');
    const spinner = document.createElement('span');
    const style = document.createElement('style');

    provider.style.setProperty('--colorBrandStroke2Contrast', 'hotpink');
    loadingScreen.className = 'flowmock-loading';
    spinner.className = 'fui-Spinner__spinner';
    style.textContent = loadingCss;
    try {
      loadingScreen.append(spinner);
      provider.append(loadingScreen);
      document.head.append(style);
      document.body.append(provider);

      expect(getComputedStyle(spinner).backgroundColor).toBe('rgba(255, 255, 255, 0)');
    } finally {
      style.remove();
      provider.remove();
    }
  });
});
