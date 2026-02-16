/**
 * WcSessionService - WalletConnect SignClient lifecycle wrapper.
 *
 * Manages SignClient initialization, shutdown, session mapping,
 * pairing creation, session info retrieval, and disconnect.
 * Designed for fail-soft integration with DaemonLifecycle (Step 4c-6).
 *
 * Key responsibilities:
 *   - Initialize SignClient with SQLite-backed IKeyValueStorage
 *   - Register event listeners for session_delete / session_expire
 *   - Maintain in-memory walletId -> session topic mapping (restored from DB on startup)
 *   - Create WC pairings with QR code generation (createPairing)
 *   - Manage session lifecycle (getSessionInfo, getPairingStatus, disconnectSession)
 *
 * @see packages/daemon/src/services/wc-storage.ts
 * @see packages/daemon/src/infrastructure/database/migrate.ts (v16: wc_sessions table)
 */

import { createRequire } from 'node:module';
import SignClient from '@walletconnect/sign-client';
import type { Database } from 'better-sqlite3';
import { WAIaaSError } from '@waiaas/core';
import type { SettingsService } from '../infrastructure/settings/settings-service.js';
import { SqliteKeyValueStorage } from './wc-storage.js';

const require = createRequire(import.meta.url);
const QRCode: typeof import('qrcode') = require('qrcode');

// ---------------------------------------------------------------------------
// CAIP-2 Chain Identifiers
// ---------------------------------------------------------------------------

