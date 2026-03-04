/**
 * ERC-8004 Registry contract addresses.
 *
 * Identity and Reputation Registries are deployed on Ethereum mainnet.
 * Validation Registry is NOT yet deployed (feature-gated with empty string).
 */

/** Registry address set for a specific network. */
export interface Erc8004Addresses {
  readonly identity: string;
  readonly reputation: string;
  readonly validation: string;
}

/** Ethereum mainnet registry addresses (confirmed deployed). */
export const ERC8004_MAINNET_ADDRESSES: Erc8004Addresses = {
  identity: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  reputation: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
  validation: '', // Not deployed on mainnet — feature-gated
} as const;

/** Testnet registry addresses (none deployed yet). */
export const ERC8004_TESTNET_ADDRESSES: Erc8004Addresses = {
  identity: '',
  reputation: '',
  validation: '',
} as const;
