/**
 * E2E Coverage Map
 *
 * Declarative mapping of Action Providers and REST API routes
 * to the E2E scenario files that cover them.
 *
 * When adding a new Provider or route, add a corresponding entry here.
 * The verify-e2e-coverage.ts script validates completeness.
 */

// ── Provider Coverage ──────────────────────────────────────────────────
// Key: directory name under packages/actions/src/providers/
// Value: scenario file(s) that cover this provider

export const providerCoverage: Record<string, string[]> = {
  // DeFi providers (mainnet-only) -> offchain settings test
  'aave-v3': ['advanced-defi-settings-push-relay.ts'],
  'across': ['advanced-defi-settings-push-relay.ts'],
  'dcent-swap': ['advanced-defi-settings-push-relay.ts'],
  'drift': ['advanced-defi-settings-push-relay.ts'],
  'jupiter-swap': ['advanced-defi-settings-push-relay.ts'],
  'kamino': ['advanced-defi-settings-push-relay.ts'],
  'lifi': ['advanced-defi-settings-push-relay.ts'],
  'pendle': ['advanced-defi-settings-push-relay.ts'],
  'polymarket': ['onchain-polymarket.ts'],
  'zerox-swap': ['advanced-defi-settings-push-relay.ts'],

  // Providers with dedicated onchain tests
  'hyperliquid': ['onchain-hyperliquid.ts', 'advanced-defi-settings-push-relay.ts'],
  'lido-staking': ['advanced-defi-settings-push-relay.ts'],
  'jito-staking': ['advanced-defi-settings-push-relay.ts'],

  // XRPL DEX provider (mainnet-only, settings test)
  'xrpl-dex': ['advanced-defi-settings-push-relay.ts'],

  // ERC-8004 provider
  'erc8004': ['advanced-x402-erc8004-erc8128.ts'],
};

// ── Route Coverage ─────────────────────────────────────────────────────
// Key: route file name (without .ts extension) under packages/daemon/src/api/routes/
// Value: scenario file(s) that cover this route

export const routeCoverage: Record<string, string[]> = {
  // Core
  'health': ['core-auth-wallet-session.ts'],
  'sessions': ['core-auth-wallet-session.ts'],
  'wallets': ['core-auth-wallet-session.ts', 'core-wallet-lifecycle.ts'],
  'wallet': ['core-auth-wallet-session.ts'],
  'policies': ['core-policy.ts', 'core-wallet-lifecycle.ts'],
  'transactions': ['core-auth-wallet-session.ts', 'onchain-human-amount.ts'],

  // Interface
  'admin': ['interface-admin-mcp-sdk.ts'],
  'admin-actions': ['interface-admin-mcp-sdk.ts'],
  'admin-auth': ['interface-admin-mcp-sdk.ts'],
  'admin-monitoring': ['interface-admin-mcp-sdk.ts'],
  'admin-notifications': ['interface-admin-mcp-sdk.ts'],
  'admin-settings': ['interface-admin-mcp-sdk.ts'],
  'admin-wallets': ['interface-admin-mcp-sdk.ts'],
  'admin-credentials': ['interface-admin-mcp-sdk.ts'],
  'mcp': ['interface-admin-mcp-sdk.ts'],
  'skills': ['interface-admin-mcp-sdk.ts'],

  // Operations
  'audit-logs': ['ops-audit-backup.ts'],
  'tokens': ['ops-notification-token-connectinfo.ts'],
  'connect-info': ['ops-notification-token-connectinfo.ts'],
  'webhooks': ['ops-notification-token-connectinfo.ts'],

  // Advanced protocols
  'userop': ['advanced-smart-account-userop-owner.ts'],
  'wallet-apps': ['advanced-smart-account-userop-owner.ts'],
  'wc': ['advanced-smart-account-userop-owner.ts'],
  'x402': ['advanced-x402-erc8004-erc8128.ts'],
  'erc8004': ['advanced-x402-erc8004-erc8128.ts'],
  'erc8128': ['advanced-x402-erc8004-erc8128.ts'],

  // Chain-specific
  'credentials': ['interface-admin-mcp-sdk.ts'],
  'external-actions': ['interface-admin-mcp-sdk.ts'],
  'actions': ['advanced-defi-settings-push-relay.ts'],
  'staking': ['advanced-defi-settings-push-relay.ts'],
  'hyperliquid': ['onchain-hyperliquid.ts'],
  'incoming': ['onchain-incoming.ts'],
  'polymarket': ['onchain-polymarket.ts'],
  'nfts': ['onchain-nft.ts'],
  'nft-approvals': ['onchain-nft.ts'],
  'defi-positions': ['advanced-defi-settings-push-relay.ts'],
  'nonce': ['core-auth-wallet-session.ts'],
  'rpc-proxy': ['advanced-x402-erc8004-erc8128.ts'],
};

// ── Route Excludes ─────────────────────────────────────────────────────
// Utility/internal route files that do not need E2E coverage

export const ROUTE_EXCLUDES: string[] = [
  'index',
  'openapi-schemas',
  'utils',
  'display-currency-helper',
];

// ── Scenario Validation ────────────────────────────────────────────────
// Minimum number of registry.register() calls per scenario file

export const SCENARIO_MIN_REGISTRATIONS = 1;
