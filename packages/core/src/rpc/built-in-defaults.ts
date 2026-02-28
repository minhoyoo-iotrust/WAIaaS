/**
 * Built-in RPC defaults for 13 networks (6 mainnet + 7 testnet).
 *
 * These are public, free-tier RPC endpoints. They provide a working
 * out-of-the-box experience without any configuration. Users should
 * add their own premium RPC endpoints for production use.
 *
 * @module @waiaas/core/rpc
 */

/**
 * Built-in default RPC URLs for all supported networks.
 *
 * - **Mainnet (6):** solana-mainnet, ethereum-mainnet, arbitrum-mainnet,
 *   optimism-mainnet, base-mainnet, polygon-mainnet
 * - **Testnet (7):** solana-devnet, solana-testnet, ethereum-sepolia,
 *   arbitrum-sepolia, optimism-sepolia, base-sepolia, polygon-amoy
 *
 * URLs are ordered by priority (index 0 = highest priority).
 * All URLs use https:// protocol.
 */
export const BUILT_IN_RPC_DEFAULTS: Readonly<Record<string, readonly string[]>> = {
  // ─── Mainnet (6 networks) ──────────────────────────────────────
  'solana-mainnet': [
    'https://api.mainnet-beta.solana.com',
    'https://rpc.ankr.com/solana',
    'https://solana.drpc.org',
  ],
  'ethereum-mainnet': [
    'https://eth.drpc.org',
    'https://rpc.ankr.com/eth',
    'https://ethereum.publicnode.com',
  ],
  'arbitrum-mainnet': [
    'https://arbitrum.drpc.org',
    'https://arbitrum.publicnode.com',
  ],
  'optimism-mainnet': [
    'https://optimism.drpc.org',
    'https://mainnet.optimism.io',
    'https://optimism.publicnode.com',
  ],
  'base-mainnet': [
    'https://base.drpc.org',
    'https://base.publicnode.com',
  ],
  'polygon-mainnet': [
    'https://polygon.drpc.org',
    'https://polygon-rpc.com',
    'https://polygon.publicnode.com',
  ],

  // ─── Testnet (7 networks) ─────────────────────────────────────
  'solana-devnet': [
    'https://api.devnet.solana.com',
    'https://rpc.ankr.com/solana_devnet',
  ],
  'solana-testnet': [
    'https://api.testnet.solana.com',
  ],
  'ethereum-sepolia': [
    'https://1rpc.io/sepolia',
    'https://0xrpc.io/sep',
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://sepolia.drpc.org',
    'https://rpc.sepolia.org',
  ],
  'arbitrum-sepolia': [
    'https://arbitrum-sepolia.drpc.org',
    'https://arbitrum-sepolia-rpc.publicnode.com',
  ],
  'optimism-sepolia': [
    'https://optimism-sepolia.drpc.org',
    'https://optimism-sepolia-rpc.publicnode.com',
  ],
  'base-sepolia': [
    'https://base-sepolia.drpc.org',
    'https://base-sepolia-rpc.publicnode.com',
  ],
  'polygon-amoy': [
    'https://polygon-amoy.drpc.org',
    'https://rpc-amoy.polygon.technology',
    'https://polygon-amoy-bor-rpc.publicnode.com',
  ],
} as const;
