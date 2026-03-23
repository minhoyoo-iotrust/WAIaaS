/**
 * DCent DEX Swap quote retrieval and execution.
 *
 * Converts CAIP-19 asset identifiers to DCent Currency IDs, queries quotes
 * from the DCent Swap aggregator, and builds ContractCallRequest arrays
 * for the WAIaaS BATCH pipeline (approve + swap for ERC-20 sells).
 *
 * Design source: doc 77 sections 7.1-7.5 (DEX Swap pipeline mapping).
 */
import { ChainError, parseCaip19, parseCaip2 } from '@waiaas/core';
import type { ContractCallRequest } from '@waiaas/core';
import { caip19ToDcentId } from './currency-mapper.js';
import { DcentSwapApiClient } from './dcent-api-client.js';
import type { DcentQuoteProvider } from './schemas.js';
import type { DcentSwapConfig } from './config.js';
import { clampSlippageBps, asBps } from '../../common/slippage.js';
import { encodeApproveCalldata } from '../../common/contract-encoding.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DcentQuoteResult {
  /** DEX providers (swap + cross_swap), sorted by expectedAmount descending. */
  dexProviders: DcentQuoteProvider[];
  /** Best DEX provider (highest expectedAmount), or null if none. */
  bestDexProvider: DcentQuoteProvider | null;
  /** Original bestOrder from DCent API. */
  bestOrder: string[];
}

export interface GetQuotesParams {
  fromAsset: string;  // CAIP-19
  toAsset: string;    // CAIP-19
  amount: string;     // smallest unit
  fromDecimals: number;
  toDecimals: number;
  fromWalletAddress?: string;
}

export interface ExecuteDexSwapParams {
  fromAsset: string;  // CAIP-19
  toAsset: string;    // CAIP-19
  amount: string;     // smallest unit
  fromDecimals: number;
  toDecimals: number;
  walletAddress: string;
  toWalletAddress?: string;  // destination chain address for cross-chain swaps
  providerId?: string;
  slippageBps?: number;
}

// ---------------------------------------------------------------------------
// Quote retrieval
// ---------------------------------------------------------------------------

/**
 * Get swap quotes from DCent aggregator with provider classification.
 *
 * Converts CAIP-19 inputs to DCent Currency IDs, queries quotes, then
 * separates results into DEX (swap/cross_swap) and Exchange providers.
 * Failed providers (status !== 'success') are filtered out.
 */
export async function getDcentQuotes(
  client: DcentSwapApiClient,
  params: GetQuotesParams,
): Promise<DcentQuoteResult> {
  const fromId = caip19ToDcentId(params.fromAsset);
  const toId = caip19ToDcentId(params.toAsset);

  const response = await client.getQuotes({
    fromId,
    toId,
    amount: params.amount,
    fromDecimals: params.fromDecimals,
    toDecimals: params.toDecimals,
    ...(params.fromWalletAddress ? { fromWalletAddress: params.fromWalletAddress } : {}),
  });

  // Check for total failure
  if (response.status === 'fail_no_available_provider' || response.status === 'fail_empty_providers') {
    throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
      message: `No swap route available from ${params.fromAsset} to ${params.toAsset}`,
    });
  }

  const allProviders = response.providers?.common ?? [];
  const bestOrder = response.providers?.bestOrder ?? [];

  // Filter to successful providers only
  const successProviders = allProviders.filter(p => p.status === 'success');

  // Filter to DEX providers (swap + cross_swap)
  const dexProviders = successProviders
    .filter(p => p.providerType === 'swap' || p.providerType === 'cross_swap');

  // Sort DEX providers by expectedAmount descending (BigInt comparison)
  dexProviders.sort((a, b) => {
    const amountA = BigInt(a.expectedAmount ?? '0');
    const amountB = BigInt(b.expectedAmount ?? '0');
    if (amountB > amountA) return 1;
    if (amountB < amountA) return -1;
    return 0;
  });

  return {
    dexProviders,
    bestDexProvider: dexProviders[0] ?? null,
    bestOrder,
  };
}

// ---------------------------------------------------------------------------
// Non-throwing quote variant (for auto-router)
// ---------------------------------------------------------------------------

/**
 * Non-throwing variant of getDcentQuotes for auto-routing.
 * Returns `{ result }` on success or `{ noRoute: true }` when no providers available.
 * Keeps getDcentQuotes backward-compatible (still throws).
 */
