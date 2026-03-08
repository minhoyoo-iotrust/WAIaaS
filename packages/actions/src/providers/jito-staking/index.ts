/**
 * Jito Staking Action Provider.
 *
 * Implements IActionProvider to resolve Jito liquid staking requests
 * into ContractCallRequest objects for the sequential pipeline.
 *
 * Actions:
 * - stake: SOL -> JitoSOL via SPL Stake Pool depositSol
 * - unstake: JitoSOL -> SOL via SPL Stake Pool withdrawSol
 */
import { z } from 'zod';
import { ChainError } from '@waiaas/core';
import type {
  IActionProvider,
  ActionProviderMetadata,
  ActionDefinition,
  ActionContext,
  ContractCallRequest,
} from '@waiaas/core';
import { type JitoStakingConfig, JITO_STAKING_DEFAULTS } from './config.js';
import {
  buildDepositSolRequest,
  buildWithdrawSolRequest,
  parseSolAmount,
} from './jito-stake-pool.js';

// ---------------------------------------------------------------------------
// Input schemas (Zod SSoT)
// ---------------------------------------------------------------------------

const JitoStakeInputSchema = z.object({
  amount: z.string().min(1, 'amount is required (SOL, e.g. "1.0")'),
});

const JitoUnstakeInputSchema = z.object({
  amount: z.string().min(1, 'amount is required (JitoSOL, e.g. "1.0")'),
});

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class JitoStakingActionProvider implements IActionProvider {
  readonly metadata: ActionProviderMetadata;
  readonly actions: readonly ActionDefinition[];

  private readonly config: JitoStakingConfig;

  constructor(config?: Partial<JitoStakingConfig>) {
    this.config = { ...JITO_STAKING_DEFAULTS, ...config };

    this.metadata = {
      name: 'jito_staking',
      description: 'Jito liquid staking protocol for SOL to JitoSOL conversion via SPL Stake Pool',
      version: '1.0.0',
      chains: ['solana'],
      mcpExpose: true,
      requiresApiKey: false,
      requiredApis: [],
      requiresSigningKey: false,
    };

    this.actions = [
      {
        name: 'stake',
        description: 'Stake SOL to receive JitoSOL via Jito Stake Pool (DepositSol). Immediate, no lock-up.',
        chain: 'solana',
        inputSchema: JitoStakeInputSchema,
        riskLevel: 'medium',
        defaultTier: 'DELAY',
      },
      {
        name: 'unstake',
        description: 'Withdraw SOL from Jito Stake Pool by burning JitoSOL (WithdrawSol). Epoch boundary delay.',
        chain: 'solana',
        inputSchema: JitoUnstakeInputSchema,
        riskLevel: 'medium',
        defaultTier: 'DELAY',
      },
    ] as const;
  }

  async resolve(
    actionName: string,
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest> {
    if (actionName === 'stake') {
      return this.resolveStake(params, context);
    }

    if (actionName === 'unstake') {
      return this.resolveUnstake(params, context);
    }

    throw new ChainError('INVALID_INSTRUCTION', 'solana', {
      message: `Unknown action: ${actionName}`,
    });
  }

  // -------------------------------------------------------------------------
  // Stake: SOL -> JitoSOL via DepositSol
  // -------------------------------------------------------------------------

  private async resolveStake(
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest> {
    const input = JitoStakeInputSchema.parse(params);
    const amountLamports = await parseSolAmount(input.amount);

    return buildDepositSolRequest(this.config, amountLamports, context.walletAddress);
  }

  // -------------------------------------------------------------------------
  // Unstake: JitoSOL -> SOL via WithdrawSol
  // -------------------------------------------------------------------------

  private async resolveUnstake(
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest> {
    const input = JitoUnstakeInputSchema.parse(params);
    const amountLamports = await parseSolAmount(input.amount);

    return buildWithdrawSolRequest(this.config, amountLamports, context.walletAddress);
  }
}
