/**
 * XRPL DEX OfferBuilder -- builds OfferCreate/OfferCancel calldata JSON
 * for the RippleAdapter.buildContractCall() pipeline.
 *
 * Handles:
 * - Currency amount conversion (XRP drops vs IOU object)
 * - Slippage application for IoC swaps
 * - Ripple epoch expiration for limit orders
 * - Owner reserve validation for new offers
 *
 * @see Phase 02-01 Task 2
 */
import { ChainError } from '@waiaas/core';
import type { SwapInput, LimitOrderInput } from './schemas.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Ripple epoch offset: 2000-01-01 00:00:00 UTC in Unix seconds. */
export const RIPPLE_EPOCH = 946684800;

/** tfImmediateOrCancel flag for instant swaps. */
export const TF_IMMEDIATE_OR_CANCEL = 0x00020000;

/** Owner reserve per ledger object in drops (0.2 XRP). */
export const OWNER_RESERVE_DROPS = 200000;

// ---------------------------------------------------------------------------
// XRPL Amount types (mirroring xrpl.js)
// ---------------------------------------------------------------------------

export interface IssuedCurrencyAmount {
  currency: string;
  issuer: string;
  value: string;
}

export interface BookOfferCurrency {
  currency: string;
  issuer?: string;
}

/** XRPL Amount: string (XRP drops) or IssuedCurrencyAmount (IOU). */
export type XrplAmount = string | IssuedCurrencyAmount;

// ---------------------------------------------------------------------------
// Amount formatting
// ---------------------------------------------------------------------------

/**
 * Convert a token identifier + amount to XRPL Amount format.
 *
 * - "XRP" + amount -> string drops (e.g., "1000000")
 * - "USD.rIssuer" + amount -> { currency: "USD", issuer: "rIssuer", value: "100" }
 *
 * @param token Token identifier ("XRP" or "CURRENCY.ISSUER")
 * @param amount Amount string (drops for XRP, decimal for IOU)
 * @throws ChainError if amount is zero/negative or token format invalid
 */
export function formatXrplAmount(token: string, amount: string): XrplAmount {
  // Validate amount is not zero or negative
  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    throw new ChainError('INVALID_INSTRUCTION', 'ripple', {
      message: `Invalid amount: ${amount}. Must be a positive number.`,
    });
  }

  if (token === 'XRP') {
    // XRP native: amount is already in drops (string)
    return amount;
  }

  // IOU: parse "CURRENCY.ISSUER" format
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1 || dotIndex === 0 || dotIndex === token.length - 1) {
    throw new ChainError('INVALID_INSTRUCTION', 'ripple', {
      message: `Invalid IOU token format: "${token}". Expected "CURRENCY.ISSUER" (e.g., "USD.rIssuer...").`,
    });
  }

  const currency = token.slice(0, dotIndex);
  const issuer = token.slice(dotIndex + 1);

  return {
    currency,
    issuer,
    value: amount,
  };
}

/**
 * Parse a token string into a BookOfferCurrency for book_offers RPC.
 * "XRP" -> { currency: "XRP" }
 * "USD.rIssuer" -> { currency: "USD", issuer: "rIssuer" }
 */
export function parseTokenToBookOfferCurrency(token: string): BookOfferCurrency {
  if (token === 'XRP') {
    return { currency: 'XRP' };
  }

  const dotIndex = token.indexOf('.');
  if (dotIndex === -1 || dotIndex === 0 || dotIndex === token.length - 1) {
    throw new ChainError('INVALID_INSTRUCTION', 'ripple', {
      message: `Invalid IOU token format: "${token}". Expected "CURRENCY.ISSUER".`,
    });
  }

  return {
    currency: token.slice(0, dotIndex),
    issuer: token.slice(dotIndex + 1),
  };
}

// ---------------------------------------------------------------------------
// Slippage helpers
// ---------------------------------------------------------------------------

/**
 * Apply slippage to an amount (reduce by slippageBps).
 * For IoC swaps, slippage reduces TakerPays (minimum receive).
 */
