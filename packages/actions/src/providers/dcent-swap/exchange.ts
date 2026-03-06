/**
 * DCent Exchange quote retrieval and execution.
 *
 * Handles cross-chain Exchange operations via DCent Swap aggregator:
 * - getExchangeQuotes: filters exchange providers from get_quotes response
 * - executeExchange: creates exchange transaction and returns TRANSFER request
 *
 * Exchange flow: get_quotes -> filter exchange providers -> create_exchange_transaction
 *   -> payInAddress TRANSFER pipeline + background status polling.
 *
 * Design source: doc 77 section 8 (Exchange pipeline mapping).
 */
import { ChainError } from '@waiaas/core';
import { caip19ToDcentId } from './currency-mapper.js';
import { DcentSwapApiClient } from './dcent-api-client.js';
import { getDcentQuotes, type GetQuotesParams } from './dex-swap.js';
import type { DcentQuoteProvider } from './schemas.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExchangeQuoteResult {
  /** Exchange providers sorted by expectedAmount descending. */
  providers: DcentQuoteProvider[];
  /** Best exchange provider (highest expectedAmount), or null if none. */
  bestProvider: DcentQuoteProvider | null;
}

export interface ExecuteExchangeParams {
  fromAsset: string;   // CAIP-19
  toAsset: string;     // CAIP-19
  amount: string;      // smallest unit
  fromDecimals: number;
  toDecimals: number;
  fromWalletAddress: string;
  toWalletAddress: string;
  providerId?: string; // optional: explicit provider selection
}

export interface TransferRequest {
  type: 'TRANSFER';
  to: string;
  amount: string;
  memo?: string;
}

export interface ExchangeMetadata {
  dcentTransactionId: string;
  dcentProviderId: string;
  transactionStatusUrl: string;
  toAmount: string;
  tracker: 'dcent-exchange';
  notificationEvent: string;
  enrolledAt: number;
}

export interface ExchangeResult {
  transferRequest: TransferRequest;
  exchangeMetadata: ExchangeMetadata;
}

// ---------------------------------------------------------------------------
// Exchange quote retrieval
// ---------------------------------------------------------------------------

/**
 * Get exchange quotes from DCent aggregator.
 *
 * Calls getDcentQuotes and filters to only exchange-type providers,
 * sorted by expectedAmount descending.
 *
 * @throws ChainError if no exchange providers are available.
 */
export async function getExchangeQuotes(
  client: DcentSwapApiClient,
  params: GetQuotesParams,
): Promise<ExchangeQuoteResult> {
  const quotes = await getDcentQuotes(client, params);
  const exchangeProviders = quotes.exchangeProviders;

  if (exchangeProviders.length === 0) {
    throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
      message: `No exchange route available from ${params.fromAsset} to ${params.toAsset}`,
    });
  }

  // Sort by expectedAmount descending (BigInt comparison)
  exchangeProviders.sort((a, b) => {
    const amountA = BigInt(a.expectedAmount ?? '0');
    const amountB = BigInt(b.expectedAmount ?? '0');
    if (amountB > amountA) return 1;
    if (amountB < amountA) return -1;
    return 0;
  });

  return {
    providers: exchangeProviders,
    bestProvider: exchangeProviders[0] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Exchange execution
// ---------------------------------------------------------------------------

/**
 * Execute a cross-chain exchange via DCent aggregator.
 *
 * Flow:
 * 1. Get quotes and filter to exchange providers
 * 2. Select provider (explicit or best)
 * 3. Call create_exchange_transaction
 * 4. Return TRANSFER request + exchange metadata for status tracking
 *
 * @throws ChainError if no exchange providers or payInAddress missing.
 */
export async function executeExchange(
  client: DcentSwapApiClient,
  params: ExecuteExchangeParams,
): Promise<ExchangeResult> {
  // Get exchange quotes
  const quotes = await getExchangeQuotes(client, {
    fromAsset: params.fromAsset,
    toAsset: params.toAsset,
    amount: params.amount,
    fromDecimals: params.fromDecimals,
    toDecimals: params.toDecimals,
  });

  // Select provider: explicit or best
  let selectedProvider: DcentQuoteProvider | undefined;
  if (params.providerId) {
    selectedProvider = quotes.providers.find(p => p.providerId === params.providerId);
    if (!selectedProvider) {
      throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
        message: `Provider ${params.providerId} not available or not an exchange provider`,
      });
    }
  } else {
    selectedProvider = quotes.bestProvider ?? undefined;
  }

  if (!selectedProvider) {
    throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
      message: 'No suitable exchange provider found',
    });
  }

  // Convert CAIP-19 to DCent IDs
  const fromId = caip19ToDcentId(params.fromAsset);
  const toId = caip19ToDcentId(params.toAsset);

  // Create exchange transaction
  const exchangeResponse = await client.createExchangeTransaction({
    fromId,
    toId,
    fromAmount: params.amount,
    fromDecimals: params.fromDecimals,
    toDecimals: params.toDecimals,
    fromWalletAddress: params.fromWalletAddress,
    toWalletAddress: params.toWalletAddress,
    providerId: selectedProvider.providerId,
  });

  // Validate response
  if (!exchangeResponse.payInAddress) {
    throw new ChainError('ACTION_API_ERROR', 'ethereum', {
      message: 'DCent API returned empty payInAddress for exchange transaction',
    });
  }

  if (!exchangeResponse.transactionId) {
    throw new ChainError('ACTION_API_ERROR', 'ethereum', {
      message: 'DCent API returned empty transactionId for exchange transaction',
    });
  }

  // Build TRANSFER request (doc 77 section 8.2)
  const transferRequest: TransferRequest = {
    type: 'TRANSFER',
    to: exchangeResponse.payInAddress,
    amount: params.amount,
  };

  // Include extraId as memo if present (DS-06)
  if (exchangeResponse.extraId) {
    transferRequest.memo = exchangeResponse.extraId;
  }

  // Build exchange metadata for status tracking
  const exchangeMetadata: ExchangeMetadata = {
    dcentTransactionId: exchangeResponse.transactionId,
    dcentProviderId: selectedProvider.providerId,
    transactionStatusUrl: exchangeResponse.transactionStatusUrl ?? '',
    toAmount: exchangeResponse.toAmount ?? '0',
    tracker: 'dcent-exchange',
    notificationEvent: 'EXCHANGE_TIMEOUT',
    enrolledAt: Date.now(),
  };

  return { transferRequest, exchangeMetadata };
}
