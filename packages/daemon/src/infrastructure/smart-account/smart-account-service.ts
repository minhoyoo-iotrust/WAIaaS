/**
 * SmartAccountService -- creates and manages ERC-4337 smart account instances.
 *
 * Uses permissionless.js toSimpleSmartAccount() with the v0.7 SimpleAccount factory
 * (0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985) which is deployed on most major EVM chains.
 *
 * Provides CREATE2 address prediction for lazy deployment (deployed=false until first tx).
 *
 * Uses EntryPoint v0.7 exclusively.
 *
 * @see internal/objectives/m30-06-erc4337-account-abstraction.md
 */
import { toSimpleSmartAccount } from 'permissionless/accounts';
import { entryPoint07Address } from 'viem/account-abstraction';
import type { SmartAccount } from 'viem/account-abstraction';
import type { Address, LocalAccount } from 'viem';

/**
 * Solady ERC4337Factory -- only deployed on ethereum-mainnet + ethereum-sepolia.
 * Smart Accounts created with this factory are deprecated and cannot transact on other chains.
 */
export const SOLADY_FACTORY_ADDRESS = '0x5d82735936c6Cd5DE57cC3c1A799f6B2E6F933Df' as Address;

/**
 * Default v0.7 SimpleAccount factory (eth-infinitism reference implementation).
 * Deployed on most major EVM chains including Base, Polygon, Arbitrum, Optimism, etc.
 */
export const DEFAULT_SIMPLE_ACCOUNT_FACTORY_V07 = '0x91E60e0613810449d098b0b5Ec8b51A0FE8c8985' as Address;

export interface SmartAccountCreateOptions {
  /** The EOA signer (owner) of the smart account */
  owner: LocalAccount;
  /** viem client for the target chain (public or wallet client) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any;
  /** Optional custom EntryPoint address (defaults to v0.7) */
  entryPoint?: Address;
  /** Optional custom factory address (defaults to SimpleAccount v0.7 factory) */
  factoryAddress?: Address;
}

export interface SmartAccountInfo {
  /** The predicted CREATE2 address of the smart account */
  address: Address;
  /** The EOA signer address (owner) */
  signerKey: Address;
  /** The EntryPoint contract address */
  entryPoint: Address;
  /** The factory address used to create this smart account */
  factoryAddress: Address;
  /** The viem SmartAccount instance (for later UserOp submission) */
  account: SmartAccount;
}

/**
 * Static mapping of factory addresses to known supported networks.
 * Primary source for factory network compatibility — used before runtime verification.
 */
export const FACTORY_SUPPORTED_NETWORKS: Record<string, string[]> = {
  [DEFAULT_SIMPLE_ACCOUNT_FACTORY_V07.toLowerCase()]: [
    'ethereum-mainnet', 'ethereum-sepolia',
    'base-mainnet', 'base-sepolia',
    'polygon-mainnet', 'polygon-amoy',
    'arbitrum-mainnet', 'arbitrum-sepolia',
    'optimism-mainnet', 'optimism-sepolia',
  ],
  [SOLADY_FACTORY_ADDRESS.toLowerCase()]: [
    'ethereum-mainnet', 'ethereum-sepolia',
  ],
};

/**
 * Get factory-supported networks from the static list.
 * Returns empty array for unknown (custom) factories.
 */
export function getFactorySupportedNetworks(factoryAddress: string | null): string[] {
  if (!factoryAddress) return [];
  return FACTORY_SUPPORTED_NETWORKS[factoryAddress.toLowerCase()] ?? [];
}

/** Cache entry for eth_getCode verification */
interface FactoryVerificationEntry {
  verified: boolean;
  timestamp: number;
}

/** 24-hour TTL for factory verification cache */
const FACTORY_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

export class SmartAccountService {
  /** Cache: "factoryAddress:networkId" → verification result */
  private readonly _verifyCache = new Map<string, FactoryVerificationEntry>();

  /**
   * Verify factory contract exists on a specific network via eth_getCode.
   * Results are cached with 24h TTL.
   * Returns null on RPC failure (caller should fall back to static list).
   */
  async verifyFactoryOnNetwork(
    factoryAddress: string,
    networkId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    publicClient: any,
  ): Promise<boolean | null> {
    const cacheKey = `${factoryAddress.toLowerCase()}:${networkId}`;
    const cached = this._verifyCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < FACTORY_VERIFY_TTL_MS) {
      return cached.verified;
    }

    try {
      const code: string = await publicClient.getCode({ address: factoryAddress as Address });
      const verified = !!code && code !== '0x';
      this._verifyCache.set(cacheKey, { verified, timestamp: Date.now() });
      return verified;
    } catch {
      // RPC failure — return null to signal fallback to static list
      return null;
    }
  }

  /**
   * Clear expired entries from the verification cache.
   */
  clearExpiredCache(): void {
    const now = Date.now();
    for (const [key, entry] of this._verifyCache) {
      if (now - entry.timestamp >= FACTORY_VERIFY_TTL_MS) {
        this._verifyCache.delete(key);
      }
    }
  }

  /**
   * Create a SmartAccount instance and predict its CREATE2 address.
   *
   * The smart account is NOT deployed on-chain yet (lazy deployment).
   * The returned address is the predicted CREATE2 address where the contract
   * will be deployed when the first UserOperation is submitted.
   */
  async createSmartAccount(opts: SmartAccountCreateOptions): Promise<SmartAccountInfo> {
    const epAddress = opts.entryPoint ?? entryPoint07Address;
    const factory = opts.factoryAddress ?? DEFAULT_SIMPLE_ACCOUNT_FACTORY_V07;

    const account = await toSimpleSmartAccount({
      client: opts.client,
      owner: opts.owner,
      factoryAddress: factory,
      entryPoint: {
        address: epAddress,
        version: '0.7',
      },
    });

    return {
      address: account.address,
      signerKey: opts.owner.address,
      entryPoint: epAddress,
      factoryAddress: factory,
      account,
    };
  }

  /**
   * Get the default EntryPoint v0.7 address.
   */
  getDefaultEntryPoint(): Address {
    return entryPoint07Address;
  }
}
