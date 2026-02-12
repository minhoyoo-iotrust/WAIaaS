/**
 * DatabasePolicyEngine - v1.2 DB-backed policy engine.
 *
 * Evaluates transactions against policies stored in the policies table.
 * Supports SPENDING_LIMIT (4-tier classification), WHITELIST (address filtering),
 * and ALLOWED_TOKENS (token transfer whitelist, default deny).
 *
 * Algorithm:
 * 1. Load enabled policies for agent (agent-specific + global), ORDER BY priority DESC
 * 2. If no policies found, return INSTANT passthrough (Phase 7 compat)
 * 3. Resolve overrides: agent-specific policies override global policies of same type
 * 4. Evaluate WHITELIST: deny if toAddress not in allowed_addresses
 * 4b. Evaluate ALLOWED_TOKENS: deny TOKEN_TRANSFER if no policy or token not whitelisted
 * 5. Evaluate SPENDING_LIMIT: classify amount into INSTANT/NOTIFY/DELAY/APPROVAL
 *
 * TOCTOU Prevention (evaluateAndReserve):
 * Uses BEGIN IMMEDIATE to serialize concurrent policy evaluations.
 * reserved_amount tracks pending amounts to prevent two requests from both passing
 * under the same spending limit.
 *
 * @see docs/33-time-lock-approval-mechanism.md
 */

import type { IPolicyEngine, PolicyEvaluation, PolicyTier } from '@waiaas/core';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import { eq, or, and, isNull, desc } from 'drizzle-orm';
import { policies } from '../infrastructure/database/schema.js';
import type * as schema from '../infrastructure/database/schema.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpendingLimitRules {
  instant_max: string;
  notify_max: string;
  delay_max: string;
  delay_seconds: number;
}

interface WhitelistRules {
  allowed_addresses: string[];
}

interface AllowedTokensRules {
  tokens: Array<{ address: string }>;
}

interface PolicyRow {
  id: string;
  agentId: string | null;
  type: string;
  rules: string;
  priority: number;
  enabled: boolean | null;
}

/** Transaction parameter for policy evaluation. */
interface TransactionParam {
  type: string;
  amount: string;
  toAddress: string;
  chain: string;
  /** Token address for ALLOWED_TOKENS evaluation (TOKEN_TRANSFER only). */
  tokenAddress?: string;
}

// ---------------------------------------------------------------------------
// DatabasePolicyEngine
// ---------------------------------------------------------------------------

/**
 * DB-backed policy engine with SPENDING_LIMIT 4-tier, WHITELIST, and ALLOWED_TOKENS evaluation.
 *
 * Constructor takes a Drizzle DB instance typed with the full schema,
 * and optionally a raw better-sqlite3 Database instance for BEGIN IMMEDIATE transactions.
 */
export class DatabasePolicyEngine implements IPolicyEngine {
  private readonly sqlite: SQLiteDatabase | null;

  constructor(
    private readonly db: BetterSQLite3Database<typeof schema>,
    sqlite?: SQLiteDatabase,
  ) {
    this.sqlite = sqlite ?? null;
  }

  /**
   * Evaluate a transaction against DB-stored policies.
   */
  async evaluate(
    agentId: string,
    transaction: TransactionParam,
  ): Promise<PolicyEvaluation> {
    // Step 1: Load enabled policies (agent-specific + global)
    const rows = await this.db
      .select()
      .from(policies)
      .where(
        and(
          or(eq(policies.agentId, agentId), isNull(policies.agentId)),
          eq(policies.enabled, true),
        ),
      )
      .orderBy(desc(policies.priority))
      .all();

    // Step 2: No policies -> INSTANT passthrough
    if (rows.length === 0) {
      return { allowed: true, tier: 'INSTANT' };
    }

    // Step 3: Resolve overrides (agent-specific wins over global for same type)
    const resolved = this.resolveOverrides(rows as PolicyRow[], agentId);

    // Step 4: Evaluate WHITELIST (deny-first)
    const whitelistResult = this.evaluateWhitelist(resolved, transaction.toAddress);
    if (whitelistResult !== null) {
      return whitelistResult;
    }

    // Step 4b: Evaluate ALLOWED_TOKENS (token transfer whitelist)
    const allowedTokensResult = this.evaluateAllowedTokens(resolved, transaction);
    if (allowedTokensResult !== null) {
      return allowedTokensResult;
    }

    // Step 5: Evaluate SPENDING_LIMIT (tier classification)
    const spendingResult = this.evaluateSpendingLimit(resolved, transaction.amount);
    if (spendingResult !== null) {
      return spendingResult;
    }

    // Default: INSTANT passthrough (no applicable rules)
    return { allowed: true, tier: 'INSTANT' };
  }

