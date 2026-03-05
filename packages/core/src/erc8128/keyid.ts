/**
 * ERC-8128 keyid generation and parsing
 *
 * keyid format: erc8128:<chainId>:<checksumAddress>
 */
import { getAddress } from 'viem';

const KEYID_PREFIX = 'erc8128';

/**
 * Build an ERC-8128 keyid from chain ID and Ethereum address.
 * The address is checksum-normalized via viem's getAddress().
 */
export function buildKeyId(chainId: number, address: string): string {
  const checksumAddress = getAddress(address);
  return `${KEYID_PREFIX}:${chainId}:${checksumAddress}`;
}

/**
 * Parse an ERC-8128 keyid string into its components.
 * @throws Error if the format is invalid
 */
export function parseKeyId(keyid: string): {
  chainId: number;
  address: string;
} {
  if (!keyid) {
    throw new Error('Invalid keyid: empty string');
  }

  const parts = keyid.split(':');
  if (parts.length !== 3) {
    throw new Error(
      `Invalid keyid format: expected "erc8128:<chainId>:<address>", got "${keyid}"`,
    );
  }

  const [prefix, chainIdStr, address] = parts;

  if (prefix !== KEYID_PREFIX) {
    throw new Error(
      `Invalid keyid prefix: expected "${KEYID_PREFIX}", got "${prefix}"`,
    );
  }

  const chainId = Number(chainIdStr);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(
      `Invalid keyid chainId: expected positive integer, got "${chainIdStr}"`,
    );
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(
      `Invalid keyid address: expected 0x-prefixed 40-hex-char address, got "${address}"`,
    );
  }

  return { chainId, address };
}
