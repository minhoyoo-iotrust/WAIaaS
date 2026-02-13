/**
 * Built-in ERC-20 token data for EVM networks (mainnet + testnet).
 *
 * Provides well-known token addresses (USDC, USDT, WETH, DAI, LINK, etc.)
 * for 5 EVM mainnet networks and 5 testnet networks.
 *
 * Testnet token sources:
 * - Circle official (USDC) — https://faucet.circle.com/
 * - Chainlink official (LINK) — https://faucets.chain.link/
 * - Aave TestnetMintableERC20 (USDT, DAI, WBTC, AAVE, GHO, EURS, cbETH)
 * - Canonical wrapped tokens (WETH, WPOL)
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
 * - Mainnet networks: curated token lists (USDC, USDT, WETH, DAI + chain-native wrapped).
 * - Testnet networks: verified faucet-available tokens (Circle USDC, Chainlink LINK, Aave tokens).
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
  // Ethereum Sepolia (10 tokens)
  // ---------------------------------------------------------------------------
  'ethereum-sepolia': [
    { address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    { address: '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
    { address: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
    { address: '0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
    { address: '0x779877A7B0D9E8603169DdbD7836e478b4624789', symbol: 'LINK', name: 'Chainlink', decimals: 18 },
    { address: '0x29f2D40B0605204364af54EC677bD022dA425d03', symbol: 'WBTC', name: 'Wrapped Bitcoin', decimals: 8 },
    { address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984', symbol: 'UNI', name: 'Uniswap', decimals: 18 },
    { address: '0x88541670E55cC00bEEFD87eB59EDd1b7C511AC9a', symbol: 'AAVE', name: 'Aave Token', decimals: 18 },
    { address: '0xc4bF5CbDaBE595361438F8c6a187bDc330539c60', symbol: 'GHO', name: 'Gho Token', decimals: 18 },
    { address: '0x6d906e526a4e2Ca02097BA9d0caA3c382F52278E', symbol: 'EURS', name: 'EURS Stablecoin', decimals: 2 },
  ],

  // ---------------------------------------------------------------------------
  // Polygon Amoy (7 tokens)
  // ---------------------------------------------------------------------------
  'polygon-amoy': [
    { address: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    { address: '0x1fdE0eCc619726f4cD597887C9F3b4c8740e19e2', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
    { address: '0x52eF3d68BaB452a294342DC3e5f464d7f610f72E', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
    { address: '0xc8c0Cf9436F4862a8F60Ce680Ca5a9f0f99b5ded', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18 },
    { address: '0x0Fd9e8d3aF1aaee056EB9e802c3A762a667b1904', symbol: 'LINK', name: 'Chainlink', decimals: 18 },
    { address: '0x360ad4f9a9A8EFe9A8DCB5f461c4Cc1047E1Dcf9', symbol: 'WPOL', name: 'Wrapped POL', decimals: 18 },
    { address: '0x1558c6FadDe1bEaf0f6628BDd1DFf3461185eA24', symbol: 'AAVE', name: 'Aave Token', decimals: 18 },
  ],

  // ---------------------------------------------------------------------------
  // Arbitrum Sepolia (3 tokens)
  // ---------------------------------------------------------------------------
  'arbitrum-sepolia': [
    { address: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    { address: '0x980B62Da83eFf3D4576C647993b0c1D7faf17c73', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
    { address: '0xb1D4538B4571d411F07960EF2838Ce337FE1E80E', symbol: 'LINK', name: 'Chainlink', decimals: 18 },
  ],

  // ---------------------------------------------------------------------------
  // Optimism Sepolia (3 tokens)
  // ---------------------------------------------------------------------------
  'optimism-sepolia': [
    { address: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
    { address: '0xE4aB69C077896252FAFBD49EFD26B5D171A32410', symbol: 'LINK', name: 'Chainlink', decimals: 18 },
  ],

  // ---------------------------------------------------------------------------
  // Base Sepolia (6 tokens)
  // ---------------------------------------------------------------------------
  'base-sepolia': [
    { address: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', symbol: 'USDC', name: 'USD Coin', decimals: 6 },
    { address: '0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a', symbol: 'USDT', name: 'Tether USD', decimals: 6 },
    { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
    { address: '0x54114591963CF60EF3aA63bEfD6eC263D98145a4', symbol: 'WBTC', name: 'Wrapped Bitcoin', decimals: 8 },
    { address: '0xE4aB69C077896252FAFBD49EFD26B5D171A32410', symbol: 'LINK', name: 'Chainlink', decimals: 18 },
    { address: '0xD171b9694f7A2597Ed006D41f7509aaD4B485c4B', symbol: 'cbETH', name: 'Coinbase Wrapped Staked ETH', decimals: 18 },
  ],
};

/**
 * Get built-in tokens for a given network.
 * Returns the token array for the network, or empty array if not found.
 */
export function getBuiltinTokens(network: string): TokenEntry[] {
  return BUILTIN_TOKENS[network] ?? [];
}