  // -------------------------------------------------------------------------
  // TOCTOU Prevention: evaluateAndReserve
  // -------------------------------------------------------------------------

  /**
   * Evaluate transaction and reserve amount atomically using BEGIN IMMEDIATE.
   *
   * This method:
   * 1. Begins an IMMEDIATE transaction (exclusive write lock)
   * 2. Loads policies (same as evaluate)
   * 3. For SPENDING_LIMIT: computes current reserved total from PENDING/QUEUED txs
   * 4. Adds current request amount to reserved total
   * 5. Evaluates against limits with reserved total considered
   * 6. If allowed: sets reserved_amount on the transaction row
   * 7. Commits
   *
   * @param agentId - The agent whose policies to evaluate
   * @param transaction - Transaction details for evaluation
   * @param txId - The transaction ID to update with reserved_amount
   * @returns PolicyEvaluation result
   * @throws Error if sqlite instance not provided in constructor
   */
  evaluateAndReserve(
    agentId: string,
    transaction: TransactionParam,
    txId: string,
  ): PolicyEvaluation {
    if (!this.sqlite) {
      throw new Error('evaluateAndReserve requires raw sqlite instance in constructor');
    }

    const sqlite = this.sqlite;

    // Use better-sqlite3 transaction().immediate() for BEGIN IMMEDIATE
    const txn = sqlite.transaction(() => {
      // Step 1: Load enabled policies via raw SQL (inside IMMEDIATE txn)
      const policyRows = sqlite
        .prepare(
          `SELECT id, agent_id AS agentId, type, rules, priority, enabled
           FROM policies
           WHERE (agent_id = ? OR agent_id IS NULL)
             AND enabled = 1
           ORDER BY priority DESC`,
        )
        .all(agentId) as PolicyRow[];

      // Step 2: No policies -> INSTANT passthrough
      if (policyRows.length === 0) {
        return { allowed: true, tier: 'INSTANT' as PolicyTier };
      }

      // Step 3: Resolve overrides
      const resolved = this.resolveOverrides(policyRows, agentId);

      // Step 4: Evaluate WHITELIST (deny-first)
      const whitelistResult = this.evaluateWhitelist(resolved, transaction.toAddress);
      if (whitelistResult !== null) {
        return whitelistResult;
      }

      // Step 4b: Evaluate ALLOWED_TOKENS (token transfer whitelist)
      const allowedTokensResult = this.evaluateAllowedTokens(resolved, transaction);
      if (allowedTokensResult !== null) {
        return allowedTokensResult;
      }

      // Step 5: Compute reserved total for SPENDING_LIMIT evaluation
      const spendingPolicy = resolved.find((p) => p.type === 'SPENDING_LIMIT');
      if (spendingPolicy) {
        // Sum of reserved_amount for agent's PENDING/QUEUED transactions
        const reservedRow = sqlite
          .prepare(
            `SELECT COALESCE(SUM(CAST(reserved_amount AS INTEGER)), 0) AS total
             FROM transactions
             WHERE agent_id = ?
               AND status IN ('PENDING', 'QUEUED')
               AND reserved_amount IS NOT NULL`,
          )
          .get(agentId) as { total: number };

        const reservedTotal = BigInt(reservedRow.total);
        const requestAmount = BigInt(transaction.amount);
        const effectiveAmount = reservedTotal + requestAmount;

        // Evaluate with effective amount (reserved + current)
        const rules: SpendingLimitRules = JSON.parse(spendingPolicy.rules);
        const instantMax = BigInt(rules.instant_max);
        const notifyMax = BigInt(rules.notify_max);
        const delayMax = BigInt(rules.delay_max);

        let tier: PolicyTier;
        let delaySeconds: number | undefined;

        if (effectiveAmount <= instantMax) {
          tier = 'INSTANT';
        } else if (effectiveAmount <= notifyMax) {
          tier = 'NOTIFY';
        } else if (effectiveAmount <= delayMax) {
          tier = 'DELAY';
          delaySeconds = rules.delay_seconds;
        } else {
          tier = 'APPROVAL';
        }

        // Set reserved_amount on the transaction row
        sqlite
          .prepare(
            `UPDATE transactions SET reserved_amount = ? WHERE id = ?`,
          )
          .run(transaction.amount, txId);

        return {
          allowed: true,
          tier,
          ...(delaySeconds !== undefined ? { delaySeconds } : {}),
        };
      }

      // No SPENDING_LIMIT -> INSTANT passthrough (whitelist already passed)
      return { allowed: true, tier: 'INSTANT' as PolicyTier };
    });

    // Execute with IMMEDIATE isolation
    return txn.immediate();
  }

