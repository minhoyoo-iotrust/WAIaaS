/**
 * CoinGecko platform ID and native coin ID mapping.
 *
 * Maps WAIaaS NetworkType to CoinGecko API identifiers:
 * - platformId: used in /simple/token_price/{platformId} path
 * - nativeCoinId: used in /simple/price?ids={nativeCoinId} path
 *
 * Supports 6 mainnet networks: Solana, Ethereum, Polygon, Arbitrum, Optimism, Base.
 * Testnet networks are intentionally excluded (no CoinGecko prices for testnet tokens).
 */

/** CoinGecko platform configuration for a network. */
export interface CoinGeckoPlatform {
  /** Platform ID for /simple/token_price/{platformId} endpoint. */
  platformId: string;
  /** Native coin ID for /simple/price?ids={nativeCoinId} endpoint. */
  nativeCoinId: string;
}

/**
 * Map from WAIaaS NetworkType to CoinGecko platform/coin IDs.
 *
 * 6 mainnet entries covering Solana + Ethereum L1 + 4 EVM L2 networks.
 * Polygon uses 'matic-network' as nativeCoinId (POL/MATIC gas token).
 * Arbitrum/Optimism/Base use 'ethereum' as nativeCoinId (ETH gas token).
 */
export const COINGECKO_PLATFORM_MAP: Record<string, CoinGeckoPlatform> = {
  // Solana (mainnet only -- devnet/testnet have no CoinGecko prices)
  'mainnet':          { platformId: 'solana',              nativeCoinId: 'solana' },
  // EVM Mainnet L1
  'ethereum-mainnet': { platformId: 'ethereum',            nativeCoinId: 'ethereum' },
  // EVM L2 Mainnets
  'polygon-mainnet':  { platformId: 'polygon-pos',         nativeCoinId: 'matic-network' },
  'arbitrum-mainnet': { platformId: 'arbitrum-one',        nativeCoinId: 'ethereum' },
  'optimism-mainnet': { platformId: 'optimistic-ethereum', nativeCoinId: 'ethereum' },
  'base-mainnet':     { platformId: 'base',                nativeCoinId: 'ethereum' },
};

/**
 * Look up CoinGecko platform config for a network.
 *
 * @param network - WAIaaS NetworkType (e.g., 'ethereum-mainnet', 'polygon-mainnet').
 * @returns CoinGeckoPlatform if supported, undefined otherwise.
 */
export function getCoinGeckoPlatform(network: string): CoinGeckoPlatform | undefined {
  return COINGECKO_PLATFORM_MAP[network];
}
