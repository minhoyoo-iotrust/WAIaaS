/**
 * DatabasePolicyEngine - v1.2 DB-backed policy engine with network scoping.
 *
 * This file contains the orchestration class that dispatches to evaluator modules
 * in the evaluators/ directory. Each policy type has its own evaluator file.
 *
 * Evaluates transactions against policies stored in the policies table.
 * Supports SPENDING_LIMIT, WHITELIST, ALLOWED_NETWORKS, ALLOWED_TOKENS,
 * CONTRACT_WHITELIST, METHOD_WHITELIST, APPROVED_SPENDERS, APPROVE_AMOUNT_LIMIT,
 * APPROVE_TIER_OVERRIDE, LENDING_ASSET_WHITELIST, LENDING_LTV_LIMIT,
 * PERP_ALLOWED_MARKETS, PERP_MAX_LEVERAGE, PERP_MAX_POSITION_USD,
 * VENUE_WHITELIST, ACTION_CATEGORY_LIMIT, and REPUTATION_THRESHOLD.
 *
 * @see docs/33-time-lock-approval-mechanism.md
 * @see docs/71-policy-engine-network-extension-design.md
 */

import type { IPolicyEngine, PolicyEvaluation, PolicyTier } from '@waiaas/core';
import {
  safeJsonParse,
  WAIaaSError,
  SpendingLimitRulesSchema,
  ApproveTierOverrideRulesSchema,
  ReputationThresholdRulesSchema,
} from '@waiaas/core';
import { type z } from 'zod';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import { eq, or, and, isNull, desc } from 'drizzle-orm';
import { policies, wallets, agentIdentities } from '../infrastructure/database/schema.js';
import type * as schema from '../infrastructure/database/schema.js';
import type { SettingsService } from '../infrastructure/settings/settings-service.js';
import type { ReputationCacheService } from '../services/erc8004/reputation-cache-service.js';

// Evaluator imports
import { evaluateWhitelist, evaluateAllowedNetworks, evaluateAllowedTokens } from './evaluators/allowed-tokens.js';
import { evaluateContractWhitelist, evaluateMethodWhitelist, evaluateVenueWhitelist, evaluatePerpAllowedMarkets } from './evaluators/contract-whitelist.js';
import { evaluateApprovedSpenders, evaluateApproveAmountLimit, evaluateApproveTierOverride } from './evaluators/approved-spenders.js';
import { evaluateSpendingLimit, evaluateActionCategoryLimit } from './evaluators/spending-limit.js';
import { evaluateLendingAssetWhitelist } from './evaluators/lending-asset-whitelist.js';
import { evaluateLendingLtvLimit, evaluatePerpMaxLeverage, evaluatePerpMaxPositionUsd } from './evaluators/lending-ltv-limit.js';
import { maxTier } from './evaluators/helpers.js';
import type { PolicyRow, TransactionParam, ParseRulesContext, SettingsContext } from './evaluators/types.js';

// Re-export types for consumers
export type { PolicyRow, TransactionParam, ParseRulesContext };

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
 */
export class DatabasePolicyEngine implements IPolicyEngine {
  private readonly sqlite: SQLiteDatabase | null;
  private readonly settingsService: SettingsService | null;
  private readonly reputationCacheService: ReputationCacheService | null;

  constructor(
    private readonly db: BetterSQLite3Database<typeof schema>,
    sqlite?: SQLiteDatabase,
    settingsService?: SettingsService,
    reputationCacheService?: ReputationCacheService,
  ) {
    this.sqlite = sqlite ?? null;
    this.settingsService = settingsService ?? null;
    this.reputationCacheService = reputationCacheService ?? null;
  }

  /** Evaluator context with parseRules + settingsService access. */
  private get ctx(): ParseRulesContext & SettingsContext {
    return {
      parseRules: this.parseRules.bind(this),
      settingsService: this.settingsService,
    };
  }

