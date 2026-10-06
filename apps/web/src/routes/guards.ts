// Adapted from Floway apps/web/src/routes/guards.ts (MIT). See NOTICE.md.
import { redirect } from 'react-router';

import { useAuthStore } from '../stores/auth-store.ts';

// Every page gates itself in its own clientLoader: React Router runs matched
// loaders in parallel and does not re-run an already matched parent on a child
// navigation, so a layout's gate alone would let a page load its data before
// the redirect lands. The answer is cached per token, so the gates cost one
// request between them.
export const requireAccess = async () => {
  const access = await useAuthStore.getState().initialize();
  if (access) return access;
  const { error } = useAuthStore.getState();
  // A server that did not answer is not a refused sign-in; sending the reader
  // to the login form would hide the failure behind a form that cannot help.
  if (error) throw new Error(error.message, { cause: error });
  throw redirect('/login');
};
