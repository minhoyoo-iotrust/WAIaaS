/**
 * DatabasePolicyEngine - v1.2 DB-backed policy engine with network scoping.
 *
 * Evaluates transactions against policies stored in the policies table.
 * Supports SPENDING_LIMIT (4-tier classification), WHITELIST (address filtering),
 * ALLOWED_NETWORKS (network whitelist, permissive default),
 * ALLOWED_TOKENS (token transfer whitelist, default deny),
 * CONTRACT_WHITELIST (contract call whitelist, default deny),
 * METHOD_WHITELIST (optional method-level restriction for contract calls),
 * APPROVED_SPENDERS (approve spender whitelist, default deny),
 * APPROVE_AMOUNT_LIMIT (unlimited approve block + amount cap),
 * and APPROVE_TIER_OVERRIDE (forced tier for APPROVE transactions).
 *
 * Algorithm:
 * 1. Load enabled policies for wallet (wallet-specific + global), ORDER BY priority DESC
 * 2. If no policies found, return INSTANT passthrough (Phase 7 compat)
 * 3. Resolve overrides: 4-level priority (wallet+network > wallet+null > global+network > global+null)
 * 4. Evaluate WHITELIST: deny if toAddress not in allowed_addresses
 * 4a.5. Evaluate ALLOWED_NETWORKS: deny if network not in allowed list (permissive default)
 * 4b. Evaluate ALLOWED_TOKENS: deny TOKEN_TRANSFER if no policy or token not whitelisted
 * 4c. Evaluate CONTRACT_WHITELIST: deny CONTRACT_CALL if no policy or contract not whitelisted
 * 4d. Evaluate METHOD_WHITELIST: deny CONTRACT_CALL if method selector not whitelisted (optional)
 * 4e. Evaluate APPROVED_SPENDERS: deny APPROVE if no policy or spender not approved
 * 4f. Evaluate APPROVE_AMOUNT_LIMIT: deny APPROVE if unlimited or exceeds max amount
 * 4g. Evaluate APPROVE_TIER_OVERRIDE: force tier for APPROVE (defaults to APPROVAL, skips SPENDING_LIMIT)
 * 5. Evaluate SPENDING_LIMIT: classify amount into INSTANT/NOTIFY/DELAY/APPROVAL
 *
 * TOCTOU Prevention (evaluateAndReserve):
 * Uses BEGIN IMMEDIATE to serialize concurrent policy evaluations.
 * reserved_amount tracks pending amounts to prevent two requests from both passing
 * under the same spending limit.
 *
 * @see docs/33-time-lock-approval-mechanism.md
 * @see docs/71-policy-engine-network-extension-design.md
 */

import type { IPolicyEngine, PolicyEvaluation, PolicyTier } from '@waiaas/core';
import { parseCaip19 } from '@waiaas/core';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import { eq, or, and, isNull, desc } from 'drizzle-orm';
import { policies } from '../infrastructure/database/schema.js';
import type * as schema from '../infrastructure/database/schema.js';
import type { SettingsService } from '../infrastructure/settings/settings-service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SpendingLimitRules {
  instant_max?: string;   // Phase 235: optional (was required, now optional for USD-only/token_limits-only policies)
  notify_max?: string;    // Phase 235: optional
  delay_max?: string;     // Phase 235: optional
  delay_seconds: number;
  // Phase 127: USD 기준 (optional)
  instant_max_usd?: number;
  notify_max_usd?: number;
  delay_max_usd?: number;
  // Phase 136: 누적 USD 한도 (optional)
  daily_limit_usd?: number;
  monthly_limit_usd?: number;
  // Phase 235: 토큰별 한도 (optional)
  token_limits?: Record<string, { instant_max: string; notify_max: string; delay_max: string }>;
}

interface WhitelistRules {
  allowed_addresses: string[];
}

interface AllowedTokensRules {
  tokens: Array<{ address: string; assetId?: string }>;
}

interface ContractWhitelistRules {
  contracts: Array<{ address: string; name?: string }>;
}

interface MethodWhitelistRules {
  methods: Array<{ contractAddress: string; selectors: string[] }>;
}

interface ApprovedSpendersRules {
  spenders: Array<{ address: string; name?: string; maxAmount?: string }>;
}

interface ApproveAmountLimitRules {
  maxAmount?: string;
  blockUnlimited: boolean;
}

interface ApproveTierOverrideRules {
  tier: string; // PolicyTier value
}

/** Threshold for detecting "unlimited" approve amounts. */
const UNLIMITED_THRESHOLD = (2n ** 256n - 1n) / 2n;

interface PolicyRow {
  id: string;
  walletId: string | null;
  type: string;
  rules: string;
  priority: number;
  enabled: boolean | null;
  network: string | null;
}

/** AllowedNetworksRules: rules JSON for ALLOWED_NETWORKS policy type. */
interface AllowedNetworksRules {
  networks: Array<{ network: string; name?: string }>;
}

/** Transaction parameter for policy evaluation. */
interface TransactionParam {
  type: string;
  amount: string;
  toAddress: string;
  chain: string;
  /** Resolved network for ALLOWED_NETWORKS evaluation + network scoping. */
  network?: string;
  /** Token address for ALLOWED_TOKENS evaluation (TOKEN_TRANSFER only). */
  tokenAddress?: string;
  /** CAIP-19 asset identifier for ALLOWED_TOKENS 4-scenario matching (TOKEN_TRANSFER only). */
  assetId?: string;
  /** Contract address for CONTRACT_WHITELIST evaluation (CONTRACT_CALL only). */
  contractAddress?: string;
  /** Function selector (4-byte hex, e.g. '0x12345678') for METHOD_WHITELIST evaluation (CONTRACT_CALL only). */
  selector?: string;
  /** Spender address for APPROVED_SPENDERS evaluation (APPROVE only). */
  spenderAddress?: string;
  /** Approve amount in raw units for APPROVE_AMOUNT_LIMIT evaluation (APPROVE only). */
  approveAmount?: string;
}

// ---------------------------------------------------------------------------
// Tier order + maxTier helper (Phase 127)
// ---------------------------------------------------------------------------

const TIER_ORDER: PolicyTier[] = ['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL'];