  /**
   * Parse policy rules JSON with Zod validation.
   * Throws POLICY_RULES_CORRUPT on invalid JSON or schema mismatch.
   */
  private parseRules<S extends z.ZodTypeAny>(rules: string, zodSchema: S, policyType: string): z.infer<S> {
    const result = safeJsonParse(rules, zodSchema);
    if (!result.success) {
      throw new WAIaaSError('POLICY_RULES_CORRUPT', { message: `${policyType} policy rules corrupt: ${result.error.message}` });
    }
    return result.data;
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

    // Step 3: Resolve overrides
    const resolved = this.resolveOverrides(rows as PolicyRow[], walletId, transaction.network);
    const ctx = this.ctx;

    // Step 4: Evaluate WHITELIST (deny-first)
    const whitelistResult = evaluateWhitelist(ctx, resolved, transaction.toAddress);
    if (whitelistResult !== null) return whitelistResult;

    // Step 4a.5: Evaluate ALLOWED_NETWORKS
    if (transaction.network) {
      const allowedNetworksResult = evaluateAllowedNetworks(ctx, resolved, transaction.network);
      if (allowedNetworksResult !== null) return allowedNetworksResult;
    }

    // Step 4b: Evaluate ALLOWED_TOKENS
    const allowedTokensResult = evaluateAllowedTokens(ctx, resolved, transaction);
    if (allowedTokensResult !== null) return allowedTokensResult;

    // Step 4c: Evaluate CONTRACT_WHITELIST
    const contractWhitelistResult = evaluateContractWhitelist(ctx, resolved, transaction);
    if (contractWhitelistResult !== null) return contractWhitelistResult;

    // Step 4d: Evaluate METHOD_WHITELIST
    const methodWhitelistResult = evaluateMethodWhitelist(ctx, resolved, transaction);
    if (methodWhitelistResult !== null) return methodWhitelistResult;

    // Step 4e: Evaluate APPROVED_SPENDERS
    const approvedSpendersResult = evaluateApprovedSpenders(ctx, resolved, transaction);
    if (approvedSpendersResult !== null) return approvedSpendersResult;

    // Step 4e.5: Evaluate REPUTATION_THRESHOLD (async, kept in this class)
    const reputationFloorTier = await this.evaluateReputationThreshold(resolved, transaction);

    // Step 4f: Evaluate APPROVE_AMOUNT_LIMIT
    const approveAmountResult = evaluateApproveAmountLimit(ctx, resolved, transaction);
    if (approveAmountResult !== null) return approveAmountResult;

    // Step 4g: Evaluate APPROVE_TIER_OVERRIDE
    const approveTierResult = evaluateApproveTierOverride(ctx, resolved, transaction);
    if (approveTierResult !== null) return approveTierResult;

    // Step 4g.5: NFT_TRANSFER default tier APPROVAL (PLCY-03, v31.0)
    if (transaction.type === 'NFT_TRANSFER') {
      let nftTierOverride: string | null = null;
      try {
        nftTierOverride = this.settingsService?.get('policy.nft_transfer_default_tier') ?? null;
      } catch { /* Setting key not registered yet */ }
      const nftTier = (nftTierOverride ?? 'APPROVAL') as PolicyTier;
      const finalTier = reputationFloorTier ? maxTier(nftTier, reputationFloorTier) : nftTier;
      return { allowed: true, tier: finalTier };
    }

    // v31.14: CONTRACT_DEPLOY default tier APPROVAL (DEPL-04)
    if (transaction.type === 'CONTRACT_DEPLOY') {
      let deployTierOverride: string | null = null;
      try {
        deployTierOverride = this.settingsService?.get('rpc_proxy.deploy_default_tier') ?? null;
      } catch { /* Setting key not registered yet */ }
      const deployTier = (deployTierOverride ?? 'APPROVAL') as PolicyTier;
      const finalTier = reputationFloorTier ? maxTier(deployTier, reputationFloorTier) : deployTier;
      return { allowed: true, tier: finalTier };
    }

    // Step 4h: Evaluate LENDING_ASSET_WHITELIST
    const lendingAssetResult = evaluateLendingAssetWhitelist(ctx, resolved, transaction);
    if (lendingAssetResult !== null) return lendingAssetResult;

    // Step 4h-b: Evaluate LENDING_LTV_LIMIT
    const ltvResult = evaluateLendingLtvLimit(ctx, resolved, transaction, walletId, this.sqlite);
    if (ltvResult !== null) return ltvResult;

    // Step 4i: Evaluate PERP_ALLOWED_MARKETS
    const perpMarketResult = evaluatePerpAllowedMarkets(ctx, resolved, transaction);
    if (perpMarketResult !== null) return perpMarketResult;

    // Step 4i-b: Evaluate PERP_MAX_LEVERAGE
    const leverageResult = evaluatePerpMaxLeverage(ctx, resolved, transaction);
    if (leverageResult !== null) return leverageResult;

    // Step 4i-c: Evaluate PERP_MAX_POSITION_USD
    const positionUsdResult = evaluatePerpMaxPositionUsd(ctx, resolved, transaction);
    if (positionUsdResult !== null) return positionUsdResult;

    // Step 4j: Evaluate VENUE_WHITELIST
    const venueResult = evaluateVenueWhitelist(ctx, resolved, transaction);
    if (venueResult !== null) return venueResult;

    // Step 4k: Evaluate ACTION_CATEGORY_LIMIT
    const categoryLimitResult = evaluateActionCategoryLimit(ctx, resolved, transaction, walletId, this.sqlite);
    if (categoryLimitResult !== null) {
      if (reputationFloorTier) {
        categoryLimitResult.tier = maxTier(categoryLimitResult.tier as PolicyTier, reputationFloorTier);
      }
      return categoryLimitResult;
    }

    // Step 5: Non-spending classification for lending actions
    const NON_SPENDING_ACTIONS = new Set(['supply', 'repay', 'withdraw', 'close_position', 'add_margin']);
    if (transaction.actionName && NON_SPENDING_ACTIONS.has(transaction.actionName)) {
      const baseTier = 'INSTANT' as PolicyTier;
      const finalTier = reputationFloorTier ? maxTier(baseTier, reputationFloorTier) : baseTier;
      return { allowed: true, tier: finalTier };
    }

    // Step 5 (continued): Evaluate SPENDING_LIMIT
    const spendingPolicy = resolved.find((p) => p.type === 'SPENDING_LIMIT');
    const tokenContext = this.buildTokenContext(transaction, spendingPolicy);
    const spendingResult = evaluateSpendingLimit(ctx, resolved, transaction.amount, undefined, tokenContext);
    if (spendingResult !== null) {
      if (reputationFloorTier) {
        spendingResult.tier = maxTier(spendingResult.tier as PolicyTier, reputationFloorTier);
      }
      return spendingResult;
    }

    // Default: INSTANT passthrough
    const defaultTier = 'INSTANT' as PolicyTier;
    const finalDefaultTier = reputationFloorTier ? maxTier(defaultTier, reputationFloorTier) : defaultTier;
    return { allowed: true, tier: finalDefaultTier };
  }

