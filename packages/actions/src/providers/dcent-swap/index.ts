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
  ApiDirectResult,
  ILogger,
} from '@waiaas/core';
import { DcentSwapApiClient } from './dcent-api-client.js';
import { type DcentSwapConfig, DCENT_SWAP_DEFAULTS } from './config.js';
import { getDcentQuotes, executeDexSwap, type DcentQuoteResult, type GetQuotesParams } from './dex-swap.js';
import { findTwoHopRoutes, executeTwoHopSwap, INTERMEDIATE_TOKENS, type TwoHopQuoteResult } from './auto-router.js';
import { resolveProviderHumanAmount } from '../../common/resolve-human-amount.js';

// ---------------------------------------------------------------------------
// Input schemas (Zod SSoT)
// ---------------------------------------------------------------------------

const GetQuotesInputSchema = z.object({
  fromAsset: z.string().min(1),
  toAsset: z.string().min(1),
  amount: z.string().min(1).describe('Amount in smallest units. Example: "1000000000000000000" = 1 token with 18 decimals').optional(),
  humanAmount: z.string().min(1).optional()
    .describe('Human-readable amount (e.g., "1.5" for 1.5 tokens). Requires decimals field. Mutually exclusive with amount.'),
  decimals: z.number().int().min(0).max(24).optional()
    .describe('Token decimals for humanAmount conversion. Required when using humanAmount.'),
  fromDecimals: z.number().int().min(0).max(18).optional()
    .describe('Source token decimals. Auto-resolved from well-known tokens when omitted.'),
  toDecimals: z.number().int().min(0).max(18).optional()
    .describe('Destination token decimals. Auto-resolved from well-known tokens when omitted.'),
});

