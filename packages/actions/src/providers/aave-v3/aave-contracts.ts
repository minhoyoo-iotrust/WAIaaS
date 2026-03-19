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
import {
  addressToHex,
  uint256ToHex,
  encodeApproveCalldata,
} from '../../common/contract-encoding.js';

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
  getReservesList: '0xd1946dbc',    // getReservesList() -> address[]
  // PoolDataProvider read functions
  getReserveTokensAddresses: '0xd2493b6c', // getReserveTokensAddresses(address) -> (aToken, stableDebt, variableDebt)
  // Oracle read functions
  getAssetsPrices: '0x9d23d9f2',    // getAssetsPrices(address[]) -> uint256[]
  // ERC-20
  approve: '0x095ea7b3',            // approve(address,uint256)
  balanceOf: '0x70a08231',          // balanceOf(address) -> uint256
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

// Re-export encodeApproveCalldata from common module for backward compatibility
export { encodeApproveCalldata };

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

// ---------------------------------------------------------------------------
// getReservesList() -- read (no args)
// ---------------------------------------------------------------------------

/**
 * Encode Pool.getReservesList() calldata.
 * No arguments -- just the 4-byte selector.
 *
 * @returns ABI-encoded calldata with 0x prefix
 */
export function encodeGetReservesListCalldata(): string {
  return AAVE_SELECTORS.getReservesList;
}

// ---------------------------------------------------------------------------
// balanceOf(address) -- ERC-20 read
// ---------------------------------------------------------------------------

/**
 * Encode ERC-20 balanceOf(address) calldata.
 *
 * @param account - Address to query balance for
 * @returns ABI-encoded calldata with 0x prefix
 */
export function encodeBalanceOfCalldata(account: string): string {
  return `${AAVE_SELECTORS.balanceOf}${addressToHex(account)}`;
}

// ---------------------------------------------------------------------------
// decimals() -- ERC-20 read
// ---------------------------------------------------------------------------

/**
 * Encode ERC-20 decimals() calldata.
 *
 * No arguments -- just the 4-byte selector (keccak256("decimals()") = 0x313ce567).
 *
 * @returns ABI-encoded calldata with 0x prefix
 */
export function encodeDecimalsCalldata(): string {
  return '0x313ce567'; // decimals() selector, no arguments
}

// ---------------------------------------------------------------------------
// getAssetsPrices(address[]) -- Oracle read
// ---------------------------------------------------------------------------

/**
 * Encode AaveOracle.getAssetsPrices(address[]) calldata.
 *
 * ABI layout: selector + offset(0x20) + length + addresses...
 *
 * @param assets - Array of asset addresses to query prices for
 * @returns ABI-encoded calldata with 0x prefix
 */
export function encodeGetAssetsPricesCalldata(assets: string[]): string {
  const offset = uint256ToHex(32n); // dynamic array offset = 0x20
  const length = uint256ToHex(BigInt(assets.length));
  const items = assets.map((a) => addressToHex(a)).join('');
  return `${AAVE_SELECTORS.getAssetsPrices}${offset}${length}${items}`;
}

// ---------------------------------------------------------------------------
// getReserveTokensAddresses(address) -- PoolDataProvider read
// ---------------------------------------------------------------------------

/**
 * Encode PoolDataProvider.getReserveTokensAddresses(address) calldata.
 *
 * @param asset - Underlying asset address
 * @returns ABI-encoded calldata with 0x prefix
 */
export function encodeGetReserveTokensAddressesCalldata(asset: string): string {
  return `${AAVE_SELECTORS.getReserveTokensAddresses}${addressToHex(asset)}`;
}
