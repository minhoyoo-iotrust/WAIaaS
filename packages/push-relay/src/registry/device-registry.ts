import Database from 'better-sqlite3';

export interface DeviceRecord {
  pushToken: string;
  walletName: string;
  platform: 'ios' | 'android';
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
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_devices_wallet_name ON devices(wallet_name)
    `);
  }

  register(walletName: string, pushToken: string, platform: 'ios' | 'android'): void {
    const now = Math.floor(Date.now() / 1000);
    this.db.prepare(`
      INSERT INTO devices (push_token, wallet_name, platform, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(push_token) DO UPDATE SET
        wallet_name = excluded.wallet_name,
        platform = excluded.platform,
        updated_at = excluded.updated_at
    `).run(pushToken, walletName, platform, now, now);
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

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) as count FROM devices').get() as { count: number };
    return row.count;
  }

  close(): void {
    this.db.close();
  }
}
