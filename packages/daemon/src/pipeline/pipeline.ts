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
import type { IChainAdapter, IPolicyEngine, SendTransactionRequest } from '@waiaas/core';
import { agents, transactions } from '../infrastructure/database/schema.js';
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
   * @param agentId - Agent initiating the transaction
   * @param request - Send transaction request (to, amount, memo?)
   * @returns The transaction ID (UUID v7)
   */
  async executeSend(agentId: string, request: SendTransactionRequest): Promise<string> {
    // Look up agent
    const agent = await this.getAgent(agentId);
    if (!agent) {
      throw new WAIaaSError('AGENT_NOT_FOUND', {
        message: `Agent '${agentId}' not found`,
      });
    }

    // Create pipeline context
    const ctx: PipelineContext = {
      ...this.deps,
      agentId,
      agent: {
        publicKey: agent.publicKey,
        chain: agent.chain,
        network: agent.network,
      },
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

  private async getAgent(agentId: string) {
    return this.deps.db.select().from(agents).where(eq(agents.id, agentId)).get();
  }
}