function maxTier(a: PolicyTier, b: PolicyTier): PolicyTier {
  const aIdx = TIER_ORDER.indexOf(a);
  const bIdx = TIER_ORDER.indexOf(b);
  return TIER_ORDER[Math.max(aIdx, bIdx)]!;
}

// ---------------------------------------------------------------------------
// DatabasePolicyEngine
// ---------------------------------------------------------------------------

/**
 * DB-backed policy engine with SPENDING_LIMIT 4-tier, WHITELIST, ALLOWED_NETWORKS,
 * ALLOWED_TOKENS, CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS,
 * APPROVE_AMOUNT_LIMIT, and APPROVE_TIER_OVERRIDE evaluation.
 *
 * Network scoping: policies can target specific networks via the `network` column.
 * 4-level override priority: wallet+network > wallet+null > global+network > global+null.
 *
 * Constructor takes a Drizzle DB instance typed with the full schema,
 * and optionally a raw better-sqlite3 Database instance for BEGIN IMMEDIATE transactions.
 */
export class DatabasePolicyEngine implements IPolicyEngine {
  private readonly sqlite: SQLiteDatabase | null;
  private readonly settingsService: SettingsService | null;

  constructor(
    private readonly db: BetterSQLite3Database<typeof schema>,
    sqlite?: SQLiteDatabase,
    settingsService?: SettingsService,
  ) {
    this.sqlite = sqlite ?? null;
    this.settingsService = settingsService ?? null;
  }

