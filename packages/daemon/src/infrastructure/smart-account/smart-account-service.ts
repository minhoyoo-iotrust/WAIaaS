/**
 * SmartAccountService -- creates and manages ERC-4337 smart account instances.
 *
 * Wraps viem's toSoladySmartAccount() to create SmartAccount objects from EOA signers.
 * Provides CREATE2 address prediction for lazy deployment (deployed=false until first tx).
 *
 * Uses EntryPoint v0.7 exclusively.
 *
 * @see internal/objectives/m30-06-erc4337-account-abstraction.md
 */
import {
  toSoladySmartAccount,
  entryPoint07Address,
  entryPoint07Abi,
} from 'viem/account-abstraction';
import type { SmartAccount } from 'viem/account-abstraction';
import type { Address, LocalAccount } from 'viem';

export interface SmartAccountCreateOptions {
  /** The EOA signer (owner) of the smart account */
  owner: LocalAccount;
  /** viem client for the target chain (public or wallet client) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any;
  /** Optional custom EntryPoint address (defaults to v0.7) */
  entryPoint?: Address;
}

export interface SmartAccountInfo {
  /** The predicted CREATE2 address of the smart account */
  address: Address;
  /** The EOA signer address (owner) */
  signerKey: Address;
  /** The EntryPoint contract address */
  entryPoint: Address;
  /** The viem SmartAccount instance (for later UserOp submission) */
  account: SmartAccount;
}

export class SmartAccountService {
  /**
   * Create a SmartAccount instance and predict its CREATE2 address.
   *
   * The smart account is NOT deployed on-chain yet (lazy deployment).
   * The returned address is the predicted CREATE2 address where the contract
   * will be deployed when the first UserOperation is submitted.
   */
  async createSmartAccount(opts: SmartAccountCreateOptions): Promise<SmartAccountInfo> {
    const epAddress = opts.entryPoint ?? entryPoint07Address;

    const account = await toSoladySmartAccount({
      client: opts.client,
      owner: opts.owner,
      entryPoint: {
        abi: entryPoint07Abi,
        address: epAddress,
        version: '0.7',
      },
    });

    return {
      address: account.address,
      signerKey: opts.owner.address,
      entryPoint: epAddress,
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
