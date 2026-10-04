import { describe, expect, it } from 'vitest';

import { AdminSessions, SESSION_TTL_MS } from '../../src/store/admin-sessions.ts';
import { openDatabase } from '../../src/store/database.ts';

describe('AdminSessions', () => {
  it('renews in the second half of the lifetime, rejects expiry and purges old sessions', () => {
    const db = openDatabase(':memory:');
    try {
      const sessions = new AdminSessions(db);
      const created = sessions.create(0);
      expect(sessions.verify(created.token, 1)?.expiresAt).toBe(SESSION_TTL_MS);
      const later = SESSION_TTL_MS / 2 + 1;
      expect(sessions.verify(created.token, later)?.expiresAt).toBe(later + SESSION_TTL_MS);
      expect(sessions.verify(created.token, later + SESSION_TTL_MS)).toBeNull();
      expect(sessions.purgeExpired(later + SESSION_TTL_MS)).toBe(1);
      const next = sessions.create(0);
      sessions.revoke(next.token);
      expect(sessions.verify(next.token, 0)).toBeNull();
    } finally { db.close(); }
  });
});
