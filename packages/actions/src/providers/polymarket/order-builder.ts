/**
 * OrderBuilder: Constructs Polymarket Order structs from user parameters.
 *
 * Converts price/size to correct makerAmount/takerAmount with USDC.e 6 decimal precision.
 * BUY: maker pays USDC, receives outcome tokens.
 * SELL: maker pays outcome tokens, receives USDC.
 *
 * @see design doc 80, Section 4.2
 */
import { randomBytes } from 'node:crypto';
import type { Hex } from 'viem';
import { ORDER_SIDE, SIGNATURE_TYPE, ZERO_ADDRESS, PM_DEFAULTS } from './config.js';
import type { PolymarketOrderStruct } from './schemas.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrderBuilderParams {
  /** Wallet address (maker = signer for EOA) */
  walletAddress: Hex;
  /** CTF ERC-1155 token ID */
  tokenId: string;
  /** Limit price in 0-1 range (e.g., "0.65") */
  price: string;
  /** Number of outcome tokens */
  size: string;
  /** Order type determines expiration handling */
  orderType: 'GTC' | 'GTD' | 'FOK' | 'IOC';
  /** Unix timestamp for GTD orders */
  expiration?: number;
  /** Fee rate in basis points (CLOB sets this, default 0) */
  feeRateBps?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCALE = 10n ** BigInt(PM_DEFAULTS.DECIMALS); // 1e6

/**
 * Convert a decimal string to bigint with 6 decimal precision.
 * "0.65" * "100" = 65.0 -> 65000000n
 */
function decimalToBigint(value: string): bigint {
  // Handle integer and decimal parts separately to avoid float precision issues
  const parts = value.split('.');
  const intPart = parts[0] ?? '0';
  let fracPart = parts[1] ?? '';

  // Pad or trim fractional part to DECIMALS digits
  const decimals = PM_DEFAULTS.DECIMALS;
  if (fracPart.length > decimals) {
    fracPart = fracPart.slice(0, decimals);
  } else {
    fracPart = fracPart.padEnd(decimals, '0');
  }

  return BigInt(intPart) * SCALE + BigInt(fracPart);
}

/**
 * Multiply two decimal strings and return bigint result with 6 decimal precision.
 * Uses integer arithmetic to avoid floating point issues.
 *
 * price * size = total USDC amount
 * Both expressed with 6 decimals in final output.
 */
function multiplyDecimals(a: string, b: string): bigint {
  const aScaled = decimalToBigint(a);
  const bScaled = decimalToBigint(b);
  // aScaled and bScaled are each scaled by 1e6
  // Their product is scaled by 1e12, so divide by 1e6 to get result at 1e6 scale
  return (aScaled * bScaled) / SCALE;
}

/**
 * Generate a random 32-byte salt as bigint.
 */
function generateSalt(): bigint {
  const bytes = randomBytes(32);
  return BigInt('0x' + bytes.toString('hex'));
}

// ---------------------------------------------------------------------------
// OrderBuilder
// ---------------------------------------------------------------------------

/**
 * Static utility for building Polymarket Order structs from user parameters.
 */
export class OrderBuilder {
  /**
   * Build a BUY order struct.
   * side=0 (BUY): maker gives USDC (makerAmount), receives outcome tokens (takerAmount).
   *
   * makerAmount = price * size * 1e6 (USDC.e to pay)
   * takerAmount = size * 1e6 (outcome tokens to receive)
   */
  static buildBuyOrder(params: OrderBuilderParams): PolymarketOrderStruct {
    const makerAmount = multiplyDecimals(params.price, params.size);
    const takerAmount = decimalToBigint(params.size);

    return OrderBuilder.buildOrder({
      ...params,
      side: ORDER_SIDE.BUY,
      makerAmount,
      takerAmount,
    });
  }

  /**
   * Build a SELL order struct.
   * side=1 (SELL): maker gives outcome tokens (makerAmount), receives USDC (takerAmount).
   *
   * makerAmount = size * 1e6 (outcome tokens to give)
   * takerAmount = price * size * 1e6 (USDC.e to receive)
   */
  static buildSellOrder(params: OrderBuilderParams): PolymarketOrderStruct {
    const makerAmount = decimalToBigint(params.size);
    const takerAmount = multiplyDecimals(params.price, params.size);

    return OrderBuilder.buildOrder({
      ...params,
      side: ORDER_SIDE.SELL,
      makerAmount,
      takerAmount,
    });
  }

  /**
   * Calculate the USDC amount for a buy order (for spending limits).
   * Returns price * size in USDC.e 6 decimal bigint.
   */
  static calculateBuyAmount(price: string, size: string): bigint {
    return multiplyDecimals(price, size);
  }

  // Internal builder
  private static buildOrder(params: OrderBuilderParams & {
    side: number;
    makerAmount: bigint;
    takerAmount: bigint;
  }): PolymarketOrderStruct {
    const expiration = params.orderType === 'GTD' && params.expiration
      ? BigInt(params.expiration)
      : 0n;

    return {
      salt: generateSalt(),
      maker: params.walletAddress,
      signer: params.walletAddress,
      taker: ZERO_ADDRESS,
      tokenId: BigInt(params.tokenId),
      makerAmount: params.makerAmount,
      takerAmount: params.takerAmount,
      expiration,
      nonce: 0n,
      feeRateBps: BigInt(params.feeRateBps ?? 0),
      side: params.side,
      signatureType: SIGNATURE_TYPE.EOA,
    };
  }
}
