/**
 * Lido Staking configuration type, defaults, and contract address maps.
 *
 * Supports Ethereum mainnet and Holesky testnet.
 * See: https://docs.lido.fi/deployed-contracts/
 */

export interface LidoStakingConfig {
  enabled: boolean;
  stethAddress: string;           // stETH contract (also used for submit())
  withdrawalQueueAddress: string; // Lido WithdrawalQueue (V1)
}

// ---------------------------------------------------------------------------
// Mainnet addresses (Ethereum)
// ---------------------------------------------------------------------------

export const LIDO_MAINNET_ADDRESSES = {
  stethAddress: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
  withdrawalQueueAddress: '0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1',
} as const;

// ---------------------------------------------------------------------------
// Testnet addresses (Holesky -- Lido has no official Sepolia deployment)
// ---------------------------------------------------------------------------

export const LIDO_TESTNET_ADDRESSES = {
  stethAddress: '0x3F1c547b21f65e10480dE3ad8E19fAAC46C95034',
  withdrawalQueueAddress: '0xc7cc160b58F8Bb0baC94b80847E2CF2800565C50',
} as const;

// ---------------------------------------------------------------------------
// Defaults (disabled, mainnet addresses)
// ---------------------------------------------------------------------------

export const LIDO_STAKING_DEFAULTS: LidoStakingConfig = {
  enabled: false,
  ...LIDO_MAINNET_ADDRESSES,
};

// ---------------------------------------------------------------------------
// Helper to select addresses by environment
// ---------------------------------------------------------------------------

/**
 * Get Lido contract addresses for a given environment type.
 * @param environment - 'mainnet' or 'testnet'
 */
export function getLidoAddresses(
  environment: 'mainnet' | 'testnet',
): { stethAddress: string; withdrawalQueueAddress: string } {
  return environment === 'testnet'
    ? { ...LIDO_TESTNET_ADDRESSES }
    : { ...LIDO_MAINNET_ADDRESSES };
}
