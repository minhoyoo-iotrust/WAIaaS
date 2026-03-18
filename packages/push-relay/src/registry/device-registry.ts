import Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';

export interface DeviceRecord {
  pushToken: string;
  walletName: string;
  platform: 'ios' | 'android';
  subscriptionToken: string | null;
  createdAt: number;
  updatedAt: number;
}

export class DeviceRegistry {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS devices (
        push_token TEXT PRIMARY KEY,
        wallet_name TEXT NOT NULL,
        platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
        subscription_token TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_devices_wallet_name ON devices(wallet_name)
    `);
    // Migration: add subscription_token column if missing (existing DBs)
    const cols = (this.db.prepare("PRAGMA table_info('devices')").all() as Array<{ name: string }>).map(c => c.name);
    if (!cols.includes('subscription_token')) {
      this.db.exec(`ALTER TABLE devices ADD COLUMN subscription_token TEXT`);
    }
    this.db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_subscription_token ON devices(subscription_token)`);

    // sign_responses table for storing signing responses (v60 Push Relay)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sign_responses (
        request_id TEXT PRIMARY KEY,
        response TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_sign_responses_expires ON sign_responses(expires_at)');
  }

  register(walletName: string, pushToken: string, platform: 'ios' | 'android'): { subscriptionToken: string } {
    const now = Math.floor(Date.now() / 1000);
    const newToken = randomBytes(4).toString('hex');
    this.db.prepare(`
      INSERT INTO devices (push_token, wallet_name, platform, subscription_token, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(push_token) DO UPDATE SET
        wallet_name = excluded.wallet_name,
        platform = excluded.platform,
        subscription_token = COALESCE(devices.subscription_token, excluded.subscription_token),
        updated_at = excluded.updated_at
    `).run(pushToken, walletName, platform, newToken, now, now);
    // Retrieve the actual token (may be the existing one on conflict)
    const row = this.db.prepare('SELECT subscription_token FROM devices WHERE push_token = ?')
      .get(pushToken) as { subscription_token: string };
    return { subscriptionToken: row.subscription_token };
  }

  getSubscriptionToken(pushToken: string): string | null {
    const row = this.db.prepare('SELECT subscription_token FROM devices WHERE push_token = ?')
      .get(pushToken) as { subscription_token: string | null } | undefined;
    return row?.subscription_token ?? null;
  }

  unregister(pushToken: string): boolean {
    const result = this.db.prepare('DELETE FROM devices WHERE push_token = ?').run(pushToken);
    return result.changes > 0;
  }

  getTokensByWalletName(walletName: string): string[] {
    const rows = this.db
      .prepare('SELECT push_token FROM devices WHERE wallet_name = ?')
      .all(walletName) as Array<{ push_token: string }>;
    return rows.map((r) => r.push_token);
  }

  removeTokens(tokens: string[]): void {
    if (tokens.length === 0) return;
    const placeholders = tokens.map(() => '?').join(',');
    this.db.prepare(`DELETE FROM devices WHERE push_token IN (${placeholders})`).run(...tokens);
  }

  getByPushToken(pushToken: string): DeviceRecord | null {
    const row = this.db.prepare(`
      SELECT push_token, wallet_name, platform, subscription_token, created_at, updated_at
      FROM devices WHERE push_token = ?
    `).get(pushToken) as {
      push_token: string; wallet_name: string; platform: string;
      subscription_token: string | null; created_at: number; updated_at: number;
    } | undefined;
    if (!row) return null;
    return {
      pushToken: row.push_token,
      walletName: row.wallet_name,
      platform: row.platform as 'ios' | 'android',
      subscriptionToken: row.subscription_token,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  getBySubscriptionToken(token: string): DeviceRecord | null {
    const row = this.db.prepare(`
      SELECT push_token, wallet_name, platform, subscription_token, created_at, updated_at
      FROM devices WHERE subscription_token = ?
    `).get(token) as {
      push_token: string; wallet_name: string; platform: string;
      subscription_token: string | null; created_at: number; updated_at: number;
    } | undefined;
    if (!row) return null;
    return {
      pushToken: row.push_token,
      walletName: row.wallet_name,
      platform: row.platform as 'ios' | 'android',
      subscriptionToken: row.subscription_token,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  listAll(): DeviceRecord[] {
    const rows = this.db.prepare(`
      SELECT push_token, wallet_name, platform, subscription_token, created_at, updated_at
      FROM devices
    `).all() as Array<{
      push_token: string; wallet_name: string; platform: string;
      subscription_token: string | null; created_at: number; updated_at: number;
    }>;
    return rows.map((row) => ({
      pushToken: row.push_token,
      walletName: row.wallet_name,
      platform: row.platform as 'ios' | 'android',
      subscriptionToken: row.subscription_token,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM devices').get() as { count: number };
    return row.count;
  }

  // ---------------------------------------------------------------------------
  // sign_responses methods (Push Relay response store)
  // ---------------------------------------------------------------------------

  saveSignResponse(requestId: string, response: string, ttlSeconds: number = 300): void {
    const now = Math.floor(Date.now() / 1000);
    this.db.prepare(`
      INSERT OR REPLACE INTO sign_responses (request_id, response, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `).run(requestId, response, now + ttlSeconds, now);
  }

  getSignResponse(requestId: string): string | null {
    const now = Math.floor(Date.now() / 1000);
    const row = this.db.prepare(
      'SELECT response FROM sign_responses WHERE request_id = ? AND expires_at > ?',
    ).get(requestId, now) as { response: string } | undefined;
    return row?.response ?? null;
  }

  deleteSignResponse(requestId: string): void {
    this.db.prepare('DELETE FROM sign_responses WHERE request_id = ?').run(requestId);
  }

  cleanupExpiredResponses(): number {
    const now = Math.floor(Date.now() / 1000);
    const result = this.db.prepare('DELETE FROM sign_responses WHERE expires_at <= ?').run(now);
    return result.changes;
  }

  signResponseCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM sign_responses').get() as { count: number };
    return row.count;
  }

  close(): void {
    this.db.close();
  }
}
