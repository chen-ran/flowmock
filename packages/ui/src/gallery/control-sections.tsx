import { AreaChart, LineChart } from '@fluentui/react-charts';
import { DeleteRegular, DocumentRegular, ServerRegular } from '@fluentui/react-icons';
import { Suspense, useState } from 'react';

import { Hint, GalleryItem, Row, Section } from './layout.tsx';
import { ChartCalloutTable } from '../charts/callout-table.tsx';
import { useChartFrame } from '../charts/frame-styles.ts';
import { ChartHost } from '../charts/host.tsx';
import { colorForHue } from '../charts/palette.ts';
import { ChartSection } from '../charts/section.tsx';
import { withUniqueSeriesLegends } from '../charts/series-legends.ts';
import { SeriesMarker } from '../charts/series-marker.tsx';
import { areaSeries, lineSeries } from '../charts/series-plot.ts';
import { bucketFrames, chartTickValues, formatAxisDate } from '../charts/time-axis.ts';
import { BackNavigationButton } from '../controls/back-navigation-button.tsx';
import { Chip } from '../controls/chip.tsx';
import { ChoiceGroup } from '../controls/choice-group.tsx';
import { CodeBlock } from '../controls/code-block.tsx';
import { ConfirmDialog } from '../controls/confirm-dialog.tsx';
import { DashboardPageHeader } from '../controls/dashboard-page-header.tsx';
import { DialogShell } from '../controls/dialog-shell.tsx';
import { EmptyState, EmptyStateLine } from '../controls/empty-state.tsx';
import { ErrorShell, ErrorStack } from '../controls/error-shell.tsx';
import { Checkbox, Combobox, Dropdown, Input, Switch, Textarea } from '../controls/fluent-form-controls.tsx';
import { HttpMethodBadge, HttpStatusBadge } from '../controls/http-badge.tsx';
import { infoLabelSlot } from '../controls/info-label.tsx';
import { LazyBodyEditor, LazyYamlEditor } from '../controls/lazy-editors.ts';
import { ContentLoadingScreen } from '../controls/loading-screen.tsx';
import { MultiselectCombobox, valuesAsOptions } from '../controls/multiselect-combobox.tsx';
import { OutcomeMessageBar } from '../controls/outcome-message-bar.tsx';
import { OutcomeToastProvider, useOutcomeToasts } from '../controls/outcome-toast.tsx';
import { Panel } from '../controls/panel.tsx';
import { ResourceListActions, ResourceListEmptyState, ResourceListPanel } from '../controls/resource-list.tsx';
import { RouteLink } from '../controls/route-link.tsx';
import { RouteMenuItem } from '../controls/route-menu-item.tsx';
import { RowTitleButton } from '../controls/row-title.tsx';
import { ScrollArea } from '../controls/scroll-area.tsx';
import { SecretInput } from '../controls/secret-input.tsx';
import { SectionHeader } from '../controls/section-header.tsx';
import { SettingsCard, SettingsExpander, SettingsSwitch } from '../controls/settings-card.tsx';
import { StatusBadge } from '../controls/status-badge.tsx';
import { SwitchSetting } from '../controls/switch-setting.tsx';
import { TableCentredCell, TableCentredHeader, TableTrailingCell, TableTrailingHeader } from '../controls/table-actions.tsx';
import { TableColumns } from '../controls/table-columns.tsx';
import { TooltipIconButton } from '../controls/tooltip-icon-button.tsx';
import { TruncationTooltip } from '../controls/truncation-tooltip.tsx';
import { useCopyToClipboard } from '../controls/use-copy-to-clipboard.ts';
import { useDiscardGuard } from '../controls/use-discard-guard.tsx';
import { fluentComponents } from '../fluent.ts';

const {
  Button,
  DialogActions,
  DialogTitle,
  Field,
  Menu,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Option,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
} = fluentComponents;

const recordings = [
  { id: 'rec_01', model: 'claude-sonnet-5-5', protocol: 'anthropic-messages', outcome: 'completed', status: 200 },
  { id: 'rec_02', model: 'a-model-name-long-enough-to-be-cut-short-by-its-column', protocol: 'openai-responses', outcome: 'truncated', status: 529 },
];

