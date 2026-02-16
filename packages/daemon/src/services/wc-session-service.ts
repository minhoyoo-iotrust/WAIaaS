/**
 * WcSessionService - WalletConnect SignClient lifecycle wrapper.
 *
 * Manages SignClient initialization, shutdown, and session mapping.
 * Designed for fail-soft integration with DaemonLifecycle (Step 4c-6).
 *
 * Key responsibilities:
 *   - Initialize SignClient with SQLite-backed IKeyValueStorage
 *   - Register event listeners for session_delete / session_expire
 *   - Maintain in-memory walletId -> session topic mapping (restored from DB on startup)
 *   - Provide getSignClient() for route handlers (Phase 147)
 *
 * @see packages/daemon/src/services/wc-storage.ts
 * @see packages/daemon/src/infrastructure/database/migrate.ts (v16: wc_sessions table)
 */

import SignClient from '@walletconnect/sign-client';
import type { Database } from 'better-sqlite3';
import type { SettingsService } from '../infrastructure/settings/settings-service.js';
import { SqliteKeyValueStorage } from './wc-storage.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WcSessionServiceDeps {
  sqlite: Database;
  settingsService: SettingsService;
}

// ---------------------------------------------------------------------------
// WcSessionService
// ---------------------------------------------------------------------------

export class WcSessionService {
  private signClient: SignClient | null = null;
  private readonly sqlite: Database;
  private readonly settingsService: SettingsService;
  /** walletId -> session topic mapping (in-memory cache) */
  private readonly sessionMap = new Map<string, string>();

  constructor(deps: WcSessionServiceDeps) {
    this.sqlite = deps.sqlite;
    this.settingsService = deps.settingsService;
  }

  /**
   * Initialize SignClient with SQLite storage.
   * No-op if walletconnect.project_id is not configured.
   */
  async initialize(): Promise<void> {
    const projectId = this.settingsService.get('walletconnect.project_id');
    if (!projectId) return;

    const relayUrl =
      this.settingsService.get('walletconnect.relay_url') ||
      'wss://relay.walletconnect.com';

    const storage = new SqliteKeyValueStorage(this.sqlite);

    this.signClient = await SignClient.init({
      projectId,
      relayUrl,
      storage: storage as any, // IKeyValueStorage compatible
      metadata: {
        name: 'WAIaaS Daemon',
        description: 'AI Agent Wallet-as-a-Service',
        url: 'http://localhost',
        icons: [],
      },
    });

    // Register event listeners for session lifecycle
    this.signClient.on('session_delete', ({ topic }: { topic: string }) => {
      this.handleSessionDelete(topic);
    });
    this.signClient.on('session_expire', ({ topic }: { topic: string }) => {
      this.handleSessionDelete(topic);
    });

    // Restore existing sessions from DB -> in-memory map
    this.restoreSessions();
  }

  /**
   * Restore walletId -> topic mappings from wc_sessions table.
   */
  private restoreSessions(): void {
    const rows = this.sqlite
      .prepare('SELECT wallet_id, topic FROM wc_sessions')
      .all() as Array<{ wallet_id: string; topic: string }>;
    for (const row of rows) {
      this.sessionMap.set(row.wallet_id, row.topic);
    }
  }

  /**
   * Check if a wallet has an active WC session.
   */
  hasActiveSession(walletId: string): boolean {
    return this.sessionMap.has(walletId);
  }

  /**
   * Get the underlying SignClient instance (for route handlers / pairing).
   * Returns null if WC is not initialized.
   */
  getSignClient(): SignClient | null {
    return this.signClient;
  }

  /**
   * Gracefully shut down SignClient resources.
   * Clears in-memory state but does NOT delete DB sessions
   * (they'll be restored on next startup).
   */
  async shutdown(): Promise<void> {
    if (this.signClient) {
      try {
        // Attempt to disconnect the WebSocket relay connection
        await (this.signClient.core?.relayer?.provider as any)?.disconnect?.();
      } catch {
        // Ignore disconnect errors -- best effort cleanup
      }
      this.signClient = null;
      this.sessionMap.clear();
    }
  }

  /**
   * Handle session deletion/expiration from WC relay.
   * Removes from both DB and in-memory map.
   */
  private handleSessionDelete(topic: string): void {
    // Remove from wc_sessions table
    this.sqlite
      .prepare('DELETE FROM wc_sessions WHERE topic = ?')
      .run(topic);

    // Remove from in-memory sessionMap
    for (const [walletId, t] of this.sessionMap) {
      if (t === topic) {
        this.sessionMap.delete(walletId);
        break;
      }
    }
  }
}
