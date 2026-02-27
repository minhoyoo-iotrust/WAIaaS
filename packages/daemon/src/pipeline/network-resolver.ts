import {
  type ChainType,
  type EnvironmentType,
  type NetworkType,
  getSingleNetwork,
  validateChainNetwork,
  validateNetworkEnvironment,
  WAIaaSError,
} from '@waiaas/core';

/**
 * Resolve the target network for a transaction.
 *
 * Priority:
 *   1. requestNetwork   (explicit per-tx override)
 *   2. getSingleNetwork(chain, environment)  (auto-resolve for single-network chains)
 *
 * Auto-resolve rules:
 *   - Solana: always auto-resolves (1 network per environment)
 *   - EVM: getSingleNetwork returns null -> throws NETWORK_REQUIRED
 *
 * Internal cross-validation (2-step):
 *   a. validateChainNetwork(chain, resolved)          -- chain-network compatibility
 *   b. validateNetworkEnvironment(chain, env, resolved) -- environment-network match
 *
 * @param requestNetwork - Network specified in transaction request (optional)
 * @param environment    - Wallet environment ('testnet' | 'mainnet')
 * @param chain          - Wallet chain ('solana' | 'ethereum')
 * @returns Resolved NetworkType
 * @throws WAIaaSError('NETWORK_REQUIRED') if EVM wallet and no network specified
 * @throws Error if resolved network is invalid for chain or environment
 *
 * @see Phase 279 -- remove default wallet/network concept
 */
export function resolveNetwork(
  requestNetwork: NetworkType | undefined | null,
  environment: EnvironmentType,
  chain: ChainType,
): NetworkType {
  // Step 1: Use explicit request network, or try auto-resolve
  const resolved: NetworkType | null = requestNetwork ?? getSingleNetwork(chain, environment);

  if (resolved === null) {
    // EVM chains have multiple networks per environment -- cannot auto-resolve
    throw new WAIaaSError('NETWORK_REQUIRED', {
      message: `Network is required for ${chain} wallets in ${environment} environment`,
    });
  }

  // Step 2: Cross-validate chain + network (solana cannot use EVM networks)
  validateChainNetwork(chain, resolved);

  // Step 3: Cross-validate environment + network (testnet cannot use mainnet networks)
  validateNetworkEnvironment(chain, environment, resolved);

  return resolved;
}
