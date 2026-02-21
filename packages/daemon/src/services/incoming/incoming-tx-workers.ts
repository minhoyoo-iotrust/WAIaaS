/**
 * Worker handler factories for incoming transaction lifecycle management.
 *
 * Provides:
 * 1. Confirmation worker -- transitions DETECTED -> CONFIRMED based on chain-specific thresholds
 * 2. Retention worker -- deletes records older than configurable retention_days
 * 3. Gap recovery handler -- calls pollAll() on subscribers after reconnection
 * 4. Cursor utilities -- read/write incoming_tx_cursors for tracking processing position
 *
 * All handler factories return `async () => void` functions compatible with
 * BackgroundWorkers.register() interval pattern.
 *
 * @see docs/76-incoming-transaction-monitoring.md sections 2.5, 5.3
 */

import type { Database } from 'better-sqlite3';

// ── EVM Confirmation Thresholds ─────────────────────────────────────

/**
 * Chain-specific block confirmation thresholds for EVM networks.
 * A DETECTED transaction is upgraded to CONFIRMED when
 * `currentBlock - txBlockNumber >= threshold`.
 */
export const EVM_CONFIRMATION_THRESHOLDS: Record<string, number> = {
  mainnet: 12,
  sepolia: 1,
  'polygon-mainnet': 128,
  'polygon-amoy': 1,
  'arbitrum-mainnet': 1,
  'arbitrum-sepolia': 1,
  'base-mainnet': 12,
  'base-sepolia': 1,
};

/** Default threshold when network is not in EVM_CONFIRMATION_THRESHOLDS. */
export const DEFAULT_EVM_CONFIRMATIONS = 12;

/** Solana commitment level used for confirmation check. */
export const SOLANA_CONFIRMATION = 'finalized';

// ── Types ───────────────────────────────────────────────────────────

interface ConfirmationWorkerDeps {
  /** Raw SQLite handle for queries and updates. */
  sqlite: Database;
  /** Returns the current block number for the given EVM chain:network. */
  getBlockNumber?: (chain: string, network: string) => Promise<bigint>;
  /** Checks if a Solana transaction has reached finalized commitment. */
  checkSolanaFinalized?: (txHash: string) => Promise<boolean>;
}

interface RetentionWorkerDeps {
  /** Raw SQLite handle for DELETE operations. */
  sqlite: Database;
  /** Returns current retention period in days (supports hot-reload). */
  getRetentionDays: () => number;
}

interface GapRecoveryDeps {
  /** Map of connection key ("chain:network") to subscriber with pollAll(). */
  subscribers: Map<string, { subscriber: { pollAll: () => Promise<void> } }>;
}

// ── Confirmation Worker ─────────────────────────────────────────────

/**
 * Creates a handler that upgrades DETECTED transactions to CONFIRMED.
 *
 * - Solana: calls checkSolanaFinalized(txHash). If true -> CONFIRMED.
 * - EVM: computes `currentBlock - txBlock`. If >= threshold -> CONFIRMED.
 * - Per-record error isolation: one failure does not block other records.
 */
export function createConfirmationWorkerHandler(
  deps: ConfirmationWorkerDeps,
): () => Promise<void> {
  const { sqlite, getBlockNumber, checkSolanaFinalized } = deps;

  return async () => {
    // Query all DETECTED transactions
    const rows = sqlite
      .prepare(
        `SELECT id, tx_hash, chain, network, block_number FROM incoming_transactions WHERE status = 'DETECTED'`,
      )
      .all() as Array<{
      id: string;
      tx_hash: string;
      chain: string;
      network: string;
      block_number: number | null;
    }>;

    if (rows.length === 0) return;

    const updateStmt = sqlite.prepare(
      `UPDATE incoming_transactions SET status = 'CONFIRMED', confirmed_at = ? WHERE id = ?`,
    );

    // Cache EVM block numbers per network to avoid redundant RPC calls
    const blockCache = new Map<string, bigint>();

    for (const row of rows) {
      try {
        if (row.chain === 'solana') {
          // Solana: check finalized commitment
          if (!checkSolanaFinalized) continue;
          const finalized = await checkSolanaFinalized(row.tx_hash);
          if (finalized) {
            const confirmedAt = Math.floor(Date.now() / 1000);
            updateStmt.run(confirmedAt, row.id);
          }
        } else if (row.chain === 'ethereum') {
          // EVM: compare block numbers
          if (!getBlockNumber || row.block_number == null) continue;

          const cacheKey = `${row.chain}:${row.network}`;
          let currentBlock = blockCache.get(cacheKey);
          if (currentBlock === undefined) {
            currentBlock = await getBlockNumber(row.chain, row.network);
            blockCache.set(cacheKey, currentBlock);
          }

          const threshold =
            EVM_CONFIRMATION_THRESHOLDS[row.network] ??
            DEFAULT_EVM_CONFIRMATIONS;
          const confirmations =
            currentBlock - BigInt(row.block_number);

          if (confirmations >= BigInt(threshold)) {
            const confirmedAt = Math.floor(Date.now() / 1000);
            updateStmt.run(confirmedAt, row.id);
          }
        }
      } catch (err) {
        // Per-record error isolation: log and continue
        console.warn(
          `Confirmation check failed for tx ${row.id}:`,
          err,
        );
      }
    }
  };
}

