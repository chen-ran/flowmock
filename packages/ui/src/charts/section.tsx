// Ported from Floway apps/web/src/components/charts/section.tsx (MIT). See NOTICE.md.
import { SelectAllOffRegular, SelectAllOnRegular, SquareMultipleRegular } from '@fluentui/react-icons';

import { chartHeight } from './layout.ts';
import { colorForHue } from './palette.ts';
import type { SeriesLegendEntry } from './series-legends.ts';
import { SeriesMarker } from './series-marker.tsx';
import { invertedSeries, isolatedSeries, toggledSeries } from './series-selection.ts';
import { EmptyStateLine } from '../controls/empty-state.tsx';
import { SectionHeader } from '../controls/section-header.tsx';
import { fluentComponents } from '../fluent.ts';
import { useUiTranslation } from '../i18n/ui-translation.ts';

const { InteractionTag, InteractionTagPrimary, Toolbar, ToolbarButton, Tooltip } = fluentComponents;

export function ChartSection({
  children,
  controlsLabel,
  emptyText,
  entries,
  hidden,
  onHiddenChange,
  title,
}: {
  children: React.ReactNode;
  controlsLabel: string;
  emptyText: string;
  entries: readonly SeriesLegendEntry[];
  hidden: Set<string>;
  onHiddenChange: (next: Set<string>) => void;
  title: string;
}) {
  const { t } = useUiTranslation();
  const ids = entries.map(entry => entry.id);
  const isolate = (id: string) => onHiddenChange(isolatedSeries(ids, hidden, id));

  return (
    <section className="grid gap-3 min-w-0">
      <SectionHeader level={2} title={title} actions={
        <Toolbar aria-label={controlsLabel} className="!p-0" size="small">
          <Tooltip content={t('ui.chartSeries.all')} relationship="label">
            <ToolbarButton aria-label={t('ui.chartSeries.all')} icon={<SelectAllOnRegular />} onClick={() => onHiddenChange(new Set())} />
          </Tooltip>
          <Tooltip content={t('ui.chartSeries.none')} relationship="label">
            <ToolbarButton aria-label={t('ui.chartSeries.none')} icon={<SelectAllOffRegular />} onClick={() => onHiddenChange(new Set(ids))} />
          </Tooltip>
          <Tooltip content={t('ui.chartSeries.invert')} relationship="label">
            <ToolbarButton aria-label={t('ui.chartSeries.invert')} icon={<SquareMultipleRegular />} onClick={() => onHiddenChange(invertedSeries(ids, hidden))} />
          </Tooltip>
        </Toolbar>
      } />

      {entries.length
        ? <div className="flex flex-wrap gap-1.5 min-w-0">
            {entries.map(entry => (
              <InteractionTag appearance="outline" key={entry.id} shape="circular" size="small">
                <Tooltip content={t('ui.chartSeries.toggleHint')} relationship="description">
                  <InteractionTagPrimary
                    className={hidden.has(entry.id) ? 'line-through opacity-[0.55]' : ''}
                    icon={<SeriesMarker className="mx-[4px]" color={colorForHue(entry.hue)} />}
                    // A double-click's two clicks land on this same series and cancel out, so the isolate that follows starts from the state the reader saw.
                    onClick={event => { if (event.shiftKey) isolate(entry.id); else onHiddenChange(toggledSeries(hidden, entry.id)); }}
                    onDoubleClick={() => isolate(entry.id)}
                  >
                    {entry.label}
                  </InteractionTagPrimary>
                </Tooltip>
              </InteractionTag>
            ))}
          </div>
        : <EmptyStateLine>{emptyText}</EmptyStateLine>}

      <div className="min-w-0" style={{ minHeight: chartHeight }}>{children}</div>
    </section>
  );
}
