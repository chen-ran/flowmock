// Adapted from Floway apps/web/src/routes/dashboard.tsx (MIT). See NOTICE.md.
import { NavigationRegular } from '@fluentui/react-icons';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLoaderData, useMatches, useOutlet, useOutletContext } from 'react-router';

import { requireAccess } from './guards.ts';
import { DocumentTitleSync } from '../components/document-title-sync.tsx';
import { LanguageSelector } from '../components/language-selector.tsx';
import { FlowMockLogo } from '../components/logo.tsx';
import { usePageFrames } from '../components/page-frames.tsx';
import { Sidebar } from '../components/sidebar/nav.tsx';
import { useTranslation } from '../i18n/translation.ts';
import { isDashboardWorkspaceHandle } from '../lib/dashboard-route-handle.ts';
import { prefersReducedMotion } from '../lib/reduced-motion.ts';
import { useAuthStore } from '../stores/auth-store.ts';
import { SCROLLPORT_FILL_CLASS } from '@flowmock/ui/controls/layout.ts';
import { OutcomeToastProvider } from '@flowmock/ui/controls/outcome-toast.tsx';
import { ScrollArea } from '@flowmock/ui/controls/scroll-area.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';
import { PAGE_ENTER_EASING, PAGE_ENTER_MS, PAGE_ENTER_OFFSET_PX } from '@flowmock/ui/winui/motion.ts';

const { Button, DrawerBody, OverlayDrawer } = fluentComponents;

type Access = Awaited<ReturnType<typeof requireAccess>>;

export interface DashboardOutletContext {
  access: Access;
}

export async function clientLoader() {
  return { access: await requireAccess() };
}

// Signing out, or any request the server answers 401, clears the store; the
// shell is what notices and leaves for the sign-in form.
export default function Dashboard() {
  const signedIn = useAuthStore(state => state.access !== null);
  if (!signedIn) return <Navigate replace to="/login" />;
  return <DashboardShell />;
}

function DashboardShell() {
  const { access } = useLoaderData<typeof clientLoader>();
  const { t } = useTranslation();
  const [navigationOpen, setNavigationOpen] = useState(false);
  // The entrance is started on the element, not declared in the sheet;
  // @flowmock/ui's page-transition.css.ts says why. React state and a
  // deliberate one-turn wait both put frames between the page appearing and it
  // moving.
  const firstFrameRef = useRef<HTMLDivElement>(null);
  const entranceStarted = useRef(false);
  useLayoutEffect(() => {
    // StrictMode double-invokes layout effects in development; a second
    // animation would start from an offset the first has already left.
    if (entranceStarted.current) return;
    if (prefersReducedMotion()) return;
    const frame = firstFrameRef.current;
    if (!frame) return;
    entranceStarted.current = true;
    // A pending animation applies no fill, so the class holds the frame at its
    // first key frame -- in this same synchronous block, so nothing paints
    // between. Declared in the markup it would park the page low for anyone
    // whose browser never ran this effect or who asked for less motion.
    frame.classList.add('flowmock-page-entrance');
    frame.animate(
      [{ translate: `0 ${PAGE_ENTER_OFFSET_PX}px` }, { translate: 'none' }],
      { duration: PAGE_ENTER_MS, easing: PAGE_ENTER_EASING, fill: 'forwards' },
    );
  }, []);
  const workspace = useMatches().some(match => isDashboardWorkspaceHandle(match.handle));
  // useOutlet keys its element on the context object, so a new context every
  // render remounts the held page.
  const outletContext = useMemo(() => ({ access } satisfies DashboardOutletContext), [access]);
  const outlet = useOutlet(outletContext);
  // The scroller belongs to the page, not the shell, so a held page keeps its
  // own scroll position while it leaves. Its content box is the one box in this
  // chain whose parent has a height for the workspace percentage to resolve.
  const page = <ScrollArea axes="vertical" className="h-full min-h-0" contentClassName={workspace ? 'h-full' : 'min-h-full'} noTabIndex>
    <div className={`${workspace ? SCROLLPORT_FILL_CLASS : ''} p-[22px_var(--flowmock-page-inset)_var(--flowmock-page-inset)] max-[680px]:p-4`}>{outlet}</div>
  </ScrollArea>;
  const frames = usePageFrames(page);

  return (
    <OutcomeToastProvider>
      <DocumentTitleSync />
      <a className="fixed left-3 top-3 z-[100000] -translate-y-20 rounded-md bg-fui-bg1 px-3 py-2 text-fui-fg1 shadow-lg focus:translate-y-0" href="#app-main">
        {t('nav.skip')}
      </a>
      <div className="grid grid-cols-[clamp(240px,18vw,290px)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] h-[100dvh] min-h-0 max-[900px]:grid-cols-1 max-[900px]:grid-rows-[58px_minmax(0,1fr)]">
        <div className="min-h-0 max-[900px]:hidden">
          <Sidebar />
        </div>
        <header className="hidden max-[900px]:flex items-center gap-3 border-b border-b-solid border-fui-divider px-4">
          <Button appearance="subtle" aria-label={t('nav.open')} icon={<NavigationRegular />} onClick={() => setNavigationOpen(true)} />
          <FlowMockLogo />
          <div className="ml-auto flex items-center gap-2"><LanguageSelector /></div>
        </header>
        <div className="grid grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] min-h-0">
          {frames.map(frame => <div
            aria-hidden={frame.leaving || undefined}
            className={`col-start-1 row-start-1 min-h-0 ${frame.leaving ? 'flowmock-page-leaving' : frame.id > 0 ? 'flowmock-page-entering' : ''}`}
            id={frame.leaving ? undefined : 'app-main'}
            role={frame.leaving ? undefined : 'main'}
            inert={frame.leaving}
            key={frame.id}
            onAnimationEnd={frame.onAnimationEnd}
            ref={frame.id === 0 && !frame.leaving ? firstFrameRef : undefined}
            tabIndex={frame.leaving ? undefined : -1}
          >{frame.node}</div>)}
        </div>
      </div>
      <OverlayDrawer
        aria-label={t('nav.label')}
        backdrop={{ className: 'flowmock-drawer-light-dismiss' }}
        onOpenChange={(_, data) => setNavigationOpen(data.open)}
        open={navigationOpen}
        position="start"
      >
        <DrawerBody className="!p-0">
          <Sidebar onNavigate={() => setNavigationOpen(false)} />
        </DrawerBody>
      </OverlayDrawer>
    </OutcomeToastProvider>
  );
}

export const useDashboardOutletContext = (): DashboardOutletContext => useOutletContext<DashboardOutletContext>();
