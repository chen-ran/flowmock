import { requireAccess } from './guards.ts';

export async function clientLoader() {
  await requireAccess();
  return null;
}

// The overview arrives with its own task; until then the index is the empty
// page the shell lands on.
export default function Index() {
  return <main />;
}
