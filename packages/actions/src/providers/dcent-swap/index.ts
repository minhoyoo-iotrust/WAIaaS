/**
 * D'CENT Swap Aggregator Action Provider.
 *
 * Implements IActionProvider to resolve D'CENT DEX swap requests
 * into ContractCallRequest arrays for the sequential pipeline.
 *
 * - dex_swap: approve + txdata BATCH (ERC-20 sell) or single swap (native sell)
 * - get_quotes: informational only (DS-07: separate query method)
 *
 * Design source: doc 77 sections 9.1-9.5 (DcentSwapActionProvider).
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
import { DcentSwapApiClient } from './dcent-api-client.js';
import { type DcentSwapConfig, DCENT_SWAP_DEFAULTS } from './config.js';
import { getDcentQuotes, executeDexSwap, type DcentQuoteResult, type GetQuotesParams } from './dex-swap.js';
import { findTwoHopRoutes, executeTwoHopSwap, type TwoHopQuoteResult } from './auto-router.js';

// ---------------------------------------------------------------------------
// Input schemas (Zod SSoT)
// ---------------------------------------------------------------------------

const GetQuotesInputSchema = z.object({
  fromAsset: z.string().min(1),
  toAsset: z.string().min(1),
  amount: z.string().min(1),
  fromDecimals: z.number().int().min(0).max(18),
  toDecimals: z.number().int().min(0).max(18),
});

const DexSwapInputSchema = z.object({
  fromAsset: z.string().min(1),
  toAsset: z.string().min(1),
  amount: z.string().min(1),
  fromDecimals: z.number().int().min(0).max(18),
  toDecimals: z.number().int().min(0).max(18),
  providerId: z.string().optional(),
  slippageBps: z.number().int().optional(),
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/** Check if a ChainError indicates no swap route available. */
function isNoRouteError(err: ChainError): boolean {
  return err.message.includes('No swap route available') ||
    err.message.includes('No DEX swap route available');
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class DcentSwapActionProvider implements IActionProvider {
  readonly metadata: ActionProviderMetadata;
  readonly actions: readonly ActionDefinition[];

  private readonly config: DcentSwapConfig;
  private client: DcentSwapApiClient | null = null;

  constructor(config?: Partial<DcentSwapConfig>) {
    this.config = { ...DCENT_SWAP_DEFAULTS, ...config };

    this.metadata = {
      name: 'dcent_swap',
      description: "D'CENT Swap Aggregator supporting multi-provider DEX swaps",
      version: '1.0.0',
      chains: ['ethereum', 'solana'],
      mcpExpose: true,
      requiresApiKey: false,
      requiredApis: [],
    };

    this.actions = [
      {
        name: 'get_quotes',
        description: "Get swap quotes from D'CENT Swap Aggregator with provider comparison (informational)",
        chain: 'ethereum',
        inputSchema: GetQuotesInputSchema,
        riskLevel: 'low',
        defaultTier: 'INSTANT',
      },
      {
        name: 'dex_swap',
        description: "Execute DEX swap via D'CENT Swap Aggregator with approve and txdata BATCH pipeline",
        chain: 'ethereum',
        inputSchema: DexSwapInputSchema,
        riskLevel: 'high',
        defaultTier: 'DELAY',
      },
    ] as const;
  }

  // -----------------------------------------------------------------------
  // IActionProvider.resolve
  // -----------------------------------------------------------------------

  async resolve(
    actionName: string,
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest | ContractCallRequest[]> {
    switch (actionName) {
      case 'get_quotes': {
        // DS-07: get_quotes is informational. Use queryQuotes() for direct access.
        const input = GetQuotesInputSchema.parse(params);
        const result = await getDcentQuotes(this.getClient(), input);
        throw new ChainError('INVALID_INSTRUCTION', context.chain, {
          message: `get_quotes is informational. Use queryQuotes() query method. Result: ${JSON.stringify({
            dexProviders: result.dexProviders.length,
            bestDexProvider: result.bestDexProvider?.providerId ?? null,
          })}`,
        });
      }

      case 'dex_swap': {
        const input = DexSwapInputSchema.parse(params);
        try {
          return await executeDexSwap(
            this.getClient(),
            {
              ...input,
              walletAddress: context.walletAddress,
            },
            this.config,
          );
        } catch (err) {
          // DS-04: Fallback to 2-hop auto-routing when direct route unavailable
          if (err instanceof ChainError && isNoRouteError(err)) {
            const twoHopResult = await executeTwoHopSwap(
              this.getClient(),
              {
                ...input,
                walletAddress: context.walletAddress,
              },
              this.config,
            );
            // Return flat BATCH requests (pipeline handles execution)
            return twoHopResult.requests;
          }
          throw err;
        }
      }

      default:
        throw new ChainError('INVALID_INSTRUCTION', context.chain, {
          message: `Unknown action: ${actionName}`,
        });
    }
  }

  // -----------------------------------------------------------------------
  // Public query methods (for MCP/SDK direct access, Phase 346)
  // -----------------------------------------------------------------------

  /**
   * Query swap quotes without going through the pipeline.
   * Returns structured result for MCP tools and SDK methods.
   */
  async queryQuotes(params: GetQuotesParams): Promise<DcentQuoteResult> {
    return getDcentQuotes(this.getClient(), params);
  }

  /**
   * Query 2-hop swap routes via intermediate tokens.
   * Returns available routes when direct route is unavailable.
   * DS-04: fallback strategy for fail_no_available_provider.
   */
  async queryTwoHopRoutes(params: GetQuotesParams): Promise<TwoHopQuoteResult> {
    return findTwoHopRoutes(this.getClient(), params);
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  /** Lazy singleton API client. */
  private getClient(): DcentSwapApiClient {
    if (!this.client) {
      this.client = new DcentSwapApiClient(this.config);
    }
    return this.client;
  }
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { type DcentSwapConfig, DCENT_SWAP_DEFAULTS } from './config.js';
export { type DcentQuoteResult, type GetQuotesParams } from './dex-swap.js';
export { caip19ToDcentId, dcentIdToCaip19 } from './currency-mapper.js';
export { DcentSwapApiClient } from './dcent-api-client.js';
export {
  findTwoHopRoutes,
  executeTwoHopSwap,
  type TwoHopRoute,
  type TwoHopQuoteResult,
  type TwoHopExecutionResult,
} from './auto-router.js';
