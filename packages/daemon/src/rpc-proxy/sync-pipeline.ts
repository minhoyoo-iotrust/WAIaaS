/**
 * SyncPipelineExecutor -- Synchronous wrapper around the 6-stage pipeline.
 *
 * Converts the existing fire-and-forget pipeline flow into a synchronous
 * request-response model for JSON-RPC. Three paths:
 *
 * 1. INSTANT: stage1-6 run directly, return txHash
 * 2. DELAY: stage1-3.5 run, stage4Wait throws PIPELINE_HALTED,
 *    delegate to CompletionWaiter for long-poll
 * 3. APPROVAL: same as DELAY but with longer timeout
 *
 * Anti-Pattern 1: Does NOT modify any existing pipeline code.
 * The PIPELINE_HALTED catch pattern keeps existing flow untouched.
 *
 * @see .planning/research/m31-14-rpc-proxy-ARCHITECTURE.md (Pattern 4)
 */

import { WAIaaSError } from '@waiaas/core';
import {
  stage1Validate,
  stage2Auth,
  stage3Policy,
  stageGasCondition,
  stage4Wait,
  stage5Execute,
  stage6Confirm,
  type PipelineContext,
} from '../pipeline/stages.js';
import type { CompletionWaiter } from './completion-waiter.js';
import type { SettingsService } from '../infrastructure/settings/settings-service.js';

// ── SyncPipelineExecutor ──────────────────────────────────────────

export class SyncPipelineExecutor {
  constructor(
    private completionWaiter: CompletionWaiter,
    private settingsService?: SettingsService,
  ) {}

  /**
   * Execute the 6-stage pipeline synchronously.
   *
   * For INSTANT tier: runs all stages and returns txHash.
   * For DELAY/APPROVAL tier: catches PIPELINE_HALTED and delegates
   * to CompletionWaiter for EventBus-based completion waiting.
   *
   * @param ctx - Pipeline context (same as existing pipeline)
   * @returns Transaction hash
   */
  async execute(ctx: PipelineContext): Promise<string> {
    // Set source for audit trail (SEC-04 preparation for Phase 400)
    (ctx as PipelineContext & { source?: string }).source = 'rpc-proxy';

    // Stages 1-3.5: always run directly
    await stage1Validate(ctx);
    await stage2Auth(ctx);
    await stage3Policy(ctx);
    await stageGasCondition(ctx);

    try {
      await stage4Wait(ctx);
    } catch (err) {
      // DELAY/APPROVAL: stage4Wait throws PIPELINE_HALTED
      if (err instanceof WAIaaSError && err.code === 'PIPELINE_HALTED') {
        const timeoutMs = this.resolveTimeout(ctx.tier);
        return this.completionWaiter.waitForCompletion(ctx.txId, timeoutMs);
      }
      throw err; // Non-HALTED errors propagate
    }

    // INSTANT: stages 5-6 directly
    await stage5Execute(ctx);
    await stage6Confirm(ctx);

    return ctx.submitResult?.txHash ?? '';
  }

  /**
   * Resolve timeout based on tier and settings.
   */
  private resolveTimeout(tier?: string): number {
    if (tier === 'DELAY') {
      const s = this.settingsService?.get('rpc_proxy.delay_timeout_seconds');
      return (s ? parseInt(s, 10) : 300) * 1000;
    }
    // APPROVAL (default)
    const s = this.settingsService?.get('rpc_proxy.approval_timeout_seconds');
    return (s ? parseInt(s, 10) : 600) * 1000;
  }
}
