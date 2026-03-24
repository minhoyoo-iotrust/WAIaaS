/**
 * Stage 4: Wait (DELAY/APPROVAL branching, INSTANT/NOTIFY passthrough).
 *
 * @see docs/32-pipeline-design.md
 */

import { WAIaaSError, type ChainType } from '@waiaas/core';
import type { PipelineContext } from './pipeline-helpers.js';
import { getRequestTo, getRequestAmount, formatNotificationAmount } from './pipeline-helpers.js';

// ---------------------------------------------------------------------------
// Stage 4: Wait (DELAY/APPROVAL branching, INSTANT/NOTIFY passthrough)
// ---------------------------------------------------------------------------

export async function stage4Wait(ctx: PipelineContext): Promise<void> {
  const tier = ctx.tier;

  // INSTANT and NOTIFY: pass through to stage5
  if (tier === 'INSTANT' || tier === 'NOTIFY') {
    return;
  }

  // DELAY: queue with cooldown, halt pipeline
  if (tier === 'DELAY') {
    if (!ctx.delayQueue) {
      // Fallback: if no DelayQueue, treat as INSTANT (backward compat)
      return;
    }
    const delaySeconds = ctx.delaySeconds
      ?? ctx.config?.policy_defaults_delay_seconds
      ?? 60;
    ctx.delayQueue.queueDelay(ctx.txId, delaySeconds);

    // Fire-and-forget: notify TX_QUEUED with cancel keyboard data
    // reply_markup is built by NotificationService using locale-aware buildCancelKeyboard (#447)
    void ctx.notificationService?.notify('TX_QUEUED', ctx.walletId, {
      txId: ctx.txId,
      amount: formatNotificationAmount(ctx.request, ctx.wallet.chain),
      to: getRequestTo(ctx.request),
      delaySeconds: String(delaySeconds),
      ...(ctx.amountUsd !== undefined ? { amountUsd: `(~$${ctx.amountUsd.toFixed(2)})` } : {}),
    }, { txId: ctx.txId });

    // Halt pipeline -- transaction will be picked up by processExpired worker
    throw new WAIaaSError('PIPELINE_HALTED', {
      message: `Transaction ${ctx.txId} queued for ${delaySeconds}s delay`,
    });
  }

  // APPROVAL: create pending approval, halt pipeline
  if (tier === 'APPROVAL') {
    if (!ctx.approvalWorkflow) {
      // Fallback: if no ApprovalWorkflow, treat as INSTANT (backward compat)
      return;
    }
    // Pass EIP-712 metadata + policy-specific timeout to requestApproval (#443, Phase 321)
    ctx.approvalWorkflow.requestApproval(ctx.txId, {
      ...(ctx.policyApprovalTimeout !== undefined ? { policyTimeoutSeconds: ctx.policyApprovalTimeout } : {}),
      ...(ctx.eip712Metadata ? { approvalType: ctx.eip712Metadata.approvalType, typedDataJson: ctx.eip712Metadata.typedDataJson } : {}),
    });

    // Route approval to the correct signing channel
    if (ctx.approvalChannelRouter) {
      // v2.6.1+: use ApprovalChannelRouter to determine the correct channel
      void (async () => {
        try {
          const result = await ctx.approvalChannelRouter!.route(ctx.walletId, {
            walletId: ctx.walletId,
            txId: ctx.txId,
            chain: ctx.wallet.chain as ChainType,
            network: ctx.resolvedNetwork,
            type: ('type' in ctx.request && ctx.request.type) ? ctx.request.type : 'TRANSFER',
            from: ctx.wallet.publicKey,
            to: getRequestTo(ctx.request),
            amount: getRequestAmount(ctx.request),
            policyTier: 'APPROVAL',
            approvalType: ctx.eip712Metadata?.approvalType,
          });
          // Only invoke WC bridge when the router selects walletconnect
          if (result.method === 'walletconnect' && ctx.wcSigningBridge) {
            void ctx.wcSigningBridge.requestSignature(
              ctx.walletId,
              ctx.txId,
              ctx.wallet.chain,
            );
          }
        } catch {
          // Channel routing errors are non-fatal; pipeline already halted
        }
      })();
    } else if (ctx.wcSigningBridge) {
      // Legacy: no router available, fall back to direct WC bridge
      void ctx.wcSigningBridge.requestSignature(
        ctx.walletId,
        ctx.txId,
        ctx.wallet.chain,
      );
    }

    // Halt pipeline -- transaction will be picked up by approve/reject/expire
    throw new WAIaaSError('PIPELINE_HALTED', {
      message: `Transaction ${ctx.txId} queued for owner approval`,
    });
  }
}