  // -------------------------------------------------------------------------
  // Batch evaluation: evaluateBatch
  // -------------------------------------------------------------------------

  async evaluateBatch(
    walletId: string,
    instructions: TransactionParam[],
    batchUsdAmount?: number,
  ): Promise<PolicyEvaluation> {
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

    if (rows.length === 0) return { allowed: true, tier: 'INSTANT' };

    const resolved = this.resolveOverrides(rows as PolicyRow[], walletId, resolvedNetwork);
    const ctx = this.ctx;

    // ALLOWED_NETWORKS evaluation before Phase A
    if (resolvedNetwork) {
      const allowedNetworksResult = evaluateAllowedNetworks(ctx, resolved, resolvedNetwork);
      if (allowedNetworksResult !== null) return allowedNetworksResult;
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
    }

    const amountTier = evaluateSpendingLimit(ctx, resolved, totalNativeAmount.toString(), batchUsdAmount);
    let finalTier = amountTier ? (amountTier.tier as PolicyTier) : ('INSTANT' as PolicyTier);

    // If batch contains APPROVE, apply APPROVE_TIER_OVERRIDE
    const hasApprove = instructions.some((i) => i.type === 'APPROVE');
    if (hasApprove) {
      const approveTierPolicy = resolved.find((p) => p.type === 'APPROVE_TIER_OVERRIDE');
      let approveTier: PolicyTier;
      if (approveTierPolicy) {
        const rules = this.parseRules(approveTierPolicy.rules, ApproveTierOverrideRulesSchema, 'APPROVE_TIER_OVERRIDE');
        approveTier = rules.tier as PolicyTier;
      } else {
        approveTier = 'APPROVAL';
      }

      const tierOrder: PolicyTier[] = ['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL'];
      const amountIdx = tierOrder.indexOf(finalTier);
      const approveIdx = tierOrder.indexOf(approveTier);
      finalTier = tierOrder[Math.max(amountIdx, approveIdx)]!;
    }

    return { allowed: true, tier: finalTier };
  }

