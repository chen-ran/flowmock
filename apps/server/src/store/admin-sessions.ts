import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export const SESSION_TTL_MS = 7 * 24 * 60 * 60_000;
const hash = (token: string): string => createHash('sha256').update(token).digest('hex');

export class AdminSessions {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) { this.db = db; }

  create(now = Date.now()): { token: string; expiresAt: number } {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = now + SESSION_TTL_MS;
    this.db.prepare('INSERT INTO admin_sessions VALUES (?, ?, ?, ?)').run(hash(token), now, now, expiresAt);
    return { token, expiresAt };
  }

  verify(token: string, now = Date.now()): { expiresAt: number } | null {
    const tokenHash = hash(token);
    const row = this.db.prepare('SELECT expires_at FROM admin_sessions WHERE token_hash = ? AND expires_at > ?').get(tokenHash, now) as { expires_at: number } | undefined;
    if (!row) return null;
    const expiresAt = row.expires_at - now < SESSION_TTL_MS / 2 ? now + SESSION_TTL_MS : row.expires_at;
    this.db.prepare('UPDATE admin_sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?').run(now, expiresAt, tokenHash);
    return { expiresAt };
  }

  revoke(token: string): void {
    this.db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(hash(token));
  }

  purgeExpired(now = Date.now()): number {
    return Number(this.db.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').run(now).changes);
  }
}
