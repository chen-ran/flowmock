import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import criticalCss from 'virtual:flowmock-critical.css?inline';
import winuiStylesheet from 'virtual:flowmock-winui.css?url';

import { fluentComponents } from '../src/fluent.ts';
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

  return <main className="grid gap-8 p-[var(--flowmock-page-inset)]">
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

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
