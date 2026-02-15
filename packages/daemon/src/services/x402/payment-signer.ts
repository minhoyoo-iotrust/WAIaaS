/**
 * Payment Signer -- x402 chain-specific payment signature generation.
 *
 * Stub file for TDD RED phase. Will be implemented in GREEN phase.
 */

import type { PaymentRequirements } from '@x402/core/types';

/** Minimal keystore interface for payment signing. */
export interface PaymentKeyStore {
  decryptPrivateKey(walletId: string, masterPassword: string): Promise<Uint8Array>;
  releaseKey(key: Uint8Array): void;
}

/** EIP-712 domain for USDC contracts. */
export interface Eip712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: string;
}

/** USDC domain table keyed by CAIP-2 network identifier. */
export const USDC_DOMAINS: Record<string, Eip712Domain> = {};

/**
 * Sign a payment based on chain-specific strategy.
 * Delegates to signEip3009 (EVM) or signSolanaTransferChecked (Solana).
 */
export async function signPayment(
  _requirements: PaymentRequirements,
  _keyStore: PaymentKeyStore,
  _walletId: string,
  _walletAddress: string,
  _masterPassword: string,
  _rpc?: unknown,
): Promise<Record<string, unknown>> {
  throw new Error('Not implemented');
}

/**
 * Sign EVM EIP-3009 transferWithAuthorization via EIP-712 signTypedData.
 */
export async function signEip3009(
  _requirements: PaymentRequirements,
  _privateKey: Uint8Array,
  _walletAddress: string,
): Promise<Record<string, unknown>> {
  throw new Error('Not implemented');
}

/**
 * Sign Solana SPL TransferChecked as partial signature (feePayer = noopSigner).
 */
export async function signSolanaTransferChecked(
  _requirements: PaymentRequirements,
  _privateKey: Uint8Array,
  _walletAddress: string,
  _rpc: unknown,
): Promise<Record<string, unknown>> {
  throw new Error('Not implemented');
}