/** CAIP-2 chain identifiers for WalletConnect v2 */
export const CAIP2_CHAIN_IDS: Record<string, string> = {
  // Solana
  'mainnet': 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
  'devnet': 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  'testnet': 'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z',
  // EVM (eip155:{chainId})
  'ethereum-mainnet': 'eip155:1',
  'ethereum-sepolia': 'eip155:11155111',
  'polygon-mainnet': 'eip155:137',
  'polygon-amoy': 'eip155:80002',
  'arbitrum-mainnet': 'eip155:42161',
  'arbitrum-sepolia': 'eip155:421614',
  'optimism-mainnet': 'eip155:10',
  'optimism-sepolia': 'eip155:11155420',
  'base-mainnet': 'eip155:8453',
  'base-sepolia': 'eip155:84532',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WcSessionServiceDeps {
  sqlite: Database;
  settingsService: SettingsService;
}

export interface PairingResult {
  uri: string;
  qrDataUrl: string;
  expiresAt: number;
}

export interface WcSessionInfo {
  walletId: string;
  topic: string;
  peerName: string | null;
  peerUrl: string | null;
  chainId: string;
  ownerAddress: string;
  expiry: number;
  createdAt: number;
}

export type PairingStatus = 'pending' | 'connected' | 'expired' | 'none';

// ---------------------------------------------------------------------------
// WcSessionService
// ---------------------------------------------------------------------------

export class WcSessionService {
  private signClient: SignClient | null = null;
  private readonly sqlite: Database;
  private readonly settingsService: SettingsService;
  /** walletId -> session topic mapping (in-memory cache) */
  private readonly sessionMap = new Map<string, string>();
  /** Tracking pending pairing attempts per wallet */
  private readonly pendingPairing = new Map<string, { expiresAt: number; uri: string }>();

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
   * Get the session topic for a wallet (public accessor).
   * Returns null if no active session exists.
   */
  getSessionTopic(walletId: string): string | null {
    return this.sessionMap.get(walletId) ?? null;
  }

  // ---------------------------------------------------------------------------
  // Pairing / Session Management (Phase 147)
  // ---------------------------------------------------------------------------

  /**
   * Create a new WC pairing for a wallet.
   * Returns URI + QR code immediately. Session settlement happens asynchronously.
   *
   * @param walletId - Wallet UUID
   * @param network - Network name (e.g., 'devnet', 'ethereum-sepolia')
   * @param chain - Chain type ('solana' or 'ethereum')
   */
  async createPairing(walletId: string, network: string, chain: string): Promise<PairingResult> {
    const signClient = this.getSignClient();
    if (!signClient) {
      throw new WAIaaSError('WC_NOT_CONFIGURED');
    }

    // Single session policy: reject if wallet already has an active session
    if (this.hasActiveSession(walletId)) {
      throw new WAIaaSError('WC_SESSION_EXISTS');
    }

    // If there's already a pending pairing for this wallet, return existing URI
    const existing = this.pendingPairing.get(walletId);
    if (existing && Math.floor(Date.now() / 1000) < existing.expiresAt) {
      const qrDataUrl = await QRCode.toDataURL(existing.uri, {
        width: 300,
        margin: 2,
        errorCorrectionLevel: 'M',
      });
      return { uri: existing.uri, qrDataUrl, expiresAt: existing.expiresAt };
    }

    // Resolve CAIP-2 chain ID
    const chainId = CAIP2_CHAIN_IDS[network] ??
      (chain === 'solana' ? `solana:${network}` : `eip155:${network}`);

    // Determine namespace and methods
    const namespace: string = chainId.split(':')[0]!; // 'eip155' or 'solana'
    const methods = namespace === 'solana'
      ? ['solana_signTransaction', 'solana_signMessage']
      : ['eth_sendTransaction', 'personal_sign', 'eth_signTypedData_v4'];
    const events = namespace === 'solana'
      ? []
      : ['chainChanged', 'accountsChanged'];

    const requiredNamespaces: Record<string, { chains: string[]; methods: string[]; events: string[] }> = {
      [namespace]: {
        chains: [chainId],
        methods,
        events,
      },
    };

    const { uri, approval } = await signClient.connect({
      requiredNamespaces,
    });

    if (!uri) {
      throw new Error('Failed to generate pairing URI');
    }

    const qrDataUrl = await QRCode.toDataURL(uri, {
      width: 300,
      margin: 2,
      errorCorrectionLevel: 'M',
    });

    const expiresAt = Math.floor(Date.now() / 1000) + 300; // 5 minutes
    this.pendingPairing.set(walletId, { expiresAt, uri });

    // Wait for approval in the background (do NOT await in HTTP handler)
    this.waitForApproval(walletId, chainId, approval);

    return { uri, qrDataUrl, expiresAt };
  }

  /**
   * Background approval waiter. Saves session to DB when external wallet approves.
   * On failure/timeout, cleans up pending pairing state.
   */
  private waitForApproval(
    walletId: string,
    chainId: string,
    approval: () => Promise<any>,
  ): void {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Pairing approval timeout')), 300_000),
    );

    Promise.race([approval(), timeout])
      .then((session: any) => {
        // Extract owner address from CAIP-10 accounts
        const firstNamespace = Object.values(session.namespaces)[0] as any;
        const firstAccount: string = firstNamespace?.accounts?.[0] ?? '';
        // CAIP-10 format: "namespace:chainId:address" -> extract address part
        const parts = firstAccount.split(':');
        const ownerAddress = parts.length >= 3 ? parts.slice(2).join(':') : firstAccount;

        // Save session to DB
        this.sqlite
          .prepare(
            `INSERT OR REPLACE INTO wc_sessions (wallet_id, topic, peer_meta, chain_id, owner_address, namespaces, expiry, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            walletId,
            session.topic,
            JSON.stringify(session.peer?.metadata ?? null),
            chainId,
            ownerAddress,
            JSON.stringify(session.namespaces),
            session.expiry,
            Math.floor(Date.now() / 1000),
          );

        // Update in-memory map
        this.sessionMap.set(walletId, session.topic);
        this.pendingPairing.delete(walletId);
      })
      .catch(() => {
        // Timeout or rejection -- clean up pending state
        this.pendingPairing.delete(walletId);
      });
  }

  /**
   * Get session info for a wallet from DB.
   * Returns null if no session exists.
   */
  getSessionInfo(walletId: string): WcSessionInfo | null {
    const row = this.sqlite
      .prepare(
        `SELECT wallet_id, topic, peer_meta, chain_id, owner_address, expiry, created_at
         FROM wc_sessions WHERE wallet_id = ?`,
      )
      .get(walletId) as {
        wallet_id: string;
        topic: string;
        peer_meta: string | null;
        chain_id: string;
        owner_address: string;
        expiry: number;
        created_at: number;
      } | undefined;

    if (!row) return null;

    let peerName: string | null = null;
    let peerUrl: string | null = null;
    if (row.peer_meta) {
      try {
        const meta = JSON.parse(row.peer_meta);
        peerName = meta?.name ?? null;
        peerUrl = meta?.url ?? null;
      } catch {
        // ignore parse errors
      }
    }

    return {
      walletId: row.wallet_id,
      topic: row.topic,
      peerName,
      peerUrl,
      chainId: row.chain_id,
      ownerAddress: row.owner_address,
      expiry: row.expiry,
      createdAt: row.created_at,
    };
  }

  /**
   * Get the current pairing/session status for a wallet.
   */
  getPairingStatus(walletId: string): PairingStatus {
    if (this.hasActiveSession(walletId)) {
      return 'connected';
    }

    const pending = this.pendingPairing.get(walletId);
    if (pending) {
      if (Math.floor(Date.now() / 1000) < pending.expiresAt) {
        return 'pending';
      }
      // Expired pending pairing -- clean up
      this.pendingPairing.delete(walletId);
      return 'expired';
    }

    return 'none';
  }

  /**
   * Disconnect a wallet's WC session.
   * Removes from relay, DB, and in-memory map.
   */
  async disconnectSession(walletId: string): Promise<void> {
    const signClient = this.getSignClient();
    if (!signClient) {
      throw new WAIaaSError('WC_NOT_CONFIGURED');
    }

    const topic = this.sessionMap.get(walletId);
    if (!topic) {
      throw new WAIaaSError('WC_SESSION_NOT_FOUND');
    }

    await signClient.disconnect({
      topic,
      reason: { code: 6000, message: 'User disconnected' },
    });

    // Clean up DB + in-memory map
    this.handleSessionDelete(topic);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

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
      this.pendingPairing.clear();
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