export async function tryGetDcentQuotes(
  client: DcentSwapApiClient,
  params: GetQuotesParams,
): Promise<{ result: DcentQuoteResult } | { noRoute: true }> {
  try {
    const result = await getDcentQuotes(client, params);
    return { result };
  } catch (err) {
    if (err instanceof ChainError && err.message.includes('No swap route available')) {
      return { noRoute: true };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// DEX Swap execution
// ---------------------------------------------------------------------------

/**
 * Execute a DEX swap via DCent aggregator.
 *
 * Returns ContractCallRequest[] for the WAIaaS BATCH pipeline:
 * - Native sell: [swapRequest]
 * - ERC-20 sell: [approveRequest, swapRequest]
 *
 * Slippage is clamped per config (default 1%, max 5%).
 */
export async function executeDexSwap(
  client: DcentSwapApiClient,
  params: ExecuteDexSwapParams,
  config: DcentSwapConfig,
): Promise<ContractCallRequest[]> {
  // Block same-asset swap
  if (params.fromAsset === params.toAsset) {
    throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
      message: 'Cannot swap a token for itself',
    });
  }

  // Get quotes
  const quotes = await getDcentQuotes(client, {
    fromAsset: params.fromAsset,
    toAsset: params.toAsset,
    amount: params.amount,
    fromDecimals: params.fromDecimals,
    toDecimals: params.toDecimals,
    fromWalletAddress: params.walletAddress,
  });

  // No DEX providers available
  if (quotes.dexProviders.length === 0) {
    throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
      message: `No DEX swap route available from ${params.fromAsset} to ${params.toAsset}`,
    });
  }

  // Select provider: explicit or bestOrder[0] filtered to DEX type
  let selectedProvider: DcentQuoteProvider | undefined;
  if (params.providerId) {
    selectedProvider = quotes.dexProviders.find(p => p.providerId === params.providerId);
    if (!selectedProvider) {
      throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
        message: `Provider ${params.providerId} not available or not a DEX provider`,
      });
    }
  } else {
    // Use best DEX provider
    selectedProvider = quotes.bestDexProvider ?? undefined;
  }

  if (!selectedProvider) {
    throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
      message: 'No suitable DEX provider found',
    });
  }

  // Check expectedAmount
  if (!selectedProvider.expectedAmount || selectedProvider.expectedAmount === '0') {
    throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
      message: 'Amount too small: expected output is 0',
    });
  }

  // Clamp slippage
  const slippageBps = clampSlippageBps(
    params.slippageBps ?? 0,
    asBps(config.defaultSlippageBps),
    asBps(config.maxSlippageBps),
  );
  // Convert bps to integer percent for DCent API (100 bps = 1%)
  const slippagePercent = Math.round(slippageBps / 100);

  // Convert CAIP-19 to DCent IDs
  const fromId = caip19ToDcentId(params.fromAsset);
  const toId = caip19ToDcentId(params.toAsset);

  // Get transaction data
  const txDataResponse = await client.getDexSwapTransactionData({
    fromId,
    toId,
    fromAmount: params.amount,
    fromDecimals: params.fromDecimals,
    toDecimals: params.toDecimals,
    fromWalletAddress: params.walletAddress,
    toWalletAddress: params.toWalletAddress ?? params.walletAddress,
    providerId: selectedProvider.providerId,
    isAutoSlippage: false,
    slippage: slippagePercent,
  });

  if (!txDataResponse.txdata) {
    throw new ChainError('ACTION_API_ERROR', 'ethereum', {
      message: 'DCent API returned empty txdata',
    });
  }

  const { txdata } = txDataResponse;

  // Determine chain namespace from CAIP-19
  const { chainId: fromChainId, assetNamespace, assetReference } = parseCaip19(params.fromAsset);
  const { namespace: chainNamespace } = parseCaip2(fromChainId);

  // Solana chain: DCent API returns base58-encoded VersionedTransaction.
  // Decode from base58, re-encode as base64 for the CONTRACT_CALL pre-built
  // transaction bypass in SolanaAdapter (#427). The adapter will also refresh
  // the blockhash before signing.
  if (chainNamespace === 'solana') {
    const solTxData = txdata as Record<string, unknown>;
    const rawData = ((solTxData.data ?? solTxData.serializedTransaction ?? '') as string).trim();
    if (!rawData) {
      throw new ChainError('ACTION_API_ERROR', 'solana', {
        message: 'DCent API returned empty Solana transaction data',
      });
    }

    // base58 decode → base64 re-encode for SolanaAdapter pre-built path
    const { base58Decode } = await import('../jito-staking/jito-stake-pool.js');
    const txBytes = base58Decode(rawData);
    const base64Tx = Buffer.from(txBytes).toString('base64');

    const swapRequest: ContractCallRequest = {
      type: 'CONTRACT_CALL',
      to: 'dcent-swap',
      instructionData: base64Tx,
    };
    return [swapRequest];
  }

  // EVM chain: approve + swap pattern
  const evmTxData = txdata as { from: string; to: string; data: string; value?: string };
  const isNativeSell = assetNamespace === 'slip44';
  const requests: ContractCallRequest[] = [];

  if (!isNativeSell) {
    // ERC-20 sell: prepend approve
    const spender = selectedProvider.spenderContractAddress ?? evmTxData.to;
    const approveRequest: ContractCallRequest = {
      type: 'CONTRACT_CALL',
      to: assetReference, // ERC-20 contract address from CAIP-19
      calldata: encodeApproveCalldata(spender, BigInt(params.amount)),
      value: '0',
    };
    requests.push(approveRequest);
  }

  // Swap request — for native sells, DCent API may return only protocol fees
  // in txdata.value instead of the full swap amount; correct to params.amount
  let swapValue = evmTxData.value ? BigInt(evmTxData.value).toString() : '0';
  if (isNativeSell) {
    const apiValue = BigInt(swapValue);
    const swapAmount = BigInt(params.amount);
    if (apiValue < swapAmount) {
      swapValue = swapAmount.toString();
    }
  }

  const swapRequest: ContractCallRequest = {
    type: 'CONTRACT_CALL',
    to: evmTxData.to,
    calldata: evmTxData.data,
    value: swapValue,
  };
  requests.push(swapRequest);

  return requests;
}