  // -------------------------------------------------------------------------
  // Private: Per-instruction policy evaluation (Phase A helper)
  // -------------------------------------------------------------------------

  private evaluateInstructionPolicies(
    resolved: PolicyRow[],
    instr: TransactionParam,
  ): PolicyEvaluation | null {
    const ctx = this.ctx;

    // WHITELIST applies to TRANSFER and TOKEN_TRANSFER
    if (instr.type === 'TRANSFER' || instr.type === 'TOKEN_TRANSFER') {
      const whitelistResult = evaluateWhitelist(ctx, resolved, instr.toAddress);
      if (whitelistResult !== null) return whitelistResult;
    }

    // ALLOWED_TOKENS applies to TOKEN_TRANSFER
    if (instr.type === 'TOKEN_TRANSFER') {
      const allowedTokensResult = evaluateAllowedTokens(ctx, resolved, instr);
      if (allowedTokensResult !== null) return allowedTokensResult;
    }

    // CONTRACT_WHITELIST applies to CONTRACT_CALL
    if (instr.type === 'CONTRACT_CALL') {
      const contractResult = evaluateContractWhitelist(ctx, resolved, instr);
      if (contractResult !== null) return contractResult;

      const methodResult = evaluateMethodWhitelist(ctx, resolved, instr);
      if (methodResult !== null) return methodResult;
    }

    // APPROVED_SPENDERS + APPROVE_AMOUNT_LIMIT apply to APPROVE
    if (instr.type === 'APPROVE') {
      const spendersResult = evaluateApprovedSpenders(ctx, resolved, instr);
      if (spendersResult !== null) return spendersResult;

      const amountResult = evaluateApproveAmountLimit(ctx, resolved, instr);
      if (amountResult !== null) return amountResult;
    }

    // LENDING_ASSET_WHITELIST applies to lending actions
    if (instr.type === 'CONTRACT_CALL') {
      const lendingAssetResult = evaluateLendingAssetWhitelist(ctx, resolved, instr);
      if (lendingAssetResult !== null) return lendingAssetResult;
    }

    // PERP_ALLOWED_MARKETS applies to perp actions
    if (instr.type === 'CONTRACT_CALL') {
      const perpMarketResult = evaluatePerpAllowedMarkets(ctx, resolved, instr);
      if (perpMarketResult !== null) return perpMarketResult;
    }

    return null; // All applicable policies passed
  }

  // -------------------------------------------------------------------------
  // TOCTOU Prevention: evaluateAndReserve
  // -------------------------------------------------------------------------

