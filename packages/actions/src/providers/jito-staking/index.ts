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
  getJitoSolBalance,
  getStakePoolExchangeRate,
} from './jito-stake-pool.js';
import { migrateAmount } from '../../common/migrate-amount.js';
import { resolveProviderHumanAmount } from '../../common/resolve-human-amount.js';
import { formatCaip19, networkToCaip2 } from '@waiaas/core';
import type { NetworkType, PositionUpdate, PositionCategory, PositionQueryContext } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Input schemas (Zod SSoT)
// ---------------------------------------------------------------------------

const JitoStakeInputSchema = z.object({
  amount: z.string().min(1, 'amount is required').describe('Amount in smallest units (lamports). Example: "1000000000" = 1.0 SOL. Legacy decimal input (e.g., "1.0") is auto-converted with deprecation warning.').optional(),
  humanAmount: z.string().min(1).optional()
    .describe('Human-readable amount (e.g., "1.5" for 1.5 SOL). Requires decimals field. Mutually exclusive with amount.'),
  decimals: z.number().int().min(0).max(24).optional()
    .describe('Token decimals for humanAmount conversion. Required when using humanAmount.'),
});

const JitoUnstakeInputSchema = z.object({
  amount: z.string().min(1, 'amount is required').describe('Amount in smallest units (lamports). Example: "1000000000" = 1.0 JitoSOL. Legacy decimal input (e.g., "1.0") is auto-converted with deprecation warning.').optional(),
  humanAmount: z.string().min(1).optional()
    .describe('Human-readable amount (e.g., "1.0" for 1.0 JitoSOL). Requires decimals field. Mutually exclusive with amount.'),
  decimals: z.number().int().min(0).max(24).optional()
    .describe('Token decimals for humanAmount conversion. Required when using humanAmount.'),
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
      displayName: 'Jito Staking',
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
    if (!this.rpcUrl) {
      throw new ChainError('INVALID_INSTRUCTION', 'solana', {
        message: 'rpcUrl is required for Jito staking (needed to read on-chain stake pool accounts)',
      });
    }

    const rp = { ...params };
    resolveProviderHumanAmount(rp, 'amount', 'humanAmount');
    const input = JitoStakeInputSchema.parse(rp);
    if (!input.amount) throw new ChainError('INVALID_INSTRUCTION', 'solana', { message: 'Either amount or humanAmount (with decimals) is required' });
    const amountLamports = migrateAmount(input.amount, 9);
    if (amountLamports === 0n) throw new ChainError('INVALID_INSTRUCTION', 'solana', { message: 'Amount must be greater than 0' });

    if (amountLamports < JITO_MIN_DEPOSIT_LAMPORTS) {
      throw new ChainError('INVALID_INSTRUCTION', 'solana', {
        message: `Minimum Jito stake deposit is ${JITO_MIN_DEPOSIT_SOL} SOL`,
      });
    }

    return buildDepositSolRequest(this.config, amountLamports, context.walletAddress, this.rpcUrl);
  }

  // -------------------------------------------------------------------------
  // Unstake: JitoSOL -> SOL via WithdrawSol
  // -------------------------------------------------------------------------

  private async resolveUnstake(
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest> {
    if (!this.rpcUrl) {
      throw new ChainError('INVALID_INSTRUCTION', 'solana', {
        message: 'rpcUrl is required for Jito unstaking (needed to read on-chain stake pool accounts)',
      });
    }

    const rp = { ...params };
    resolveProviderHumanAmount(rp, 'amount', 'humanAmount');
    const input = JitoUnstakeInputSchema.parse(rp);
    if (!input.amount) throw new ChainError('INVALID_INSTRUCTION', 'solana', { message: 'Either amount or humanAmount (with decimals) is required' });
    const amountLamports = migrateAmount(input.amount, 9);
    if (amountLamports === 0n) throw new ChainError('INVALID_INSTRUCTION', 'solana', { message: 'Amount must be greater than 0' });

    return buildWithdrawSolRequest(this.config, amountLamports, context.walletAddress, this.rpcUrl);
  }

  // -------------------------------------------------------------------------
  // IPositionProvider methods (duck-type, no formal implements)
  // -------------------------------------------------------------------------

  /**
   * Query jitoSOL token balance and stake pool exchange rate for the given wallet.
   * Returns STAKING position with SOL-equivalent underlyingAmount.
   */
  async getPositions(ctx: PositionQueryContext): Promise<PositionUpdate[]> {
    if (ctx.chain !== 'solana') return [];
    if (!this.rpcUrl) return [];
    const walletAddress = ctx.walletAddress;
    const network = ctx.networks[0] ?? 'solana-mainnet';

    try {
      const balance = await getJitoSolBalance(
        this.rpcUrl,
        walletAddress,
        this.config.jitosolMint,
      );

      if (!balance || balance.uiAmount === 0) return [];

      const exchangeRate = await getStakePoolExchangeRate(
        this.rpcUrl,
        this.config.stakePoolAddress,
      );

      const solEquivalent = balance.uiAmount * exchangeRate;
      const now = Math.floor(Date.now() / 1000);

      // Use networkToCaip2 for correct CAIP-2 identifier per network (MCHN-08)
      const caip2 = networkToCaip2(network as NetworkType);

      return [
        {
          walletId: ctx.walletId,
          category: 'STAKING' as PositionCategory,
          provider: 'jito_staking',
          chain: 'solana',
          network,
          assetId: formatCaip19(
            caip2,
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
