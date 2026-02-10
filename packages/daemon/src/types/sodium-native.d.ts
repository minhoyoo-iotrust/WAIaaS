/**
 * Minimal type declarations for sodium-native.
 *
 * sodium-native does not ship TypeScript types.
 * Only the APIs used by the keystore module are declared here.
 */
declare module 'sodium-native' {
  /** Size of an Ed25519 public key (32 bytes). */
  export const crypto_sign_PUBLICKEYBYTES: number;

  /** Size of an Ed25519 secret key (64 bytes: seed + public). */
  export const crypto_sign_SECRETKEYBYTES: number;

  /** Size of an Ed25519 signature (64 bytes). */
  export const crypto_sign_BYTES: number;

  /** Generate an Ed25519 keypair. */
  export function crypto_sign_keypair(publicKey: Buffer, secretKey: Buffer): void;

  /** Create a detached Ed25519 signature. */
  export function crypto_sign_detached(signature: Buffer, message: Buffer, secretKey: Buffer): void;

  /** Verify a detached Ed25519 signature. */
  export function crypto_sign_verify_detached(
    signature: Buffer,
    message: Buffer,
    publicKey: Buffer,
  ): boolean;

  /** Allocate a guarded memory buffer with guard pages. */
  export function sodium_malloc(size: number): Buffer;

  /** Zero-fill a buffer securely. */
  export function sodium_memzero(buf: Buffer): void;

  /** Set buffer to read-only mode. */
  export function sodium_mprotect_readonly(buf: Buffer): void;

  /** Set buffer to read-write mode. */
  export function sodium_mprotect_readwrite(buf: Buffer): void;

  /** Set buffer to no-access mode. */
  export function sodium_mprotect_noaccess(buf: Buffer): void;
}
