// Ported from Floway apps/web/src/components/ui/info-label.tsx (MIT). See NOTICE.md.
import type { InfoLabelProps, LabelProps } from '@fluentui/react-components';
import type { ReactNode } from 'react';

import { fluentComponents } from '../fluent.ts';

const { InfoLabel } = fluentComponents;

// Not for a Switch: its label carries `htmlFor`, so a click anywhere inside
// throws the switch and the info button never opens.
// https://react.fluentui.dev/?path=/docs/components-infolabel--docs
export const infoLabelSlot = (label: ReactNode, info: InfoLabelProps['info']) =>
  (_: unknown, slotProps: LabelProps) => <InfoLabel {...slotProps} info={info}>{label}</InfoLabel>;
