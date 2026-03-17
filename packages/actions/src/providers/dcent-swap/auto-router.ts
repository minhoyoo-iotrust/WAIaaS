/**
 * 2-hop auto-routing fallback for DCent Swap.
 *
 * When DCent API returns `fail_no_available_provider` for a direct pair,
 * this module probes intermediate tokens (ETH, USDC, USDT per chain) to
 * find 2-hop paths and calculates cumulative costs.
 *
 * Design source: doc 77 section 11 (Phase 345 confirmed scope: DS-04 fallback).
 */
import { ChainError, parseCaip19 } from '@waiaas/core';
import type { ContractCallRequest } from '@waiaas/core';
import { DcentSwapApiClient } from './dcent-api-client.js';
import { tryGetDcentQuotes, executeDexSwap, type GetQuotesParams } from './dex-swap.js';
import type { DcentQuoteProvider } from './schemas.js';
import type { DcentSwapConfig } from './config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IntermediateToken {
  caip19: string;
  symbol: string;
  decimals: number;
}

export interface TwoHopRoute {
  intermediateToken: IntermediateToken;
  hop1: { provider: DcentQuoteProvider; fromAsset: string; toAsset: string };
  hop2: { provider: DcentQuoteProvider; fromAsset: string; toAsset: string };
  finalExpectedAmount: string;
  totalFees: { hop1Fee: string; hop2Fee: string; totalFee: string };
  isMultiHop: true;
  hopCount: 2;
}

export interface TwoHopQuoteResult {
  routes: TwoHopRoute[];
  bestRoute: TwoHopRoute | null;
}

export interface TwoHopExecutionResult {
  requests: ContractCallRequest[];
  metadata: {
    isMultiHop: true;
    hopCount: 2;
    intermediateToken: { caip19: string; symbol: string; decimals: number };
    hop1ExpectedAmount: string;
    finalExpectedAmount: string;
    totalFees: { hop1Fee: string; hop2Fee: string; totalFee: string };
  };
}

// ---------------------------------------------------------------------------
// Per-chain intermediate tokens
// ---------------------------------------------------------------------------