function ShellSection() {
  const [showError, setShowError] = useState(false);

  return <Section id="shell" item="gallery/shell" title="Page shell">
    <Row label="page header">
      <GalleryItem name="controls/dashboard-page-header">
        <div className="w-full"><DashboardPageHeader actions={<Button appearance="primary">Record</Button>} description="A route's title, its one-line purpose and its actions." title="Recordings" /></div>
      </GalleryItem>
    </Row>
    <Row label="navigation - back, route link, route menu item">
      <GalleryItem name="controls/back-navigation-button"><BackNavigationButton to="/recordings">Recordings</BackNavigationButton></GalleryItem>
      <GalleryItem name="controls/route-link"><Text>Open the <RouteLink to="/scenarios">scenarios</RouteLink> page.</Text></GalleryItem>
      <GalleryItem name="controls/route-menu-item">
        <Menu>
          <MenuTrigger disableButtonEnhancement><Button>Go to</Button></MenuTrigger>
          <MenuPopover><MenuList>
            <RouteMenuItem icon={<DocumentRegular />} to="/recordings">Recordings</RouteMenuItem>
            <RouteMenuItem icon={<ServerRegular />} subText="Upstream targets" to="/targets">Targets</RouteMenuItem>
          </MenuList></MenuPopover>
        </Menu>
      </GalleryItem>
    </Row>
    <Row label="panel and section header">
      <GalleryItem name="controls/panel">
        <GalleryItem name="controls/section-header">
          <Panel className="grid w-full gap-3">
            <SectionHeader actions={<Button size="small">Edit</Button>} description="A section header names the block below it." info="It may carry an info button." level={3} title="Timeline" />
            <Text>Panel body.</Text>
          </Panel>
        </GalleryItem>
      </GalleryItem>
    </Row>
    <Row label="scroll area - overlay scrollbars on a fixed box">
      <GalleryItem name="controls/scroll-area">
        <Panel className="w-full" padding="flush">
          <ScrollArea axes="vertical" className="h-[120px]" contentClassName="grid gap-1 p-4">
            {Array.from({ length: 12 }, (_, index) => <Text key={index}>Frame {index + 1}: content_block_delta</Text>)}
          </ScrollArea>
        </Panel>
      </GalleryItem>
    </Row>
    <Row label="empty, loading and error states">
      <GalleryItem name="controls/empty-state">
        <Panel className="w-[320px]"><EmptyState description="Recordings appear once the proxy captures one." title="No recordings" /></Panel>
      </GalleryItem>
      <GalleryItem name="controls/loading-screen">
        <Panel className="h-[140px] w-[240px]"><ContentLoadingScreen label="Loading…" /></Panel>
      </GalleryItem>
      <GalleryItem name="controls/error-shell">
        <Button onClick={() => setShowError(true)}>Show the error shell</Button>
        {/* The shell fills the viewport by design, so it is shown over the page. */}
        {showError && <div className="fixed inset-0 z-50 bg-fui-bg1">
          <ErrorShell action={<Button appearance="primary" onClick={() => setShowError(false)}>Close</Button>} title="Something went wrong">
            <ErrorStack>{'TypeError: The recording has no frames.\n    at planReplay (engine.ts:42:11)\n    at replay (http.ts:88:5)'}</ErrorStack>
          </ErrorShell>
        </div>}
      </GalleryItem>
    </Row>
  </Section>;
}

function SettingsSection() {
  const [record, setRecord] = useState(true);
  const [persist, setPersist] = useState(false);
  const [faults, setFaults] = useState(true);
  const [range, setRange] = useState('1h');

  return <Section id="settings" item="gallery/settings" title="Settings">
    <GalleryItem name="controls/settings-card">
      <div className="grid w-full gap-1">
        <SettingsCard action={<SettingsSwitch checked={record} label="Record" onChange={setRecord} />} description="A setting the system remembered." header="Record upstream traffic" icon={<ServerRegular />} />
        <SettingsExpander action={<SettingsSwitch checked={persist} label="Persist" onChange={setPersist} />} description="Opens to the region it configures." header="Timeline persistence" toggledOn={persist}>
          <Text>Requests are kept for seven days.</Text>
        </SettingsExpander>
      </div>
    </GalleryItem>
    <Row label="switch setting and choice group">
      <GalleryItem name="controls/switch-setting"><SwitchSetting checked={faults} description="Applies to new requests." label="Inject faults" onChange={setFaults} /></GalleryItem>
      <GalleryItem name="controls/choice-group">
        <ChoiceGroup ariaLabel="Range" items={[{ value: '1h', label: '1 hour' }, { value: '24h', label: '24 hours' }, { value: '7d', label: '7 days' }]} onChange={setRange} value={range} />
      </GalleryItem>
    </Row>
  </Section>;
}

