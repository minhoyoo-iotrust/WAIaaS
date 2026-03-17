/**
 * daemon-pipeline.ts - Extracted pipeline re-entry logic from DaemonLifecycle.
 *
 * Contains executeFromStage4(), executeFromStage5(), and handleApprovalApproved()
 * that were previously ~300 lines in daemon.ts.
 * Receives a DaemonState context object to read/write daemon fields.
 */

import { WAIaaSError, getSingleNetwork, safeJsonParse } from '@waiaas/core';
import { z } from 'zod';
import { resolveRpcUrl } from '../infrastructure/adapter-pool.js';
import { transactions as txTable } from '../infrastructure/database/schema.js';
import { eq } from 'drizzle-orm';
import type { ChainType, NetworkType, EnvironmentType, IPolicyEngine } from '@waiaas/core';
import type { SendTransactionRequest, TransactionRequest } from '@waiaas/core';
import type { PipelineContext } from '../pipeline/stages.js';
import type { DaemonState } from './daemon.js';

// ---------------------------------------------------------------------------
// Null-object policy engine for stage 5-6 re-entry (policy already evaluated)
// ---------------------------------------------------------------------------

const NULL_POLICY_ENGINE: IPolicyEngine = {
  evaluate: async () => ({ allowed: true, tier: 'INSTANT' as const }),
};

/**
 * Re-enter the pipeline at stage4 for a gas-condition-met transaction.
 *
 * Called by the resumePipeline callback in AsyncPollingService when
 * GasConditionTracker returns COMPLETED. Skips stages 1-3 and 3.5
 * (already evaluated). Runs stage5Execute + stage6Confirm.
 *
 * Gas-condition transactions bypass stage4Wait (policy was already evaluated
 * at Stage 3, and the transaction was only waiting for gas price -- no further
 * delay/approval needed).
 *
 * @param state - DaemonState context
 * @param txId - Transaction ID to execute
 * @param walletId - Wallet that owns the transaction
 */
export async function executeFromStage4(state: DaemonState, txId: string, walletId: string): Promise<void> {
  try {
    if (!state._db || !state.adapterPool || !state.keyStore || !state._config) {
      console.warn(`executeFromStage4(${txId}): missing deps, skipping`);
      return;
    }

    // Import stages and schema
    const { stage5Execute, stage6Confirm } = await import('../pipeline/stages.js');
    const { wallets, transactions } = await import('../infrastructure/database/schema.js');
    const { eq } = await import('drizzle-orm');

    // Look up wallet from DB
    const wallet = state._db.select().from(wallets).where(eq(wallets.id, walletId)).get();
    if (!wallet) {
      console.warn(`executeFromStage4(${txId}): wallet ${walletId} not found`);
      return;
    }

    // Look up transaction to get request data
    const tx = state._db.select().from(transactions).where(eq(transactions.id, txId)).get();
    if (!tx) {
      console.warn(`executeFromStage4(${txId}): transaction not found`);
      return;
    }

    // Use network recorded at Stage 1 (NOT re-resolve)
    const resolvedNetwork: string =
      tx.network
      ?? getSingleNetwork(wallet.chain as ChainType, wallet.environment as EnvironmentType)
      ?? (() => { throw new WAIaaSError('NETWORK_REQUIRED'); })();

    // Resolve adapter from pool using recorded network
    const rpcUrl = resolveRpcUrl(
      state._config.rpc,
      wallet.chain,
      resolvedNetwork,
    );
    const adapter = await state.adapterPool.resolve(
      wallet.chain as ChainType,
      resolvedNetwork as NetworkType,
      rpcUrl,
    );

    // Restore original request from metadata (#208)
    // DELAY/GAS_WAITING re-entry needs full request to rebuild correct tx type
    const TxMetadataSchema = z.object({ originalRequest: z.record(z.unknown()).optional() }).passthrough();
    const meta = tx.metadata
      ? (() => { const r = safeJsonParse(tx.metadata as string, TxMetadataSchema); return r.success ? r.data : {}; })()
      : {};
    const request = (meta.originalRequest ?? {
      to: tx.toAddress ?? '',
      amount: tx.amount ?? '0',
      memo: undefined,
    }) as SendTransactionRequest | TransactionRequest;

    // Construct PipelineContext for stages 5-6
    // Policy already evaluated at Stage 3 before GAS_WAITING entry
    const ctx: PipelineContext = {
      db: state._db,
      adapter,
      keyStore: state.keyStore,
      policyEngine: NULL_POLICY_ENGINE, // Not needed for stages 5-6
      masterPassword: state.masterPassword,
      walletId,
      wallet: {
        publicKey: wallet.publicKey,
        chain: wallet.chain,
        environment: wallet.environment,
        // #251: pass AA fields for Smart Account re-entry
        accountType: wallet.accountType,
        aaProvider: wallet.aaProvider,
        aaProviderApiKeyEncrypted: wallet.aaProviderApiKeyEncrypted,
        aaBundlerUrl: wallet.aaBundlerUrl,
        aaPaymasterUrl: wallet.aaPaymasterUrl,
        aaPaymasterPolicyId: wallet.aaPaymasterPolicyId,
      },
      resolvedNetwork,
      resolvedRpcUrl: rpcUrl,
      request,
      txId,
      eventBus: state.eventBus,
      notificationService: state.notificationService ?? undefined,
    };

    // Skip stage4Wait -- gas condition met, proceed directly to execution
    await stage5Execute(ctx);
    await stage6Confirm(ctx);
  } catch (error) {
    // Mark as FAILED if stages 5-6 throw
    try {
      if (state._db) {
        const { transactions } = await import('../infrastructure/database/schema.js');
        const { eq } = await import('drizzle-orm');
        const errorMessage = error instanceof Error ? error.message : 'Gas condition pipeline re-entry failed';
        state._db
          .update(transactions)
          .set({ status: 'FAILED', error: errorMessage })
          .where(eq(transactions.id, txId))
          .run();
      }
    } catch {
      // Swallow DB update errors in background
    }
  }
}

