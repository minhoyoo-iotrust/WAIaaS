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
  LIDO_NETWORK_CONFIG,
  LIDO_TESTNET_NETWORK_CONFIG,
  type LidoNetworkContracts,
} from './lido-contract.js';
import { formatCaip19 } from '@waiaas/core';
import type { PositionUpdate, PositionCategory, PositionQueryContext } from '@waiaas/core';

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
  constructor(config?: Partial<LidoStakingConfig>) {
    this.config = { ...LIDO_STAKING_DEFAULTS, ...config };

    this.metadata = {
      name: 'lido_staking',
      displayName: 'Lido Staking',
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
   * Query stETH and wstETH balances across all supported networks in ctx.networks.
   * Uses Promise.allSettled for partial failure resilience (MCHN-06, MCHN-07).
   */
  async getPositions(ctx: PositionQueryContext): Promise<PositionUpdate[]> {
    if (ctx.chain !== 'ethereum') return [];
    const walletAddress = ctx.walletAddress;

    // Select config map based on environment (MCHN-10)
    const networkConfig = ctx.environment === 'testnet'
      ? LIDO_TESTNET_NETWORK_CONFIG
      : LIDO_NETWORK_CONFIG;

    // Filter ctx.networks to only Lido-supported networks
    const supportedNetworks = ctx.networks.filter(n => networkConfig[n]);
    if (supportedNetworks.length === 0) return [];

    // Query each network in parallel via Promise.allSettled (MCHN-06)
    const results = await Promise.allSettled(
      supportedNetworks.map(network => {
        const rpcUrl = ctx.rpcUrls[network];
        if (!rpcUrl) return Promise.resolve([] as PositionUpdate[]);
        return this.queryNetworkPositions(ctx.walletId, walletAddress, network, networkConfig[network]!, rpcUrl);
      }),
    );

    // Collect only fulfilled results (MCHN-07)
    return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  }

  /**
   * Query stETH + wstETH positions on a single network.
   */
  private async queryNetworkPositions(
    walletId: string,
    walletAddress: string,
    network: string,
    config: LidoNetworkContracts,
    rpcUrl: string,
  ): Promise<PositionUpdate[]> {
    const positions: PositionUpdate[] = [];
    const now = Math.floor(Date.now() / 1000);

    // 1. Read stETH balance (only on networks that have stETH deployed)
    if (config.stethAddress) {
      const stethBalance = await this.ethCallUint256WithRpc(
        rpcUrl,
        config.stethAddress,
        encodeBalanceOfCalldata(walletAddress),
      );

      if (stethBalance > 0n) {
        const amount = this.formatWei(stethBalance);
        positions.push({
          walletId,
          category: 'STAKING' as PositionCategory,
          provider: 'lido_staking',
          chain: 'ethereum',
          network,
          assetId: formatCaip19(config.caip2, 'erc20', config.stethAddress),
          amount,
          amountUsd: null,
          metadata: { token: 'stETH', underlyingAmount: amount },
          status: 'ACTIVE',
          openedAt: now,
        });
      }
    }

    // 2. Read wstETH balance
    const wstethBalance = await this.ethCallUint256WithRpc(
      rpcUrl,
      config.wstethAddress,
      encodeBalanceOfCalldata(walletAddress),
    );

    if (wstethBalance > 0n) {
      // 3. Read stEthPerToken exchange rate
      let stEthPerToken = 10n ** 18n; // default 1:1
      try {
        stEthPerToken = await this.ethCallUint256WithRpc(
          rpcUrl,
          config.wstethAddress,
          encodeStEthPerTokenCalldata(),
        );
      } catch {
        // Fallback to 1:1 if stEthPerToken fails (L2 wstETH may not have this method)
      }

      const amount = this.formatWei(wstethBalance);
      const underlyingRaw = (wstethBalance * stEthPerToken) / (10n ** 18n);
      const underlyingAmount = this.formatWei(underlyingRaw);

      positions.push({
        walletId,
        category: 'STAKING' as PositionCategory,
        provider: 'lido_staking',
        chain: 'ethereum',
        network,
        assetId: formatCaip19(config.caip2, 'erc20', config.wstethAddress),
        amount,
        amountUsd: null,
        metadata: { token: 'wstETH', underlyingAmount },
        status: 'ACTIVE',
        openedAt: now,
      });
    }

    return positions;
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
   * Execute a single eth_call with explicit rpcUrl and decode the result as uint256.
   */
  private async ethCallUint256WithRpc(rpcUrl: string, to: string, data: string): Promise<bigint> {
    const resp = await fetch(rpcUrl, {
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
