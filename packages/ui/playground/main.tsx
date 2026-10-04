import { DeleteRegular, ServerRegular } from '@fluentui/react-icons';
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router';
import criticalCss from 'virtual:flowmock-critical.css?inline';
import winuiStylesheet from 'virtual:flowmock-winui.css?url';

import { BackNavigationButton } from '../src/controls/back-navigation-button.tsx';
import { Chip } from '../src/controls/chip.tsx';
import { ChoiceGroup } from '../src/controls/choice-group.tsx';
import { CodeBlock } from '../src/controls/code-block.tsx';
import { ConfirmDialog } from '../src/controls/confirm-dialog.tsx';
import { DashboardPageHeader } from '../src/controls/dashboard-page-header.tsx';
import { EmptyState } from '../src/controls/empty-state.tsx';
import { HttpMethodBadge, HttpStatusBadge } from '../src/controls/http-badge.tsx';
import { PANEL_STACK_CLASS } from '../src/controls/layout.ts';
import { ContentLoadingScreen } from '../src/controls/loading-screen.tsx';
import { MultiselectCombobox, valuesAsOptions } from '../src/controls/multiselect-combobox.tsx';
import { OutcomeMessageBar } from '../src/controls/outcome-message-bar.tsx';
import { Panel } from '../src/controls/panel.tsx';
import { RouteLink } from '../src/controls/route-link.tsx';
import { SecretInput } from '../src/controls/secret-input.tsx';
import { SectionHeader } from '../src/controls/section-header.tsx';
import { SettingsCard, SettingsExpander, SettingsSwitch } from '../src/controls/settings-card.tsx';
import { StatusBadge } from '../src/controls/status-badge.tsx';
import { SwitchSetting } from '../src/controls/switch-setting.tsx';
import { TooltipIconButton } from '../src/controls/tooltip-icon-button.tsx';
import { useCopyToClipboard } from '../src/controls/use-copy-to-clipboard.ts';
import { fluentComponents } from '../src/fluent.ts';
import { initI18n } from '../src/i18n/init.ts';
import { useSystemTheme } from '../src/theme.ts';
import '../src/global.css';

const {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  DialogTrigger,
  Dropdown,
  Field,
  FluentProvider,
  Input,
  MessageBar,
  MessageBarBody,
  Option,
  ProgressBar,
  Radio,
  RadioGroup,
  Spinner,
  Switch,
  Tab,
  TabList,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Toast,
  ToastTitle,
  Toaster,
  Tooltip,
  useId,
  useToastController,
} = fluentComponents;

// The critical block is inlined and the WinUI layer linked after it, ahead of
// Griffel's runtime sheets, which is the order an app's document carries them in.
const style = document.createElement('style');
style.textContent = criticalCss;
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = winuiStylesheet;
document.head.append(style, link);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="grid gap-3">
  <Text as="h2" size={500} weight="semibold">{title}</Text>
  <div className="flex flex-wrap items-center gap-3">{children}</div>
</section>;

const rows = [
  { name: 'anthropic-messages', recordings: 12, outcome: 'completed' },
  { name: 'openai-responses', recordings: 7, outcome: 'truncated' },
];

