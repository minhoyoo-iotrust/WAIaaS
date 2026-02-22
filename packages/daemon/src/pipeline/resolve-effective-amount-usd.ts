/**
 * USD amount resolution for 5-type transactions.
 *
 * Converts transaction amounts to USD using IPriceOracle.
 * Returns PriceResult 3-state discriminated union:
 * - success: USD conversion succeeded
 * - oracleDown: Oracle entirely unavailable (transient)
 * - notListed: Token not found in any oracle source (persistent)
 *
 * Security principle: "unknown price != price of 0"
 *
 * @see docs/61-price-oracle-spec.md section 6.2
 */

import type { IPriceOracle, PriceInfo, NetworkType } from '@waiaas/core';
import type { ChainType } from '@waiaas/core';
import { PriceNotAvailableError } from '../infrastructure/oracle/oracle-errors.js';

// ---------------------------------------------------------------------------
// PriceResult 3-state discriminated union
// ---------------------------------------------------------------------------

/** USD conversion succeeded. */
export interface PriceResultSuccess {
  type: 'success';
  usdAmount: number;
  isStale: boolean;
}

/** Oracle entirely unavailable -- native price lookup failed. */
export interface PriceResultOracleDown {
  type: 'oracleDown';
}

/** Token not found in any oracle source. */
export interface PriceResultNotListed {
  type: 'notListed';
  tokenAddress: string;
  chain: string;
  /** BATCH only: number of notListed instructions. */
  failedCount?: number;
}

export type PriceResult =
  | PriceResultSuccess
  | PriceResultOracleDown
  | PriceResultNotListed;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NATIVE_DECIMALS: Record<string, number> = {
  solana: 9,
  ethereum: 18,
};

// ---------------------------------------------------------------------------
// resolveEffectiveAmountUsd
// ---------------------------------------------------------------------------

/**
 * Resolve the effective USD amount for a transaction request.
 *
 * Must be called BEFORE evaluateAndReserve() (better-sqlite3 sync transaction
 * cannot perform async Oracle HTTP calls).
 */
export async function resolveEffectiveAmountUsd(
  request: Record<string, unknown>,
  txType: string,
  chain: string,
  priceOracle: IPriceOracle,
  network?: string,
): Promise<PriceResult> {
  try {
    switch (txType) {
      case 'TRANSFER': {
        const req = request as { amount: string };
        const nativePrice = await priceOracle.getNativePrice(
          chain as ChainType,
        );
        const decimals = NATIVE_DECIMALS[chain] ?? 18;
        const humanAmount = Number(req.amount) / Math.pow(10, decimals);
        return {
          type: 'success',
          usdAmount: humanAmount * nativePrice.usdPrice,
          isStale: nativePrice.isStale,
        };
      }

      case 'TOKEN_TRANSFER': {
        const req = request as {
          amount: string;
          token: { address: string; decimals: number; symbol: string };
        };
        try {
          const tokenPrice = await priceOracle.getPrice({
            address: req.token.address,
            decimals: req.token.decimals,
            chain: chain as ChainType,
            network: network as NetworkType | undefined,
          });
          const humanAmount =
            Number(req.amount) / Math.pow(10, req.token.decimals);
          return {
            type: 'success',
            usdAmount: humanAmount * tokenPrice.usdPrice,
            isStale: tokenPrice.isStale,
          };
        } catch (err) {
          if (err instanceof PriceNotAvailableError) {
            return {
              type: 'notListed',
              tokenAddress: req.token.address,
              chain,
            };
          }
          // Non-PriceNotAvailableError -> rethrow to outer catch (oracleDown)
          throw err;
        }
      }

      case 'CONTRACT_CALL': {
        const req = request as { value?: string };
        if (!req.value || req.value === '0') {
          return { type: 'success', usdAmount: 0, isStale: false };
        }
        const nativePrice = await priceOracle.getNativePrice(
          chain as ChainType,
        );
        const decimals = NATIVE_DECIMALS[chain] ?? 18;
        const humanAmount = Number(req.value) / Math.pow(10, decimals);
        return {
          type: 'success',
          usdAmount: humanAmount * nativePrice.usdPrice,
          isStale: nativePrice.isStale,
        };
      }

      case 'APPROVE': {
        // APPROVE has no monetary value to convert
        return { type: 'success', usdAmount: 0, isStale: false };
      }

      case 'BATCH': {
        return await resolveBatchUsd(request, chain, priceOracle, network);
      }

      default:
        return { type: 'oracleDown' };
    }
  } catch {
    // Any unhandled error -> oracleDown (safe fallback)
    return { type: 'oracleDown' };
  }
}

