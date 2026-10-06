// Ported from Floway apps/web/src/components/logo.tsx (MIT). See NOTICE.md.
import logoUrl from '../assets/flowmock.svg?no-inline';

export function FlowMockLogo() {
  return (
    // The wordmark takes the primary text fill in both themes, as its WinUI
    // counterpart the navigation pane title does.
    // https://github.com/microsoft/microsoft-ui-xaml/blob/188f602b27cdb47572b28c380e9c087b02e1ccee/controls/dev/NavigationView/NavigationView.xaml#L198
    // https://github.com/microsoft/microsoft-ui-xaml/blob/188f602b27cdb47572b28c380e9c087b02e1ccee/controls/dev/NavigationView/NavigationView_themeresources.xaml#L21
    <div className="inline-flex items-center min-w-0 gap-2.5 text-fui-fg1">
      <img alt="" aria-hidden="true" className="block h-11 w-11 shrink-0 ml-[-1.5px]" src={logoUrl} />
      <span className="font-fui-semibold text-fui-base500 leading-[var(--lineHeightBase500)]">FlowMock</span>
    </div>
  );
}
