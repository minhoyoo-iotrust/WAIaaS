/**
 * Stage 3: Policy evaluation + Stage 3.5: Gas condition check.
 *
 * Stage 3: evaluateAndReserve TOCTOU-safe + downgradeIfNoOwner
 * Stage 3.5: Gas condition check (between policy and wait)
 *
 * @see docs/32-pipeline-design.md
 */

import { eq, sql } from 'drizzle-orm';
import {
  WAIaaSError,
  type PolicyTier,
  type BatchRequest,
} from '@waiaas/core';
import { wallets, transactions } from '../infrastructure/database/schema.js';
import { insertAuditLog } from '../infrastructure/database/audit-helper.js';
import { DatabasePolicyEngine } from './database-policy-engine.js';
import { downgradeIfNoOwner } from '../workflow/owner-state.js';
import { resolveEffectiveAmountUsd, type PriceResult } from './resolve-effective-amount-usd.js';
import { rpcConfigKey } from '../infrastructure/adapter-pool.js';
import type { PipelineContext } from './pipeline-helpers.js';
import {
  resolveActionTier,
  getRequestAmount,
  getRequestTo,
  resolveNotificationTo,
  formatNotificationAmount,
  resolveDisplayAmount,
  extractPolicyType,
  buildTransactionParam,
  hintedTokens,
} from './pipeline-helpers.js';

// ---------------------------------------------------------------------------
// Stage 3: Policy evaluation
// ---------------------------------------------------------------------------

