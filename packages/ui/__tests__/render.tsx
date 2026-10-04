// Ported from Floway apps/web/__tests__/render.tsx (MIT). See NOTICE.md.
import { render } from '@testing-library/react';
import type { PropsWithChildren, ReactNode } from 'react';

import { fluentComponents } from '../src/fluent.ts';
import { winuiLightTheme } from '../src/winui/theme.ts';

const { FluentProvider } = fluentComponents;

const AppWrapper = ({ children }: PropsWithChildren) =>
  <FluentProvider theme={winuiLightTheme}>{children}</FluentProvider>;

// `src/root.tsx` mounts `winuiLightTheme` / `winuiDarkTheme`, never the stock
// Fluent theme they are built from. A suite that provides its own theme
// renders a tree the WinUI layer never reached, so every DOM suite goes
// through here and sees the tokens the app actually ships.
export const renderInApp = (node: ReactNode) =>
  render(node, { wrapper: AppWrapper });
