/**
 * TransactionPipeline - orchestrates the 6-stage send flow.
 *
 * executeSend() creates a PipelineContext and runs stages 1-6 sequentially.
 * getTransaction() queries a transaction by ID.
 *
 * @see docs/32-pipeline-design.md
 */

import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import { WAIaaSError } from '@waiaas/core';
import type { ChainType, NetworkType, EnvironmentType, IChainAdapter, IPolicyEngine, SendTransactionRequest, TransactionRequest } from '@waiaas/core';
import { resolveNetwork } from './network-resolver.js';
import { wallets, transactions } from '../infrastructure/database/schema.js';
import type { LocalKeyStore } from '../infrastructure/keystore/keystore.js';
import type * as schema from '../infrastructure/database/schema.js';
import type { NotificationService } from '../notifications/notification-service.js';
import type { PipelineContext } from './stages.js';
import {
  stage1Validate,
  stage2Auth,
  stage3Policy,
  stage4Wait,
  stage5Execute,
  stage6Confirm,
} from './stages.js';

// ---------------------------------------------------------------------------
// Pipeline dependencies
// ---------------------------------------------------------------------------

export interface PipelineDeps {
  db: BetterSQLite3Database<typeof schema>;
  adapter: IChainAdapter;
  keyStore: LocalKeyStore;
  policyEngine: IPolicyEngine;
  masterPassword: string;
  sqlite?: SQLiteDatabase;
  notificationService?: NotificationService;
}

// ---------------------------------------------------------------------------
// TransactionPipeline
// ---------------------------------------------------------------------------

export class TransactionPipeline {
  constructor(private readonly deps: PipelineDeps) {}

  /**
   * Execute a send transaction through the 6-stage pipeline.
   *
   * @param walletId - Wallet initiating the transaction
   * @param request - Send transaction request (legacy) or discriminatedUnion 5-type request
   * @returns The transaction ID (UUID v7)
   */
  async executeSend(walletId: string, request: SendTransactionRequest | TransactionRequest): Promise<string> {
    // Look up wallet
    const wallet = await this.getWallet(walletId);
    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_FOUND', {
        message: `Wallet '${walletId}' not found`,
      });
    }

    // Resolve network from request > wallet.defaultNetwork > environment default
    const resolvedNetwork = resolveNetwork(
      (request as { network?: string }).network as NetworkType | undefined,
      wallet.defaultNetwork as NetworkType | null,
      wallet.environment as EnvironmentType,
      wallet.chain as ChainType,
    );

    // Create pipeline context
    const ctx: PipelineContext = {
      ...this.deps,
      walletId,
      wallet: {
        publicKey: wallet.publicKey,
        chain: wallet.chain,
        environment: wallet.environment,
        defaultNetwork: wallet.defaultNetwork ?? null,
      },
      resolvedNetwork,
      request,
      txId: '',
    };

    // Execute 6 stages sequentially
    await stage1Validate(ctx);
    await stage2Auth(ctx);
    await stage3Policy(ctx);
    await stage4Wait(ctx);
    await stage5Execute(ctx);
    await stage6Confirm(ctx);

    return ctx.txId;
  }

  /**
   * Get a transaction by ID.
   *
   * @param txId - Transaction UUID
   * @returns Transaction record
   * @throws WAIaaSError('TX_NOT_FOUND') if not found
   */
  async getTransaction(txId: string) {
    const tx = await this.deps.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, txId))
      .get();

    if (!tx) {
      throw new WAIaaSError('TX_NOT_FOUND', {
        message: `Transaction '${txId}' not found`,
      });
    }

    return tx;
  }

  // --- Private helpers ---

  private async getWallet(walletId: string) {
    return this.deps.db.select().from(wallets).where(eq(wallets.id, walletId)).get();
  }
}