  // -------------------------------------------------------------------------
  // releaseReservation
  // -------------------------------------------------------------------------

  /**
   * Release a reserved amount on a transaction.
   * Called when transaction reaches FAILED/CANCELLED/EXPIRED state.
   *
   * @param txId - The transaction ID to clear reservation for
   */
  releaseReservation(txId: string): void {
    if (!this.sqlite) {
      throw new Error('releaseReservation requires raw sqlite instance in constructor');
    }

    this.sqlite
      .prepare('UPDATE transactions SET reserved_amount = NULL WHERE id = ?')
      .run(txId);
  }

  // -------------------------------------------------------------------------
  // Private: Override resolution
  // -------------------------------------------------------------------------

  /**
   * Resolve policy overrides: for each policy type, agent-specific wins over global.
   * Returns deduplicated policy list (one per type, agent-specific preferred).
   */
  private resolveOverrides(rows: PolicyRow[], agentId: string): PolicyRow[] {
    const typeMap = new Map<string, PolicyRow>();

    // Rows are already sorted by priority DESC.
    // For each type, prefer agent-specific over global.
    for (const row of rows) {
      const existing = typeMap.get(row.type);
      if (!existing) {
        typeMap.set(row.type, row);
      } else if (row.agentId === agentId && existing.agentId !== agentId) {
        // Agent-specific overrides global
        typeMap.set(row.type, row);
      }
    }

    return Array.from(typeMap.values());
  }

  // -------------------------------------------------------------------------
  // Private: WHITELIST evaluation
  // -------------------------------------------------------------------------

