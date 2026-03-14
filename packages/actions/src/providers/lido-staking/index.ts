/**
 * Lido Staking Action Provider.
 *
 * Implements IActionProvider to resolve Lido liquid staking requests
 * into ContractCallRequest arrays for the sequential pipeline.
 *
 * Actions:
 * - stake: ETH -> stETH via Lido submit() (single element)
 * - unstake: stETH -> ETH via WithdrawalQueue (2 elements: approve + requestWithdrawals)
 */
import { z } from 'zod';
import { ChainError } from '@waiaas/core';
import { migrateAmount } from '../../common/migrate-amount.js';
import { resolveProviderHumanAmount } from '../../common/resolve-human-amount.js';
import type {
  IActionProvider,
  ActionProviderMetadata,
  ActionDefinition,
  ActionContext,
  ContractCallRequest,
} from '@waiaas/core';
import { type LidoStakingConfig, LIDO_STAKING_DEFAULTS } from './config.js';
import {
  encodeSubmitCalldata,
  encodeRequestWithdrawalsCalldata,
  encodeApproveCalldata,
  encodeBalanceOfCalldata,
  encodeStEthPerTokenCalldata,
  decodeUint256Result,
  WSTETH_MAINNET,
} from './lido-contract.js';
import { formatCaip19 } from '@waiaas/core';
import type { PositionUpdate, PositionCategory } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Input schemas (Zod SSoT)
// ---------------------------------------------------------------------------

const LidoStakeInputSchema = z.object({
  amount: z.string().min(1, 'amount is required').describe('Amount in smallest units (wei). Example: "1000000000000000000" = 1.0 ETH. Legacy decimal input (e.g., "1.0") is auto-converted with deprecation warning.').optional(),
  humanAmount: z.string().min(1).optional()
    .describe('Human-readable amount (e.g., "1.5" for 1.5 ETH). Requires decimals field. Mutually exclusive with amount.'),
  decimals: z.number().int().min(0).max(24).optional()
    .describe('Token decimals for humanAmount conversion. Required when using humanAmount.'),
});

