/**
 * Sign-message pipeline module.
 *
 * Provides executeSignMessage() -- a standalone pipeline for signing messages
 * (personal_sign or EIP-712 signTypedData) after basic validation.
 *
 * Unlike sign-only.ts which signs full unsigned transactions, this module
 * handles pure message signing without on-chain submission.
 *
 * 6-step pipeline:
 * 1. Validate request (signType + data presence)
 * 2. Generate UUID v7 transaction ID
 * 3. INSERT DB record (type='SIGN', status='PENDING')
 * 4. Chain-type validation (typedData = EVM only)
 * 5. Decrypt key -> sign message -> release key
 * 6. Update status='SIGNED', return result
 *
 * @see packages/core/src/schemas/transaction.schema.ts (SignMessageRequestSchema)
 */

import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';
import { WAIaaSError, SignMessageRequestSchema, type SignMessageRequest, type EventBus } from '@waiaas/core';
import { transactions } from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import type * as schema from '../infrastructure/database/schema.js';
import type { NotificationService } from '../notifications/notification-service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SignMessageDeps {
  db: BetterSQLite3Database<typeof schema>;
  keyStore: LocalKeyStore;
  masterPassword: string;
  notificationService?: NotificationService;
  eventBus?: EventBus;
}

export interface SignMessageResult {
  id: string;
  signature: string;
  signType: 'personal' | 'typedData';
}

// ---------------------------------------------------------------------------
// executeSignMessage: 6-step sign-message pipeline
// ---------------------------------------------------------------------------

/**
 * Execute the sign-message pipeline.
 *
 * Supports two modes:
 * - personal: raw message signing via privateKeyToAccount().signMessage()
 * - typedData: EIP-712 structured data signing via privateKeyToAccount().signTypedData()
 *
 * @param deps - Pipeline dependencies
 * @param walletId - Wallet whose key will sign
 * @param chain - Wallet chain type
 * @param body - Sign message request body (validated by Zod)
 * @param sessionId - Optional session ID for audit trail
 */
export async function executeSignMessage(
  deps: SignMessageDeps,
  walletId: string,
  chain: string,
  body: SignMessageRequest,
  sessionId?: string,
): Promise<SignMessageResult> {
  // Step 1: Validate request via Zod (superRefine handles cross-field validation)
  const parsed = SignMessageRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw new WAIaaSError('VALIDATION_FAILED', {
      message: parsed.error.issues.map((i) => i.message).join('; '),
    });
  }
  const request = parsed.data;
  const signType = request.signType ?? 'personal';

  // Step 2: Generate transaction ID
  const txId = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);

  // Step 3: INSERT DB record (type='SIGN', status='PENDING')
  await deps.db.insert(transactions).values({
    id: txId,
    walletId,
    chain,
    network: null,
    type: 'SIGN',
    status: 'PENDING',
    amount: null,
    toAddress: null,
    sessionId: sessionId ?? null,
    createdAt: now,
  });

  // Step 4: Chain-type validation (typedData = EVM only)
  // DB stores chain as 'ethereum', not 'evm'
  if (signType === 'typedData' && chain !== 'ethereum') {
    await deps.db
      .update(transactions)
      .set({ status: 'FAILED', error: 'signTypedData is only supported for EVM wallets' })
      .where(eq(transactions.id, txId));
    throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
      message: 'signType "typedData" is only supported for EVM wallets',
    });
  }

  // Step 5: Decrypt key -> sign -> release
  let signature: string;
  let privateKey: Uint8Array | null = null;
  try {
    privateKey = await deps.keyStore.decryptPrivateKey(walletId, deps.masterPassword);
    const hexKey = `0x${Buffer.from(privateKey).toString('hex')}` as Hex;
    const account = privateKeyToAccount(hexKey);

    if (signType === 'personal') {
      // personal_sign: sign raw message
      const message = request.message!;
      signature = await account.signMessage({
        message: message.startsWith('0x')
          ? { raw: message as Hex }
          : message,
      });
    } else {
      // EIP-712 signTypedData
      const td = request.typedData!;
      signature = await account.signTypedData({
        domain: {
          name: td.domain.name,
          version: td.domain.version,
          chainId: td.domain.chainId != null ? BigInt(td.domain.chainId) : undefined,
          verifyingContract: td.domain.verifyingContract as Hex | undefined,
          salt: td.domain.salt as Hex | undefined,
        },
        types: td.types as Record<string, Array<{ name: string; type: string }>>,
        primaryType: td.primaryType,
        message: td.message,
      });
    }
  } catch (err) {
    if (err instanceof WAIaaSError) throw err;
    await deps.db
      .update(transactions)
      .set({ status: 'FAILED', error: err instanceof Error ? err.message : 'Signing failed' })
      .where(eq(transactions.id, txId));
    throw new WAIaaSError('CHAIN_ERROR', {
      message: err instanceof Error ? err.message : 'Failed to sign message',
    });
  } finally {
    if (privateKey) {
      deps.keyStore.releaseKey(privateKey);
    }
  }

  // Step 6: Update DB: status='SIGNED'
  const executedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
  await deps.db
    .update(transactions)
    .set({ status: 'SIGNED', executedAt })
    .where(eq(transactions.id, txId));

  // Fire-and-forget: emit wallet:activity event
  deps.eventBus?.emit('wallet:activity', {
    walletId,
    activity: 'TX_SUBMITTED',
    details: { txId, signMessage: true, signType },
    timestamp: Math.floor(Date.now() / 1000),
  });

  return {
    id: txId,
    signature,
    signType,
  };
}