/** Well-known intermediate tokens per CAIP-2 chain identifier. */
export const INTERMEDIATE_TOKENS: Record<string, IntermediateToken[]> = {
  'eip155:1': [
    { caip19: 'eip155:1/slip44:60', symbol: 'ETH', decimals: 18 },
    { caip19: 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', symbol: 'USDC', decimals: 6 },
    { caip19: 'eip155:1/erc20:0xdac17f958d2ee523a2206206994597c13d831ec7', symbol: 'USDT', decimals: 6 },
  ],
  'eip155:56': [
    { caip19: 'eip155:56/slip44:60', symbol: 'BNB', decimals: 18 },
    { caip19: 'eip155:56/erc20:0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d', symbol: 'USDC', decimals: 18 },
    { caip19: 'eip155:56/erc20:0x55d398326f99059ff775485246999027b3197955', symbol: 'USDT', decimals: 18 },
  ],
  'eip155:137': [
    { caip19: 'eip155:137/slip44:966', symbol: 'MATIC', decimals: 18 },
    { caip19: 'eip155:137/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', symbol: 'USDC', decimals: 6 },
    { caip19: 'eip155:137/erc20:0xc2132d05d31c914a87c6611c10748aeb04b58e8f', symbol: 'USDT', decimals: 6 },
  ],
  'eip155:10': [
    { caip19: 'eip155:10/slip44:60', symbol: 'ETH', decimals: 18 },
    { caip19: 'eip155:10/erc20:0x0b2c639c533813f4aa9d7837caf62653d097ff85', symbol: 'USDC', decimals: 6 },
    { caip19: 'eip155:10/erc20:0x94b008aa00579c1307b0ef2c499ad98a8ce58e58', symbol: 'USDT', decimals: 6 },
  ],
  'eip155:8453': [
    { caip19: 'eip155:8453/slip44:60', symbol: 'ETH', decimals: 18 },
    { caip19: 'eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', symbol: 'USDC', decimals: 6 },
  ],
  'eip155:42161': [
    { caip19: 'eip155:42161/slip44:60', symbol: 'ETH', decimals: 18 },
    { caip19: 'eip155:42161/erc20:0xaf88d065e77c8cc2239327c5edb3a432268e5831', symbol: 'USDC', decimals: 6 },
    { caip19: 'eip155:42161/erc20:0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', symbol: 'USDT', decimals: 6 },
  ],
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': [
    { caip19: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501', symbol: 'SOL', decimals: 9 },
    { caip19: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', decimals: 6 },
    { caip19: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', symbol: 'USDT', decimals: 6 },
  ],
};

/**
 * Get intermediate tokens for a given CAIP-19 asset's chain.
 * Extracts the CAIP-2 chain identifier from the CAIP-19 URI.
 */
export function getIntermediatesForChain(caip19: string): IntermediateToken[] {
  const { chainId } = parseCaip19(caip19);
  return INTERMEDIATE_TOKENS[chainId] ?? [];
}

// ---------------------------------------------------------------------------
// Fee extraction helper
// ---------------------------------------------------------------------------

function extractDepositFee(provider: DcentQuoteProvider): string {
  const fee = provider.providerFee as Record<string, unknown> | undefined;
  if (fee && typeof fee.depositFee === 'string') {
    return fee.depositFee;
  }
  return '0';
}

// ---------------------------------------------------------------------------
// 2-hop route discovery
// ---------------------------------------------------------------------------

/**
 * Find 2-hop routes via intermediate tokens when direct route is unavailable.
 *
 * 1. First checks if direct route exists — if yes, returns empty (no fallback needed).
 * 2. For each intermediate token on the same chain:
 *    - Skip if same as fromAsset or toAsset
 *    - Query hop 1 (fromAsset -> intermediate) and hop 2 (intermediate -> toAsset)
 *    - Build TwoHopRoute with cumulative costs
 * 3. Sort routes by finalExpectedAmount descending.
 */
export async function findTwoHopRoutes(
  client: DcentSwapApiClient,
  params: GetQuotesParams,
): Promise<TwoHopQuoteResult> {
  // Step 1: Check if direct route exists
  const directResult = await tryGetDcentQuotes(client, params);
  if ('result' in directResult && directResult.result.dexProviders.length > 0) {
    // Direct route available — no fallback needed
    return { routes: [], bestRoute: null };
  }

  // Step 2: Probe intermediate tokens
  const intermediates = getIntermediatesForChain(params.fromAsset);
  const routes: TwoHopRoute[] = [];

  // Use Promise.allSettled for parallel probing
  const probeResults = await Promise.allSettled(
    intermediates.map(async (intermediate) => {
      // Skip if intermediate is same as from or to
      if (intermediate.caip19 === params.fromAsset || intermediate.caip19 === params.toAsset) {
        return null;
      }

      // Hop 1: fromAsset -> intermediate
      const hop1Result = await tryGetDcentQuotes(client, {
        fromAsset: params.fromAsset,
        toAsset: intermediate.caip19,
        amount: params.amount,
        fromDecimals: params.fromDecimals,
        toDecimals: intermediate.decimals,
        fromWalletAddress: params.fromWalletAddress,
      });

      if ('noRoute' in hop1Result || !hop1Result.result.bestDexProvider) {
        return null;
      }

      const hop1Provider = hop1Result.result.bestDexProvider;
      const hop1ExpectedAmount = hop1Provider.expectedAmount ?? '0';
      if (hop1ExpectedAmount === '0') return null;

      // Hop 2: intermediate -> toAsset
      const hop2Result = await tryGetDcentQuotes(client, {
        fromAsset: intermediate.caip19,
        toAsset: params.toAsset,
        amount: hop1ExpectedAmount,
        fromDecimals: intermediate.decimals,
        toDecimals: params.toDecimals,
        fromWalletAddress: params.fromWalletAddress,
      });

      if ('noRoute' in hop2Result || !hop2Result.result.bestDexProvider) {
        return null;
      }

      const hop2Provider = hop2Result.result.bestDexProvider;
      const hop2ExpectedAmount = hop2Provider.expectedAmount ?? '0';
      if (hop2ExpectedAmount === '0') return null;

      // Calculate cumulative fees
      const hop1Fee = extractDepositFee(hop1Provider);
      const hop2Fee = extractDepositFee(hop2Provider);
      const totalFee = (BigInt(hop1Fee) + BigInt(hop2Fee)).toString();

      const route: TwoHopRoute = {
        intermediateToken: intermediate,
        hop1: {
          provider: hop1Provider,
          fromAsset: params.fromAsset,
          toAsset: intermediate.caip19,
        },
        hop2: {
          provider: hop2Provider,
          fromAsset: intermediate.caip19,
          toAsset: params.toAsset,
        },
        finalExpectedAmount: hop2ExpectedAmount,
        totalFees: { hop1Fee, hop2Fee, totalFee },
        isMultiHop: true,
        hopCount: 2,
      };

      return route;
    }),
  );

  // Collect successful routes
  for (const result of probeResults) {
    if (result.status === 'fulfilled' && result.value) {
      routes.push(result.value);
    }
  }

  // Sort by finalExpectedAmount descending
  routes.sort((a, b) => {
    const amountA = BigInt(a.finalExpectedAmount);
    const amountB = BigInt(b.finalExpectedAmount);
    if (amountB > amountA) return 1;
    if (amountB < amountA) return -1;
    return 0;
  });

  return {
    routes,
    bestRoute: routes[0] ?? null,
  };
}

// ---------------------------------------------------------------------------
// 2-hop execution
// ---------------------------------------------------------------------------

/**
 * Execute a 2-hop swap, producing a flat ContractCallRequest[] BATCH.
 *
 * If route is not provided, calls findTwoHopRoutes to discover the best route.
 * Concatenates hop1 + hop2 ContractCallRequest arrays.
 * On hop2 failure, throws PARTIAL_SWAP_FAILURE with intermediate token info.
 */
export async function executeTwoHopSwap(
  client: DcentSwapApiClient,
  params: {
    fromAsset: string;
    toAsset: string;
    amount: string;
    fromDecimals: number;
    toDecimals: number;
    walletAddress: string;
    slippageBps?: number;
  },
  config: DcentSwapConfig,
  route?: TwoHopRoute,
): Promise<TwoHopExecutionResult> {
  // Discover route if not provided
  if (!route) {
    const quoteResult = await findTwoHopRoutes(client, {
      fromAsset: params.fromAsset,
      toAsset: params.toAsset,
      amount: params.amount,
      fromDecimals: params.fromDecimals,
      toDecimals: params.toDecimals,
      fromWalletAddress: params.walletAddress,
    });
    if (!quoteResult.bestRoute) {
      throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
        message: `No 2-hop swap route available from ${params.fromAsset} to ${params.toAsset}`,
      });
    }
    route = quoteResult.bestRoute;
  }

  const intermediate = route.intermediateToken;
  const hop1ExpectedAmount = route.hop1.provider.expectedAmount ?? '0';

  // Execute hop 1: fromAsset -> intermediate
  const hop1Requests = await executeDexSwap(
    client,
    {
      fromAsset: params.fromAsset,
      toAsset: intermediate.caip19,
      amount: params.amount,
      fromDecimals: params.fromDecimals,
      toDecimals: intermediate.decimals,
      walletAddress: params.walletAddress,
      slippageBps: params.slippageBps,
    },
    config,
  );

  // Execute hop 2: intermediate -> toAsset
  let hop2Requests: ContractCallRequest[];
  try {
    hop2Requests = await executeDexSwap(
      client,
      {
        fromAsset: intermediate.caip19,
        toAsset: params.toAsset,
        amount: hop1ExpectedAmount,
        fromDecimals: intermediate.decimals,
        toDecimals: params.toDecimals,
        walletAddress: params.walletAddress,
        slippageBps: params.slippageBps,
      },
      config,
    );
  } catch {
    // Partial failure: hop 1 may have succeeded but hop 2 failed
    throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
      message: `2-hop swap partially completed. Hop 1 succeeded but Hop 2 failed. ` +
        `Intermediate token ${intermediate.symbol} (${intermediate.caip19}) may have balance of approximately ${hop1ExpectedAmount} smallest units. ` +
        `Please check your wallet balance and swap the intermediate token manually.`,
    });
  }

  // Combine into flat BATCH
  const requests = [...hop1Requests, ...hop2Requests];

  return {
    requests,
    metadata: {
      isMultiHop: true,
      hopCount: 2,
      intermediateToken: {
        caip19: intermediate.caip19,
        symbol: intermediate.symbol,
        decimals: intermediate.decimals,
      },
      hop1ExpectedAmount,
      finalExpectedAmount: route.finalExpectedAmount,
      totalFees: route.totalFees,
    },
  };
}