const LidoUnstakeInputSchema = z.object({
  amount: z.string().min(1, 'amount is required').describe('Amount in smallest units (wei). Example: "1000000000000000000" = 1.0 stETH. Legacy decimal input (e.g., "1.0") is auto-converted with deprecation warning.').optional(),
  humanAmount: z.string().min(1).optional()
    .describe('Human-readable amount (e.g., "1.0" for 1.0 stETH). Requires decimals field. Mutually exclusive with amount.'),
  decimals: z.number().int().min(0).max(24).optional()
    .describe('Token decimals for humanAmount conversion. Required when using humanAmount.'),
});

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class LidoStakingActionProvider implements IActionProvider {
  readonly metadata: ActionProviderMetadata;
  readonly actions: readonly ActionDefinition[];

  private readonly config: LidoStakingConfig;
  private readonly rpcUrl?: string;

  constructor(config?: Partial<LidoStakingConfig>) {
    this.config = { ...LIDO_STAKING_DEFAULTS, ...config };
    this.rpcUrl = this.config.rpcUrl;

    this.metadata = {
      name: 'lido_staking',
      description: 'Lido liquid staking protocol for ETH to stETH conversion with withdrawal support',
      version: '1.0.0',
      chains: ['ethereum'],
      mcpExpose: true,
      requiresApiKey: false,
      requiredApis: [],
      requiresSigningKey: false,
    };

    this.actions = [
      {
        name: 'stake',
        description: 'Stake ETH to receive stETH via Lido protocol (submit). Immediate, no lock-up.',
        chain: 'ethereum',
        inputSchema: LidoStakeInputSchema,
        riskLevel: 'medium',
        defaultTier: 'DELAY',
      },
      {
        name: 'unstake',
        description: 'Request stETH to ETH withdrawal via Lido Withdrawal Queue. Takes 1-5 days to finalize.',
        chain: 'ethereum',
        inputSchema: LidoUnstakeInputSchema,
        riskLevel: 'medium',
        defaultTier: 'DELAY',
      },
    ] as const;
  }

  async resolve(
    actionName: string,
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest | ContractCallRequest[]> {
    if (actionName === 'stake') {
      return this.resolveStake(params);
    }

    if (actionName === 'unstake') {
      return this.resolveUnstake(params, context);
    }

    throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
      message: `Unknown action: ${actionName}`,
    });
  }

  // -------------------------------------------------------------------------
  // Stake: ETH -> stETH via submit()
  // -------------------------------------------------------------------------

  private resolveStake(params: Record<string, unknown>): ContractCallRequest {
    const rp = { ...params };
    resolveProviderHumanAmount(rp, 'amount', 'humanAmount');
    const input = LidoStakeInputSchema.parse(rp);
    if (!input.amount) throw new ChainError('INVALID_INSTRUCTION', 'ethereum', { message: 'Either amount or humanAmount (with decimals) is required' });
    const amountWei = migrateAmount(input.amount, 18);
    if (amountWei === 0n) throw new ChainError('INVALID_INSTRUCTION', 'ethereum', { message: 'Amount must be greater than 0' });

    return {
      type: 'CONTRACT_CALL',
      to: this.config.stethAddress,
      calldata: encodeSubmitCalldata(), // submit(address(0)) referral
      value: amountWei.toString(),      // ETH value sent with tx
    };
  }

  // -------------------------------------------------------------------------
  // Unstake: stETH -> ETH via WithdrawalQueue (approve + requestWithdrawals)
  // -------------------------------------------------------------------------

  private resolveUnstake(
    params: Record<string, unknown>,
    context: ActionContext,
  ): ContractCallRequest[] {
    const rp = { ...params };
    resolveProviderHumanAmount(rp, 'amount', 'humanAmount');
    const input = LidoUnstakeInputSchema.parse(rp);
    if (!input.amount) throw new ChainError('INVALID_INSTRUCTION', 'ethereum', { message: 'Either amount or humanAmount (with decimals) is required' });
    const amountWei = migrateAmount(input.amount, 18);
    if (amountWei === 0n) throw new ChainError('INVALID_INSTRUCTION', 'ethereum', { message: 'Amount must be greater than 0' });

    // Step 1: Approve stETH to WithdrawalQueue
    const approveRequest: ContractCallRequest = {
      type: 'CONTRACT_CALL',
      to: this.config.stethAddress,
      calldata: encodeApproveCalldata(
        this.config.withdrawalQueueAddress,
        amountWei,
      ),
      value: '0',
    };

    // Step 2: Request withdrawal from WithdrawalQueue
    const withdrawRequest: ContractCallRequest = {
      type: 'CONTRACT_CALL',
      to: this.config.withdrawalQueueAddress,
      calldata: encodeRequestWithdrawalsCalldata(
        [amountWei],
        context.walletAddress,
      ),
      value: '0',
    };

    return [approveRequest, withdrawRequest];
  }

  // -------------------------------------------------------------------------
  // IPositionProvider methods (duck-type, no formal implements)
  // -------------------------------------------------------------------------

  /**
   * Query stETH and wstETH balances for the given wallet and return
   * STAKING position updates. Returns [] on zero balances or RPC error.
   */
  async getPositions(walletId: string): Promise<PositionUpdate[]> {
    if (!this.rpcUrl) return [];

    try {
      const positions: PositionUpdate[] = [];
      const now = Math.floor(Date.now() / 1000);

      // 1. Read stETH balance
      const stethBalance = await this.ethCallUint256(
        this.config.stethAddress,
        encodeBalanceOfCalldata(walletId),
      );

      // 2. Read wstETH balance
      const wstethBalance = await this.ethCallUint256(
        WSTETH_MAINNET,
        encodeBalanceOfCalldata(walletId),
      );

      // 3. Read stEthPerToken exchange rate (for wstETH -> stETH conversion)
      let stEthPerToken = 10n ** 18n; // default 1:1
      if (wstethBalance > 0n) {
        stEthPerToken = await this.ethCallUint256(
          WSTETH_MAINNET,
          encodeStEthPerTokenCalldata(),
        );
      }

      // 4. Build stETH position if non-zero
      if (stethBalance > 0n) {
        const amount = this.formatWei(stethBalance);
        positions.push({
          walletId,
          category: 'STAKING' as PositionCategory,
          provider: 'lido_staking',
          chain: 'ethereum',
          network: 'ethereum-mainnet',
          assetId: formatCaip19('eip155:1', 'erc20', this.config.stethAddress),
          amount,
          amountUsd: null,
          metadata: { token: 'stETH', underlyingAmount: amount },
          status: 'ACTIVE',
          openedAt: now,
        });
      }

      // 5. Build wstETH position if non-zero
      if (wstethBalance > 0n) {
        const amount = this.formatWei(wstethBalance);
        const underlyingRaw = (wstethBalance * stEthPerToken) / (10n ** 18n);
        const underlyingAmount = this.formatWei(underlyingRaw);

        positions.push({
          walletId,
          category: 'STAKING' as PositionCategory,
          provider: 'lido_staking',
          chain: 'ethereum',
          network: 'ethereum-mainnet',
          assetId: formatCaip19('eip155:1', 'erc20', WSTETH_MAINNET),
          amount,
          amountUsd: null,
          metadata: { token: 'wstETH', underlyingAmount },
          status: 'ACTIVE',
          openedAt: now,
        });
      }

      return positions;
    } catch {
      return [];
    }
  }

  getProviderName(): string {
    return 'lido_staking';
  }

  getSupportedCategories(): PositionCategory[] {
    return ['STAKING'];
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Execute a single eth_call and decode the result as uint256.
   */
  private async ethCallUint256(to: string, data: string): Promise<bigint> {
    const resp = await fetch(this.rpcUrl!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to, data }, 'latest'],
      }),
    });
    const json = (await resp.json()) as { result: string };
    return decodeUint256Result(json.result);
  }

  /**
   * Format a wei-denominated bigint to a human-readable decimal string (18 decimals).
   */
  private formatWei(value: bigint): string {
    const whole = value / (10n ** 18n);
    const frac = value % (10n ** 18n);
    if (frac === 0n) return `${whole}.0`;
    const fracStr = frac.toString().padStart(18, '0').replace(/0+$/, '');
    return `${whole}.${fracStr}`;
  }
}
