/**
 * Chain-specific constants -- Single Source of Truth.
 *
 * All chain-dependent decimals and symbols must be imported from here.
 * Do NOT define local NATIVE_DECIMALS or NATIVE_SYMBOLS in daemon or other packages.
 *
 * @see Phase 431 (SSOT-01)
 */

/** Native token decimal places per chain. Defaults to 18 (EVM standard). */
export const NATIVE_DECIMALS: Record<string, number> = {
  solana: 9,
  ethereum: 18,
  ripple: 6, // 1 XRP = 1,000,000 drops
};

/** Native token symbols per chain. Defaults to uppercase chain name. */
export const NATIVE_SYMBOLS: Record<string, string> = {
  solana: 'SOL',
  ethereum: 'ETH',
  ripple: 'XRP',
};

/** Get native token decimals for a chain. Defaults to 18 for unknown chains. */
export function nativeDecimals(chain: string): number {
  return NATIVE_DECIMALS[chain] ?? 18;
}

/** Get native token symbol for a chain. Defaults to uppercase chain name. */
export function nativeSymbol(chain: string): string {
  return NATIVE_SYMBOLS[chain] ?? chain.toUpperCase();
}