function applySlippage(amount: string, slippageBps: number, isIou: boolean): string {
  if (isIou) {
    // IOU: decimal arithmetic
    const value = parseFloat(amount);
    const adjusted = value * (1 - slippageBps / 10000);
    // Preserve precision (max 15 significant digits for XRPL IOU)
    return adjusted.toPrecision(15).replace(/0+$/, '').replace(/\.$/, '');
  }

  // XRP drops: integer arithmetic
  const drops = BigInt(amount);
  const adjusted = drops - (drops * BigInt(slippageBps)) / 10000n;
  return adjusted.toString();
}

// ---------------------------------------------------------------------------
// Calldata builders
// ---------------------------------------------------------------------------

/** Calldata JSON for OfferCreate (swap/limit) or OfferCancel. */
export interface OfferCalldata {
  xrplTxType: 'OfferCreate' | 'OfferCancel';
  TakerGets?: XrplAmount;
  TakerPays?: XrplAmount;
  Flags?: number;
  Expiration?: number;
  OfferSequence?: number;
}

/**
 * Build OfferCreate calldata for an immediate swap (tfImmediateOrCancel).
 * Slippage is applied to TakerPays (reduce minimum receive).
 */
export function buildSwapParams(input: SwapInput): OfferCalldata {
  const takerGets = formatXrplAmount(input.takerGets, input.takerGetsAmount);
  const isPayIou = input.takerPays !== 'XRP';

  // Apply slippage to TakerPays (what we want = minimum acceptable)
  const adjustedPayAmount = applySlippage(input.takerPaysAmount, input.slippageBps, isPayIou);
  const takerPays = formatXrplAmount(input.takerPays, adjustedPayAmount);

  return {
    xrplTxType: 'OfferCreate',
    TakerGets: takerGets,
    TakerPays: takerPays,
    Flags: TF_IMMEDIATE_OR_CANCEL,
  };
}

/**
 * Build OfferCreate calldata for a limit order (no IoC).
 * Expiration is converted to Ripple epoch.
 */
export function buildLimitOrderParams(input: LimitOrderInput): OfferCalldata {
  const takerGets = formatXrplAmount(input.takerGets, input.takerGetsAmount);
  const takerPays = formatXrplAmount(input.takerPays, input.takerPaysAmount);

  // Convert expiration to Ripple epoch (current time + seconds - RIPPLE_EPOCH offset)
  const expirationRipple = Math.floor(Date.now() / 1000) + input.expirationSeconds - RIPPLE_EPOCH;

  return {
    xrplTxType: 'OfferCreate',
    TakerGets: takerGets,
    TakerPays: takerPays,
    Expiration: expirationRipple,
  };
}

/**
 * Build OfferCancel calldata.
 */
export function buildCancelParams(offerSequence: number): OfferCalldata {
  return {
    xrplTxType: 'OfferCancel',
    OfferSequence: offerSequence,
  };
}

// ---------------------------------------------------------------------------
// Reserve validation
// ---------------------------------------------------------------------------

/**
 * Validate that the account has sufficient XRP for a new offer's owner reserve.
 *
 * @param availableXrpDrops Available XRP balance in drops (after existing reserves)
 * @param existingOfferCount Number of existing offers (for context in error message)
 * @throws ChainError if available balance < OWNER_RESERVE_DROPS
 */
export function validateReserve(availableXrpDrops: string, existingOfferCount: number): void {
  const available = BigInt(availableXrpDrops);
  const required = BigInt(OWNER_RESERVE_DROPS);

  if (available < required) {
    const availableXrp = Number(available) / 1_000_000;
    const requiredXrp = Number(required) / 1_000_000;
    throw new ChainError('INSUFFICIENT_BALANCE', 'ripple', {
      message: `Insufficient XRP for new offer: need ${requiredXrp} XRP reserve (available: ${availableXrp} XRP, current offers: ${existingOfferCount}). Each open offer requires ${requiredXrp} XRP owner reserve.`,
    });
  }
}
