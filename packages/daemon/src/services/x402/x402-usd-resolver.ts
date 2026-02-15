/**
 * x402 payment amount USD resolution.
 *
 * Converts x402 PaymentRequirements amounts to USD for SPENDING_LIMIT policy evaluation.
 *
 * Strategy:
 * - USDC (6 decimals, $1 peg): Direct conversion without oracle call.
 *   USDC addresses come from USDC_DOMAINS (EVM) and SOLANA_USDC_ADDRESSES (Solana).
 * - Non-USDC tokens: IPriceOracle.getPrice() with chain-appropriate default decimals.
 * - No oracle / oracle error: Returns 0 (safe fallback, allows INSTANT tier pass).
 *
 * @see packages/daemon/src/pipeline/resolve-effective-amount-usd.ts (5-type pattern)
 * @see packages/daemon/src/services/x402/payment-signer.ts (USDC_DOMAINS)
 */

import { USDC_DOMAINS } from './payment-signer.js';
import type { IPriceOracle } from '@waiaas/core';
import { parseCaip2 } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Solana USDC addresses (not in USDC_DOMAINS which is EVM-only EIP-712)
// ---------------------------------------------------------------------------

/**
 * Known Solana USDC token mint addresses by CAIP-2 network.
 *
 * Circle native USDC on Solana uses SPL Token, not EIP-3009,
 * so these are separate from USDC_DOMAINS (which stores EIP-712 domain separators).
 */
const SOLANA_USDC_ADDRESSES: Record<string, string> = {
  // Solana Mainnet (Circle native USDC)
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  // Solana Devnet (Circle USDC devnet)
  'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1': '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
};

// ---------------------------------------------------------------------------
// resolveX402UsdAmount
// ---------------------------------------------------------------------------

/**
 * Resolve x402 payment amount to USD value.
 *
 * @param amount - Raw token amount (string, integer units)
 * @param asset - Token contract/mint address
 * @param caip2Network - CAIP-2 network identifier (e.g., "eip155:8453", "solana:5eykt4...")
 * @param priceOracle - Optional IPriceOracle for non-USDC tokens
 * @returns USD amount (number). Returns 0 if price cannot be determined (safe fallback).
 */
export async function resolveX402UsdAmount(
  amount: string,
  asset: string,
  caip2Network: string,
  priceOracle?: IPriceOracle,
): Promise<number> {
  // 1. Check EVM USDC (USDC_DOMAINS has verifyingContract for 7 EVM chains)
  const usdcDomain = USDC_DOMAINS[caip2Network];
  if (usdcDomain && usdcDomain.verifyingContract.toLowerCase() === asset.toLowerCase()) {
    // USDC: 6 decimals, $1 direct conversion
    return Number(amount) / 1_000_000;
  }

  // 2. Check Solana USDC (separate address table, case-sensitive for base58)
  const solanaUsdcAddress = SOLANA_USDC_ADDRESSES[caip2Network];
  if (solanaUsdcAddress && solanaUsdcAddress === asset) {
    // Solana USDC: 6 decimals, $1 direct conversion
    return Number(amount) / 1_000_000;
  }

  // 3. Non-USDC: use IPriceOracle (if available)
  if (!priceOracle) return 0;

  const { namespace } = parseCaip2(caip2Network);
  const chain = namespace === 'eip155' ? 'ethereum' : 'solana';

  try {
    // x402 PaymentRequirements does not include decimals, use chain defaults
    // EVM: 18 (most common), Solana: 9 (most common)
    const decimals = chain === 'ethereum' ? 18 : 9;
    const priceInfo = await priceOracle.getPrice({
      address: asset,
      decimals,
      chain: chain as 'ethereum' | 'solana',
    });
    const humanAmount = Number(amount) / Math.pow(10, decimals);
    return humanAmount * priceInfo.usdPrice;
  } catch {
    // Safe fallback: unknown price -> 0 (INSTANT tier pass)
    return 0;
  }
}
