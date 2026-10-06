import { Outlet } from 'react-router';

import { requireAccess } from './guards.ts';

// The signed-in layout. Its shell arrives with the navigation; until then it
// only gates what it holds.
export async function clientLoader() {
  return { access: await requireAccess() };
}

export default function Dashboard() {
  return <Outlet />;
}
