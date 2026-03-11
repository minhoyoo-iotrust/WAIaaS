/**
 * Common EVM ABI encoding utilities.
 *
 * Provides low-level hex encoding helpers for manual ABI construction
 * without viem dependency. Used by providers that build raw calldata
 * (aave-v3, lido-staking, zerox-swap, dcent-swap).
 *
 * Consolidates identical implementations previously duplicated across
 * aave-contracts.ts, lido-contract.ts, zerox-swap/index.ts, and dcent-swap/dex-swap.ts.
 */

/**
 * Pad a hex string to a target length (default 64 = 32 bytes) with leading zeros.
 */
export function padHex(value: string, length: number = 64): string {
  return value.padStart(length, '0');
}

/**
 * Convert a 0x-prefixed Ethereum address to a 64-char lowercase hex string
 * (32-byte ABI encoding).
 */
export function addressToHex(address: string): string {
  return padHex(address.slice(2).toLowerCase());
}

/**
 * Convert a bigint to a 64-char hex string (32-byte ABI encoding).
 *
 * @throws Error if value is negative
 */
export function uint256ToHex(value: bigint): string {
  if (value < 0n) throw new Error('uint256 cannot be negative');
  return padHex(value.toString(16));
}

/**
 * Encode ERC-20 approve(address spender, uint256 amount) calldata.
 *
 * @param spender - Spender address (0x-prefixed)
 * @param amount - Amount to approve as bigint
 * @returns ABI-encoded calldata with 0x prefix
 */
export function encodeApproveCalldata(spender: string, amount: bigint): string {
  const selector = '0x095ea7b3';
  const paddedSpender = addressToHex(spender);
  const paddedAmount = uint256ToHex(amount);
  return `${selector}${paddedSpender}${paddedAmount}`;
}
