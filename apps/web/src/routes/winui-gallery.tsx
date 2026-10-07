import { requireAccess } from './guards.ts';
import { Gallery } from '@flowmock/ui/gallery';

export async function clientLoader() {
  await requireAccess();
  return null;
}

// Every control the app draws, in one place, for judging the WinUI layer.
// Registered in development builds only; see ../routes.ts.
export default function WinuiGallery() {
  return <Gallery />;
}
