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
import { type JitoStakingConfig, JITO_STAKING_DEFAULTS, JITO_MIN_DEPOSIT_LAMPORTS, JITO_MIN_DEPOSIT_SOL } from './config.js';
import {
  buildDepositSolRequest,
  buildWithdrawSolRequest,
  parseSolAmount,
  getJitoSolBalance,
  getStakePoolExchangeRate,
} from './jito-stake-pool.js';
import { formatCaip19 } from '@waiaas/core';
import type { PositionUpdate, PositionCategory } from '@waiaas/core';

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
  private readonly rpcUrl?: string;

  constructor(config?: Partial<JitoStakingConfig>) {
    this.config = { ...JITO_STAKING_DEFAULTS, ...config };
    this.rpcUrl = this.config.rpcUrl;

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

    if (amountLamports < JITO_MIN_DEPOSIT_LAMPORTS) {
      throw new ChainError('INVALID_INSTRUCTION', 'solana', {
        message: `Minimum Jito stake deposit is ${JITO_MIN_DEPOSIT_SOL} SOL`,
      });
    }

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

  // -------------------------------------------------------------------------
  // IPositionProvider methods (duck-type, no formal implements)
  // -------------------------------------------------------------------------

  /**
   * Query jitoSOL token balance and stake pool exchange rate for the given wallet.
   * Returns STAKING position with SOL-equivalent underlyingAmount.
   */
  async getPositions(walletId: string): Promise<PositionUpdate[]> {
    if (!this.rpcUrl) return [];

    try {
      const balance = await getJitoSolBalance(
        this.rpcUrl,
        walletId,
        this.config.jitosolMint,
      );

      if (!balance || balance.uiAmount === 0) return [];

      const exchangeRate = await getStakePoolExchangeRate(
        this.rpcUrl,
        this.config.stakePoolAddress,
      );

      const solEquivalent = balance.uiAmount * exchangeRate;
      const now = Math.floor(Date.now() / 1000);

      return [
        {
          walletId,
          category: 'STAKING' as PositionCategory,
          provider: 'jito_staking',
          chain: 'solana',
          network: 'solana-mainnet',
          assetId: formatCaip19(
            'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
            'token',
            this.config.jitosolMint,
          ),
          amount: String(balance.uiAmount),
          amountUsd: null,
          metadata: {
            token: 'jitoSOL',
            underlyingAmount: String(solEquivalent),
            underlyingToken: 'SOL',
            exchangeRate,
          },
          status: 'ACTIVE',
          openedAt: now,
        },
      ];
    } catch {
      return [];
    }
  }

  getProviderName(): string {
    return 'jito_staking';
  }

  getSupportedCategories(): PositionCategory[] {
    return ['STAKING'];
  }
}
