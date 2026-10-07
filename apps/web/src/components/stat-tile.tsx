import { Panel } from '@flowmock/ui/controls/panel.tsx';
import { fluentComponents } from '@flowmock/ui/fluent';

const { Text } = fluentComponents;

// A figure and its name, in the type of Floway's usage summary tiles.
export function StatTile({ label, value }: { label: string; value: string }) {
  return <Panel className="!py-2 !px-3 min-h-[62px]">
    <span className="grid gap-1 min-w-0">
      <Text className="text-fui-fg2" size={200} weight="semibold">{label}</Text>
      <Text className="tabular-nums [overflow-wrap:anywhere]" size={500} weight="semibold">{value}</Text>
    </span>
  </Panel>;
}