// ---------------------------------------------------------------------------
// BATCH helper
// ---------------------------------------------------------------------------

/**
 * Resolve USD for BATCH: sum individual instruction USD amounts.
 *
 * 1. Get native price first (failure -> oracleDown)
 * 2. Iterate instructions, classify by field presence
 * 3. Any TOKEN_TRANSFER notListed -> return notListed with failedCount
 * 4. All success -> return success with total USD
 */
async function resolveBatchUsd(
  request: Record<string, unknown>,
  chain: string,
  priceOracle: IPriceOracle,
  network?: string,
): Promise<PriceResult> {
  const batchReq = request as {
    instructions: Array<Record<string, unknown>>;
  };

  // Step 1: Get native price (needed for TRANSFER/CONTRACT_CALL instructions)
  let nativePrice: PriceInfo;
  try {
    nativePrice = await priceOracle.getNativePrice(chain as ChainType);
  } catch {
    return { type: 'oracleDown' };
  }

  const decimals = NATIVE_DECIMALS[chain] ?? 18;
  let totalUsd = 0;
  let isStale = nativePrice.isStale;
  let failedCount = 0;
  let firstNotListedToken = '';

  // Step 2: Iterate instructions
  for (const instr of batchReq.instructions) {
    const instrType = classifyInstruction(instr);

    switch (instrType) {
      case 'TRANSFER': {
        const amount = (instr as { amount: string }).amount;
        const humanAmount = Number(amount) / Math.pow(10, decimals);
        totalUsd += humanAmount * nativePrice.usdPrice;
        break;
      }

      case 'TOKEN_TRANSFER': {
        const tokenInstr = instr as {
          amount: string;
          token: { address: string; decimals: number; symbol: string };
        };
        try {
          const tokenPrice = await priceOracle.getPrice({
            address: tokenInstr.token.address,
            decimals: tokenInstr.token.decimals,
            chain: chain as ChainType,
            network: network as NetworkType | undefined,
          });
          const humanAmount =
            Number(tokenInstr.amount) / Math.pow(10, tokenInstr.token.decimals);
          totalUsd += humanAmount * tokenPrice.usdPrice;
          if (tokenPrice.isStale) isStale = true;
        } catch (err) {
          if (err instanceof PriceNotAvailableError) {
            failedCount++;
            if (!firstNotListedToken) {
              firstNotListedToken = tokenInstr.token.address;
            }
          } else {
            // Non-PriceNotAvailableError in BATCH token -> treat as oracleDown
            return { type: 'oracleDown' };
          }
        }
        break;
      }

      case 'CONTRACT_CALL': {
        const value = (instr as { value?: string }).value;
        if (value && value !== '0') {
          const humanAmount = Number(value) / Math.pow(10, decimals);
          totalUsd += humanAmount * nativePrice.usdPrice;
        }
        break;
      }

      case 'APPROVE': {
        // $0 contribution
        break;
      }
    }
  }

  // Step 3: If any TOKEN_TRANSFER failed -> notListed
  if (failedCount > 0) {
    return {
      type: 'notListed',
      tokenAddress: firstNotListedToken,
      chain,
      failedCount,
    };
  }

  // Step 4: All success
  return {
    type: 'success',
    usdAmount: totalUsd,
    isStale,
  };
}

/**
 * Classify a BATCH instruction by field presence.
 * Same logic as stage3Policy BATCH classification.
 */
function classifyInstruction(instr: Record<string, unknown>): string {
  if ('spender' in instr) return 'APPROVE';
  if ('token' in instr) return 'TOKEN_TRANSFER';
  if ('programId' in instr || 'calldata' in instr) return 'CONTRACT_CALL';
  return 'TRANSFER';
}
