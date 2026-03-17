/**
 * Stage 1: Validate request + INSERT PENDING transaction (with sessionId audit trail).
 *
 * @see docs/32-pipeline-design.md
 */

import {
  SendTransactionRequestSchema,
  TransactionRequestSchema,
} from '@waiaas/core';
import { transactions } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import type { PipelineContext } from './pipeline-helpers.js';
import { formatNotificationAmount, resolveNotificationTo } from './pipeline-helpers.js';

// ---------------------------------------------------------------------------
// Stage 1: Validate + DB INSERT
// ---------------------------------------------------------------------------

export async function stage1Validate(ctx: PipelineContext): Promise<void> {
  // Validate request with appropriate Zod schema
  // If request has a `type` field, use discriminatedUnion schema (5-type)
  // Otherwise, use legacy SendTransactionRequestSchema (backward compat)
  const req = ctx.request;
  if ('type' in req && req.type) {
    TransactionRequestSchema.parse(req);
  } else {
    SendTransactionRequestSchema.parse(req);
  }

  // Determine transaction type from request
  const txType = ('type' in req && req.type) ? req.type : 'TRANSFER';

  // Generate transaction ID
  ctx.txId = generateId();

  // INSERT PENDING transaction into DB
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);

  // Extract common and type-specific fields for DB INSERT
  let amount = 'amount' in req ? (req as { amount?: string }).amount : undefined;
  // CONTRACT_CALL uses 'value' for native token amount (e.g. ETH sent with contract call)
  if (!amount && 'value' in req) {
    amount = (req as { value?: string }).value;
  }
  const toAddress = 'to' in req ? (req as { to?: string }).to : undefined;

  // Serialize original request for pipeline re-entry (#208)
  // DELAY/GAS_WAITING re-entry needs the full request to rebuild the correct tx type
  const metadata = JSON.stringify({ originalRequest: req });

  await ctx.db.insert(transactions).values({
    id: ctx.txId,
    walletId: ctx.walletId,
    chain: ctx.wallet.chain,
    network: ctx.resolvedNetwork,
    type: txType,
    status: 'PENDING',
    amount: amount ?? null,
    toAddress: toAddress ?? null,
    sessionId: ctx.sessionId ?? null,
    createdAt: now,
    metadata,
  });

  // Fire-and-forget: notify TX_REQUESTED (never blocks pipeline)
  // display_amount is empty at Stage 1 -- amountUsd not yet computed
  void ctx.notificationService?.notify('TX_REQUESTED', ctx.walletId, {
    amount: formatNotificationAmount(ctx.request, ctx.wallet.chain),
    to: resolveNotificationTo(ctx.request, ctx.resolvedNetwork, ctx.contractNameRegistry),
    type: txType,
    display_amount: '',
  }, { txId: ctx.txId });

  // v1.6: emit wallet:activity TX_REQUESTED event
  ctx.eventBus?.emit('wallet:activity', {
    walletId: ctx.walletId,
    activity: 'TX_REQUESTED',
    details: { txId: ctx.txId },
    timestamp: Math.floor(Date.now() / 1000),
  });
}
