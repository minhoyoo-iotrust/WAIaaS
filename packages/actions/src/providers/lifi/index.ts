/**
 * LI.FI Cross-Chain Bridge Action Provider.
 *
 * Implements IActionProvider to resolve cross-chain bridge and swap requests
 * into ContractCallRequest arrays via LI.FI /quote API.
 *
 * Both 'cross_swap' and 'bridge' actions use the same resolve logic —
 * LI.FI /quote handles both cases. The distinction is semantic for AI agents:
 * - bridge = same token across chains (e.g., USDC Ethereum -> USDC Base)
 * - cross_swap = different tokens across chains (e.g., ETH -> Base USDC)
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
import { LiFiApiClient } from './lifi-api-client.js';
import { resolveProviderHumanAmount } from '../../common/resolve-human-amount.js';
import { type LiFiConfig, LIFI_DEFAULTS, getLiFiChainId } from './config.js';

// ---------------------------------------------------------------------------
// Input schema for cross_swap and bridge actions
// ---------------------------------------------------------------------------

const LiFiCrossSwapInputSchema = z.object({
  fromChain: z.string().min(1, 'fromChain is required (e.g., solana, ethereum, base)'),
  toChain: z.string().min(1, 'toChain is required'),
  fromToken: z.string().min(1, 'fromToken address or symbol is required'),
  toToken: z.string().min(1, 'toToken address or symbol is required'),
  fromAmount: z.string().min(1, 'fromAmount is required (in smallest units)').describe('Amount in smallest units of source token (wei/lamports). Example: "1000000" = 1 USDC').optional(),
  humanFromAmount: z.string().min(1).optional()
    .describe('Human-readable from amount (e.g., "100" for 100 USDC). Requires decimals field. Mutually exclusive with fromAmount.'),
  decimals: z.number().int().min(0).max(24).optional()
    .describe('Token decimals for humanFromAmount conversion. Required when using humanFromAmount.'),
  slippage: z.number().min(0).max(1).optional(),  // decimal, e.g. 0.03 = 3%
  toAddress: z.string().optional(),                // defaults to fromAddress (context.walletAddress)
});

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class LiFiActionProvider implements IActionProvider {
  readonly metadata: ActionProviderMetadata;
  readonly actions: readonly ActionDefinition[];
  private readonly config: LiFiConfig;
  private readonly logger?: ILogger;

  constructor(config?: Partial<LiFiConfig>, logger?: ILogger) {
    this.config = { ...LIFI_DEFAULTS, ...config };
    this.logger = logger;

    this.metadata = {
      name: 'lifi',
      displayName: 'LI.FI',
      description: 'LI.FI cross-chain bridge and swap aggregator (100+ bridges, 40+ chains)',
      version: '1.0.0',
      chains: ['ethereum', 'solana'],   // multi-chain provider
      mcpExpose: true,
      requiresApiKey: false,            // LI.FI works without API key (rate limited)
      requiredApis: ['lifi'],
      requiresSigningKey: false,
    };

    this.actions = [
      {
        name: 'cross_swap',
        description: 'Cross-chain bridge and swap via LI.FI aggregator. Moves tokens between different chains (e.g., SOL to Base USDC)',
        chain: 'ethereum',              // primary chain indicator (multi-chain works via fromChain/toChain params)
        inputSchema: LiFiCrossSwapInputSchema,
        riskLevel: 'high',              // cross-chain operations are higher risk
        defaultTier: 'DELAY',
      },
      {
        name: 'bridge',
        description: 'Simple cross-chain bridge via LI.FI. Transfers same token between chains (e.g., USDC from Ethereum to Arbitrum)',
        chain: 'ethereum',
        inputSchema: LiFiCrossSwapInputSchema,  // same schema
        riskLevel: 'high',
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
    if (actionName !== 'cross_swap' && actionName !== 'bridge') {
      throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
        message: `Unknown action: ${actionName}. Supported: cross_swap, bridge`,
      });
    }

    // Phase 405: humanFromAmount -> fromAmount conversion
    const rp = { ...params };
    resolveProviderHumanAmount(rp, 'fromAmount', 'humanFromAmount');

    // Parse and validate input
    const input = LiFiCrossSwapInputSchema.parse(rp);
    if (!input.fromAmount) {
      throw new ChainError('INVALID_INSTRUCTION', 'ethereum', { message: 'Either fromAmount or humanFromAmount (with decimals) is required' });
    }

    // Resolve LI.FI chain IDs (throws descriptive error for unsupported chains)
    let fromChainId: number;
    let toChainId: number;
    try {
      fromChainId = getLiFiChainId(input.fromChain);
      toChainId = getLiFiChainId(input.toChain);
    } catch (err) {
      throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
        message: (err as Error).message,
      });
    }

    // Clamp slippage: default 3%, max 5% (decimal values for LI.FI API)
    const slippage = this.clampSlippage(input.slippage);

    // Create API client
    const apiClient = new LiFiApiClient(this.config, this.logger);

    // Get quote from LI.FI /quote
    const quote = await apiClient.getQuote({
      fromChain: fromChainId,
      toChain: toChainId,
      fromToken: input.fromToken,
      toToken: input.toToken,
      fromAmount: input.fromAmount,
      fromAddress: context.walletAddress,
      slippage,
      toAddress: input.toAddress,
    });

    // Build ContractCallRequest from the transactionRequest
    // Convert value from hex (e.g. "0x38d7ea4c68000") to decimal string —
    // LI.FI API may return either format, but ContractCallRequestSchema requires /^\d+$/
    const request: ContractCallRequest = {
      type: 'CONTRACT_CALL',
      to: quote.transactionRequest.to,
      calldata: quote.transactionRequest.data,
      value: quote.transactionRequest.value
        ? BigInt(quote.transactionRequest.value).toString()
        : undefined,
    };

    return [request];
  }

  /**
   * Clamp slippage to [defaultSlippagePct, maxSlippagePct].
   * Input is decimal (0.03 = 3%). If not provided or <= 0, use default.
   * If > max, clamp to max.
   */
  private clampSlippage(input?: number): number {
    if (!input || input <= 0) return this.config.defaultSlippagePct;
    return Math.min(input, this.config.maxSlippagePct);
  }
}
