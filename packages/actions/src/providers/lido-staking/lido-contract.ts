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
import {
  addressToHex,
  uint256ToHex,
  encodeApproveCalldata,
} from '../../common/contract-encoding.js';

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

// Re-export encodeApproveCalldata from common module for backward compatibility
export { encodeApproveCalldata };

// ---------------------------------------------------------------------------
// wstETH contract addresses
// ---------------------------------------------------------------------------

/** wstETH mainnet contract address. */
export const WSTETH_MAINNET = '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0';

/** wstETH Sepolia testnet contract address (deprecated by Lido, but contracts still readable). */
export const WSTETH_SEPOLIA = '0xB82381A3fBD3FaFA77B3a7bE693342618240067b';

// ---------------------------------------------------------------------------
// Multichain contract config (MCHN-01, MCHN-04)
// ---------------------------------------------------------------------------

export interface LidoNetworkContracts {
  stethAddress: string;
  wstethAddress: string;
  caip2: string; // e.g. 'eip155:1'
}

/**
 * Lido wstETH is deployed on these 5 EVM mainnets.
 * Scroll omitted: not a WAIaaS NetworkType.
 */
export const LIDO_NETWORK_CONFIG: Record<string, LidoNetworkContracts> = {
  'ethereum-mainnet': {
    stethAddress: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
    wstethAddress: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
    caip2: 'eip155:1',
  },
  'base-mainnet': {
    stethAddress: '', // stETH not on Base, only wstETH
    wstethAddress: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452',
    caip2: 'eip155:8453',
  },
  'arbitrum-mainnet': {
    stethAddress: '',
    wstethAddress: '0x5979D7b546E38E414F7E9822514be443A4800529',
    caip2: 'eip155:42161',
  },
  'optimism-mainnet': {
    stethAddress: '',
    wstethAddress: '0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb',
    caip2: 'eip155:10',
  },
  'polygon-mainnet': {
    stethAddress: '',
    wstethAddress: '0x03b54A6e9a984069379fae1a4fC4dBAE93B3bCCD',
    caip2: 'eip155:137',
  },
};

/**
 * Testnet config (Sepolia — deprecated by Lido, but contracts still readable).
 */
export const LIDO_TESTNET_NETWORK_CONFIG: Record<string, LidoNetworkContracts> = {
  'ethereum-sepolia': {
    stethAddress: '0x3e3FE7dBc6B4C189E7128855dD526361c49b40Af',
    wstethAddress: '0xB82381A3fBD3FaFA77B3a7bE693342618240067b',
    caip2: 'eip155:11155111',
  },
};

// ---------------------------------------------------------------------------
// balanceOf(address) -- function selector 0x70a08231
// ---------------------------------------------------------------------------

/**
 * Encode ERC-20 balanceOf(address) calldata.
 *
 * @param address - 0x-prefixed Ethereum address
 * @returns ABI-encoded calldata with 0x prefix
 */
export function encodeBalanceOfCalldata(address: string): string {
  const selector = '0x70a08231';
  const paddedAddress = addressToHex(address);
  return `${selector}${paddedAddress}`;
}

// ---------------------------------------------------------------------------
// stEthPerToken() -- function selector 0x035faf82
// ---------------------------------------------------------------------------

/**
 * Encode wstETH stEthPerToken() view function calldata.
 * No arguments, returns the current stETH:wstETH exchange rate.
 *
 * @returns 4-byte selector with 0x prefix
 */
export function encodeStEthPerTokenCalldata(): string {
  return '0x035faf82';
}

// ---------------------------------------------------------------------------
// Decode uint256 result from eth_call
// ---------------------------------------------------------------------------

/**
 * Parse a raw eth_call result (0x-prefixed hex) into a bigint.
 *
 * @param hex - 0x-prefixed hex string from eth_call result
 * @returns Decoded bigint value
 */
export function decodeUint256Result(hex: string): bigint {
  const stripped = hex.startsWith('0x') ? hex.slice(2) : hex;
  return BigInt('0x' + stripped);
}
