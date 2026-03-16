/**
 * Shared staking balance aggregation utility.
 *
 * Aggregates staking transactions (stake/unstake) from the DB for a given
 * wallet and provider key. Used by both staking.ts and admin-wallets.ts.
 *
 * @see Phase 431 (SSOT-04)
 */

import type { Database as SQLiteDatabase } from 'better-sqlite3';

interface StakingTxRow {
  amount: string | null;
  bridge_status: string | null;
  created_at: number | null;
  metadata: string | null;
}

/**
 * Aggregate staking transactions for a wallet + provider key.
 *
 * Stake transactions increase position; unstake transactions decrease.
 * The net balance is an estimate based on transaction records.
 */
export function aggregateStakingBalance(
  sqlite: SQLiteDatabase,
  walletId: string,
  providerKey: string,
): { balanceWei: bigint; pendingUnstake: { amount: string; status: 'PENDING' | 'COMPLETED' | 'TIMEOUT'; requestedAt: number | null } | null } {
  // Query completed stake/unstake transactions for this provider
  const stakeRows = sqlite.prepare(
    `SELECT amount, bridge_status, created_at, metadata
     FROM transactions
     WHERE wallet_id = ? AND status IN ('CONFIRMED', 'COMPLETED')
       AND metadata LIKE ?
     ORDER BY created_at ASC`,
  ).all(walletId, `%${providerKey}%`) as StakingTxRow[];

  let totalStaked = 0n;
  let totalUnstaked = 0n;

  for (const row of stakeRows) {
    // Fallback: if amount is NULL, try extracting from metadata (CONTRACT_CALL value)
    let effectiveAmount = row.amount;
    if (!effectiveAmount && row.metadata) {
      try {
        const meta = JSON.parse(row.metadata) as Record<string, unknown>;
        const origReq = meta.originalRequest as Record<string, unknown> | undefined;
        if (origReq?.value && typeof origReq.value === 'string') {
          effectiveAmount = origReq.value;
        }
      } catch { /* ignore */ }
    }
    if (!effectiveAmount) continue;

    // Parse metadata to determine if it's a stake or unstake action
    let isUnstake = false;
    if (row.metadata) {
      try {
        const meta = JSON.parse(row.metadata) as Record<string, unknown>;
        if (meta.action === 'unstake' || meta.actionName === 'unstake') {
          isUnstake = true;
        }
      } catch { /* ignore */ }
    }

    try {
      const amountBig = BigInt(effectiveAmount);
      if (isUnstake) {
        totalUnstaked += amountBig;
      } else {
        totalStaked += amountBig;
      }
    } catch {
      // Non-numeric amount -- skip
    }
  }

  // Check for pending unstake (bridge_status = PENDING)
  const pendingRow = sqlite.prepare(
    `SELECT amount, bridge_status, created_at
     FROM transactions
     WHERE wallet_id = ? AND bridge_status = 'PENDING'
       AND metadata LIKE ?
     ORDER BY created_at DESC
     LIMIT 1`,
  ).get(walletId, `%${providerKey}%`) as StakingTxRow | undefined;

  let pendingUnstake: { amount: string; status: 'PENDING' | 'COMPLETED' | 'TIMEOUT'; requestedAt: number | null } | null = null;

  if (pendingRow && pendingRow.amount) {
    pendingUnstake = {
      amount: pendingRow.amount,
      status: (pendingRow.bridge_status ?? 'PENDING') as 'PENDING' | 'COMPLETED' | 'TIMEOUT',
      requestedAt: pendingRow.created_at ?? null,
    };
  }

  // Net staking balance
  const balanceWei = totalStaked > totalUnstaked ? totalStaked - totalUnstaked : 0n;

  return { balanceWei, pendingUnstake };
}