export async function stage3Policy(ctx: PipelineContext): Promise<void> {
  let evaluation;

  // Determine transaction type from request
  const req = ctx.request;
  const txType = ('type' in req && req.type) ? req.type : 'TRANSFER';

  // Build type-specific TransactionParam (hoisted for notification use)
  const txParam = buildTransactionParam(req, txType, ctx.wallet.chain);
  txParam.network = ctx.resolvedNetwork;

  // [Phase 127] Oracle HTTP 호출 (evaluateAndReserve 진입 전 완료)
  let priceResult: PriceResult | undefined;
  if (ctx.priceOracle) {
    priceResult = await resolveEffectiveAmountUsd(
      req as unknown as Record<string, unknown>, txType, ctx.wallet.chain, ctx.priceOracle, ctx.resolvedNetwork,
    );
  }

  // BATCH type uses evaluateBatch (2-stage policy evaluation)
  if (txType === 'BATCH' && ctx.policyEngine instanceof DatabasePolicyEngine) {
    const batchReq = req as BatchRequest;
    // Classify each instruction and build TransactionParam array
    const params = batchReq.instructions.map((instr) => {
      let instrType = 'TRANSFER';
      if ('spender' in instr) instrType = 'APPROVE';
      else if ('token' in instr) instrType = 'TOKEN_TRANSFER';
      else if ('programId' in instr || 'calldata' in instr) instrType = 'CONTRACT_CALL';

      return {
        type: instrType,
        amount: 'amount' in instr ? (instr as { amount?: string }).amount ?? '0' : '0',
        toAddress: 'to' in instr ? (instr as { to?: string }).to ?? '' : '',
        chain: ctx.wallet.chain,
        network: ctx.resolvedNetwork,
        tokenAddress: 'token' in instr ? (instr as { token?: { address: string } }).token?.address : undefined,
        assetId: 'token' in instr ? (instr as { token?: { assetId?: string } }).token?.assetId : undefined,
        contractAddress: instrType === 'CONTRACT_CALL' ? ('to' in instr ? (instr as { to?: string }).to : undefined) : undefined,
        selector: 'calldata' in instr ? (instr as { calldata?: string }).calldata?.slice(0, 10) : undefined,
        spenderAddress: 'spender' in instr ? (instr as { spender?: string }).spender : undefined,
        approveAmount: instrType === 'APPROVE' && 'amount' in instr ? (instr as { amount?: string }).amount : undefined,
      };
    });

    // evaluateBatch에 batchUsdAmount 전달 (Phase 127)
    const batchUsdAmount = priceResult?.type === 'success' ? priceResult.usdAmount : undefined;
    evaluation = await ctx.policyEngine.evaluateBatch(ctx.walletId, params, batchUsdAmount);
  } else {
    // evaluateAndReserve에 usdAmount 전달 (Phase 127)
    const usdAmount = priceResult?.type === 'success' ? priceResult.usdAmount : undefined;

    // [Phase 320] Pre-fetch reputation floor tier (async, before IMMEDIATE txn)
    let reputationFloorTier: import('@waiaas/core').PolicyTier | undefined;
    if (ctx.reputationCache && ctx.policyEngine instanceof DatabasePolicyEngine) {
      const prefetchResult = await ctx.policyEngine.prefetchReputationTier(
        ctx.walletId,
        txParam,
        ctx.reputationCache,
      );
      reputationFloorTier = prefetchResult?.tier;

      // INT-01 fix: Emit REPUTATION_THRESHOLD_TRIGGERED when tier is escalated.
      // This fires before the evaluation result is used, so the notification goes out
      // regardless of whether the transaction is ultimately allowed or denied.
      if (prefetchResult) {
        void ctx.notificationService?.notify('REPUTATION_THRESHOLD_TRIGGERED', ctx.walletId, {
          tier: prefetchResult.tier,
          score: prefetchResult.score ?? '',
          threshold: prefetchResult.threshold ?? '',
        }, { txId: ctx.txId });
      }
    }

    // Use evaluateAndReserve for TOCTOU-safe evaluation when DatabasePolicyEngine + sqlite available
    if (ctx.policyEngine instanceof DatabasePolicyEngine && ctx.sqlite) {
      evaluation = ctx.policyEngine.evaluateAndReserve(
        ctx.walletId,
        txParam,
        ctx.txId,
        usdAmount,
        reputationFloorTier,
      );
    } else {
      evaluation = await ctx.policyEngine.evaluate(ctx.walletId, txParam);
    }
  }

  if (!evaluation.allowed) {
    // Update tx status to CANCELLED (REJECTED not in TRANSACTION_STATUSES enum)
    await ctx.db
      .update(transactions)
      .set({ status: 'CANCELLED', error: evaluation.reason ?? 'Policy denied' })
      .where(eq(transactions.id, ctx.txId));

    // Fire-and-forget: notify POLICY_VIOLATION (never blocks pipeline)
    void ctx.notificationService?.notify('POLICY_VIOLATION', ctx.walletId, {
      reason: evaluation.reason ?? 'Policy denied',
      amount: formatNotificationAmount(ctx.request, ctx.wallet.chain),
      to: getRequestTo(ctx.request),
      policyType: extractPolicyType(evaluation.reason),
      tokenAddress: txParam.tokenAddress ?? '',
      contractAddress: txParam.contractAddress ?? '',
      adminLink: '/admin/policies',
    }, { txId: ctx.txId });

    // Audit log: POLICY_DENIED
    if (ctx.sqlite) {
      insertAuditLog(ctx.sqlite, {
        eventType: 'POLICY_DENIED',
        actor: ctx.sessionId ?? 'system',
        walletId: ctx.walletId,
        txId: ctx.txId,
        details: {
          reason: evaluation.reason,
          requestedAmount: getRequestAmount(ctx.request),
          type: ('type' in ctx.request && ctx.request.type) ? ctx.request.type : 'TRANSFER',
        },
        severity: 'warning',
      });
    }

    throw new WAIaaSError('POLICY_DENIED', {
      message: evaluation.reason ?? 'Transaction denied by policy',
    });
  }

  let tier = evaluation.tier;
  let downgraded = false;

  // [Phase 331] Action tier override: Settings > provider default > no floor
  if (ctx.actionProviderKey && ctx.actionName && ctx.actionDefaultTier) {
    const actionTier = resolveActionTier(
      ctx.actionProviderKey, ctx.actionName, ctx.actionDefaultTier, ctx.settingsService,
    );
    // Action tier acts as a FLOOR -- escalate but never downgrade
    const TIER_ORDER_331: PolicyTier[] = ['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL'];
    if (TIER_ORDER_331.indexOf(actionTier) > TIER_ORDER_331.indexOf(tier)) {
      tier = actionTier;
    }
  }

  // [Phase 127] PriceResult에 따른 후처리
  if (priceResult?.type === 'notListed') {
    // Audit log: UNLISTED_TOKEN_TRANSFER (refactored to insertAuditLog)
    if (ctx.sqlite) {
      insertAuditLog(ctx.sqlite, {
        eventType: 'UNLISTED_TOKEN_TRANSFER',
        actor: ctx.sessionId ?? 'system',
        walletId: ctx.walletId,
        txId: ctx.txId,
        details: {
          tokenAddress: priceResult.tokenAddress,
          chain: priceResult.chain,
          failedCount: priceResult.failedCount,
        },
        severity: 'warning',
      });
    }

    // 최소 NOTIFY 격상 (evaluation tier와 NOTIFY 중 보수적)
    const TIER_ORDER: PolicyTier[] = ['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL'];
    const currentIdx = TIER_ORDER.indexOf(tier);
    const notifyIdx = TIER_ORDER.indexOf('NOTIFY');
    if (currentIdx < notifyIdx) {
      tier = 'NOTIFY';
    }

    // CoinGecko 키 미설정 + 최초 1회 힌트
    const cacheKey = `${priceResult.chain}:${priceResult.tokenAddress}`;
    const coingeckoKey = ctx.settingsService?.get('oracle.coingecko_api_key');
    const shouldShowHint = !coingeckoKey && !hintedTokens.has(cacheKey);
    if (shouldShowHint) {
      hintedTokens.add(cacheKey);
    }

    // 가격 불명 토큰 알림 발송 (allowed=true인 상태에서도 notListed는 발생)
    const hint = shouldShowHint
      ? 'CoinGecko API 키를 설정하면 이 토큰의 USD 가격을 조회할 수 있습니다. Admin Settings > Oracle에서 설정하세요.'
      : undefined;

    const notifyVars: Record<string, string> = {
      amount: formatNotificationAmount(ctx.request, ctx.wallet.chain),
      to: getRequestTo(ctx.request),
      reason: `가격 불명 토큰 (${priceResult.tokenAddress}) -- 최소 NOTIFY 격상`,
      policyType: 'SPENDING_LIMIT',
    };
    if (hint) notifyVars.hint = hint;

    void ctx.notificationService?.notify('POLICY_VIOLATION', ctx.walletId, notifyVars, { txId: ctx.txId });
  }
  // oracleDown: 아무것도 하지 않음 -- 네이티브 금액 기준 tier가 이미 설정됨

  // Check for APPROVAL -> DELAY downgrade when no owner registered
  if (tier === 'APPROVAL') {
    const walletRow = await ctx.db.select().from(wallets).where(eq(wallets.id, ctx.walletId)).get();
    if (walletRow) {
      const result = downgradeIfNoOwner(
        {
          ownerAddress: walletRow.ownerAddress ?? null,
          ownerVerified: walletRow.ownerVerified ?? false,
        },
        tier,
      );
      tier = result.tier as PolicyTier;
      downgraded = result.downgraded;
    }
  }

  // Set tier and metadata on context
  ctx.tier = tier;
  ctx.downgraded = downgraded;
  if (evaluation.delaySeconds !== undefined) {
    ctx.delaySeconds = evaluation.delaySeconds;
  }
  // #443: pass policy-specific approval timeout to stage4
  if (evaluation.approvalTimeoutSeconds !== undefined) {
    ctx.policyApprovalTimeout = evaluation.approvalTimeoutSeconds;
  }

  // [Phase 139] Cache amountUsd on context for Stage 5/6 display_amount
  const stageAmountUsd = priceResult?.type === 'success' ? priceResult.usdAmount : undefined;
  ctx.amountUsd = stageAmountUsd;

  // [Phase 139] Resolve display amount for notifications
  const displayAmount = await resolveDisplayAmount(
    stageAmountUsd ?? null, ctx.settingsService, ctx.forexRateService,
  );

  // [Phase 136] Cumulative spending warning notification (80% threshold)
  if (evaluation.cumulativeWarning) {
    const w = evaluation.cumulativeWarning;
    void ctx.notificationService?.notify('CUMULATIVE_LIMIT_WARNING', ctx.walletId, {
      type: w.type,
      spent: String(w.spent.toFixed(2)),
      limit: String(w.limit.toFixed(2)),
      ratio: String(Math.round(w.ratio * 100)),
      display_amount: displayAmount,
    }, { txId: ctx.txId });
  }

  // [Phase 136] APPROVAL tier notification with reason
  if (tier === 'APPROVAL' && !downgraded) {
    const reason = evaluation.approvalReason ?? 'per_tx';
    void ctx.notificationService?.notify('TX_APPROVAL_REQUIRED', ctx.walletId, {
      txId: ctx.txId,
      amount: formatNotificationAmount(ctx.request, ctx.wallet.chain),
      to: resolveNotificationTo(ctx.request, ctx.resolvedNetwork, ctx.contractNameRegistry),
      reason,
      display_amount: displayAmount,
    }, { txId: ctx.txId });
  }

  // Update DB with tier
  await ctx.db
    .update(transactions)
    .set({ tier })
    .where(eq(transactions.id, ctx.txId));
}

