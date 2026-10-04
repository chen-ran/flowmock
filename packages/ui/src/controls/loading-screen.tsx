// Ported from Floway apps/web/src/components/ui/loading-screen.tsx (MIT). See NOTICE.md.
import { fluentComponents } from '../fluent.ts';

const { Spinner } = fluentComponents;

export function AppLoadingScreen({ label }: { label: string }) {
  return <main className="flowmock-loading flowmock-loading-app"><Spinner label={label} /></main>;
}

export function ContentLoadingScreen({ label }: { label: string }) {
  return <div className="flowmock-loading"><Spinner label={label} /></div>;
}
