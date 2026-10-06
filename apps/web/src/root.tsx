// Ported from Floway apps/web/src/root.tsx (MIT). See NOTICE.md.
import { useSyncExternalStore } from 'react';
import { isRouteErrorResponse, Links, Outlet, Scripts } from 'react-router';
import criticalCss from 'virtual:flowmock-critical.css?inline';
import winuiStylesheet from 'virtual:flowmock-winui.css?url';

import type { Route } from './+types/root';
import logoUrl from './assets/flowmock.svg?no-inline';
import { GradientBackground } from './components/gradient-background.tsx';
import { LanguageSync } from './components/language-sync.tsx';
import { NavigationProgress } from './components/navigation-progress.tsx';
import { useTranslation } from './i18n/translation.ts';
import { ErrorShell, ErrorStack } from '@flowmock/ui/controls/error-shell.tsx';
import { AppLoadingScreen } from '@flowmock/ui/controls/loading-screen.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';
import { defaultLanguage, htmlLanguageFor } from '@flowmock/ui/i18n';
import { useSystemTheme } from '@flowmock/ui/theme';
import './i18n/index.ts';
import '@flowmock/ui/global.css';

const { Button, FluentProvider } = fluentComponents;

// Fonts are fetched in CORS mode whatever the crossOrigin value, and a preload
// whose mode disagrees with the real request is fetched twice. The URL is the
// first source @flowmock/ui/global.css names for the face.
// https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/preload#cors-enabled_fetches
const SEGOE_UI_VARIABLE_MIRROR_URL = 'https://docs.azure.cn/static/third-party/SegoeUIVariable/SegoeUI-VF.ttf?flowmock-vf=2.02';

export const links: Route.LinksFunction = () => [
  { rel: 'icon', type: 'image/svg+xml', href: logoUrl },
  { rel: 'preconnect', href: 'https://docs.azure.cn', crossOrigin: 'anonymous' },
  { rel: 'preload', as: 'font', type: 'font/ttf', href: SEGOE_UI_VARIABLE_MIRROR_URL, crossOrigin: 'anonymous' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const theme = useSystemTheme();

  return (
    <html lang={htmlLanguageFor(defaultLanguage)}>
      <head>
        <meta charSet="utf-8" />
        <meta name="darkreader-lock" content="true" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* A FlowMock instance is one developer's console, not a public site. */}
        <meta name="robots" content="noindex" />
        <meta name="theme-color" content="#f5f5f5" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#111111" media="(prefers-color-scheme: dark)" />
        <title>FlowMock</title>
        <Links />
        {/* Inlined because it has to be true before a linked stylesheet can
            arrive. See ./critical.css.ts. */}
        <style>{criticalCss}</style>
        {/* Linked by hand rather than through Links, which renders ahead of
            anything this component writes: the WinUI layer has to follow the
            block above, whose spinner rules reach Fluent's class names at the
            same specificity. */}
        <link href={winuiStylesheet} rel="stylesheet" />
      </head>
      <body className="text-[14px]">
        <FluentProvider theme={theme}>
          <LanguageSync />
          <GradientBackground>{children}</GradientBackground>
        </FluentProvider>
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <>
      <NavigationProgress />
      <Outlet />
    </>
  );
}

export function HydrateFallback() {
  const { t } = useTranslation();
  return <AppLoadingScreen label={t('common.loading')} />;
}

// The prerendered HTML carries HydrateFallback's boot screen, so rendering the
// error tree during hydration itself is a mismatch React recovers from by
// rebuilding the page. Hydrating the fallback and showing the failure on the
// next pass keeps that exchange one React handles.
const subscribeNever = () => () => {};
const isClient = () => true;
const isServer = () => false;
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { t } = useTranslation();
  const hydrated = useSyncExternalStore(subscribeNever, isClient, isServer);

  if (!hydrated) return <AppLoadingScreen label={t('common.loading')} />;

  let title = t('common.errors.unexpectedTitle');
  let message = t('common.errors.unexpectedDescription');
  let stack: string | undefined;
  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? '404' : t('common.errors.title');
    message = error.status === 404 ? t('common.errors.notFound') : error.statusText || message;
  } else if (error instanceof Error) {
    message = error.message;
    stack = error.stack;
  }

  return (
    <ErrorShell
      action={
        <>
          {/* A reload, not a router navigation: whatever failed may have left
              app state or modules in a shape a navigation would keep. */}
          <Button appearance="primary" onClick={() => window.location.reload()}>{t('common.errors.refresh')}</Button>
          <Button onClick={() => window.history.back()}>{t('common.errors.back')}</Button>
        </>
      }
      // The trace's first line is the message, so a shown trace stands alone.
      message={stack ? undefined : message}
      title={title}
    >
      {stack && <ErrorStack>{stack}</ErrorStack>}
    </ErrorShell>
  );
}
