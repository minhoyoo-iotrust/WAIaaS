/**
 * Static metadata for ALL built-in DeFi action providers.
 *
 * Used by GET /v1/actions/providers to show disabled providers in Admin UI (#354).
 * Each entry's `enabledKey` matches the setting key prefix (actions.{enabledKey}_enabled).
 *
 * This is a lightweight, standalone file with no heavy imports — safe to import
 * in route modules without pulling in provider SDK dependencies.
 */
export const BUILTIN_PROVIDER_METADATA: ReadonlyArray<{
  name: string;
  displayName: string;
  description: string;
  version: string;
  chains: readonly string[];
  mcpExpose: boolean;
  requiresApiKey: boolean;
  apiKeyUrl?: string;
  enabledKey: string;
  category: string;
}> = [
  { name: 'jupiter_swap', displayName: 'Jupiter Swap', description: 'Jupiter DEX aggregator for Solana token swaps with MEV protection', version: '1.0.0', chains: ['solana'], mcpExpose: true, requiresApiKey: true, apiKeyUrl: 'https://portal.jup.ag', enabledKey: 'jupiter_swap', category: 'Swap' },
  { name: 'zerox_swap', displayName: '0x Swap', description: '0x DEX aggregator for EVM token swaps via AllowanceHolder flow', version: '1.0.0', chains: ['ethereum'], mcpExpose: true, requiresApiKey: true, apiKeyUrl: 'https://dashboard.0x.org', enabledKey: 'zerox_swap', category: 'Swap' },
  { name: 'lifi', displayName: 'LI.FI', description: 'LI.FI cross-chain bridge and swap aggregator (100+ bridges, 40+ chains)', version: '1.0.0', chains: ['ethereum', 'solana'], mcpExpose: true, requiresApiKey: false, enabledKey: 'lifi', category: 'Bridge' },
  { name: 'lido_staking', displayName: 'Lido Staking', description: 'Lido liquid staking protocol for ETH to stETH conversion with withdrawal support', version: '1.0.0', chains: ['ethereum'], mcpExpose: true, requiresApiKey: false, enabledKey: 'lido_staking', category: 'Staking' },
  { name: 'jito_staking', displayName: 'Jito Staking', description: 'Jito liquid staking for SOL to JitoSOL conversion on Solana', version: '1.0.0', chains: ['solana'], mcpExpose: true, requiresApiKey: false, enabledKey: 'jito_staking', category: 'Staking' },
  { name: 'aave_v3', displayName: 'Aave V3', description: 'Aave V3 DeFi lending protocol for EVM chains: supply, borrow, repay, withdraw', version: '1.0.0', chains: ['ethereum'], mcpExpose: true, requiresApiKey: false, enabledKey: 'aave_v3', category: 'Lending' },
  { name: 'kamino', displayName: 'Kamino Lending', description: 'Kamino lending protocol on Solana: deposit, borrow, repay, withdraw', version: '1.0.0', chains: ['solana'], mcpExpose: true, requiresApiKey: false, enabledKey: 'kamino', category: 'Lending' },
  { name: 'pendle_yield', displayName: 'Pendle Yield', description: 'Pendle yield trading protocol: tokenize and trade future yield on EVM chains', version: '1.0.0', chains: ['ethereum'], mcpExpose: true, requiresApiKey: false, enabledKey: 'pendle_yield', category: 'Yield' },
  { name: 'drift_perp', displayName: 'Drift Perp', description: 'Drift Protocol V2 perpetual futures on Solana: open, close, and manage leveraged positions', version: '1.0.0', chains: ['solana'], mcpExpose: true, requiresApiKey: false, enabledKey: 'drift', category: 'Perp' },
  { name: 'erc8004_agent', displayName: 'ERC-8004 Agent', description: 'ERC-8004 Trustless Agents — identity registration, reputation management, and on-chain validation', version: '1.0.0', chains: ['ethereum'], mcpExpose: true, requiresApiKey: false, enabledKey: 'erc8004_agent', category: 'Other' },
  { name: 'hyperliquid_perp', displayName: 'Hyperliquid Perp', description: 'Hyperliquid DEX perpetual futures: open, close, and manage leveraged positions', version: '1.0.0', chains: ['ethereum'], mcpExpose: true, requiresApiKey: false, enabledKey: 'hyperliquid', category: 'Perp' },
  { name: 'hyperliquid_spot', displayName: 'Hyperliquid Spot', description: 'Hyperliquid DEX spot trading: buy, sell, and cancel spot market and limit orders', version: '1.0.0', chains: ['ethereum'], mcpExpose: true, requiresApiKey: false, enabledKey: 'hyperliquid', category: 'Swap' },
  { name: 'hyperliquid_sub', displayName: 'Hyperliquid Sub-Account', description: 'Hyperliquid sub-account management: create sub-accounts and transfer USDC', version: '1.0.0', chains: ['ethereum'], mcpExpose: true, requiresApiKey: false, enabledKey: 'hyperliquid', category: 'Other' },
  { name: 'dcent_swap', displayName: "D'CENT Swap", description: "D'CENT Swap Aggregator supporting multi-chain DEX swaps including cross-chain swaps", version: '1.0.0', chains: ['ethereum'], mcpExpose: true, requiresApiKey: false, enabledKey: 'dcent_swap', category: 'Swap' },
  { name: 'across_bridge', displayName: 'Across Bridge', description: 'Across Protocol intent-based cross-chain bridge with fast relayer fills', version: '1.0.0', chains: ['ethereum'], mcpExpose: true, requiresApiKey: false, enabledKey: 'across_bridge', category: 'Bridge' },
  { name: 'polymarket_order', displayName: 'Polymarket Order', description: 'Polymarket prediction market CLOB trading (buy/sell/cancel/update orders)', version: '1.0.0', chains: ['ethereum'], mcpExpose: true, requiresApiKey: false, enabledKey: 'polymarket', category: 'Prediction' },
  { name: 'polymarket_ctf', displayName: 'Polymarket CTF', description: 'Polymarket CTF on-chain operations (split, merge, redeem, approve)', version: '1.0.0', chains: ['ethereum'], mcpExpose: true, requiresApiKey: false, enabledKey: 'polymarket', category: 'Prediction' },
];
