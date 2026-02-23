/**
 * 0x Swap Action Provider.
 *
 * Implements IActionProvider to resolve 0x DEX swap requests
 * into ContractCallRequest arrays for the sequential pipeline.
 *
 * ERC-20 sells produce [approve, swap] (2 elements).
 * Native ETH sells produce [swap] (1 element).
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
import { ZeroExApiClient } from './zerox-api-client.js';
import {
  type ZeroExSwapConfig,
  ZEROX_SWAP_DEFAULTS,
  getAllowanceHolderAddress,
  CHAIN_ID_MAP,
} from './config.js';
import { clampSlippageBps, asBps } from '../../common/slippage.js';

// ---------------------------------------------------------------------------
// Native ETH placeholder address used by 0x API
// ---------------------------------------------------------------------------

const NATIVE_ETH_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

// ---------------------------------------------------------------------------
// ERC-20 approve calldata encoder
// ---------------------------------------------------------------------------

/**
 * Encode ERC-20 approve(address spender, uint256 amount) calldata.
 * Function selector: 0x095ea7b3
 */
function encodeApproveCalldata(spender: string, amount: string): string {
  const selector = '0x095ea7b3';
  const paddedSpender = spender.slice(2).toLowerCase().padStart(64, '0');
  const paddedAmount = BigInt(amount).toString(16).padStart(64, '0');
  return `${selector}${paddedSpender}${paddedAmount}`;
}

// ---------------------------------------------------------------------------
// Input schema for the swap action
// ---------------------------------------------------------------------------

const SwapInputSchema = z.object({
  sellToken: z.string().min(1, 'sellToken is required'),
  buyToken: z.string().min(1, 'buyToken is required'),
  sellAmount: z.string().min(1, 'sellAmount is required (in smallest units)'),
  slippageBps: z.number().int().optional(),
  chainId: z.number().int().optional(),
});

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class ZeroExSwapActionProvider implements IActionProvider {
  readonly metadata: ActionProviderMetadata;
  readonly actions: readonly ActionDefinition[];

  private readonly config: ZeroExSwapConfig;

  constructor(config?: Partial<ZeroExSwapConfig>) {
    this.config = { ...ZEROX_SWAP_DEFAULTS, ...config };

    this.metadata = {
      name: 'zerox_swap',
      description: '0x DEX aggregator for EVM token swaps via AllowanceHolder flow',
      version: '1.0.0',
      chains: ['ethereum'],
      mcpExpose: true,
      requiresApiKey: true,
      requiredApis: ['0x'],
    };

    this.actions = [
      {
        name: 'swap',
        description: 'Swap tokens on EVM chains via 0x aggregator with slippage protection and AllowanceHolder approval',
        chain: 'ethereum',
        inputSchema: SwapInputSchema,
        riskLevel: 'medium',
        defaultTier: 'DELAY',
      },
    ] as const;
  }

  async resolve(
    actionName: string,
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest[]> {
    // Validate action name
    if (actionName !== 'swap') {
      throw new ChainError('INVALID_INSTRUCTION', 'ethereum', { message: `Unknown action: ${actionName}` });
    }

    // Parse and validate input
    const input = SwapInputSchema.parse(params);

    // SAFE-05: Block same-token swap
    if (input.sellToken.toLowerCase() === input.buyToken.toLowerCase()) {
      throw new ChainError('INVALID_INSTRUCTION', 'ethereum', { message: 'Cannot swap a token for itself' });
    }

    // Resolve chainId: explicit input > CHAIN_ID_MAP lookup > default 1 (Ethereum mainnet)
    const chainId = input.chainId ?? CHAIN_ID_MAP['ethereum-mainnet'] ?? 1;

    // ZXSW-06: Clamp slippage -- default 100bps (1%), max 500bps (5%)
    const slippageBps = clampSlippageBps(
      input.slippageBps ?? 0,
      asBps(this.config.defaultSlippageBps),
      asBps(this.config.maxSlippageBps),
    );

    // Create API client with resolved chainId
    const apiClient = new ZeroExApiClient(this.config, chainId);

    // Get quote from 0x API
    const quote = await apiClient.getQuote({
      sellToken: input.sellToken,
      buyToken: input.buyToken,
      sellAmount: input.sellAmount,
      taker: context.walletAddress,
      slippageBps,
    });

    // ZXSW-07: Check liquidity availability
    if (!quote.liquidityAvailable) {
      throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
        message: 'No liquidity available for this swap pair',
      });
    }

    // ZXSW-09: Validate AllowanceHolder address
    const expectedAllowanceHolder = getAllowanceHolderAddress(chainId);
    if (quote.transaction.to.toLowerCase() !== expectedAllowanceHolder.toLowerCase()) {
      throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
        message: `AllowanceHolder address mismatch: expected ${expectedAllowanceHolder}, got ${quote.transaction.to}`,
      });
    }

    // Build result array
    const isNativeEthSell = input.sellToken.toLowerCase() === NATIVE_ETH_ADDRESS;

    const swapRequest: ContractCallRequest = {
      type: 'CONTRACT_CALL',
      to: quote.transaction.to,
      calldata: quote.transaction.data,
      value: quote.transaction.value,
    };

    if (isNativeEthSell) {
      // Native ETH sell: single swap element
      return [swapRequest];
    }

    // ERC-20 sell: approve + swap (ZXSW-04)
    const approveRequest: ContractCallRequest = {
      type: 'CONTRACT_CALL',
      to: input.sellToken,
      calldata: encodeApproveCalldata(expectedAllowanceHolder, input.sellAmount),
      value: '0',
    };

    return [approveRequest, swapRequest];
  }
}
