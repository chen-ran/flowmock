// Adapted from Floway apps/web/src/components/sidebar/pages.ts (MIT). See NOTICE.md.
import {
  BookDatabase20Color,
  ClipboardTextEdit20Color,
  Database20Color,
  Gauge20Color,
  History20Color,
  Home20Color,
  PersonKey20Color,
  Settings20Color,
} from '@fluentui/react-icons';
import type { FluentIcon } from '@fluentui/react-icons';

import type en from '../../i18n/locales/en.ts';

type NavStrings = typeof en['translation']['nav'];
type NavLabelKey = `nav.${{ [K in keyof NavStrings]: NavStrings[K] extends string ? K : never }[keyof NavStrings] & string}`;
type GroupLabelKey = `nav.groups.${keyof typeof en['translation']['nav']['groups'] & string}`;

export interface AppPage {
  to: string;
  labelKey: NavLabelKey;
  icon: FluentIcon;
}

export interface NavGroup {
  labelKey?: GroupLabelKey;
  items: AppPage[];
}

// The sidebar carries Fluent's multi-colour glyphs, as Floway's does, where
// WinUI's NavigationView draws monochrome ones. These assets hard-code their
// gradient stops and consume no currentColor, so a row's glyph holds its colour
// through hover, press and selection while the label takes the state brush.
// https://github.com/microsoft/microsoft-ui-xaml/blob/188f602b27cdb47572b28c380e9c087b02e1ccee/controls/dev/NavigationView/NavigationView_themeresources.xaml#L460-L491
export const navGroups: NavGroup[] = [
  {
    items: [
      { to: '/', labelKey: 'nav.overview', icon: Home20Color },
    ],
  },
  {
    labelKey: 'nav.groups.corpus',
    items: [
      { to: '/corpus', labelKey: 'nav.corpus', icon: Database20Color },
      { to: '/cassettes', labelKey: 'nav.cassettes', icon: BookDatabase20Color },
    ],
  },
  {
    labelKey: 'nav.groups.replay',
    items: [
      { to: '/scenarios', labelKey: 'nav.scenarios', icon: ClipboardTextEdit20Color },
      { to: '/keys', labelKey: 'nav.keys', icon: PersonKey20Color },
    ],
  },
  {
    labelKey: 'nav.groups.monitor',
    items: [
      { to: '/monitor', labelKey: 'nav.monitor', icon: Gauge20Color },
      { to: '/requests', labelKey: 'nav.requests', icon: History20Color },
    ],
  },
];

// Reached from the drawer's footer, below the pages that work on the corpus.
export const settingsPage: AppPage = { to: '/settings', labelKey: 'nav.settings', icon: Settings20Color };

export const appPages: AppPage[] = [...navGroups.flatMap(group => group.items), settingsPage];

// The page a path belongs to: the overview owns only its own root, every other
// page owns its subtree, so a detail page keeps its list selected.
export const pageForPath = (path: string): AppPage | undefined =>
  appPages.find(page => page.to === '/' ? path === '/' : path === page.to || path.startsWith(`${page.to}/`));
