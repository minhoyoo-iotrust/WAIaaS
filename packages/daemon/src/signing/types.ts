/**
 * ISignerCapability interface and SigningParams 7-variant discriminated union.
 *
 * SSoT: doc-81 D2.1~D2.2 (External Action Framework design).
 *
 * @since v31.12
 */
import type { SigningScheme } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Signing result
// ---------------------------------------------------------------------------

/** Result of a signing operation. */
export interface SigningResult {
  /** The signature output (hex string, base64 string, or raw bytes). */
  signature: string | Uint8Array;
  /** Optional metadata (e.g., headers for ERC-8128). */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// ISignerCapability interface (doc-81 D2.1)
// ---------------------------------------------------------------------------

/**
 * Capability interface for a single signing scheme.
 * Each implementation handles one specific signing algorithm.
 */
export interface ISignerCapability {
  /** The signing scheme this capability handles. */
  readonly scheme: SigningScheme;
  /** Check if this capability can handle the given params. */
  canSign(params: SigningParams): boolean;
  /** Perform the signing operation. */
  sign(params: SigningParams): Promise<SigningResult>;
}

// ---------------------------------------------------------------------------
// SigningParams 7-variant discriminated union (doc-81 D2.2)
// ---------------------------------------------------------------------------

/** EIP-712 typed data signing params. */
export interface Eip712SigningParams {
  scheme: 'eip712';
  privateKey: `0x${string}`;
  domain: Record<string, unknown>;
  types: Record<string, Array<{ name: string; type: string }>>;
  primaryType: string;
  value: Record<string, unknown>;
}

/** personal_sign (EIP-191) params. */
export interface PersonalSigningParams {
  scheme: 'personal';
  privateKey: `0x${string}`;
  message: string;
}

/** HMAC-SHA256 signing params. */
export interface HmacSigningParams {
  scheme: 'hmac-sha256';
  secret: string;
  data: string;
  encoding?: 'hex' | 'base64';
}

/** RSA-PSS signing params. */
export interface RsaPssSigningParams {
  scheme: 'rsa-pss';
  privateKey: string;
  data: string;
  saltLength?: number;
}

/** ECDSA secp256k1 raw signing params. */
export interface EcdsaSecp256k1SigningParams {
  scheme: 'ecdsa-secp256k1';
  privateKey: `0x${string}`;
  data: string;
  /** If true (default), hash data with keccak256 before signing. */
  hashData?: boolean;
}

/** Ed25519 signing params. */
export interface Ed25519SigningParams {
  scheme: 'ed25519';
  privateKey: Uint8Array;
  data: Uint8Array;
}

/** ERC-8128 HTTP message signing params. */
export interface Erc8128SigningParams {
  scheme: 'erc8128';
  privateKey: `0x${string}`;
  chainId: number;
  address: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  coveredComponents?: string[];
  preset?: 'minimal' | 'standard' | 'strict';
  ttlSec?: number;
  nonce?: string | false;
}

/** Discriminated union of all 7 signing param variants. */
export type SigningParams =
  | Eip712SigningParams
  | PersonalSigningParams
  | HmacSigningParams
  | RsaPssSigningParams
  | EcdsaSecp256k1SigningParams
  | Ed25519SigningParams
  | Erc8128SigningParams;