  evaluateAndReserve(
    walletId: string,
    transaction: TransactionParam,
    txId: string,
    usdAmount?: number,
    reputationFloorTier?: PolicyTier,
  ): PolicyEvaluation {
    if (!this.sqlite) {
      throw new Error('evaluateAndReserve requires raw sqlite instance in constructor');
    }

    const sqlite = this.sqlite;
    const ctx = this.ctx;

    const txn = sqlite.transaction(() => {
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

      if (policyRows.length === 0) {
        const baseTier = 'INSTANT' as PolicyTier;
        const effectiveTier = reputationFloorTier ? maxTier(baseTier, reputationFloorTier) : baseTier;
        return { allowed: true, tier: effectiveTier };
      }

      const resolved = this.resolveOverrides(policyRows, walletId, transaction.network);

      const whitelistResult = evaluateWhitelist(ctx, resolved, transaction.toAddress);
      if (whitelistResult !== null) return whitelistResult;

      if (transaction.network) {
        const allowedNetworksResult = evaluateAllowedNetworks(ctx, resolved, transaction.network);
        if (allowedNetworksResult !== null) return allowedNetworksResult;
      }

      const allowedTokensResult = evaluateAllowedTokens(ctx, resolved, transaction);
      if (allowedTokensResult !== null) return allowedTokensResult;

      const contractWhitelistResult = evaluateContractWhitelist(ctx, resolved, transaction);
      if (contractWhitelistResult !== null) return contractWhitelistResult;

      const methodWhitelistResult = evaluateMethodWhitelist(ctx, resolved, transaction);
      if (methodWhitelistResult !== null) return methodWhitelistResult;

      const approvedSpendersResult = evaluateApprovedSpenders(ctx, resolved, transaction);
      if (approvedSpendersResult !== null) return approvedSpendersResult;

      const approveAmountResult = evaluateApproveAmountLimit(ctx, resolved, transaction);
      if (approveAmountResult !== null) return approveAmountResult;

      const approveTierResult = evaluateApproveTierOverride(ctx, resolved, transaction);
      if (approveTierResult !== null) return approveTierResult;

      const lendingAssetResult = evaluateLendingAssetWhitelist(ctx, resolved, transaction);
      if (lendingAssetResult !== null) return lendingAssetResult;

      const ltvResult = evaluateLendingLtvLimit(ctx, resolved, transaction, walletId, sqlite, usdAmount);
      if (ltvResult !== null) return ltvResult;

      const perpMarketResult = evaluatePerpAllowedMarkets(ctx, resolved, transaction);
      if (perpMarketResult !== null) return perpMarketResult;

      const leverageResult = evaluatePerpMaxLeverage(ctx, resolved, transaction);
      if (leverageResult !== null) return leverageResult;

      const positionUsdResult = evaluatePerpMaxPositionUsd(ctx, resolved, transaction);
      if (positionUsdResult !== null) return positionUsdResult;

      const venueResult = evaluateVenueWhitelist(ctx, resolved, transaction);
      if (venueResult !== null) return venueResult;

      const categoryLimitResult = evaluateActionCategoryLimit(ctx, resolved, transaction, walletId, sqlite);
      if (categoryLimitResult !== null) {
        if (reputationFloorTier) {
          categoryLimitResult.tier = maxTier(categoryLimitResult.tier as PolicyTier, reputationFloorTier);
        }
        return categoryLimitResult;
      }

      // Non-spending actions
      const NON_SPENDING_ACTIONS_R = new Set(['supply', 'repay', 'withdraw', 'close_position', 'add_margin']);
      if (transaction.actionName && NON_SPENDING_ACTIONS_R.has(transaction.actionName)) {
        const baseTier = 'INSTANT' as PolicyTier;
        const finalTier = reputationFloorTier ? maxTier(baseTier, reputationFloorTier) : baseTier;
        return { allowed: true, tier: finalTier };
      }

      // SPENDING_LIMIT with reservation
      const spendingPolicy = resolved.find((p) => p.type === 'SPENDING_LIMIT');
      if (spendingPolicy) {
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

        const tokenContext = this.buildTokenContext(transaction, spendingPolicy);
        const spendingResult = evaluateSpendingLimit(
          ctx,
          resolved,
          effectiveAmount.toString(),
          usdAmount,
          tokenContext,
        );

        // Cumulative USD limit evaluation
        if (usdAmount !== undefined && usdAmount > 0) {
          const rules = this.parseRules(spendingPolicy.rules, SpendingLimitRulesSchema, 'SPENDING_LIMIT');
          const hasCumulativeLimits = rules.daily_limit_usd !== undefined || rules.monthly_limit_usd !== undefined;

          if (hasCumulativeLimits) {
            const now = Math.floor(Date.now() / 1000);
            let cumulativeTier: PolicyTier = 'INSTANT';
            let cumulativeReason: 'cumulative_daily' | 'cumulative_monthly' | undefined;
            let cumulativeWarning: { type: 'daily' | 'monthly'; ratio: number; spent: number; limit: number } | undefined;

            if (rules.daily_limit_usd !== undefined) {
              const windowStart = now - 86400;
              const spent = this.getCumulativeUsdSpent(sqlite, walletId, windowStart);
              const totalWithCurrent = spent + usdAmount;

              if (totalWithCurrent > rules.daily_limit_usd) {
                cumulativeTier = 'APPROVAL';
                cumulativeReason = 'cumulative_daily';
              } else {
                const ratio = totalWithCurrent / rules.daily_limit_usd;
                if (ratio >= 0.8) {
                  cumulativeWarning = { type: 'daily', ratio, spent: totalWithCurrent, limit: rules.daily_limit_usd };
                }
              }
            }

            if (rules.monthly_limit_usd !== undefined && cumulativeReason === undefined) {
              const windowStart = now - 2592000;
              const spent = this.getCumulativeUsdSpent(sqlite, walletId, windowStart);
              const totalWithCurrent = spent + usdAmount;

              if (totalWithCurrent > rules.monthly_limit_usd) {
                cumulativeTier = 'APPROVAL';
                cumulativeReason = 'cumulative_monthly';
              } else if (!cumulativeWarning) {
                const ratio = totalWithCurrent / rules.monthly_limit_usd;
                if (ratio >= 0.8) {
                  cumulativeWarning = { type: 'monthly', ratio, spent: totalWithCurrent, limit: rules.monthly_limit_usd };
                }
              }
            }

            const perTxTier = spendingResult?.tier ?? ('INSTANT' as PolicyTier);
            const finalTier = maxTier(perTxTier, cumulativeTier);

            let approvalReason: 'per_tx' | 'cumulative_daily' | 'cumulative_monthly' | undefined;
            if (finalTier === 'APPROVAL') {
              approvalReason = cumulativeReason ?? 'per_tx';
            }

            sqlite
              .prepare(
                `UPDATE transactions SET reserved_amount = ?, amount_usd = ?, reserved_amount_usd = ? WHERE id = ?`,
              )
              .run(transaction.amount, usdAmount, usdAmount, txId);

            const repFinalTier = reputationFloorTier ? maxTier(finalTier, reputationFloorTier) : finalTier;

            return {
              allowed: true,
              tier: repFinalTier,
              ...(spendingResult?.delaySeconds !== undefined && repFinalTier === 'DELAY' ? { delaySeconds: spendingResult.delaySeconds } : {}),
              ...(approvalReason ? { approvalReason } : {}),
              ...(cumulativeWarning ? { cumulativeWarning } : {}),
            };
          }
        }

        // No cumulative limits
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

        const baseResult = spendingResult ?? { allowed: true, tier: 'INSTANT' as PolicyTier };
        if (reputationFloorTier && baseResult.allowed) {
          baseResult.tier = maxTier(baseResult.tier as PolicyTier, reputationFloorTier);
        }
        return baseResult;
      }

      // No SPENDING_LIMIT -> INSTANT passthrough
      const noSpendingTier = reputationFloorTier ?? ('INSTANT' as PolicyTier);
      return { allowed: true, tier: noSpendingTier };
    });

    return txn.immediate();
  }

