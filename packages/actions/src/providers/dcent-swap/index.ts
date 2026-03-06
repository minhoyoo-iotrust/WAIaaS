/**
 * DCent Swap Action Provider.
 *
 * Implements IActionProvider to resolve DCent DEX swap requests
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
import {
  getExchangeQuotes,
  executeExchange,
  type ExchangeQuoteResult,
  type ExecuteExchangeParams,
  type ExchangeResult,
} from './exchange.js';
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

const ExchangeInputSchema = z.object({
  fromAsset: z.string().min(1),
  toAsset: z.string().min(1),
  amount: z.string().min(1),
  fromDecimals: z.number().int().min(0).max(18),
  toDecimals: z.number().int().min(0).max(18),
  toAddress: z.string().min(1),
  providerId: z.string().optional(),
});

const SwapStatusInputSchema = z.object({
  transactionId: z.string().min(1),
  providerId: z.string().min(1),
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
      description: 'DCent Swap aggregator supporting multi-provider DEX swaps and cross-chain exchanges',
      version: '1.0.0',
      chains: ['ethereum', 'solana'],
      mcpExpose: true,
      requiresApiKey: false,
      requiredApis: [],
    };

    this.actions = [
      {
        name: 'get_quotes',
        description: 'Get swap quotes from DCent aggregator with provider comparison (informational)',
        chain: 'ethereum',
        inputSchema: GetQuotesInputSchema,
        riskLevel: 'low',
        defaultTier: 'INSTANT',
      },
      {
        name: 'dex_swap',
        description: 'Execute DEX swap via DCent aggregator with approve and txdata BATCH pipeline',
        chain: 'ethereum',
        inputSchema: DexSwapInputSchema,
        riskLevel: 'high',
        defaultTier: 'DELAY',
      },
      {
        name: 'exchange',
        description: 'Execute cross-chain exchange via DCent aggregator with payInAddress TRANSFER pipeline',
        chain: 'ethereum',
        inputSchema: ExchangeInputSchema,
        riskLevel: 'high',
        defaultTier: 'APPROVAL',
      },
      {
        name: 'swap_status',
        description: 'Check DCent swap or exchange transaction status',
        chain: 'ethereum',
        inputSchema: SwapStatusInputSchema,
        riskLevel: 'low',
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
  ): Promise<ContractCallRequest | ContractCallRequest[]> {
    switch (actionName) {
      case 'get_quotes': {
        // DS-07: get_quotes is informational. Use queryQuotes() for direct access.
        const input = GetQuotesInputSchema.parse(params);
        const result = await getDcentQuotes(this.getClient(), input);
        throw new ChainError('INVALID_INSTRUCTION', context.chain, {
          message: `get_quotes is informational. Use queryQuotes() query method. Result: ${JSON.stringify({
            dexProviders: result.dexProviders.length,
            exchangeProviders: result.exchangeProviders.length,
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

      case 'exchange': {
        // DS-07: Exchange returns TRANSFER, not ContractCallRequest.
        // Use executeExchangeAction() for direct access from MCP/SDK.
        const input = ExchangeInputSchema.parse(params);
        const result = await this.executeExchangeAction({
          ...input,
          fromWalletAddress: context.walletAddress,
          toWalletAddress: input.toAddress,
        });
        throw new ChainError('INVALID_INSTRUCTION', context.chain, {
          message: `exchange action returns TRANSFER, not ContractCallRequest. Use executeExchangeAction(). Result: ${JSON.stringify({
            payInAddress: result.transferRequest.to,
            transactionId: result.exchangeMetadata.dcentTransactionId,
          })}`,
        });
      }

      case 'swap_status': {
        // DS-07: swap_status is informational. Use querySwapStatus() for direct access.
        const input = SwapStatusInputSchema.parse(params);
        const result = await this.querySwapStatus(input);
        throw new ChainError('INVALID_INSTRUCTION', context.chain, {
          message: `swap_status is informational. Use querySwapStatus(). Result: ${JSON.stringify(result)}`,
        });
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
   * Query exchange-only quotes.
   * Returns exchange providers sorted by expectedAmount.
   */
  async queryExchangeQuotes(params: GetQuotesParams): Promise<ExchangeQuoteResult> {
    return getExchangeQuotes(this.getClient(), params);
  }

  /**
   * Execute a cross-chain exchange.
   * Returns TRANSFER request + exchange metadata for pipeline submission.
   */
  async executeExchangeAction(params: ExecuteExchangeParams): Promise<ExchangeResult> {
    return executeExchange(this.getClient(), params);
  }

  /**
   * Query 2-hop swap routes via intermediate tokens.
   * Returns available routes when direct route is unavailable.
   * DS-04: fallback strategy for fail_no_available_provider.
   */
  async queryTwoHopRoutes(params: GetQuotesParams): Promise<TwoHopQuoteResult> {
    return findTwoHopRoutes(this.getClient(), params);
  }

  /**
   * Query swap/exchange transaction status.
   * Calls DCent get_transactions_status API directly.
   */
  async querySwapStatus(params: { transactionId: string; providerId: string }) {
    const response = await this.getClient().getTransactionsStatus([
      { txId: params.transactionId, providerId: params.providerId },
    ]);
    return response[0] ?? null;
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
export { type ExchangeQuoteResult, type ExecuteExchangeParams, type ExchangeResult } from './exchange.js';
export { ExchangeStatusTracker } from './exchange-status-tracker.js';
export { caip19ToDcentId, dcentIdToCaip19 } from './currency-mapper.js';
export { DcentSwapApiClient } from './dcent-api-client.js';
export {
  findTwoHopRoutes,
  executeTwoHopSwap,
  type TwoHopRoute,
  type TwoHopQuoteResult,
  type TwoHopExecutionResult,
} from './auto-router.js';