// ---------------------------------------------------------------------------
// Stage 3.5: Gas condition check (between policy and wait)
// ---------------------------------------------------------------------------

/**
 * Stage 3.5: Gas condition check.
 *
 * If the request includes `gasCondition` and the `gas_condition.enabled` setting
 * is true (defaults to true when settings key is not yet registered):
 *   1. Check max_pending_count limit against current GAS_WAITING transactions
 *   2. Set status='GAS_WAITING', store gasCondition metadata in bridgeMetadata
 *   3. Emit TX_GAS_WAITING notification
 *   4. Throw PIPELINE_HALTED (transaction will be picked up by GasConditionTracker)
 *
 * If gasCondition is absent: no-op (backward compat -- proceed to stage4Wait).
 *
 * @see 258-CONTEXT.md for architecture details
 */
export async function stageGasCondition(ctx: PipelineContext): Promise<void> {
  const req = ctx.request;

  // Check if request has gasCondition (present on all 5 discriminatedUnion types)
  const gasCondition = ('gasCondition' in req && req.gasCondition)
    ? req.gasCondition as { maxGasPrice?: string; maxPriorityFee?: string; timeout?: number }
    : undefined;

  if (!gasCondition) {
    // No gas condition specified: proceed normally (backward compat)
    return;
  }

  // Check if gas_condition feature is enabled via settings
  // Default to true if the setting key is not yet registered (258-02 adds it)
  let gasConditionEnabled = true;
  if (ctx.settingsService) {
    try {
      const enabledValue = ctx.settingsService.get('gas_condition.enabled');
      gasConditionEnabled = enabledValue !== 'false';
    } catch {
      // Setting key not yet registered (will be added in 258-02) -- default to true
      gasConditionEnabled = true;
    }
  }

  if (!gasConditionEnabled) {
    // Feature disabled: proceed normally, ignore gasCondition
    return;
  }

  // Check max_pending_count limit
  let maxPendingCount = 100;
  if (ctx.settingsService) {
    try {
      const maxValue = ctx.settingsService.get('gas_condition.max_pending_count');
      const parsed = parseInt(maxValue, 10);
      if (!isNaN(parsed) && parsed > 0) {
        maxPendingCount = parsed;
      }
    } catch {
      // Setting key not yet registered -- use default
    }
  }

  // Count current GAS_WAITING transactions
  const countResult = ctx.db
    .select({ count: sql<number>`count(*)` })
    .from(transactions)
    .where(eq(transactions.status, 'GAS_WAITING'))
    .get();
  const currentWaiting = countResult?.count ?? 0;

  if (currentWaiting >= maxPendingCount) {
    throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
      message: `Gas condition pending limit reached (${currentWaiting}/${maxPendingCount}). Try again later.`,
    });
  }

  // Resolve timeout: request.timeout > settings default > hardcoded 3600
  let timeout = gasCondition.timeout;
  if (!timeout) {
    if (ctx.settingsService) {
      try {
        const defaultTimeout = ctx.settingsService.get('gas_condition.default_timeout_sec');
        const parsed = parseInt(defaultTimeout, 10);
        if (!isNaN(parsed) && parsed >= 60 && parsed <= 86400) {
          timeout = parsed;
        }
      } catch {
        // Setting key not yet registered
      }
    }
    if (!timeout) timeout = 3600;
  }

  // Clamp timeout to max_timeout_sec
  let maxTimeout = 86400;
  if (ctx.settingsService) {
    try {
      const maxValue = ctx.settingsService.get('gas_condition.max_timeout_sec');
      const parsed = parseInt(maxValue, 10);
      if (!isNaN(parsed) && parsed >= 60) {
        maxTimeout = parsed;
      }
    } catch {
      // Setting key not yet registered
    }
  }
  if (timeout > maxTimeout) {
    timeout = maxTimeout;
  }

  // Resolve RPC URL for GasConditionTracker (raw fetch, no adapter dependency)
  let rpcUrl = '';
  if (ctx.settingsService) {
    try {
      rpcUrl = ctx.settingsService.get(`rpc.${rpcConfigKey(ctx.wallet.chain, ctx.resolvedNetwork)}`);
    } catch {
      // Setting key not found -- tracker will skip this TX
    }
  }

  // Store gas condition metadata in bridgeMetadata for GasConditionTracker (258-02)
  const gasConditionMeta = {
    tracker: 'gas-condition',
    gasCondition: {
      maxGasPrice: gasCondition.maxGasPrice,
      maxPriorityFee: gasCondition.maxPriorityFee,
      timeout,
    },
    chain: ctx.wallet.chain,
    network: ctx.resolvedNetwork,
    rpcUrl,
    gasConditionCreatedAt: Date.now(),
  };

  // Set status='GAS_WAITING', store bridgeMetadata
  await ctx.db
    .update(transactions)
    .set({
      status: 'GAS_WAITING',
      bridgeMetadata: JSON.stringify(gasConditionMeta),
    })
    .where(eq(transactions.id, ctx.txId));

  // Fire-and-forget: notify TX_GAS_WAITING
  void ctx.notificationService?.notify('TX_GAS_WAITING', ctx.walletId, {
    txId: ctx.txId,
    maxGasPrice: gasCondition.maxGasPrice ?? '',
    maxPriorityFee: gasCondition.maxPriorityFee ?? '',
    timeout: String(timeout),
    chain: ctx.wallet.chain,
    network: ctx.resolvedNetwork,
  }, { txId: ctx.txId });

  // Halt pipeline -- transaction will be picked up by GasConditionTracker
  throw new WAIaaSError('PIPELINE_HALTED', {
    message: `Transaction ${ctx.txId} waiting for gas condition (timeout: ${timeout}s)`,
  });
}