  /**
   * Evaluate a transaction against DB-stored policies.
   */
  async evaluate(
    walletId: string,
    transaction: TransactionParam,
  ): Promise<PolicyEvaluation> {
    // Step 1: Load enabled policies (wallet-specific + global, with network filter)
    const rows = await this.db
      .select()
      .from(policies)
      .where(
        and(
          or(eq(policies.walletId, walletId), isNull(policies.walletId)),
          or(
            transaction.network ? eq(policies.network, transaction.network) : isNull(policies.network),
            isNull(policies.network),
          ),
          eq(policies.enabled, true),
        ),
      )
      .orderBy(desc(policies.priority))
      .all();

    // Step 2: No policies -> INSTANT passthrough
    if (rows.length === 0) {
      return { allowed: true, tier: 'INSTANT' };
    }

    // Step 3: Resolve overrides (4-level: wallet+network > wallet+null > global+network > global+null)
    const resolved = this.resolveOverrides(rows as PolicyRow[], walletId, transaction.network);

    // Step 4: Evaluate WHITELIST (deny-first)
    const whitelistResult = this.evaluateWhitelist(resolved, transaction.toAddress);
    if (whitelistResult !== null) {
      return whitelistResult;
    }

    // Step 4a.5: Evaluate ALLOWED_NETWORKS (network whitelist, permissive default)
    if (transaction.network) {
      const allowedNetworksResult = this.evaluateAllowedNetworks(resolved, transaction.network);
      if (allowedNetworksResult !== null) {
        return allowedNetworksResult;
      }
    }

    // Step 4b: Evaluate ALLOWED_TOKENS (token transfer whitelist)
    const allowedTokensResult = this.evaluateAllowedTokens(resolved, transaction);
    if (allowedTokensResult !== null) {
      return allowedTokensResult;
    }

    // Step 4c: Evaluate CONTRACT_WHITELIST (contract call whitelist)
    const contractWhitelistResult = this.evaluateContractWhitelist(resolved, transaction);
    if (contractWhitelistResult !== null) {
      return contractWhitelistResult;
    }

    // Step 4d: Evaluate METHOD_WHITELIST (method-level restriction)
    const methodWhitelistResult = this.evaluateMethodWhitelist(resolved, transaction);
    if (methodWhitelistResult !== null) {
      return methodWhitelistResult;
    }

    // Step 4e: Evaluate APPROVED_SPENDERS (approve spender whitelist)
    const approvedSpendersResult = this.evaluateApprovedSpenders(resolved, transaction);
    if (approvedSpendersResult !== null) {
      return approvedSpendersResult;
    }

    // Step 4f: Evaluate APPROVE_AMOUNT_LIMIT (unlimited approve block + amount cap)
    const approveAmountResult = this.evaluateApproveAmountLimit(resolved, transaction);
    if (approveAmountResult !== null) {
      return approveAmountResult;
    }

    // Step 4g: Evaluate APPROVE_TIER_OVERRIDE (forced tier for APPROVE transactions)
    const approveTierResult = this.evaluateApproveTierOverride(resolved, transaction);
    if (approveTierResult !== null) {
      return approveTierResult; // FINAL result, skips SPENDING_LIMIT
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
  // Batch evaluation: evaluateBatch
  // -------------------------------------------------------------------------

  /**
   * Evaluate a batch of instructions using 2-stage policy evaluation.
   *
   * Phase A: Evaluate each instruction individually against its applicable policies.
   *          All-or-Nothing: if any instruction is denied, entire batch is denied.
   *
   * Phase B: Sum native amounts (TRANSFER.amount) and evaluate
   *          aggregate against SPENDING_LIMIT. If batch contains APPROVE, apply
   *          APPROVE_TIER_OVERRIDE and take max(amount tier, approve tier).
   *
   * @param walletId - Wallet whose policies to evaluate
   * @param instructions - Array of instruction parameters (same shape as TransactionParam)
   * @returns PolicyEvaluation with final tier or denial with violation details
   */
  async evaluateBatch(
    walletId: string,
    instructions: TransactionParam[],
    batchUsdAmount?: number,
  ): Promise<PolicyEvaluation> {
    // Step 1: Load policies with network filter
    // All instructions in a BATCH share the same network
    const resolvedNetwork = instructions[0]?.network;

    const rows = await this.db
      .select()
      .from(policies)
      .where(
        and(
          or(eq(policies.walletId, walletId), isNull(policies.walletId)),
          or(
            resolvedNetwork ? eq(policies.network, resolvedNetwork) : isNull(policies.network),
            isNull(policies.network),
          ),
          eq(policies.enabled, true),
        ),
      )
      .orderBy(desc(policies.priority))
      .all();

    if (rows.length === 0) {
      return { allowed: true, tier: 'INSTANT' };
    }

    const resolved = this.resolveOverrides(rows as PolicyRow[], walletId, resolvedNetwork);

    // ALLOWED_NETWORKS evaluation before Phase A
    if (resolvedNetwork) {
      const allowedNetworksResult = this.evaluateAllowedNetworks(resolved, resolvedNetwork);
      if (allowedNetworksResult !== null) {
        return allowedNetworksResult;
      }
    }

    // Phase A: Evaluate each instruction individually
    const violations: Array<{ index: number; type: string; reason: string }> = [];

    for (let i = 0; i < instructions.length; i++) {
      const instr = instructions[i]!;
      const result = this.evaluateInstructionPolicies(resolved, instr);
      if (result !== null && !result.allowed) {
        violations.push({
          index: i,
          type: instr.type,
          reason: result.reason ?? 'Policy violation',
        });
      }
    }

    // All-or-Nothing: 1 violation = entire batch denied
    if (violations.length > 0) {
      return {
        allowed: false,
        tier: 'INSTANT',
        reason:
          `Batch policy violation: ${violations.length} instruction(s) denied. ` +
          violations.map((v) => `[${v.index}] ${v.type}: ${v.reason}`).join('; '),
      };
    }

    // Phase B: Aggregate amount for SPENDING_LIMIT
    let totalNativeAmount = 0n;
    for (const instr of instructions) {
      if (instr.type === 'TRANSFER') {
        totalNativeAmount += BigInt(instr.amount);
      }
      // TOKEN_TRANSFER and APPROVE: 0 (no native amount)
      // CONTRACT_CALL: Solana has no native value attachment in CPI, so 0
    }

    // Evaluate aggregate against SPENDING_LIMIT (Phase 127: pass batchUsdAmount for USD evaluation)
    const amountTier = this.evaluateSpendingLimit(resolved, totalNativeAmount.toString(), batchUsdAmount);
    let finalTier = amountTier ? (amountTier.tier as PolicyTier) : ('INSTANT' as PolicyTier);

    // If batch contains APPROVE, apply APPROVE_TIER_OVERRIDE
    const hasApprove = instructions.some((i) => i.type === 'APPROVE');
    if (hasApprove) {
      // Get approve tier from APPROVE_TIER_OVERRIDE policy (or default APPROVAL)
      const approveTierPolicy = resolved.find((p) => p.type === 'APPROVE_TIER_OVERRIDE');
      let approveTier: PolicyTier;
      if (approveTierPolicy) {
        const rules: { tier: string } = JSON.parse(approveTierPolicy.rules);
        approveTier = rules.tier as PolicyTier;
      } else {
        approveTier = 'APPROVAL';
      }

      // Final tier = max(amount tier, approve tier)
      const tierOrder: PolicyTier[] = ['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL'];
      const amountIdx = tierOrder.indexOf(finalTier);
      const approveIdx = tierOrder.indexOf(approveTier);
      finalTier = tierOrder[Math.max(amountIdx, approveIdx)]!;
    }

    return {
      allowed: true,
      tier: finalTier,
    };
  }

  // -------------------------------------------------------------------------
  // Private: Per-instruction policy evaluation (Phase A helper)
  // -------------------------------------------------------------------------

  /**
   * Evaluate applicable policies for a single instruction in a batch.
   *
   * Only evaluates type-specific policies:
   * - TRANSFER: WHITELIST
   * - TOKEN_TRANSFER: WHITELIST + ALLOWED_TOKENS
   * - CONTRACT_CALL: CONTRACT_WHITELIST + METHOD_WHITELIST
   * - APPROVE: APPROVED_SPENDERS + APPROVE_AMOUNT_LIMIT
   *
   * Does NOT evaluate SPENDING_LIMIT (that's Phase B aggregate) or
   * APPROVE_TIER_OVERRIDE (that's Phase B).
   *
   * Returns null if all policies pass, PolicyEvaluation with allowed=false if denied.
   */
  private evaluateInstructionPolicies(
    resolved: PolicyRow[],
    instr: TransactionParam,
  ): PolicyEvaluation | null {
    // WHITELIST applies to TRANSFER and TOKEN_TRANSFER
    if (instr.type === 'TRANSFER' || instr.type === 'TOKEN_TRANSFER') {
      const whitelistResult = this.evaluateWhitelist(resolved, instr.toAddress);
      if (whitelistResult !== null) return whitelistResult;
    }

    // ALLOWED_TOKENS applies to TOKEN_TRANSFER
    if (instr.type === 'TOKEN_TRANSFER') {
      const allowedTokensResult = this.evaluateAllowedTokens(resolved, instr);
      if (allowedTokensResult !== null) return allowedTokensResult;
    }

    // CONTRACT_WHITELIST applies to CONTRACT_CALL
    if (instr.type === 'CONTRACT_CALL') {
      const contractResult = this.evaluateContractWhitelist(resolved, instr);
      if (contractResult !== null) return contractResult;

      const methodResult = this.evaluateMethodWhitelist(resolved, instr);
      if (methodResult !== null) return methodResult;
    }

    // APPROVED_SPENDERS + APPROVE_AMOUNT_LIMIT apply to APPROVE
    if (instr.type === 'APPROVE') {
      const spendersResult = this.evaluateApprovedSpenders(resolved, instr);
      if (spendersResult !== null) return spendersResult;

      const amountResult = this.evaluateApproveAmountLimit(resolved, instr);
      if (amountResult !== null) return amountResult;
    }

    return null; // All applicable policies passed
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
   * @param walletId - The wallet whose policies to evaluate
   * @param transaction - Transaction details for evaluation
   * @param txId - The transaction ID to update with reserved_amount
   * @returns PolicyEvaluation result
   * @throws Error if sqlite instance not provided in constructor
   */
  evaluateAndReserve(
    walletId: string,
    transaction: TransactionParam,
    txId: string,
    usdAmount?: number,
  ): PolicyEvaluation {
    if (!this.sqlite) {
      throw new Error('evaluateAndReserve requires raw sqlite instance in constructor');
    }

    const sqlite = this.sqlite;

    // Use better-sqlite3 transaction().immediate() for BEGIN IMMEDIATE
    const txn = sqlite.transaction(() => {
      // Step 1: Load enabled policies via raw SQL with network filter (inside IMMEDIATE txn)
      const policyRows = sqlite
        .prepare(
          `SELECT id, wallet_id AS walletId, type, rules, priority, enabled, network
           FROM policies
           WHERE (wallet_id = ? OR wallet_id IS NULL)
             AND (network = ? OR network IS NULL)
             AND enabled = 1
           ORDER BY priority DESC`,
        )
        .all(walletId, transaction.network ?? null) as PolicyRow[];

      // Step 2: No policies -> INSTANT passthrough
      if (policyRows.length === 0) {
        return { allowed: true, tier: 'INSTANT' as PolicyTier };
      }

      // Step 3: Resolve overrides (4-level with network)
      const resolved = this.resolveOverrides(policyRows, walletId, transaction.network);

      // Step 4: Evaluate WHITELIST (deny-first)
      const whitelistResult = this.evaluateWhitelist(resolved, transaction.toAddress);
      if (whitelistResult !== null) {
        return whitelistResult;
      }

      // Step 4a.5: Evaluate ALLOWED_NETWORKS (network whitelist, permissive default)
      if (transaction.network) {
        const allowedNetworksResult = this.evaluateAllowedNetworks(resolved, transaction.network);
        if (allowedNetworksResult !== null) {
          return allowedNetworksResult;
        }
      }

      // Step 4b: Evaluate ALLOWED_TOKENS (token transfer whitelist)
      const allowedTokensResult = this.evaluateAllowedTokens(resolved, transaction);
      if (allowedTokensResult !== null) {
        return allowedTokensResult;
      }

      // Step 4c: Evaluate CONTRACT_WHITELIST (contract call whitelist)
      const contractWhitelistResult = this.evaluateContractWhitelist(resolved, transaction);
      if (contractWhitelistResult !== null) {
        return contractWhitelistResult;
      }

      // Step 4d: Evaluate METHOD_WHITELIST (method-level restriction)
      const methodWhitelistResult = this.evaluateMethodWhitelist(resolved, transaction);
      if (methodWhitelistResult !== null) {
        return methodWhitelistResult;
      }

      // Step 4e: Evaluate APPROVED_SPENDERS (approve spender whitelist)
      const approvedSpendersResult = this.evaluateApprovedSpenders(resolved, transaction);
      if (approvedSpendersResult !== null) {
        return approvedSpendersResult;
      }

      // Step 4f: Evaluate APPROVE_AMOUNT_LIMIT (unlimited approve block + amount cap)
      const approveAmountResult = this.evaluateApproveAmountLimit(resolved, transaction);
      if (approveAmountResult !== null) {
        return approveAmountResult;
      }

      // Step 4g: Evaluate APPROVE_TIER_OVERRIDE (forced tier for APPROVE transactions)
      const approveTierResult = this.evaluateApproveTierOverride(resolved, transaction);
      if (approveTierResult !== null) {
        return approveTierResult; // FINAL result, skips SPENDING_LIMIT
      }

      // Step 5: Compute reserved total for SPENDING_LIMIT evaluation
      const spendingPolicy = resolved.find((p) => p.type === 'SPENDING_LIMIT');
      if (spendingPolicy) {
        // Sum of reserved_amount for wallet's PENDING/QUEUED/SIGNED transactions
        // SIGNED included for sign-only pipeline reservation (TOCTOU prevention)
        const reservedRow = sqlite
          .prepare(
            `SELECT COALESCE(SUM(CAST(reserved_amount AS INTEGER)), 0) AS total
             FROM transactions
             WHERE wallet_id = ?
               AND status IN ('PENDING', 'QUEUED', 'SIGNED')
               AND reserved_amount IS NOT NULL`,
          )
          .get(walletId) as { total: number };

        const reservedTotal = BigInt(reservedRow.total);
        const requestAmount = BigInt(transaction.amount);
        const effectiveAmount = reservedTotal + requestAmount;

        // Evaluate with effective amount (reserved + current) via unified evaluateSpendingLimit
        const spendingResult = this.evaluateSpendingLimit(
          resolved,
          effectiveAmount.toString(),
          usdAmount,
        );

        // Step 6: Cumulative USD limit evaluation (daily/monthly rolling window)
        if (usdAmount !== undefined && usdAmount > 0) {
          const rules: SpendingLimitRules = JSON.parse(spendingPolicy.rules);
          const hasCumulativeLimits = rules.daily_limit_usd !== undefined || rules.monthly_limit_usd !== undefined;

          if (hasCumulativeLimits) {
            const now = Math.floor(Date.now() / 1000);
            let cumulativeTier: PolicyTier = 'INSTANT';
            let cumulativeReason: 'cumulative_daily' | 'cumulative_monthly' | undefined;
            let cumulativeWarning: { type: 'daily' | 'monthly'; ratio: number; spent: number; limit: number } | undefined;

            // 6a: Daily (24h rolling window)
            if (rules.daily_limit_usd !== undefined) {
              const windowStart = now - 86400; // 24 * 60 * 60
              const spent = this.getCumulativeUsdSpent(sqlite, walletId, windowStart);
              const totalWithCurrent = spent + usdAmount;

              if (totalWithCurrent > rules.daily_limit_usd) {
                cumulativeTier = 'APPROVAL';
                cumulativeReason = 'cumulative_daily';
              } else {
                // 80% warning check
                const ratio = totalWithCurrent / rules.daily_limit_usd;
                if (ratio >= 0.8) {
                  cumulativeWarning = { type: 'daily', ratio, spent: totalWithCurrent, limit: rules.daily_limit_usd };
                }
              }
            }

            // 6b: Monthly (30-day rolling window) -- only if daily didn't already escalate
            if (rules.monthly_limit_usd !== undefined && cumulativeReason === undefined) {
              const windowStart = now - 2592000; // 30 * 24 * 60 * 60
              const spent = this.getCumulativeUsdSpent(sqlite, walletId, windowStart);
              const totalWithCurrent = spent + usdAmount;

              if (totalWithCurrent > rules.monthly_limit_usd) {
                cumulativeTier = 'APPROVAL';
                cumulativeReason = 'cumulative_monthly';
              } else if (!cumulativeWarning) {
                // 80% warning check (only if daily warning not already set)
                const ratio = totalWithCurrent / rules.monthly_limit_usd;
                if (ratio >= 0.8) {
                  cumulativeWarning = { type: 'monthly', ratio, spent: totalWithCurrent, limit: rules.monthly_limit_usd };
                }
              }
            }

            // Step 7: Final tier = max(per-tx tier, cumulative tier)
            const perTxTier = spendingResult?.tier ?? ('INSTANT' as PolicyTier);
            const finalTier = maxTier(perTxTier, cumulativeTier);

            // Determine approvalReason
            let approvalReason: 'per_tx' | 'cumulative_daily' | 'cumulative_monthly' | undefined;
            if (finalTier === 'APPROVAL') {
              approvalReason = cumulativeReason ?? 'per_tx';
            }

            // Record USD amounts + reserved_amount
            sqlite
              .prepare(
                `UPDATE transactions SET reserved_amount = ?, amount_usd = ?, reserved_amount_usd = ? WHERE id = ?`,
              )
              .run(transaction.amount, usdAmount, usdAmount, txId);

            return {
              allowed: true,
              tier: finalTier,
              ...(spendingResult?.delaySeconds !== undefined && finalTier === 'DELAY' ? { delaySeconds: spendingResult.delaySeconds } : {}),
              ...(approvalReason ? { approvalReason } : {}),
              ...(cumulativeWarning ? { cumulativeWarning } : {}),
            };
          }
        }

        // No cumulative limits or usdAmount not available -- use per-tx result
        // Set reserved_amount on the transaction row + USD amounts if available
        if (usdAmount !== undefined) {
          sqlite
            .prepare(
              `UPDATE transactions SET reserved_amount = ?, amount_usd = ?, reserved_amount_usd = ? WHERE id = ?`,
            )
            .run(transaction.amount, usdAmount, usdAmount, txId);
        } else {
          sqlite
            .prepare(
              `UPDATE transactions SET reserved_amount = ? WHERE id = ?`,
            )
            .run(transaction.amount, txId);
        }

        return spendingResult ?? { allowed: true, tier: 'INSTANT' as PolicyTier };
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
      .prepare('UPDATE transactions SET reserved_amount = NULL, reserved_amount_usd = NULL WHERE id = ?')
      .run(txId);
  }

  // -------------------------------------------------------------------------
  // Private: Cumulative USD spending aggregation
  // -------------------------------------------------------------------------

  /**
   * Get cumulative USD spent by wallet within a time window.
   * Includes both confirmed amounts (amount_usd) and pending reservations (reserved_amount_usd).
   *
   * CONFIRMED/SIGNED: counted via amount_usd (confirmed or about to be broadcasted).
   * PENDING/QUEUED: counted via reserved_amount_usd (awaiting processing, not yet confirmed).
   * Deduplication: SIGNED is in the first query only (amount_usd). PENDING/QUEUED in second only.
   */
  private getCumulativeUsdSpent(sqlite: SQLiteDatabase, walletId: string, windowStart: number): number {
    // 1. Confirmed transactions (CONFIRMED/SIGNED) amount_usd within window
    const confirmedRow = sqlite
      .prepare(
        `SELECT COALESCE(SUM(amount_usd), 0) AS total
         FROM transactions
         WHERE wallet_id = ? AND status IN ('CONFIRMED', 'SIGNED')
         AND created_at >= ? AND amount_usd IS NOT NULL`,
      )
      .get(walletId, windowStart) as { total: number };

    // 2. Pending transactions (PENDING/QUEUED) reserved_amount_usd (no window filter -- all pending count)
    const pendingRow = sqlite
      .prepare(
        `SELECT COALESCE(SUM(reserved_amount_usd), 0) AS total
         FROM transactions
         WHERE wallet_id = ? AND status IN ('PENDING', 'QUEUED')
         AND reserved_amount_usd IS NOT NULL`,
      )
      .get(walletId) as { total: number };

    return confirmedRow.total + pendingRow.total;
  }

  // -------------------------------------------------------------------------
  // Private: Override resolution
  // -------------------------------------------------------------------------

  /**
   * Resolve policy overrides with 4-level priority:
   *   1. wallet-specific + network-specific (highest)
   *   2. wallet-specific + all-networks
   *   3. global + network-specific
   *   4. global + all-networks (lowest)
   *
   * For each policy type, one policy is selected.
   * Lower priority entries are inserted first, higher priority entries overwrite.
   * Key: typeMap[row.type] (same as current -- no composite key needed, PLCY-D03).
   *
   * Backward compat: when all policies have network=NULL,
   * phases 2+4 collapse into current 2-level (wallet > global) behavior.
   */
  private resolveOverrides(
    rows: PolicyRow[],
    walletId: string,
    resolvedNetwork?: string,
  ): PolicyRow[] {
    const typeMap = new Map<string, PolicyRow>();

    // Phase 1: global + all-networks (4th priority, lowest)
    for (const row of rows) {
      if (row.walletId === null && row.network === null) {
        typeMap.set(row.type, row);
      }
    }

    // Phase 2: global + network-specific (3rd priority)
    if (resolvedNetwork) {
      for (const row of rows) {
        if (row.walletId === null && row.network === resolvedNetwork) {
          typeMap.set(row.type, row);
        }
      }
    }

    // Phase 3: wallet-specific + all-networks (2nd priority)
    for (const row of rows) {
      if (row.walletId === walletId && row.network === null) {
        typeMap.set(row.type, row);
      }
    }

    // Phase 4: wallet-specific + network-specific (1st priority, highest)
    if (resolvedNetwork) {
      for (const row of rows) {
        if (row.walletId === walletId && row.network === resolvedNetwork) {
          typeMap.set(row.type, row);
        }
      }
    }

    return Array.from(typeMap.values());
  }

  // -------------------------------------------------------------------------
  // Private: ALLOWED_NETWORKS evaluation
  // -------------------------------------------------------------------------

  /**
   * Evaluate ALLOWED_NETWORKS policy.
   *
   * Logic:
   * - Applies to ALL 5 transaction types (TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL, APPROVE, BATCH)
   * - If no ALLOWED_NETWORKS policy exists: return null (permissive default -- all networks allowed)
   * - If policy exists: check if resolvedNetwork is in rules.networks[].network
   *   -> If found: return null (continue to next evaluation)
   *   -> If not found: deny with reason 'Network not in allowed list'
   * - Comparison: case-insensitive (toLowerCase)
   * - Tier: INSTANT (immediate denial)
   *
   * Returns PolicyEvaluation if denied, null if allowed (or no policy).
   */
  private evaluateAllowedNetworks(
    resolved: PolicyRow[],
    resolvedNetwork: string,
  ): PolicyEvaluation | null {
    const policy = resolved.find((p) => p.type === 'ALLOWED_NETWORKS');

    // No ALLOWED_NETWORKS policy -> permissive default (all networks allowed)
    if (!policy) return null;

    const rules: AllowedNetworksRules = JSON.parse(policy.rules);

    // Case-insensitive comparison
    const isAllowed = rules.networks.some(
      (n) => n.network.toLowerCase() === resolvedNetwork.toLowerCase(),
    );

    if (!isAllowed) {
      const allowedList = rules.networks.map((n) => n.network).join(', ');
      return {
        allowed: false,
        tier: 'INSTANT',
        reason: `Network '${resolvedNetwork}' not in allowed networks list. Allowed: ${allowedList}`,
      };
    }

    return null; // Network allowed, continue evaluation
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
   * Evaluate ALLOWED_TOKENS policy with 4-scenario matching matrix (PLCY-03).
   *
   * Logic:
   * - Only applies to TOKEN_TRANSFER transaction type
   * - If transaction type is TOKEN_TRANSFER and no ALLOWED_TOKENS policy exists:
   *   -> deny with reason 'Token transfer not allowed: no ALLOWED_TOKENS policy configured'
   * - If ALLOWED_TOKENS policy exists, match using 4-scenario matrix:
   *   Scenario 1: Policy assetId + TX assetId -> exact CAIP-19 string match
   *   Scenario 2: Policy assetId + TX address only -> extract address from policy assetId, compare lowercase
   *   Scenario 3: Policy address only + TX assetId -> extract address from TX assetId, compare lowercase
   *   Scenario 4: Policy address only + TX address only -> current behavior (case-insensitive)
   * - EVM addresses normalized to lowercase for comparison (PLCY-04)
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

    // No ALLOWED_TOKENS policy -> check toggle, then deny (default deny)
    if (!allowedTokensPolicy) {
      if (this.settingsService?.get('policy.default_deny_tokens') === 'false') {
        return null; // default-allow mode: skip token whitelist check
      }
      return {
        allowed: false,
        tier: 'INSTANT',
        reason: 'Token transfer not allowed: no ALLOWED_TOKENS policy configured',
      };
    }

    // Parse rules.tokens array
    const rules: AllowedTokensRules = JSON.parse(allowedTokensPolicy.rules);
    const txTokenAddress = transaction.tokenAddress;
    const txAssetId = transaction.assetId;

    if (!txTokenAddress && !txAssetId) {
      return {
        allowed: false,
        tier: 'INSTANT',
        reason: 'Token transfer missing token address',
      };
    }

    // 4-scenario matching matrix (PLCY-03)
    const isAllowed = rules.tokens.some((policyToken) => {
      // Scenario 1: Both have assetId -> exact CAIP-19 string match
      // CAIP-19 strings are already normalized (EVM lowercase by tokenAssetId, Solana preserved)
      if (policyToken.assetId && txAssetId) {
        return policyToken.assetId === txAssetId;
      }

      // Scenario 2: Policy has assetId, TX has address only
      if (policyToken.assetId && txTokenAddress) {
        try {
          const policyAddr = parseCaip19(policyToken.assetId).assetReference;
          return policyAddr.toLowerCase() === txTokenAddress.toLowerCase();
        } catch {
          return false; // Invalid policy assetId -> no match
        }
      }

      // Scenario 3: Policy has address only, TX has assetId
      if (!policyToken.assetId && txAssetId) {
        try {
          const txAddr = parseCaip19(txAssetId).assetReference;
          return policyToken.address.toLowerCase() === txAddr.toLowerCase();
        } catch {
          return false; // Invalid TX assetId -> no match
        }
      }

      // Scenario 4: Both address only -> current behavior (case-insensitive)
      return policyToken.address.toLowerCase() === (txTokenAddress ?? '').toLowerCase();
    });

    if (!isAllowed) {
      return {
        allowed: false,
        tier: 'INSTANT',
        reason: `Token not in allowed list: ${txAssetId ?? txTokenAddress}`,
      };
    }

    return null; // Token is allowed, continue evaluation
  }

  // -------------------------------------------------------------------------
  // Private: CONTRACT_WHITELIST evaluation
  // -------------------------------------------------------------------------

  /**
   * Evaluate CONTRACT_WHITELIST policy.
   *
   * Logic:
   * - Only applies to CONTRACT_CALL transaction type
   * - If transaction type is CONTRACT_CALL and no CONTRACT_WHITELIST policy exists:
   *   -> deny with reason 'Contract calls disabled: no CONTRACT_WHITELIST policy configured'
   * - If CONTRACT_WHITELIST policy exists, check if contract address is in rules.contracts[].address:
   *   -> If found: return null (continue to next evaluation)
   *   -> If not found: deny with reason 'Contract not whitelisted: {address}'
   * - For non-CONTRACT_CALL types: return null (not applicable)
   *
   * Returns PolicyEvaluation if denied, null if allowed (or not applicable).
   */
  private evaluateContractWhitelist(
    resolved: PolicyRow[],
    transaction: TransactionParam,
  ): PolicyEvaluation | null {
    // Only evaluate for CONTRACT_CALL transactions
    if (transaction.type !== 'CONTRACT_CALL') return null;

    const contractWhitelistPolicy = resolved.find((p) => p.type === 'CONTRACT_WHITELIST');

    // No CONTRACT_WHITELIST policy -> check toggle, then deny (default deny)
    if (!contractWhitelistPolicy) {
      if (this.settingsService?.get('policy.default_deny_contracts') === 'false') {
        return null; // default-allow mode: skip contract whitelist check
      }
      return {
        allowed: false,
        tier: 'INSTANT',
        reason: 'Contract calls disabled: no CONTRACT_WHITELIST policy configured',
      };
    }

    // Parse rules.contracts array
    const rules: ContractWhitelistRules = JSON.parse(contractWhitelistPolicy.rules);
    const contractAddress = transaction.contractAddress ?? transaction.toAddress;

    // Check if contract is in whitelist (case-insensitive comparison for EVM addresses)
    const isWhitelisted = rules.contracts.some(
      (c) => c.address.toLowerCase() === contractAddress.toLowerCase(),
    );

    if (!isWhitelisted) {
      return {
        allowed: false,
        tier: 'INSTANT',
        reason: `Contract not whitelisted: ${contractAddress}`,
      };
    }

    return null; // Contract is whitelisted, continue evaluation
  }

  // -------------------------------------------------------------------------
  // Private: METHOD_WHITELIST evaluation
  // -------------------------------------------------------------------------

  /**
   * Evaluate METHOD_WHITELIST policy.
   *
   * Logic:
   * - Only applies to CONTRACT_CALL transaction type
   * - If no METHOD_WHITELIST policy exists: return null (method restriction is optional)
   * - If METHOD_WHITELIST policy exists, find matching entry for transaction's contract address:
   *   -> If no entry for this contract: return null (no method restriction for this contract)
   *   -> If entry found, check if transaction's selector is in entry.selectors:
   *     -> If found: return null (method allowed)
   *     -> If not found: deny with reason 'Method not whitelisted: {selector} on contract {address}'
   *
   * Returns PolicyEvaluation if denied, null if allowed (or not applicable).
   */
  private evaluateMethodWhitelist(
    resolved: PolicyRow[],
    transaction: TransactionParam,
  ): PolicyEvaluation | null {
    // Only evaluate for CONTRACT_CALL transactions
    if (transaction.type !== 'CONTRACT_CALL') return null;

    const methodWhitelistPolicy = resolved.find((p) => p.type === 'METHOD_WHITELIST');

    // No METHOD_WHITELIST policy -> no method restriction (optional policy)
    if (!methodWhitelistPolicy) return null;

    // Parse rules.methods array
    const rules: MethodWhitelistRules = JSON.parse(methodWhitelistPolicy.rules);
    const contractAddress = transaction.contractAddress ?? transaction.toAddress;
    const selector = transaction.selector;

    // Find matching entry for this contract (case-insensitive)
    const entry = rules.methods.find(
      (m) => m.contractAddress.toLowerCase() === contractAddress.toLowerCase(),
    );

    // No entry for this contract -> no method restriction for this specific contract
    if (!entry) return null;

    // Check if selector is in the allowed list (case-insensitive)
    if (!selector) {
      return {
        allowed: false,
        tier: 'INSTANT',
        reason: `Method not whitelisted: missing selector on contract ${contractAddress}`,
      };
    }

    const isAllowed = entry.selectors.some(
      (s) => s.toLowerCase() === selector.toLowerCase(),
    );

    if (!isAllowed) {
      return {
        allowed: false,
        tier: 'INSTANT',
        reason: `Method not whitelisted: ${selector} on contract ${contractAddress}`,
      };
    }

    return null; // Method is whitelisted, continue evaluation
  }

  // -------------------------------------------------------------------------
  // Private: APPROVED_SPENDERS evaluation
  // -------------------------------------------------------------------------

  /**
   * Evaluate APPROVED_SPENDERS policy.
   *
   * Logic:
   * - Only applies to APPROVE transaction type
   * - If transaction type is APPROVE and no APPROVED_SPENDERS policy exists:
   *   -> deny with reason 'Token approvals disabled: no APPROVED_SPENDERS policy configured'
   * - If APPROVED_SPENDERS policy exists, check if transaction's spenderAddress is in rules.spenders[]:
   *   -> If found: return null (continue evaluation)
   *   -> If not found: deny with reason 'Spender not in approved list: {address}'
   * - Case-insensitive comparison (EVM addresses)
   *
   * Returns PolicyEvaluation if denied, null if allowed (or not applicable).
   */
  private evaluateApprovedSpenders(
    resolved: PolicyRow[],
    transaction: TransactionParam,
  ): PolicyEvaluation | null {
    // Only evaluate for APPROVE transactions
    if (transaction.type !== 'APPROVE') return null;

    const approvedSpendersPolicy = resolved.find((p) => p.type === 'APPROVED_SPENDERS');

    // No APPROVED_SPENDERS policy -> check toggle, then deny (default deny)
    if (!approvedSpendersPolicy) {
      if (this.settingsService?.get('policy.default_deny_spenders') === 'false') {
        return null; // default-allow mode: skip approved spenders check
      }
      return {
        allowed: false,
        tier: 'INSTANT',
        reason: 'Token approvals disabled: no APPROVED_SPENDERS policy configured',
      };
    }

    // Parse rules.spenders array
    const rules: ApprovedSpendersRules = JSON.parse(approvedSpendersPolicy.rules);
    const spenderAddress = transaction.spenderAddress;

    if (!spenderAddress) {
      return {
        allowed: false,
        tier: 'INSTANT',
        reason: 'Approve missing spender address',
      };
    }

    // Check if spender is in approved list (case-insensitive for EVM addresses)
    const isApproved = rules.spenders.some(
      (s) => s.address.toLowerCase() === spenderAddress.toLowerCase(),
    );

    if (!isApproved) {
      return {
        allowed: false,
        tier: 'INSTANT',
        reason: `Spender not in approved list: ${spenderAddress}`,
      };
    }

    return null; // Spender is approved, continue evaluation
  }

  // -------------------------------------------------------------------------
  // Private: APPROVE_AMOUNT_LIMIT evaluation
  // -------------------------------------------------------------------------

  /**
   * Evaluate APPROVE_AMOUNT_LIMIT policy.
   *
   * Logic:
   * - Only applies to APPROVE transaction type
   * - Checks for unlimited approve amounts (>= UNLIMITED_THRESHOLD)
   * - Checks for amount cap (maxAmount)
   * - If no policy exists: default block_unlimited=true (block unlimited approvals)
   *
   * Returns PolicyEvaluation if denied, null if allowed (or not applicable).
   */
  private evaluateApproveAmountLimit(
    resolved: PolicyRow[],
    transaction: TransactionParam,
  ): PolicyEvaluation | null {
    // Only evaluate for APPROVE transactions
    if (transaction.type !== 'APPROVE') return null;

    const approveAmount = transaction.approveAmount;
    if (!approveAmount) return null; // No amount to check

    const amount = BigInt(approveAmount);

    const approveAmountPolicy = resolved.find((p) => p.type === 'APPROVE_AMOUNT_LIMIT');

    if (!approveAmountPolicy) {
      // No policy: default block unlimited
      if (amount >= UNLIMITED_THRESHOLD) {
        return {
          allowed: false,
          tier: 'INSTANT',
          reason: 'Unlimited token approval is blocked',
        };
      }
      return null;
    }

    // Parse rules
    const rules: ApproveAmountLimitRules = JSON.parse(approveAmountPolicy.rules);

    // Check unlimited block
    if (rules.blockUnlimited && amount >= UNLIMITED_THRESHOLD) {
      return {
        allowed: false,
        tier: 'INSTANT',
        reason: 'Unlimited token approval is blocked',
      };
    }

    // Check maxAmount cap
    if (rules.maxAmount && amount > BigInt(rules.maxAmount)) {
      return {
        allowed: false,
        tier: 'INSTANT',
        reason: 'Approve amount exceeds limit',
      };
    }

    return null; // Amount within limits, continue evaluation
  }

  // -------------------------------------------------------------------------
  // Private: APPROVE_TIER_OVERRIDE evaluation
  // -------------------------------------------------------------------------

  /**
   * Evaluate APPROVE_TIER_OVERRIDE policy.
   *
   * Logic:
   * - Only applies to APPROVE transaction type
   * - If no APPROVE_TIER_OVERRIDE policy exists: return APPROVAL tier (default: Owner approval required)
   * - If policy exists: return configured tier
   * - This is a FINAL result -- skips SPENDING_LIMIT entirely for APPROVE transactions
   *
   * Returns PolicyEvaluation (always returns result for APPROVE type, null for others).
   */
  private evaluateApproveTierOverride(
    resolved: PolicyRow[],
    transaction: TransactionParam,
  ): PolicyEvaluation | null {
    // Only evaluate for APPROVE transactions
    if (transaction.type !== 'APPROVE') return null;

    const approveTierPolicy = resolved.find((p) => p.type === 'APPROVE_TIER_OVERRIDE');

    if (!approveTierPolicy) {
      // Default: APPROVAL tier (Owner approval required for approvals)
      return { allowed: true, tier: 'APPROVAL' as PolicyTier };
    }

    // Parse rules
    const rules: ApproveTierOverrideRules = JSON.parse(approveTierPolicy.rules);
    return { allowed: true, tier: rules.tier as PolicyTier };
  }

  // -------------------------------------------------------------------------
  // Private: SPENDING_LIMIT evaluation
  // -------------------------------------------------------------------------

  /**
   * Evaluate SPENDING_LIMIT policy.
   * Returns PolicyEvaluation with tier classification, or null if no spending limit.
   *
   * Phase 127: usdAmount가 전달되고 rules에 USD 임계값이 설정되어 있으면,
   * 네이티브 티어와 USD 티어 중 더 보수적인(높은) 티어를 채택한다.
   */
  private evaluateSpendingLimit(
    resolved: PolicyRow[],
    amount: string,
    usdAmount?: number,
  ): PolicyEvaluation | null {
    const spending = resolved.find((p) => p.type === 'SPENDING_LIMIT');
    if (!spending) return null;

    const rules: SpendingLimitRules = JSON.parse(spending.rules);

    // 1. 네이티브 기준 티어 (기존 로직)
    const nativeTier = this.evaluateNativeTier(BigInt(amount), rules);

    // 2. USD 기준 티어 (Phase 127)
    let finalTier = nativeTier;
    if (usdAmount !== undefined && usdAmount > 0 && this.hasUsdThresholds(rules)) {
      const usdTier = this.evaluateUsdTier(usdAmount, rules);
      finalTier = maxTier(nativeTier, usdTier);
    }

    // delaySeconds는 최종 tier가 DELAY일 때만 포함
    const delaySeconds = finalTier === 'DELAY' ? rules.delay_seconds : undefined;

    return {
      allowed: true,
      tier: finalTier,
      ...(delaySeconds !== undefined ? { delaySeconds } : {}),
      ...(finalTier === 'APPROVAL' ? { approvalReason: 'per_tx' as const } : {}),
    };
  }

  /**
   * Evaluate native amount tier (extracted from evaluateSpendingLimit).
   * Note: non-null assertions used here -- Phase 236 will add proper undefined guards.
   */
  private evaluateNativeTier(amountBig: bigint, rules: SpendingLimitRules): PolicyTier {
    const instantMax = BigInt(rules.instant_max!);
    const notifyMax = BigInt(rules.notify_max!);
    const delayMax = BigInt(rules.delay_max!);

    if (amountBig <= instantMax) {
      return 'INSTANT';
    } else if (amountBig <= notifyMax) {
      return 'NOTIFY';
    } else if (amountBig <= delayMax) {
      return 'DELAY';
    } else {
      return 'APPROVAL';
    }
  }

  /**
   * Check if rules have any USD thresholds configured.
   */
  private hasUsdThresholds(rules: SpendingLimitRules): boolean {
    return rules.instant_max_usd !== undefined
      || rules.notify_max_usd !== undefined
      || rules.delay_max_usd !== undefined;
  }

  /**
   * Evaluate USD amount tier.
   */
  private evaluateUsdTier(usdAmount: number, rules: SpendingLimitRules): PolicyTier {
    if (rules.instant_max_usd !== undefined && usdAmount <= rules.instant_max_usd) {
      return 'INSTANT';
    }
    if (rules.notify_max_usd !== undefined && usdAmount <= rules.notify_max_usd) {
      return 'NOTIFY';
    }
    if (rules.delay_max_usd !== undefined && usdAmount <= rules.delay_max_usd) {
      return 'DELAY';
    }
    return 'APPROVAL';
  }
}