function ToastButton() {
  const toasts = useOutcomeToasts();
  return <Button onClick={() => {
    const handle = toasts.start('Importing the cassette…');
    window.setTimeout(() => handle.succeed('Imported 19 recordings'), 1200);
  }}>Import with a toast</Button>;
}

function DataDisplaySection() {
  const copy = useCopyToClipboard();
  const [showEmpty, setShowEmpty] = useState(false);

  return <Section id="data-display" item="gallery/data-display" title="Data display">
    <Row label="badges and chips">
      <GalleryItem name="controls/status-badge">
        <StatusBadge tone="success">completed</StatusBadge>
        <StatusBadge tone="warning">truncated</StatusBadge>
        <StatusBadge tone="danger">failed</StatusBadge>
        <StatusBadge tone="accent">replay</StatusBadge>
        <StatusBadge tone="neutral">idle</StatusBadge>
      </GalleryItem>
      <GalleryItem name="controls/http-badge">
        <HttpMethodBadge method="POST" />
        <HttpStatusBadge severity="success">200</HttpStatusBadge>
        <HttpStatusBadge severity="warning">429</HttpStatusBadge>
        <HttpStatusBadge severity="error">529</HttpStatusBadge>
      </GalleryItem>
      <GalleryItem name="controls/chip"><Chip>claude-sonnet-5-5</Chip></GalleryItem>
      <GalleryItem name="controls/tooltip-icon-button">
        <TooltipIconButton icon={<DocumentRegular />} label="Open" onClick={() => {}} />
        <TooltipIconButton danger icon={<DeleteRegular />} label="Delete" onClick={() => {}} />
      </GalleryItem>
    </Row>
    <Row label="resource list - actions, table with row titles, truncation and trailing cells">
      <GalleryItem name="controls/resource-list">
        <div className="grid w-full gap-3">
          <ResourceListActions createLabel="New recording" onCreate={() => {}} onRefresh={() => setShowEmpty(empty => !empty)} refreshLabel="Refresh" />
          <ResourceListPanel>
            {showEmpty ? <ResourceListEmptyState>No recordings match the filter.</ResourceListEmptyState> : <GalleryItem name="controls/table-actions"><GalleryItem name="controls/table-columns">
              <Table aria-label="Recordings">
                <TableColumns widths={[null, '200px', '96px', '96px']} />
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Model</TableHeaderCell>
                    <TableHeaderCell>Protocol</TableHeaderCell>
                    <TableCentredHeader>Status</TableCentredHeader>
                    <TableTrailingHeader>Actions</TableTrailingHeader>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recordings.map(recording => <TableRow key={recording.id}>
                    <TableCell>
                      <GalleryItem name="controls/row-title">
                        <GalleryItem name="controls/truncation-tooltip">
                          <TruncationTooltip content={recording.model} relationship="label">
                            {measureRef => <RowTitleButton onClick={() => {}} ref={measureRef}>{recording.model}</RowTitleButton>}
                          </TruncationTooltip>
                        </GalleryItem>
                      </GalleryItem>
                    </TableCell>
                    <TableCell>{recording.protocol}</TableCell>
                    <TableCentredCell><HttpStatusBadge severity={recording.status < 400 ? 'success' : 'error'}>{recording.status}</HttpStatusBadge></TableCentredCell>
                    <TableTrailingCell><TooltipIconButton danger icon={<DeleteRegular />} label="Delete" onClick={() => {}} /></TableTrailingCell>
                  </TableRow>)}
                </TableBody>
              </Table>
            </GalleryItem></GalleryItem>}
          </ResourceListPanel>
        </div>
      </GalleryItem>
    </Row>
    <Row label="code block and outcomes">
      <GalleryItem name="controls/code-block">
        <div className="w-full">
          <CodeBlock code={'{\n  "model": "claude-sonnet-5-5",\n  "stream": true\n}'} copyOutcome={copy.outcomeFor()} language="json" onCopy={() => copy.copy('{"model":"claude-sonnet-5-5","stream":true}')} />
        </div>
      </GalleryItem>
      <GalleryItem name="controls/outcome-message-bar">
        <div className="w-full"><OutcomeMessageBar onDismiss={() => {}} title="Import failed">The file is not a FlowMock cassette.</OutcomeMessageBar></div>
      </GalleryItem>
      <GalleryItem name="controls/outcome-toast"><OutcomeToastProvider><ToastButton /></OutcomeToastProvider></GalleryItem>
    </Row>
  </Section>;
}

