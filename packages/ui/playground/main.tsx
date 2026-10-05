import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';
import criticalCss from 'virtual:flowmock-critical.css?inline';
import winuiStylesheet from 'virtual:flowmock-winui.css?url';

import { fluentComponents } from '../src/fluent.ts';
import { Gallery } from '../src/gallery/gallery.tsx';
import { initI18n } from '../src/i18n/init.ts';
import { useSystemTheme } from '../src/theme.ts';
import '../src/global.css';

const { FluentProvider } = fluentComponents;

// The critical block is inlined and the WinUI layer linked after it, ahead of
// Griffel's runtime sheets, which is the order an app's document carries them in.
const style = document.createElement('style');
style.textContent = criticalCss;
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = winuiStylesheet;
document.head.append(style, link);

// The playground has no catalogue of its own; the controls bring theirs.
await initI18n({
  loadLocale: async () => await Promise.resolve({ translation: {} }),
  shell: { translation: {} },
});

// The critical block pins the document to the viewport, so the page brings its
// own scroller. It sits inside the provider: Fluent copies the provider's
// className onto every portal mount node, where a box would cover the page.
const App = () => <FluentProvider theme={useSystemTheme()}>
  <div className="fixed inset-0 overflow-auto bg-fui-bg1">
    <main className="p-[var(--flowmock-page-inset)]"><Gallery /></main>
  </div>
</FluentProvider>;

const router = createMemoryRouter([{ path: '*', element: <App /> }]);

createRoot(document.getElementById('root')!).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
