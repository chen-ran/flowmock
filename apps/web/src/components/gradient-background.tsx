// Ported from Floway apps/web/src/components/gradient-background.tsx (MIT). See NOTICE.md.
import type { PropsWithChildren } from 'react';

export function GradientBackground({ children }: PropsWithChildren) {
  return <div className="flowmock-gradient-background">{children}</div>;
}