/**
 * Resume pipeline after APPROVAL tier owner sign-off (fix #246).
 *
 * Shared handler for all 4 approval paths:
 * 1. REST API (ApprovalWorkflow.approve)
 * 2. WalletConnect (WcSigningBridge -> ApprovalWorkflow.approve)
 * 3. Signing SDK (SignResponseHandler.handleApprove)
 * 4. Telegram Bot (TelegramBotService.handleApprove)
 *
 * Looks up the transaction's walletId, then delegates to executeFromStage5.
 */
export function handleApprovalApproved(state: DaemonState, txId: string): void {
  try {
    if (!state._db) return;

    const tx = state._db.select().from(txTable).where(eq(txTable.id, txId)).get();
    if (tx) {
      void executeFromStage5(state, txId, tx.walletId);
    }
  } catch (error) {
    console.warn(`[handleApprovalApproved] Failed for ${txId}:`, error);
  }
}

/**
 * Re-enter the pipeline at stage5 for a delay-expired transaction.
 *
 * Called by the delay-expired BackgroundWorker when processExpired()
 * returns transactions whose cooldown has elapsed.
 * Also called by handleApprovalApproved for APPROVAL tier transactions.
 *
 * @param state - DaemonState context
 * @param txId - Transaction ID to execute
 * @param walletId - Wallet that owns the transaction
 */