// ── Retention Worker ────────────────────────────────────────────────

/**
 * Creates a handler that deletes incoming_transactions records
 * older than the configured retention period.
 *
 * Uses raw SQLite DELETE for efficiency. getRetentionDays() is called
 * each invocation to support hot-reload of the setting.
 */
export function createRetentionWorkerHandler(
  deps: RetentionWorkerDeps,
): () => Promise<void> {
  const { sqlite, getRetentionDays } = deps;

  return async () => {
    const retentionDays = getRetentionDays();
    const cutoff = Math.floor(Date.now() / 1000) - retentionDays * 86400;
    const result = sqlite
      .prepare('DELETE FROM incoming_transactions WHERE detected_at < ?')
      .run(cutoff);

    if (result.changes > 0) {
      console.log(
        `Retention worker: deleted ${result.changes} incoming_transactions older than ${retentionDays} days`,
      );
    }
  };
}

// ── Gap Recovery Handler ────────────────────────────────────────────

/**
 * Creates a handler for recovering missed transactions after reconnection.
 *
 * When a WebSocket reconnects, the gap between last-known cursor and current
 * chain state needs to be filled. This handler finds the relevant subscriber
 * and calls pollAll() to recover missed transactions.
 */
export function createGapRecoveryHandler(
  deps: GapRecoveryDeps,
): (chain: string, network: string, walletIds: string[]) => Promise<void> {
  const { subscribers } = deps;

  return async (
    chain: string,
    network: string,
    _walletIds: string[],
  ) => {
    const key = `${chain}:${network}`;
    const entry = subscribers.get(key);
    if (!entry) {
      // No subscriber for this chain:network -- graceful skip
      return;
    }

    try {
      await entry.subscriber.pollAll();
    } catch (err) {
      console.warn(`Gap recovery failed for ${key}:`, err);
    }
  };
}

// ── Cursor Utilities ────────────────────────────────────────────────

/**
 * Save or update the processing cursor for a wallet.
 *
 * Uses INSERT OR REPLACE to handle both new and existing cursors.
 * The cursor value is chain-specific:
 * - Solana: last processed transaction signature
 * - EVM: last processed block number (as string)
 */
export function updateCursor(
  sqlite: Database,
  walletId: string,
  chain: string,
  network: string,
  cursor: string,
): void {
  const isSolana = chain === 'solana';
  const updatedAt = Math.floor(Date.now() / 1000);

  sqlite
    .prepare(
      `INSERT OR REPLACE INTO incoming_tx_cursors (wallet_id, chain, network, last_signature, last_block_number, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      walletId,
      chain,
      network,
      isSolana ? cursor : null,
      isSolana ? null : parseInt(cursor, 10),
      updatedAt,
    );
}

/**
 * Load the processing cursor for a wallet.
 *
 * Returns the cursor value (signature or block number as string),
 * or null if no cursor exists for the given wallet+chain+network.
 */
export function loadCursor(
  sqlite: Database,
  walletId: string,
  chain: string,
  network: string,
): string | null {
  const row = sqlite
    .prepare(
      `SELECT last_signature, last_block_number FROM incoming_tx_cursors
       WHERE wallet_id = ? AND chain = ? AND network = ?`,
    )
    .get(walletId, chain, network) as
    | { last_signature: string | null; last_block_number: number | null }
    | undefined;

  if (!row) return null;

  // Return whichever cursor value is present
  if (row.last_signature) return row.last_signature;
  if (row.last_block_number != null) return String(row.last_block_number);
  return null;
}