  /**
   * Evaluate WHITELIST policy.
   * Returns PolicyEvaluation if denied, null if allowed (or no whitelist).
   */
  private evaluateWhitelist(
    resolved: PolicyRow[],
    toAddress: string,
  ): PolicyEvaluation | null {
    const whitelist = resolved.find((p) => p.type === 'WHITELIST');
    if (!whitelist) return null;

    const rules: WhitelistRules = JSON.parse(whitelist.rules);

    // Empty allowed_addresses = whitelist inactive
    if (!rules.allowed_addresses || rules.allowed_addresses.length === 0) {
      return null;
    }

    // Case-insensitive comparison (EVM compat)
    const normalizedTo = toAddress.toLowerCase();
    const isWhitelisted = rules.allowed_addresses.some(
      (addr) => addr.toLowerCase() === normalizedTo,
    );

    if (!isWhitelisted) {
      return {
        allowed: false,
        tier: 'INSTANT',
        reason: `Address ${toAddress} not in whitelist`,
      };
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // Private: ALLOWED_TOKENS evaluation
  // -------------------------------------------------------------------------

  /**
   * Evaluate ALLOWED_TOKENS policy.
   *
   * Logic:
   * - Only applies to TOKEN_TRANSFER transaction type
   * - If transaction type is TOKEN_TRANSFER and no ALLOWED_TOKENS policy exists:
   *   -> deny with reason 'Token transfer not allowed: no ALLOWED_TOKENS policy configured'
   * - If ALLOWED_TOKENS policy exists, check if transaction's token address is in rules.tokens[].address:
   *   -> If found: return null (continue to next evaluation)
   *   -> If not found: deny with reason 'Token not in allowed list: {tokenAddress}'
   * - For non-TOKEN_TRANSFER types: return null (not applicable)
   *
   * Returns PolicyEvaluation if denied, null if allowed (or not applicable).
   */
  private evaluateAllowedTokens(
    resolved: PolicyRow[],
    transaction: TransactionParam,
  ): PolicyEvaluation | null {
    // Only evaluate for TOKEN_TRANSFER transactions
    if (transaction.type !== 'TOKEN_TRANSFER') return null;

    const allowedTokensPolicy = resolved.find((p) => p.type === 'ALLOWED_TOKENS');

    // No ALLOWED_TOKENS policy -> deny token transfers (default deny)
    if (!allowedTokensPolicy) {
      return {
        allowed: false,
        tier: 'INSTANT',
        reason: 'Token transfer not allowed: no ALLOWED_TOKENS policy configured',
      };
    }

    // Parse rules.tokens array
    const rules: AllowedTokensRules = JSON.parse(allowedTokensPolicy.rules);
    const tokenAddress = transaction.tokenAddress;

    if (!tokenAddress) {
      return {
        allowed: false,
        tier: 'INSTANT',
        reason: 'Token transfer missing token address',
      };
    }

    // Check if token is in allowed list (case-insensitive comparison for EVM addresses)
    const isAllowed = rules.tokens.some(
      (t) => t.address.toLowerCase() === tokenAddress.toLowerCase(),
    );

    if (!isAllowed) {
      return {
        allowed: false,
        tier: 'INSTANT',
        reason: `Token not in allowed list: ${tokenAddress}`,
      };
    }

    return null; // Token is allowed, continue evaluation
  }

  // -------------------------------------------------------------------------
  // Private: SPENDING_LIMIT evaluation
  // -------------------------------------------------------------------------

  /**
   * Evaluate SPENDING_LIMIT policy.
   * Returns PolicyEvaluation with tier classification, or null if no spending limit.
   */
  private evaluateSpendingLimit(
    resolved: PolicyRow[],
    amount: string,
  ): PolicyEvaluation | null {
    const spending = resolved.find((p) => p.type === 'SPENDING_LIMIT');
    if (!spending) return null;

    const rules: SpendingLimitRules = JSON.parse(spending.rules);
    const amountBig = BigInt(amount);
    const instantMax = BigInt(rules.instant_max);
    const notifyMax = BigInt(rules.notify_max);
    const delayMax = BigInt(rules.delay_max);

    let tier: PolicyTier;
    let delaySeconds: number | undefined;

    if (amountBig <= instantMax) {
      tier = 'INSTANT';
    } else if (amountBig <= notifyMax) {
      tier = 'NOTIFY';
    } else if (amountBig <= delayMax) {
      tier = 'DELAY';
      delaySeconds = rules.delay_seconds;
    } else {
      tier = 'APPROVAL';
    }

    return {
      allowed: true,
      tier,
      ...(delaySeconds !== undefined ? { delaySeconds } : {}),
    };
  }
}