  // -------------------------------------------------------------------------
  // releaseReservation
  // -------------------------------------------------------------------------

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

  private getCumulativeUsdSpent(sqlite: SQLiteDatabase, walletId: string, windowStart: number): number {
    const confirmedRow = sqlite
      .prepare(
        `SELECT COALESCE(SUM(amount_usd), 0) AS total
         FROM transactions
         WHERE wallet_id = ? AND status IN ('CONFIRMED', 'SIGNED')
         AND created_at >= ? AND amount_usd IS NOT NULL`,
      )
      .get(walletId, windowStart) as { total: number };

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
  // Private: REPUTATION_THRESHOLD evaluation (Phase 320)
  // -------------------------------------------------------------------------

  private async evaluateReputationThreshold(
    resolved: PolicyRow[],
    transaction: TransactionParam,
  ): Promise<PolicyTier | null> {
    const policy = resolved.find((p) => p.type === 'REPUTATION_THRESHOLD');
    if (!policy) return null;

    const rules = this.parseRules(policy.rules, ReputationThresholdRulesSchema, 'REPUTATION_THRESHOLD');

    if (!rules.check_counterparty) return null;

    const agentId = this.resolveAgentIdFromAddress(transaction.toAddress);

    if (!agentId) {
      return (rules.unrated_tier ?? 'APPROVAL') as PolicyTier;
    }

    if (!this.reputationCacheService) {
      return (rules.unrated_tier ?? 'APPROVAL') as PolicyTier;
    }

    const reputation = await this.reputationCacheService.getReputation(
      agentId,
      rules.tag1 ?? '',
      rules.tag2 ?? '',
    );

    if (!reputation) {
      return (rules.unrated_tier ?? 'APPROVAL') as PolicyTier;
    }

    if (reputation.score < rules.min_score) {
      return (rules.below_threshold_tier ?? 'APPROVAL') as PolicyTier;
    }

    return null;
  }

  private resolveAgentIdFromAddress(toAddress: string): string | null {
    if (!toAddress) return null;

    const normalizedAddress = toAddress.toLowerCase();

    const rows = this.db
      .select({
        chainAgentId: agentIdentities.chainAgentId,
        publicKey: wallets.publicKey,
        status: agentIdentities.status,
      })
      .from(agentIdentities)
      .innerJoin(wallets, eq(agentIdentities.walletId, wallets.id))
      .all();

    const match = rows.find(
      (r) =>
        r.publicKey.toLowerCase() === normalizedAddress &&
        (r.status === 'REGISTERED' || r.status === 'WALLET_LINKED'),
    );

    return match?.chainAgentId ?? null;
  }

  async prefetchReputationTier(
    walletId: string,
    transaction: TransactionParam,
    reputationCache: ReputationCacheService,
  ): Promise<{ tier: PolicyTier; score?: string; threshold?: string } | undefined> {
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

    if (rows.length === 0) return undefined;

    const resolved = this.resolveOverrides(rows as PolicyRow[], walletId, transaction.network);
    const policy = resolved.find((p) => p.type === 'REPUTATION_THRESHOLD');
    if (!policy) return undefined;

    const rules = this.parseRules(policy.rules, ReputationThresholdRulesSchema, 'REPUTATION_THRESHOLD');
    if (!rules.check_counterparty) return undefined;

    const agentId = this.resolveAgentIdFromAddress(transaction.toAddress);
    if (!agentId) {
      return { tier: (rules.unrated_tier ?? 'APPROVAL') as PolicyTier };
    }

    const reputation = await reputationCache.getReputation(
      agentId,
      rules.tag1 ?? '',
      rules.tag2 ?? '',
    );

    if (!reputation) {
      return { tier: (rules.unrated_tier ?? 'APPROVAL') as PolicyTier };
    }

    if (reputation.score < rules.min_score) {
      return {
        tier: (rules.below_threshold_tier ?? 'APPROVAL') as PolicyTier,
        score: String(reputation.score),
        threshold: String(rules.min_score),
      };
    }

    return undefined;
  }

  // -------------------------------------------------------------------------
  // Private: buildTokenContext helper
  // -------------------------------------------------------------------------

  private buildTokenContext(
    transaction: TransactionParam,
    spendingPolicy?: PolicyRow,
  ): {
    type: string;
    tokenAddress?: string;
    tokenDecimals?: number;
    chain?: string;
    assetId?: string;
    policyNetwork?: string;
  } {
    return {
      type: transaction.type,
      tokenAddress: transaction.tokenAddress,
      tokenDecimals: transaction.tokenDecimals,
      chain: transaction.chain,
      assetId: transaction.assetId,
      policyNetwork: spendingPolicy?.network ?? undefined,
    };
  }
}