function GuardedDialog({ onClose, open }: { onClose: () => void; open: boolean }) {
  const [name, setName] = useState('demo');
  const { discardConfirmation, requestClose } = useDiscardGuard({ onClose, values: { name } });
  return <>
    <DialogShell actions={<DialogActions><Button onClick={requestClose}>Cancel</Button><Button appearance="primary" onClick={onClose}>Save</Button></DialogActions>} onOpenChange={(_, data) => { if (!data.open) requestClose(); }} open={open} title={<DialogTitle>Edit the scenario</DialogTitle>}>
      <Field label="Name"><Input onChange={(_, data) => setName(data.value)} value={name} /></Field>
      <Hint>Change the name, then cancel: the discard guard asks first.</Hint>
    </DialogShell>
    {discardConfirmation}
  </>;
}

function FormsSection() {
  const [models, setModels] = useState(['claude-sonnet-5-5']);
  const [editing, setEditing] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const [confirming, setConfirming] = useState(false);

  return <Section id="forms" item="gallery/forms" title="Forms and dialogs">
    <Row label="form controls">
      <GalleryItem name="controls/fluent-form-controls">
        <Field label="Name"><Input placeholder="A scenario name" /></Field>
        <Field label="Protocol">
          <Dropdown placeholder="Pick one">
            <Option>anthropic-messages</Option>
            <Option>openai-chat-completions</Option>
          </Dropdown>
        </Field>
        <Field label="Model">
          <Combobox freeform placeholder="Type or pick">
            <Option>claude-sonnet-5-5</Option>
            <Option>gpt-5</Option>
          </Combobox>
        </Field>
        <Checkbox defaultChecked label="Stream" />
        <Switch defaultChecked label="Enabled" />
        <Field className="w-full" label="Notes"><Textarea placeholder="What this scenario reproduces" /></Field>
      </GalleryItem>
    </Row>
    <Row label="secret, multiselect and info label">
      <GalleryItem name="controls/secret-input"><Field label="Upstream key"><SecretInput defaultValue="sk-ant-example" /></Field></GalleryItem>
      <GalleryItem name="controls/multiselect-combobox">
        <Field label="Models">
          <MultiselectCombobox ariaLabel="Models" onChange={setModels} options={valuesAsOptions(['claude-sonnet-5-5', 'claude-opus-5-5', 'gpt-5'])} placeholder="Pick models" value={models} />
        </Field>
      </GalleryItem>
      <GalleryItem name="controls/info-label"><Field label={{ children: infoLabelSlot('Seed', 'Every random choice is drawn from this seed.') }}><Input defaultValue="42" /></Field></GalleryItem>
    </Row>
    <Row label="dialogs - shell with a discard guard, confirmation">
      <GalleryItem name="controls/dialog-shell">
        <GalleryItem name="controls/use-discard-guard">
          <Button onClick={() => { setEditKey(key => key + 1); setEditing(true); }}>Edit in a dialog</Button>
          <GuardedDialog key={editKey} onClose={() => setEditing(false)} open={editing} />
        </GalleryItem>
      </GalleryItem>
      <GalleryItem name="controls/confirm-dialog">
        <Button onClick={() => setConfirming(true)}>Delete with confirmation</Button>
        <ConfirmDialog actionLabel="Delete" message="The scenario and its history are removed." onConfirm={() => setConfirming(false)} onOpenChange={setConfirming} open={confirming} title="Delete the scenario?" />
      </GalleryItem>
    </Row>
  </Section>;
}

const scenarioSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'The scenario\'s name.' },
    stream: { type: 'boolean', description: 'Whether replies stream.' },
  },
  required: ['name'],
  additionalProperties: false,
};