const DexSwapInputSchema = z.object({
  fromAsset: z.string().min(1),
  toAsset: z.string().min(1),
  amount: z.string().min(1).describe('Amount in smallest units. Example: "1000000000000000000" = 1 token with 18 decimals').optional(),
  humanAmount: z.string().min(1).optional()
    .describe('Human-readable amount (e.g., "1.5" for 1.5 tokens). Requires decimals field. Mutually exclusive with amount.'),
  decimals: z.number().int().min(0).max(24).optional()
    .describe('Token decimals for humanAmount conversion. Required when using humanAmount. Note: this is separate from fromDecimals/toDecimals.'),
  fromDecimals: z.number().int().min(0).max(18).optional()
    .describe('Source token decimals. Auto-resolved from well-known tokens when omitted.'),
  toDecimals: z.number().int().min(0).max(18).optional()
    .describe('Destination token decimals. Auto-resolved from well-known tokens when omitted.'),
  providerId: z.string().optional(),
  slippageBps: z.number().int().optional(),
  toWalletAddress: z.string().optional()
    .describe('Destination wallet address for cross-chain swaps. Required when source and destination chains differ (e.g., EVM→Solana).'),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build flat CAIP-19 → decimals lookup from INTERMEDIATE_TOKENS. */
const KNOWN_DECIMALS: Map<string, number> = new Map();
for (const tokens of Object.values(INTERMEDIATE_TOKENS)) {
  for (const t of tokens) {
    KNOWN_DECIMALS.set(t.caip19.toLowerCase(), t.decimals);
  }
}

/**
 * Resolve token decimals from CAIP-19 asset ID.
 * Uses well-known tokens from INTERMEDIATE_TOKENS map.
 */
function resolveDecimals(caip19: string, label: string): number {
  const d = KNOWN_DECIMALS.get(caip19.toLowerCase());
  if (d !== undefined) return d;
  throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
    message: `${label} is required for asset ${caip19} — not a well-known token. Provide ${label} explicitly (e.g., 18 for ETH, 6 for USDC).`,
  });
}

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
  private readonly logger?: ILogger;
  private client: DcentSwapApiClient | null = null;

  constructor(config?: Partial<DcentSwapConfig>, logger?: ILogger) {
    this.config = { ...DCENT_SWAP_DEFAULTS, ...config };
    this.logger = logger;

    this.metadata = {
      name: 'dcent_swap',
      displayName: "D'CENT Swap",
      description: "D'CENT Swap Aggregator supporting multi-chain DEX swaps including cross-chain swaps",
      version: '1.0.0',
      chains: ['ethereum', 'solana'],
      mcpExpose: true,
      requiresApiKey: false,
      requiredApis: [],
      requiresSigningKey: false,
    };

    this.actions = [
      {
        name: 'get_quotes',
        description: "Get swap quotes from D'CENT Swap Aggregator with provider comparison — supports same-chain and cross-chain swaps (informational)",
        chain: 'ethereum',
        inputSchema: GetQuotesInputSchema,
        riskLevel: 'low',
        defaultTier: 'INSTANT',
      },
      {
        name: 'dex_swap',
        description: "Execute DEX swap via D'CENT Swap Aggregator — supports same-chain and cross-chain swaps with approve and txdata BATCH pipeline",
        chain: 'ethereum',
        inputSchema: DexSwapInputSchema,
        riskLevel: 'high',
        defaultTier: 'INSTANT',
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
  ): Promise<ContractCallRequest | ContractCallRequest[] | ApiDirectResult> {
    // Chain guard: D'CENT Swap supports EVM and Solana chains
    if (context.chain !== 'ethereum' && context.chain !== 'solana') {
      throw new ChainError('INVALID_INSTRUCTION', context.chain, {
        message: `D'CENT Swap supports EVM and Solana chains. Got: ${context.chain}`,
      });
    }

    // Phase 405: humanAmount -> amount conversion
    const rp = { ...params };
    resolveProviderHumanAmount(rp, 'amount', 'humanAmount');

    switch (actionName) {
      case 'get_quotes': {
        // DS-07: get_quotes is informational -- returns ApiDirectResult (issue #409 fix)
        const input = GetQuotesInputSchema.parse(rp);
        if (!input.amount) throw new ChainError('INVALID_INSTRUCTION', context.chain, { message: 'Either amount or humanAmount (with decimals) is required' });
        const fromDec = input.fromDecimals ?? resolveDecimals(input.fromAsset, 'fromDecimals');
        const toDec = input.toDecimals ?? resolveDecimals(input.toAsset, 'toDecimals');
        const result = await getDcentQuotes(this.getClient(), { ...input, fromDecimals: fromDec, toDecimals: toDec, fromWalletAddress: context.walletAddress } as GetQuotesParams);
        return {
          __apiDirect: true as const,
          externalId: `dcent-quotes-${Date.now()}`,
          status: 'success' as const,
          provider: 'dcent_swap',
          action: 'get_quotes',
          data: {
            dexProviders: result.dexProviders,
            bestDexProvider: result.bestDexProvider ?? null,
            totalProviders: result.dexProviders.length,
          },
        };
      }

      case 'dex_swap': {
        const input = DexSwapInputSchema.parse(rp);
        if (!input.amount) throw new ChainError('INVALID_INSTRUCTION', context.chain, { message: 'Either amount or humanAmount (with decimals) is required' });
        const swapFromDec = input.fromDecimals ?? resolveDecimals(input.fromAsset, 'fromDecimals');
        const swapToDec = input.toDecimals ?? resolveDecimals(input.toAsset, 'toDecimals');
        const swapParams = { fromAsset: input.fromAsset, toAsset: input.toAsset, amount: input.amount, fromDecimals: swapFromDec, toDecimals: swapToDec, walletAddress: context.walletAddress, toWalletAddress: input.toWalletAddress, providerId: input.providerId, slippageBps: input.slippageBps };
        try {
          return await executeDexSwap(
            this.getClient(),
            swapParams,
            this.config,
          );
        } catch (err) {
          // DS-04: Fallback to 2-hop auto-routing when direct route unavailable
          if (err instanceof ChainError && isNoRouteError(err)) {
            const twoHopResult = await executeTwoHopSwap(
              this.getClient(),
              swapParams,
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
      this.client = new DcentSwapApiClient(this.config, this.logger);
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
