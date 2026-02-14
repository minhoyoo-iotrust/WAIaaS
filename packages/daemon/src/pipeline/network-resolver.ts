import {
  type ChainType,
  type EnvironmentType,
  type NetworkType,
  getDefaultNetwork,
  validateChainNetwork,
  validateNetworkEnvironment,
} from '@waiaas/core';

/**
 * Resolve the target network for a transaction.
 *
 * Priority:
 *   1. request.network   (explicit per-tx override)
 *   2. wallet.defaultNetwork (user-configured default, nullable)
 *   3. getDefaultNetwork(chain, environment)  (environment fallback)
 *
 * Internal cross-validation (2-step):
 *   a. validateChainNetwork(chain, resolved)          -- chain-network compatibility
 *   b. validateNetworkEnvironment(chain, env, resolved) -- environment-network match
 *
 * @param requestNetwork      - Network specified in transaction request (optional)
 * @param walletDefaultNetwork - Default network configured on wallet (nullable)
 * @param environment          - Wallet environment ('testnet' | 'mainnet')
 * @param chain                - Wallet chain ('solana' | 'ethereum')
 * @returns Resolved NetworkType
 * @throws Error if resolved network is invalid for chain or environment
 */
export function resolveNetwork(
  requestNetwork: NetworkType | undefined | null,
  walletDefaultNetwork: NetworkType | null,
  environment: EnvironmentType,
  chain: ChainType,
): NetworkType {
  // Step 1: Determine network from 3-level priority
  const resolved: NetworkType =
    requestNetwork
    ?? walletDefaultNetwork
    ?? getDefaultNetwork(chain, environment);

  // Step 2: Cross-validate chain + network (solana cannot use EVM networks)
  validateChainNetwork(chain, resolved);

  // Step 3: Cross-validate environment + network (testnet cannot use mainnet networks)
  validateNetworkEnvironment(chain, environment, resolved);

  return resolved;
}
