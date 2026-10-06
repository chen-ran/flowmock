import { render } from '@testing-library/react';
import type { PropsWithChildren, ReactNode } from 'react';

import { fluentComponents } from '@flowmock/ui/fluent';
import { winuiLightTheme } from '@flowmock/ui/theme';

const { FluentProvider } = fluentComponents;

const AppWrapper = ({ children }: PropsWithChildren) =>
  <FluentProvider theme={winuiLightTheme}>{children}</FluentProvider>;

// The app mounts the WinUI themes, never the stock Fluent theme they are built
// from, so every DOM suite goes through here.
export const renderInApp = (node: ReactNode) => render(node, { wrapper: AppWrapper });
