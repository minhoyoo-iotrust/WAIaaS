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
import { parseTokenAmount } from '../../common/amount-parser.js';
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
} from './lido-contract.js';

// ---------------------------------------------------------------------------
// Input schemas (Zod SSoT)
// ---------------------------------------------------------------------------

const LidoStakeInputSchema = z.object({
  amount: z.string().min(1, 'amount is required (ETH, e.g. "1.0")'),
});

const LidoUnstakeInputSchema = z.object({
  amount: z.string().min(1, 'amount is required (stETH, e.g. "1.0")'),
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
    const input = LidoStakeInputSchema.parse(params);
    const amountWei = parseTokenAmount(input.amount, 18);

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
    const input = LidoUnstakeInputSchema.parse(params);
    const amountWei = parseTokenAmount(input.amount, 18);

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
}
