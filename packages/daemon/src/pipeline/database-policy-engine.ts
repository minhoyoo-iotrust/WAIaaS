/**
 * DatabasePolicyEngine - v1.2 DB-backed policy engine.
 *
 * Evaluates transactions against policies stored in the policies table.
 * Supports SPENDING_LIMIT (4-tier classification), WHITELIST (address filtering),
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
 * 3. Resolve overrides: wallet-specific policies override global policies of same type
 * 4. Evaluate WHITELIST: deny if toAddress not in allowed_addresses
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
}

/** Transaction parameter for policy evaluation. */
interface TransactionParam {
  type: string;
  amount: string;
  toAddress: string;
  chain: string;
  /** Token address for ALLOWED_TOKENS evaluation (TOKEN_TRANSFER only). */
  tokenAddress?: string;
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
// DatabasePolicyEngine
// ---------------------------------------------------------------------------

/**
 * DB-backed policy engine with SPENDING_LIMIT 4-tier, WHITELIST, ALLOWED_TOKENS,
 * CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT,
 * and APPROVE_TIER_OVERRIDE evaluation.
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
    walletId: string,
    transaction: TransactionParam,
  ): Promise<PolicyEvaluation> {
    // Step 1: Load enabled policies (wallet-specific + global)
    const rows = await this.db
      .select()
      .from(policies)
      .where(
        and(
          or(eq(policies.walletId, walletId), isNull(policies.walletId)),
          eq(policies.enabled, true),
        ),
      )
      .orderBy(desc(policies.priority))
      .all();

    // Step 2: No policies -> INSTANT passthrough
    if (rows.length === 0) {
      return { allowed: true, tier: 'INSTANT' };
    }

    // Step 3: Resolve overrides (wallet-specific wins over global for same type)
    const resolved = this.resolveOverrides(rows as PolicyRow[], walletId);

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
  ): Promise<PolicyEvaluation> {
    // Step 1: Load policies (reuse existing query logic)
    const rows = await this.db
      .select()
      .from(policies)
      .where(
        and(
          or(eq(policies.walletId, walletId), isNull(policies.walletId)),
          eq(policies.enabled, true),
        ),
      )
      .orderBy(desc(policies.priority))
      .all();

    if (rows.length === 0) {
      return { allowed: true, tier: 'INSTANT' };
    }

    const resolved = this.resolveOverrides(rows as PolicyRow[], walletId);

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

    // Evaluate aggregate against SPENDING_LIMIT
    const amountTier = this.evaluateSpendingLimit(resolved, totalNativeAmount.toString());
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
          `SELECT id, wallet_id AS walletId, type, rules, priority, enabled
           FROM policies
           WHERE (wallet_id = ? OR wallet_id IS NULL)
             AND enabled = 1
           ORDER BY priority DESC`,
        )
        .all(walletId) as PolicyRow[];

      // Step 2: No policies -> INSTANT passthrough
      if (policyRows.length === 0) {
        return { allowed: true, tier: 'INSTANT' as PolicyTier };
      }

      // Step 3: Resolve overrides
      const resolved = this.resolveOverrides(policyRows, walletId);

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
        // Sum of reserved_amount for wallet's PENDING/QUEUED transactions
        const reservedRow = sqlite
          .prepare(
            `SELECT COALESCE(SUM(CAST(reserved_amount AS INTEGER)), 0) AS total
             FROM transactions
             WHERE wallet_id = ?
               AND status IN ('PENDING', 'QUEUED')
               AND reserved_amount IS NOT NULL`,
          )
          .get(walletId) as { total: number };

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
   * Resolve policy overrides: for each policy type, wallet-specific wins over global.
   * Returns deduplicated policy list (one per type, agent-specific preferred).
   */
  private resolveOverrides(rows: PolicyRow[], walletId: string): PolicyRow[] {
    const typeMap = new Map<string, PolicyRow>();

    // Rows are already sorted by priority DESC.
    // For each type, prefer wallet-specific over global.
    for (const row of rows) {
      const existing = typeMap.get(row.type);
      if (!existing) {
        typeMap.set(row.type, row);
      } else if (row.walletId === walletId && existing.walletId !== walletId) {
        // Wallet-specific overrides global
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

    // No CONTRACT_WHITELIST policy -> deny contract calls (default deny)
    if (!contractWhitelistPolicy) {
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

    // No APPROVED_SPENDERS policy -> deny approvals (default deny)
    if (!approvedSpendersPolicy) {
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
