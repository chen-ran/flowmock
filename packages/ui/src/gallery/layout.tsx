// Ported from Floway apps/web/src/routes/dashboard-winui-gallery.tsx (MIT). See NOTICE.md.
import type { ReactNode } from 'react';

import { PANEL_STACK_CLASS } from '../controls/layout.ts';
import { Panel } from '../controls/panel.tsx';
import { SectionHeader } from '../controls/section-header.tsx';
import { fluentComponents } from '../fluent.ts';

const { Text } = fluentComponents;

// What the gallery test counts: one name per restyled Fluent family and per
// ported module that renders, so a module nobody mounts here fails the suite.
// display: contents keeps the marker out of the row's flex layout.
export function GalleryItem({ children, name }: { children: ReactNode; name: string }) {
  return <div className="contents" data-gallery-item={name}>{children}</div>;
}

export function Section({ children, id, item = `winui/${id}`, title }: { children: ReactNode; id: string; item?: string; title: string }) {
  return <section className="grid gap-4" data-gallery-item={item} id={id}>
    <SectionHeader level={2} title={title} />
    <Panel className={PANEL_STACK_CLASS}>{children}</Panel>
  </section>;
}

export function Row({ children, label }: { children: ReactNode; label: string }) {
  return <div className="grid gap-2">
    <Text size={200} weight="semibold" className="text-fui-fg2 uppercase tracking-wide">{label}</Text>
    <div className="flex flex-wrap items-center gap-3">{children}</div>
  </div>;
}

export function Hint({ children }: { children: ReactNode }) {
  return <Text italic size={200} className="text-fui-fg2">{children}</Text>;
}

export function StateLabel({ children, state }: { children: ReactNode; state: string }) {
  return <div className="grid justify-items-start gap-1">
    <div>{children}</div>
    <Text size={100} className="text-fui-fg2">{state}</Text>
  </div>;
}
