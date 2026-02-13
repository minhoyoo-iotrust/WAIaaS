/**
 * Built-in ERC-20 token data for EVM mainnet networks.
 *
 * Provides well-known token addresses (USDC, USDT, WETH, DAI, etc.) for
 * 5 EVM mainnet networks. Testnet networks return empty arrays -- users
 * can add testnet tokens via the custom token API.
 *
 * All addresses use EIP-55 checksum format.
 *
 * @see docs/56-spl-erc20-spec.md
 */

export interface TokenEntry {
  /** EIP-55 checksum address */
  address: string;
  /** Token ticker symbol (e.g. "USDC") */
  symbol: string;
  /** Full token name (e.g. "USD Coin") */
  name: string;
  /** Token decimals (e.g. 6 for USDC, 18 for WETH) */
  decimals: number;
}

/**
 * Built-in ERC-20 tokens keyed by EvmNetworkType string.
 *
 * - Mainnet networks have curated token lists (USDC, USDT, WETH, DAI + chain-native wrapped).
 * - Testnet networks have empty arrays (add via custom token API).
 */
export const BUILTIN_TOKENS: Record<string, TokenEntry[]> = {
  // ---------------------------------------------------------------------------
  // Ethereum Mainnet (6 tokens)
  // ---------------------------------------------------------------------------
  'ethereum-mainnet': [
    { address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
    { address: '0xC02aaA39b223FE8D0A0e5c4F27eAD9083C756Cc2', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
    { address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
    { address: '0x514910771AF9Ca656af840dff83E8264EcF986CA', symbol: 'LINK', name: 'Chainlink', decimals: 18 },
    { address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', symbol: 'UNI', name: 'Uniswap', decimals: 18 },
  ],

  // ---------------------------------------------------------------------------
  // Polygon Mainnet (5 tokens)
  // ---------------------------------------------------------------------------
  'polygon-mainnet': [
    { address: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    { address: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
    { address: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
    { address: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
    { address: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', symbol: 'WMATIC', name: 'Wrapped Matic', decimals: 18 },
  ],

  // ---------------------------------------------------------------------------
  // Arbitrum Mainnet (5 tokens)
  // ---------------------------------------------------------------------------
  'arbitrum-mainnet': [
    { address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    { address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
    { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
    { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
    { address: '0x912CE59144191C1204E64559FE8253a0e49E6548', symbol: 'ARB', name: 'Arbitrum', decimals: 18 },
  ],

  // ---------------------------------------------------------------------------
  // Optimism Mainnet (5 tokens)
  // ---------------------------------------------------------------------------
  'optimism-mainnet': [
    { address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    { address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
    { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
    { address: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
    { address: '0x4200000000000000000000000000000000000042', symbol: 'OP', name: 'Optimism', decimals: 18 },
  ],

  // ---------------------------------------------------------------------------
  // Base Mainnet (3 tokens)
  // ---------------------------------------------------------------------------
  'base-mainnet': [
    { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
    { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
  ],

  // ---------------------------------------------------------------------------
  // Testnet networks (empty -- add via custom token API)
  // ---------------------------------------------------------------------------
  'ethereum-sepolia': [],
  'polygon-amoy': [],
  'arbitrum-sepolia': [],
  'optimism-sepolia': [],
  'base-sepolia': [],
};

/**
 * Get built-in tokens for a given network.
 * Returns the token array for the network, or empty array if not found.
 */
export function getBuiltinTokens(network: string): TokenEntry[] {
  return BUILTIN_TOKENS[network] ?? [];
}
