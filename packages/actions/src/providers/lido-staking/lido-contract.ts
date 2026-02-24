/**
 * Lido contract ABI encoding helpers.
 *
 * Manual ABI encoding (no viem dependency) for:
 * - stETH submit(address _referral)
 * - WithdrawalQueue requestWithdrawals(uint256[] _amounts, address _owner)
 * - ERC-20 approve(address spender, uint256 amount)
 *
 * Function selectors are hardcoded hex constants derived from keccak256 of function signatures.
 */

// ---------------------------------------------------------------------------
// Utility: pad a hex value to 32 bytes (64 hex chars)
// ---------------------------------------------------------------------------

function padHex(value: string, length: number = 64): string {
  return value.padStart(length, '0');
}

function addressToHex(address: string): string {
  return padHex(address.slice(2).toLowerCase());
}

function uint256ToHex(value: bigint): string {
  if (value < 0n) throw new Error('uint256 cannot be negative');
  return padHex(value.toString(16));
}

// ---------------------------------------------------------------------------
// submit(address _referral) -- function selector 0xa1903eab
// ---------------------------------------------------------------------------

/**
 * Encode Lido stETH submit(address _referral) calldata.
 * ETH value is sent as transaction value, not encoded in calldata.
 *
 * @param referral - Referral address (defaults to zero address)
 * @returns ABI-encoded calldata with 0x prefix
 */
export function encodeSubmitCalldata(
  referral: string = '0x0000000000000000000000000000000000000000',
): string {
  const selector = '0xa1903eab';
  const paddedReferral = addressToHex(referral);
  return `${selector}${paddedReferral}`;
}

// ---------------------------------------------------------------------------
// requestWithdrawals(uint256[] _amounts, address _owner) -- 0xd669a4e2
// ---------------------------------------------------------------------------

/**
 * Encode Lido WithdrawalQueue requestWithdrawals(uint256[], address) calldata.
 *
 * ABI layout:
 *   selector (4 bytes)
 *   offset to amounts array (32 bytes) = 0x40 (64 decimal)
 *   owner address (32 bytes)
 *   array length (32 bytes)
 *   array element 0 (32 bytes)
 *   ... array element N (32 bytes)
 *
 * @param amounts - Array of stETH withdrawal amounts in wei
 * @param owner - Address to receive the withdrawal NFT
 * @returns ABI-encoded calldata with 0x prefix
 */
export function encodeRequestWithdrawalsCalldata(
  amounts: bigint[],
  owner: string,
): string {
  const selector = '0xd669a4e2';

  // offset to dynamic array = 0x40 (2 * 32 bytes: offset slot + owner slot)
  const offsetHex = uint256ToHex(64n);
  const ownerHex = addressToHex(owner);
  const lengthHex = uint256ToHex(BigInt(amounts.length));
  const elementsHex = amounts.map((a) => uint256ToHex(a)).join('');

  return `${selector}${offsetHex}${ownerHex}${lengthHex}${elementsHex}`;
}

// ---------------------------------------------------------------------------
// approve(address spender, uint256 amount) -- 0x095ea7b3
// ---------------------------------------------------------------------------

/**
 * Encode ERC-20 approve(address spender, uint256 amount) calldata.
 *
 * @param spender - Spender address to approve
 * @param amount - Amount to approve in wei
 * @returns ABI-encoded calldata with 0x prefix
 */
export function encodeApproveCalldata(spender: string, amount: bigint): string {
  const selector = '0x095ea7b3';
  const paddedSpender = addressToHex(spender);
  const paddedAmount = uint256ToHex(amount);
  return `${selector}${paddedSpender}${paddedAmount}`;
}
