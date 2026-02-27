/**
 * Aave V3 manual hex ABI encoding helpers.
 *
 * Manual ABI encoding (no viem dependency) for:
 * - Pool.supply(address,uint256,address,uint16)
 * - Pool.borrow(address,uint256,uint256,uint16,address)
 * - Pool.repay(address,uint256,uint256,address)
 * - Pool.withdraw(address,uint256,address)
 * - ERC-20 approve(address,uint256)
 * - Pool.getUserAccountData(address) [read]
 * - PoolDataProvider.getReserveData(address) [read]
 *
 * Function selectors are hardcoded hex constants derived from keccak256 of function signatures.
 * Follows the Lido pattern (lido-contract.ts).
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
// Function selectors (verified via keccak256)
// ---------------------------------------------------------------------------

export const AAVE_SELECTORS = {
  // Pool write functions
  supply: '0x617ba037',             // supply(address,uint256,address,uint16)
  borrow: '0xa415bcad',             // borrow(address,uint256,uint256,uint16,address)
  repay: '0x573ade81',              // repay(address,uint256,uint256,address)
  withdraw: '0x69328dec',           // withdraw(address,uint256,address)
  // Pool read functions
  getUserAccountData: '0xbf92857c', // getUserAccountData(address)
  getReserveData: '0x35ea6a75',     // getReserveData(address)
  // ERC-20
  approve: '0x095ea7b3',            // approve(address,uint256)
} as const;

// ---------------------------------------------------------------------------
// MAX_UINT256 sentinel (for full repay/withdraw)
// ---------------------------------------------------------------------------

export const MAX_UINT256 = (1n << 256n) - 1n;

// ---------------------------------------------------------------------------
// supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)
// ---------------------------------------------------------------------------

/**
 * Encode Aave V3 Pool.supply() calldata.
 *
 * @param asset - ERC-20 token address to supply
 * @param amount - Amount in token's smallest unit (wei for 18-decimal tokens)
 * @param onBehalfOf - Address to credit the aToken to
 * @param referralCode - Referral code (defaults to 0)
 * @returns ABI-encoded calldata with 0x prefix
 */
export function encodeSupplyCalldata(
  asset: string,
  amount: bigint,
  onBehalfOf: string,
  referralCode: number = 0,
): string {
  return `${AAVE_SELECTORS.supply}${addressToHex(asset)}${uint256ToHex(amount)}${addressToHex(onBehalfOf)}${uint256ToHex(BigInt(referralCode))}`;
}

// ---------------------------------------------------------------------------
// borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf)
// ---------------------------------------------------------------------------

/**
 * Encode Aave V3 Pool.borrow() calldata.
 *
 * Parameter order matches IPool.sol: (asset, amount, interestRateMode, referralCode, onBehalfOf).
 *
 * @param asset - ERC-20 token address to borrow
 * @param amount - Amount to borrow in token's smallest unit
 * @param onBehalfOf - Address that will receive the borrowed tokens and incur the debt
 * @param interestRateMode - 2 = variable (stable is deprecated)
 * @param referralCode - Referral code (defaults to 0)
 * @returns ABI-encoded calldata with 0x prefix
 */
export function encodeBorrowCalldata(
  asset: string,
  amount: bigint,
  onBehalfOf: string,
  interestRateMode: bigint = 2n,
  referralCode: number = 0,
): string {
  return `${AAVE_SELECTORS.borrow}${addressToHex(asset)}${uint256ToHex(amount)}${uint256ToHex(interestRateMode)}${uint256ToHex(BigInt(referralCode))}${addressToHex(onBehalfOf)}`;
}

// ---------------------------------------------------------------------------
// repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf)
// ---------------------------------------------------------------------------

/**
 * Encode Aave V3 Pool.repay() calldata.
 *
 * @param asset - ERC-20 token address to repay
 * @param amount - Amount to repay (use MAX_UINT256 for full repay)
 * @param onBehalfOf - Address whose debt will be repaid
 * @param interestRateMode - 2 = variable
 * @returns ABI-encoded calldata with 0x prefix
 */
export function encodeRepayCalldata(
  asset: string,
  amount: bigint,
  onBehalfOf: string,
  interestRateMode: bigint = 2n,
): string {
  return `${AAVE_SELECTORS.repay}${addressToHex(asset)}${uint256ToHex(amount)}${uint256ToHex(interestRateMode)}${addressToHex(onBehalfOf)}`;
}

// ---------------------------------------------------------------------------
// withdraw(address asset, uint256 amount, address to)
// ---------------------------------------------------------------------------

/**
 * Encode Aave V3 Pool.withdraw() calldata.
 *
 * @param asset - ERC-20 token address to withdraw
 * @param amount - Amount to withdraw (use MAX_UINT256 for full withdrawal)
 * @param to - Address to receive the withdrawn tokens
 * @returns ABI-encoded calldata with 0x prefix
 */
export function encodeWithdrawCalldata(
  asset: string,
  amount: bigint,
  to: string,
): string {
  return `${AAVE_SELECTORS.withdraw}${addressToHex(asset)}${uint256ToHex(amount)}${addressToHex(to)}`;
}

// ---------------------------------------------------------------------------
// approve(address spender, uint256 amount) -- ERC-20
// ---------------------------------------------------------------------------

/**
 * Encode ERC-20 approve(address spender, uint256 amount) calldata.
 *
 * @param spender - Spender address to approve
 * @param amount - Amount to approve in token's smallest unit
 * @returns ABI-encoded calldata with 0x prefix
 */
export function encodeApproveCalldata(spender: string, amount: bigint): string {
  return `${AAVE_SELECTORS.approve}${addressToHex(spender)}${uint256ToHex(amount)}`;
}

// ---------------------------------------------------------------------------
// getUserAccountData(address user) -- read
// ---------------------------------------------------------------------------

/**
 * Encode Pool.getUserAccountData(address) calldata.
 *
 * @param user - User address to query
 * @returns ABI-encoded calldata with 0x prefix
 */
export function encodeGetUserAccountDataCalldata(user: string): string {
  return `${AAVE_SELECTORS.getUserAccountData}${addressToHex(user)}`;
}

// ---------------------------------------------------------------------------
// getReserveData(address asset) -- read
// ---------------------------------------------------------------------------

/**
 * Encode PoolDataProvider.getReserveData(address) calldata.
 *
 * @param asset - Asset address to query
 * @returns ABI-encoded calldata with 0x prefix
 */
export function encodeGetReserveDataCalldata(asset: string): string {
  return `${AAVE_SELECTORS.getReserveData}${addressToHex(asset)}`;
}
