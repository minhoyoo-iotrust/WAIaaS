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
  ILogger,
} from '@waiaas/core';
import { ZeroExApiClient } from './zerox-api-client.js';
import {
  type ZeroExSwapConfig,
  ZEROX_SWAP_DEFAULTS,
  getAllowanceHolderAddress,
  CHAIN_ID_MAP,
} from './config.js';
import { clampSlippageBps, asBps } from '../../common/slippage.js';
import { encodeApproveCalldata } from '../../common/contract-encoding.js';
import { resolveProviderHumanAmount } from '../../common/resolve-human-amount.js';

// ---------------------------------------------------------------------------
// Native ETH placeholder address used by 0x API
// ---------------------------------------------------------------------------

const NATIVE_ETH_ADDRESS = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

// ---------------------------------------------------------------------------
// Input schema for the swap action
// ---------------------------------------------------------------------------

const SwapInputSchema = z.object({
  sellToken: z.string().min(1, 'sellToken is required'),
  buyToken: z.string().min(1, 'buyToken is required'),
  sellAmount: z.string().min(1, 'sellAmount is required (in smallest units)').describe('Sell amount in smallest units (wei). Example: "1000000000000000000" = 1 ETH').optional(),
  humanSellAmount: z.string().min(1).optional()
    .describe('Human-readable sell amount (e.g., "1.5" for 1.5 ETH). Requires decimals field. Mutually exclusive with sellAmount.'),
  decimals: z.number().int().min(0).max(24).optional()
    .describe('Token decimals for humanSellAmount conversion. Required when using humanSellAmount.'),
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
  private readonly logger?: ILogger;

  constructor(config?: Partial<ZeroExSwapConfig>, logger?: ILogger) {
    this.config = { ...ZEROX_SWAP_DEFAULTS, ...config };
    this.logger = logger;

    this.metadata = {
      name: 'zerox_swap',
      displayName: '0x Swap',
      description: '0x DEX aggregator for EVM token swaps via AllowanceHolder flow',
      version: '1.0.0',
      chains: ['ethereum'],
      mcpExpose: true,
      requiresApiKey: true,
      requiredApis: ['0x'],
      requiresSigningKey: false,
    };

    this.actions = [
      {
        name: 'swap',
        description: 'Swap tokens on EVM chains via 0x aggregator with slippage protection and AllowanceHolder approval',
        chain: 'ethereum',
        inputSchema: SwapInputSchema,
        riskLevel: 'medium',
        defaultTier: 'INSTANT',
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

    // Phase 405: humanSellAmount -> sellAmount conversion
    const resolvedParams = { ...params };
    resolveProviderHumanAmount(resolvedParams, 'sellAmount', 'humanSellAmount');

    // Parse and validate input
    const input = SwapInputSchema.parse(resolvedParams);
    if (!input.sellAmount) {
      throw new ChainError('INVALID_INSTRUCTION', 'ethereum', { message: 'Either sellAmount or humanSellAmount (with decimals) is required' });
    }

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
    const apiClient = new ZeroExApiClient(this.config, chainId, this.logger);

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

    // Convert value from hex to decimal string —
    // 0x API may return hex format, but ContractCallRequestSchema requires /^\d+$/
    const swapRequest: ContractCallRequest = {
      type: 'CONTRACT_CALL',
      to: quote.transaction.to,
      calldata: quote.transaction.data,
      value: quote.transaction.value
        ? BigInt(quote.transaction.value).toString()
        : undefined,
    };

    if (isNativeEthSell) {
      // Native ETH sell: single swap element
      return [swapRequest];
    }

    // ERC-20 sell: approve + swap (ZXSW-04)
    const approveRequest: ContractCallRequest = {
      type: 'CONTRACT_CALL',
      to: input.sellToken,
      calldata: encodeApproveCalldata(expectedAllowanceHolder, BigInt(input.sellAmount)),
      value: '0',
    };

    return [approveRequest, swapRequest];
  }
}