function EditorsSection() {
  const [scenario, setScenario] = useState('name: demo\nstream: sometimes\n');

  return <Section id="editors" item="gallery/editors" title="Editors">
    <Hint>Both load Monaco on first render. The YAML document breaks its schema on purpose.</Hint>
    <div className="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
      <GalleryItem name="controls/body-editor">
        <Panel className="h-[220px]" padding="flush">
          <Suspense fallback={<ContentLoadingScreen label="Loading…" />}>
            <LazyBodyEditor json label="Response body" text={'{\n  "id": "msg_01",\n  "type": "message",\n  "content": [{ "type": "text", "text": "Hello" }]\n}'} />
          </Suspense>
        </Panel>
      </GalleryItem>
      <GalleryItem name="controls/yaml-editor">
        <Panel className="h-[220px]" padding="flush">
          <Suspense fallback={<ContentLoadingScreen label="Loading…" />}>
            <LazyYamlEditor label="Scenario" onChange={setScenario} schema={scenarioSchema} value={scenario} />
          </Suspense>
        </Panel>
      </GalleryItem>
    </div>
  </Section>;
}

const chartBuckets = bucketFrames('today', Date.UTC(2026, 9, 5, 9, 30));
const chartEntries = withUniqueSeriesLegends([
  { id: 'p50', label: 'TTFT p50', hue: 251 },
  { id: 'p90', label: 'TTFT p90', hue: 144 },
]);
const wave = (offset: number, scale: number) =>
  chartBuckets.map((bucket, index) => ({ x: bucket.date, y: Math.round(scale * (1.4 + Math.sin(index / 3 + offset))) }));

function ChartsSection() {
  const [hidden, setHidden] = useState(new Set<string>());
  const frame = useChartFrame();
  const visible = chartEntries.filter(entry => !hidden.has(entry.id));
  const ticks = chartTickValues(chartBuckets).map(bucket => bucket.date);
  const axis = (date: Date) => formatAxisDate(date, 'today', 'en-US');

  return <Section id="charts" item="gallery/charts" title="Charts">
    <GalleryItem name="charts/section">
      <ChartSection controlsLabel="Series" emptyText="No series" entries={chartEntries} hidden={hidden} onHiddenChange={setHidden} title="Time to first token">
        <GalleryItem name="charts/host">
          <ChartHost className="flowmock-gallery-line-chart" emptyText="Nothing in range" hasData={visible.length > 0}>
            {({ size }) => <LineChart customDateTimeFormatter={axis} data={{ lineChartData: visible.map((entry, index) => lineSeries(entry, wave(index, 200 + index * 120))) }} height={size.height} hideLegend styles={frame} tickValues={ticks} width={size.width} />}
          </ChartHost>
        </GalleryItem>
      </ChartSection>
    </GalleryItem>
    <ChartHost className="flowmock-gallery-area-chart" emptyText="Nothing in range" hasData>
      {({ size }) => <AreaChart customDateTimeFormatter={axis} data={{ lineChartData: [areaSeries(chartEntries[0]!, wave(1, 300))] }} height={size.height} hideLegend styles={frame} tickValues={ticks} width={size.width} />}
    </ChartHost>
    <Row label="series marker and callout table">
      <GalleryItem name="charts/series-marker"><SeriesMarker color={colorForHue(251)} /><SeriesMarker color={colorForHue(144)} /></GalleryItem>
      <GalleryItem name="charts/callout-table">
        <Panel>
          <ChartCalloutTable
            columns={[{ key: 'requests', label: 'Requests' }, { key: 'ttft', label: 'TTFT' }]}
            rows={chartEntries.map((entry, index) => ({ color: colorForHue(entry.hue), key: entry.id, label: entry.label, values: [String(120 - index * 40), `${340 + index * 210} ms`] }))}
            title="09:00"
          />
        </Panel>
      </GalleryItem>
    </Row>
    <EmptyStateLine>Every chart stands in the same reserved height, so a page does not reflow when data arrives.</EmptyStateLine>
  </Section>;
}

// Every module this package ports that renders, outside the restyled Fluent
// families the WinUI sections cover.
export function ControlSections() {
  return <>
    <ShellSection />
    <SettingsSection />
    <DataDisplaySection />
    <FormsSection />
    <EditorsSection />
    <ChartsSection />
  </>;
}