const Playground = () => {
  const toasterId = useId('toaster');
  const { dispatchToast } = useToastController(toasterId);
  const [switchOn, setSwitchOn] = useState(true);
  const copy = useCopyToClipboard();
  const [range, setRange] = useState('1h');
  const [models, setModels] = useState<string[]>(['claude-sonnet-5-5']);
  const [confirming, setConfirming] = useState(false);

  return <main className="grid gap-8 p-[var(--flowmock-page-inset)]">
    <DashboardPageHeader actions={<Button appearance="primary">Action</Button>} description="Controls rendered through the WinUI layer." title="Playground" />
    <Section title="Shell">
      <div className="grid w-full gap-3">
        <div><BackNavigationButton to="/recordings">Recordings</BackNavigationButton></div>
        <Panel className={PANEL_STACK_CLASS}>
          <SectionHeader description="A panel stacks a heading over its body." level={2} title="Panel" />
          <Text>Body text with a <RouteLink to="/scenarios">route link</RouteLink>.</Text>
        </Panel>
        <SettingsCard description="A setting the system remembered." header="Record upstream traffic" icon={<ServerRegular />} action={<SettingsSwitch checked={switchOn} label="Record" onChange={setSwitchOn} />} />
        <SettingsExpander description="Opens to its own region." header="Timeline persistence" toggledOn={switchOn} action={<SettingsSwitch checked={switchOn} label="Persist" onChange={setSwitchOn} />}>
          <Text>Retained for seven days.</Text>
        </SettingsExpander>
        <Panel><EmptyState description="Recordings appear here once the proxy captures one." title="No recordings" /></Panel>
        <Panel className="h-[160px]"><ContentLoadingScreen label="Loading…" /></Panel>
      </div>
    </Section>
    <Section title="Data display">
      <StatusBadge tone="success">completed</StatusBadge>
      <StatusBadge tone="warning">truncated</StatusBadge>
      <StatusBadge tone="danger">failed</StatusBadge>
      <StatusBadge tone="accent">replay</StatusBadge>
      <StatusBadge tone="neutral">idle</StatusBadge>
      <HttpMethodBadge method="POST" />
      <HttpStatusBadge severity="success">200</HttpStatusBadge>
      <HttpStatusBadge severity="error">529</HttpStatusBadge>
      <Chip>claude-sonnet-5-5</Chip>
      <TooltipIconButton icon={<DeleteRegular />} label="Delete" danger onClick={() => {}} />
      <div className="grid w-full gap-3">
        <OutcomeMessageBar intent="error" title="Import failed" onDismiss={() => {}}>The file is not a FlowMock cassette.</OutcomeMessageBar>
        <CodeBlock code={'{\n  "model": "claude-sonnet-5-5",\n  "stream": true\n}'} copyOutcome={copy.outcomeFor()} language="json" onCopy={() => copy.copy('{}')} />
      </div>
    </Section>
    <Section title="Forms and dialogs">
      <ChoiceGroup ariaLabel="Range" items={[{ value: '1h', label: '1 hour' }, { value: '24h', label: '24 hours' }, { value: '7d', label: '7 days' }]} onChange={setRange} value={range} />
      <SwitchSetting checked={switchOn} description="Applies to new requests." label="Inject faults" onChange={setSwitchOn} />
      <Field label="Upstream key"><SecretInput defaultValue="sk-ant-example" /></Field>
      <Field label="Models">
        <MultiselectCombobox ariaLabel="Models" onChange={setModels} options={valuesAsOptions(['claude-sonnet-5-5', 'claude-opus-5-5', 'gpt-5'])} placeholder="Pick models" value={models} />
      </Field>
      <Button onClick={() => setConfirming(true)}>Confirm dialog</Button>
      <ConfirmDialog actionLabel="Delete" message="The scenario and its history are removed." onConfirm={() => setConfirming(false)} onOpenChange={setConfirming} open={confirming} title="Delete the scenario?" />
    </Section>
    <Section title="Buttons">
      <Button appearance="primary">Primary</Button>
      <Button>Secondary</Button>
      <Button appearance="subtle">Subtle</Button>
      <Button appearance="transparent">Transparent</Button>
      <Button disabled>Disabled</Button>
      <Tooltip content="A WinUI tooltip" relationship="label"><Button>Tooltip</Button></Tooltip>
    </Section>
    <Section title="Selection">
      <Switch checked={switchOn} label={switchOn ? 'On' : 'Off'} onChange={(_, data) => setSwitchOn(data.checked)} />
      <Checkbox defaultChecked label="Checked" />
      <Checkbox checked="mixed" label="Mixed" />
      <RadioGroup defaultValue="a" layout="horizontal">
        <Radio label="First" value="a" />
        <Radio label="Second" value="b" />
      </RadioGroup>
    </Section>
    <Section title="Fields">
      <Field label="Name"><Input placeholder="Placeholder" /></Field>
      <Field label="Protocol">
        <Dropdown placeholder="Pick one">
          <Option>anthropic-messages</Option>
          <Option>openai-chat-completions</Option>
        </Dropdown>
      </Field>
    </Section>
    <Section title="Table">
      <Table aria-label="Recordings" className="max-w-[640px]">
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Protocol</TableHeaderCell>
            <TableHeaderCell>Recordings</TableHeaderCell>
            <TableHeaderCell>Outcome</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(row => <TableRow key={row.name}>
            <TableCell>{row.name}</TableCell>
            <TableCell>{row.recordings}</TableCell>
            <TableCell><Badge appearance="tint">{row.outcome}</Badge></TableCell>
          </TableRow>)}
        </TableBody>
      </Table>
    </Section>
    <Section title="Overlays">
      <Dialog>
        <DialogTrigger disableButtonEnhancement><Button>Open dialog</Button></DialogTrigger>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Delete the recording</DialogTitle>
            <DialogContent>The recording and its chunk file are removed.</DialogContent>
            <DialogActions>
              <DialogTrigger disableButtonEnhancement><Button>Cancel</Button></DialogTrigger>
              <Button appearance="primary">Delete</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      <Button onClick={() => dispatchToast(<Toast><ToastTitle>Recording saved</ToastTitle></Toast>, { intent: 'success' })}>Show toast</Button>
      <Toaster toasterId={toasterId} />
    </Section>
    <Section title="Status">
      <MessageBar intent="info"><MessageBarBody>Informational message</MessageBarBody></MessageBar>
      <MessageBar intent="warning"><MessageBarBody>Warning message</MessageBarBody></MessageBar>
      <MessageBar intent="error"><MessageBarBody>Error message</MessageBarBody></MessageBar>
      <MessageBar intent="success"><MessageBarBody>Success message</MessageBarBody></MessageBar>
      <div className="w-[240px]"><ProgressBar value={0.6} /></div>
      <Spinner size="small" />
      <TabList defaultSelectedValue="corpus">
        <Tab value="corpus">Corpus</Tab>
        <Tab value="scenarios">Scenarios</Tab>
        <Tab value="keys">Keys</Tab>
      </TabList>
    </Section>
  </main>;
};

// The critical block pins the document to the viewport, so the page brings its
// own scroller. It sits inside the provider: Fluent copies the provider's
// className onto every portal mount node, where a box would cover the page.
const App = () => <FluentProvider theme={useSystemTheme()}>
  <div className="fixed inset-0 overflow-auto bg-fui-bg1"><Playground /></div>
</FluentProvider>;

// The playground has no catalogue of its own; the controls bring theirs.
await initI18n({
  loadLocale: async () => await Promise.resolve({ translation: {} }),
  shell: { translation: {} },
});

const router = createMemoryRouter([{ path: '*', element: <App /> }]);

createRoot(document.getElementById('root')!).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
