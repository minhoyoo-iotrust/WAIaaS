/**
 * Stage 6: Confirmation wait.
 *
 * Waits for on-chain confirmation of the submitted transaction.
 * Updates DB status to CONFIRMED or FAILED based on the result.
 *
 * @see docs/32-pipeline-design.md
 */

import { eq } from 'drizzle-orm';
import { WAIaaSError } from '@waiaas/core';
import { transactions } from '../infrastructure/database/schema.js';
import { insertAuditLog } from '../infrastructure/database/audit-helper.js';
import type { PipelineContext } from './pipeline-helpers.js';
import {
  getRequestAmount,
  resolveNotificationTo,
  formatNotificationAmount,
  resolveDisplayAmount,
} from './pipeline-helpers.js';

// ---------------------------------------------------------------------------
// Stage 6: Confirmation wait
// ---------------------------------------------------------------------------

export async function stage6Confirm(ctx: PipelineContext): Promise<void> {
  const reqAmount = formatNotificationAmount(ctx.request, ctx.wallet.chain);

  // [Phase 139] Resolve display amount for Stage 6 notifications
  const displayAmount = await resolveDisplayAmount(
    ctx.amountUsd ?? null, ctx.settingsService, ctx.forexRateService,
  );

  const result = await ctx.adapter.waitForConfirmation(ctx.submitResult!.txHash, 30_000);

  if (result.status === 'confirmed' || result.status === 'finalized') {
    // On-chain confirmed
    const executedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
    await ctx.db
      .update(transactions)
      .set({ status: 'CONFIRMED', executedAt })
      .where(eq(transactions.id, ctx.txId));

    // Audit log: TX_CONFIRMED
    if (ctx.sqlite) {
      insertAuditLog(ctx.sqlite, {
        eventType: 'TX_CONFIRMED',
        actor: ctx.sessionId ?? 'system',
        walletId: ctx.walletId,
        txId: ctx.txId,
        details: {
          txHash: ctx.submitResult!.txHash,
          chain: ctx.wallet.chain,
          network: ctx.resolvedNetwork,
          executedAt: Math.floor(Date.now() / 1000),
        },
        severity: 'info',
      });
    }

    // Fire-and-forget: notify TX_CONFIRMED (never blocks pipeline)
    void ctx.notificationService?.notify('TX_CONFIRMED', ctx.walletId, {
      txId: ctx.txId,
      txHash: ctx.submitResult!.txHash,
      amount: reqAmount,
      to: resolveNotificationTo(ctx.request, ctx.resolvedNetwork, ctx.contractNameRegistry),
      display_amount: displayAmount,
      network: ctx.resolvedNetwork,
    }, { txId: ctx.txId });

    // v1.6: emit transaction:completed event
    ctx.eventBus?.emit('transaction:completed', {
      walletId: ctx.walletId,
      txId: ctx.txId,
      txHash: ctx.submitResult!.txHash,
      amount: getRequestAmount(ctx.request),
      network: ctx.resolvedNetwork,
      type: ('type' in ctx.request && ctx.request.type) ? ctx.request.type : 'TRANSFER',
      timestamp: Math.floor(Date.now() / 1000),
    });

  } else if (result.status === 'failed') {
    // On-chain revert
    await ctx.db
      .update(transactions)
      .set({ status: 'FAILED', error: 'Transaction reverted on-chain' })
      .where(eq(transactions.id, ctx.txId));

    // Audit log: TX_FAILED (on-chain revert)
    if (ctx.sqlite) {
      insertAuditLog(ctx.sqlite, {
        eventType: 'TX_FAILED',
        actor: ctx.sessionId ?? 'system',
        walletId: ctx.walletId,
        txId: ctx.txId,
        details: { error: 'Transaction reverted on-chain', stage: 6, chain: ctx.wallet.chain, network: ctx.resolvedNetwork },
        severity: 'warning',
      });
    }

    // Fire-and-forget: notify TX_FAILED on on-chain revert (never blocks pipeline)
    void ctx.notificationService?.notify('TX_FAILED', ctx.walletId, {
      txId: ctx.txId,
      error: 'Transaction reverted on-chain',
      amount: reqAmount,
      display_amount: displayAmount,
      network: ctx.resolvedNetwork,
    }, { txId: ctx.txId });

    // v1.6: emit transaction:failed event (on-chain revert)
    ctx.eventBus?.emit('transaction:failed', {
      walletId: ctx.walletId,
      txId: ctx.txId,
      error: 'Transaction reverted on-chain',
      network: ctx.resolvedNetwork,
      type: ('type' in ctx.request && ctx.request.type) ? ctx.request.type : 'TRANSFER',
      timestamp: Math.floor(Date.now() / 1000),
    });

    throw new WAIaaSError('CHAIN_ERROR', {
      message: 'Transaction reverted on-chain',
    });

  } else {
    // status === 'submitted': still pending, NOT failed
    // Keep SUBMITTED status (already set by Stage 5)
    // Do NOT overwrite to FAILED -- tx may confirm later
    // No notification: no state change occurred
  }
}
