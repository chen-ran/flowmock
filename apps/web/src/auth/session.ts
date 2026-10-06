// Ported from Floway apps/web/src/auth/session.ts (MIT). See NOTICE.md.
export const flowmockSessionStorageKey = 'flowmock-admin-session';
// Distinct from the data plane's x-flowmock-session, which names a replay
// session rather than an admin one.
export const flowmockSessionHeader = 'x-flowmock-admin-session';

const sessionInvalidatedEvent = 'flowmock-session-invalidated';

// Guards the build-time prerender pass, which has no DOM. Storage switched off
// is deliberately unguarded: a session that cannot persist should throw.
const hasWindow = (): boolean => typeof window !== 'undefined';

export const getSessionToken = (): string | null => {
  if (!hasWindow()) return null;
  return window.localStorage.getItem(flowmockSessionStorageKey);
};

export const setSessionToken = (token: string): void => {
  if (!hasWindow()) return;
  window.localStorage.setItem(flowmockSessionStorageKey, token);
};

export const clearSessionToken = (): void => {
  if (!hasWindow()) return;
  window.localStorage.removeItem(flowmockSessionStorageKey);
};

// Only the token a 401 answered for is cleared: a sign-in that replaced it
// while the request was in flight stands.
export const invalidateSession = (expectedToken: string | null): void => {
  if (getSessionToken() !== expectedToken) return;
  clearSessionToken();
  if (!hasWindow()) return;
  window.dispatchEvent(new Event(sessionInvalidatedEvent));
};

export const onSessionInvalidated = (listener: () => void): (() => void) => {
  if (!hasWindow()) return () => undefined;
  window.addEventListener(sessionInvalidatedEvent, listener);
  return () => window.removeEventListener(sessionInvalidatedEvent, listener);
};
