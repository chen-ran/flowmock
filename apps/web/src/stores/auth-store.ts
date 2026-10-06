// Adapted from Floway apps/web/src/stores/auth-store.ts (MIT). See NOTICE.md.
import { create } from 'zustand';
import type { StoreApi } from 'zustand';

import { api, callApi, callApiNoContent, type GlobalError } from '../api/client.ts';
import { clearSessionToken, getSessionToken, onSessionInvalidated, setSessionToken } from '../auth/session.ts';

// How the server let this browser in: a session exchanged for the admin key,
// or open because the server was started without one.
export type AdminVia = 'session' | 'admin-key' | 'open';

// ../auth/session.ts owns the token. The store holds only what the server
// answered for one, and holds the two together, so a cached answer can never be
// read against a token it did not come from. An open server answers for no
// token at all, which is why a missing token still asks.
interface Access {
  token: string | null;
  via: AdminVia;
}

interface AuthStore {
  access: Access | null;
  error: GlobalError | null;
  clear: () => void;
  logout: () => Promise<void>;
  initialize: () => Promise<Access | null>;
  refresh: () => Promise<Access | null>;
  primeFromLogin: (token: string) => void;
}

let accessRequest: { id: object; token: string | null; promise: Promise<Access | null> } | null = null;

const accessFor = (get: StoreApi<AuthStore>['getState'], token: string | null): Access | null => {
  const { access } = get();
  return access?.token === token ? access : null;
};

const loadAccess = (
  set: StoreApi<AuthStore>['setState'],
  get: StoreApi<AuthStore>['getState'],
  force: boolean,
): Promise<Access | null> => {
  const token = getSessionToken();
  const cached = accessFor(get, token);
  // The in-flight check comes first: a pending request keeps the previous answer
  // in place when the token is unchanged, so the cached fast path below would
  // otherwise resolve a caller from an answer the request may replace.
  if (accessRequest?.token === token) return accessRequest.promise;
  if (!force && cached) return Promise.resolve(cached);

  set({ access: cached, error: null });
  const requestId = {};
  const promise = callApi(() => api.auth.me.$get()).then(result => {
    if (accessRequest?.id !== requestId || getSessionToken() !== token) {
      return accessFor(get, getSessionToken());
    }
    accessRequest = null;
    if (result.data) {
      const access = { token, via: result.data.via };
      set({ access, error: null });
      return access;
    }
    if (result.error.status === 401) {
      get().clear();
      return null;
    }
    set({ access: accessFor(get, token), error: result.error });
    return null;
  });
  accessRequest = { id: requestId, token, promise };
  return promise;
};

export const useAuthStore = create<AuthStore>((set, get) => ({
  access: null,
  error: null,

  clear: () => {
    accessRequest = null;
    clearSessionToken();
    set({ access: null, error: null });
  },

  // Local sign-out intent takes precedence when server-side revocation fails;
  // the server expires a surviving session on its own.
  logout: async () => {
    await callApiNoContent(() => api.auth.session.$delete());
    get().clear();
  },

  initialize: () => loadAccess(set, get, false),
  refresh: () => loadAccess(set, get, true),

  primeFromLogin: token => {
    accessRequest = null;
    setSessionToken(token);
    set({ access: { token, via: 'session' }, error: null });
  },
}));

onSessionInvalidated(() => useAuthStore.getState().clear());