export async function executeFromStage5(state: DaemonState, txId: string, walletId: string): Promise<void> {
  try {
    if (!state._db || !state.adapterPool || !state.keyStore || !state._config) {
      console.warn(`executeFromStage5(${txId}): missing deps, skipping`);
      return;
    }

    // Import stages and schema
    const { stage5Execute, stage6Confirm } = await import('../pipeline/stages.js');
    const { wallets, transactions } = await import('../infrastructure/database/schema.js');
    const { eq } = await import('drizzle-orm');

    // Look up wallet from DB
    const wallet = state._db.select().from(wallets).where(eq(wallets.id, walletId)).get();
    if (!wallet) {
      console.warn(`executeFromStage5(${txId}): wallet ${walletId} not found`);
      return;
    }

    // Look up transaction to get request data
    const tx = state._db.select().from(transactions).where(eq(transactions.id, txId)).get();
    if (!tx) {
      console.warn(`executeFromStage5(${txId}): transaction not found`);
      return;
    }

    // Use network recorded at Stage 1 (NOT re-resolve)
    const resolvedNetwork: string =
      tx.network
      ?? getSingleNetwork(wallet.chain as ChainType, wallet.environment as EnvironmentType)
      ?? (() => { throw new WAIaaSError('NETWORK_REQUIRED'); })();

    // Resolve adapter from pool using recorded network
    const rpcUrl = resolveRpcUrl(
      state._config.rpc,
      wallet.chain,
      resolvedNetwork,
    );
    const adapter = await state.adapterPool.resolve(
      wallet.chain as ChainType,
      resolvedNetwork as NetworkType,
      rpcUrl,
    );

    // Restore original request from metadata (#208)
    const TxMetadataSchema2 = z.object({ originalRequest: z.record(z.unknown()).optional() }).passthrough();
    const meta = tx.metadata
      ? (() => { const r = safeJsonParse(tx.metadata as string, TxMetadataSchema2); return r.success ? r.data : {}; })()
      : {};
    let request = (meta.originalRequest ?? {
      to: tx.toAddress ?? '',
      amount: tx.amount ?? '0',
      memo: undefined,
    }) as SendTransactionRequest | TransactionRequest;

    // Phase 321: Re-encode calldata for EIP-712 approvals (setAgentWallet)
    // The original calldata has a placeholder '0x' signature. On approval,
    // the Owner's real EIP-712 signature is stored in pending_approvals.
    // Re-encode the calldata with the real signature before stage5Execute.
    if (state.sqlite) {
      const approvalRow = state.sqlite.prepare(
        'SELECT approval_type, typed_data_json, owner_signature FROM pending_approvals WHERE tx_id = ?',
      ).get(txId) as { approval_type: string; typed_data_json: string | null; owner_signature: string | null } | undefined;

      if (approvalRow?.approval_type === 'EIP712' && approvalRow.typed_data_json && approvalRow.owner_signature) {
        try {
          const Eip712DataSchema = z.object({ message: z.object({ agentId: z.union([z.string(), z.number()]), newWallet: z.string(), deadline: z.union([z.string(), z.number()]) }) }).passthrough();
          const typedDataResult = safeJsonParse(approvalRow.typed_data_json, Eip712DataSchema);
          if (!typedDataResult.success) throw new Error('Invalid typed_data_json');
          const typedData = typedDataResult.data;
          const { encodeFunctionData } = await import('viem');
          const { IDENTITY_REGISTRY_ABI } = await import('@waiaas/actions');
          const reEncodedCalldata = encodeFunctionData({
            abi: IDENTITY_REGISTRY_ABI,
            functionName: 'setAgentWallet',
            args: [
              BigInt(typedData.message.agentId),
              typedData.message.newWallet as `0x${string}`,
              BigInt(typedData.message.deadline),
              approvalRow.owner_signature as `0x${string}`,
            ],
          });
          // Replace calldata in the request object
          request = { ...request, calldata: reEncodedCalldata } as typeof request;
        } catch (err) {
          console.warn(`[executeFromStage5] EIP-712 calldata re-encoding failed for ${txId}:`, err);
        }
      }
    }

    // Construct PipelineContext for stages 5-6
    const ctx: PipelineContext = {
      db: state._db,
      adapter,
      keyStore: state.keyStore,
      policyEngine: NULL_POLICY_ENGINE, // Not needed for stages 5-6
      masterPassword: state.masterPassword,
      walletId,
      wallet: {
        publicKey: wallet.publicKey,
        chain: wallet.chain,
        environment: wallet.environment,
        // #251: pass AA fields for Smart Account re-entry
        accountType: wallet.accountType,
        aaProvider: wallet.aaProvider,
        aaProviderApiKeyEncrypted: wallet.aaProviderApiKeyEncrypted,
        aaBundlerUrl: wallet.aaBundlerUrl,
        aaPaymasterUrl: wallet.aaPaymasterUrl,
        aaPaymasterPolicyId: wallet.aaPaymasterPolicyId,
      },
      resolvedNetwork,
      resolvedRpcUrl: rpcUrl,
      request,
      txId,
      eventBus: state.eventBus,
      notificationService: state.notificationService ?? undefined,
    };

    await stage5Execute(ctx);
    await stage6Confirm(ctx);
  } catch (error) {
    // Mark as FAILED if stages 5-6 throw
    try {
      if (state._db) {
        const { transactions } = await import('../infrastructure/database/schema.js');
        const { eq } = await import('drizzle-orm');
        const errorMessage = error instanceof Error ? error.message : 'Pipeline re-entry failed';
        state._db
          .update(transactions)
          .set({ status: 'FAILED', error: errorMessage })
          .where(eq(transactions.id, txId))
          .run();
      }
    } catch {
      // Swallow DB update errors in background
    }
  }
}
