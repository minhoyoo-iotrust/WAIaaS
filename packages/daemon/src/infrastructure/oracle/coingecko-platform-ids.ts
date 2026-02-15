/**
 * CoinGecko platform ID and native coin ID mapping.
 *
 * Maps WAIaaS ChainType to CoinGecko API identifiers:
 * - platformId: used in /simple/token_price/{platformId} path
 * - nativeCoinId: used in /simple/price?ids={nativeCoinId} path
 *
 * v1.5: Only solana and ethereum. L2 networks (Polygon, Arbitrum, etc.)
 * will be added when TokenRef gains a network field.
 */

/** CoinGecko platform configuration for a chain. */
export interface CoinGeckoPlatform {
  /** Platform ID for /simple/token_price/{platformId} endpoint. */
  platformId: string;
  /** Native coin ID for /simple/price?ids={nativeCoinId} endpoint. */
  nativeCoinId: string;
}

/**
 * Map from WAIaaS ChainType to CoinGecko platform/coin IDs.
 *
 * Currently supports solana and ethereum (mainnet).
 * L2 platformIds (polygon-pos, arbitrum-one, etc.) are out of v1.5 scope.
 */
export const COINGECKO_PLATFORM_MAP: Record<string, CoinGeckoPlatform> = {
  solana: { platformId: 'solana', nativeCoinId: 'solana' },
  ethereum: { platformId: 'ethereum', nativeCoinId: 'ethereum' },
};

/**
 * Look up CoinGecko platform config for a chain.
 *
 * @param chain - WAIaaS ChainType ('solana' | 'ethereum').
 * @returns CoinGeckoPlatform if supported, undefined otherwise.
 */
export function getCoinGeckoPlatform(chain: string): CoinGeckoPlatform | undefined {
  return COINGECKO_PLATFORM_MAP[chain];
}
