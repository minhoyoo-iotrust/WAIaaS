import type { ChainType } from '../enums/chain.js';

/**
 * Local keystore interface.
 * Manages cryptographic key pairs with AES-256-GCM encryption and Argon2id KDF.
 * Keys are stored as per-wallet JSON files in ~/.waiaas/keystore/.
 *
 * Design reference: 26-keystore-spec.md
 */
export interface ILocalKeyStore {
  /** Generate a key pair and store encrypted with master password. */
  generateKeyPair(
    walletId: string,
    chain: ChainType,
    network: string,
    masterPassword: string,
  ): Promise<{
    publicKey: string;
    encryptedPrivateKey: Uint8Array;
  }>;

  /** Decrypt private key from keystore (returns guarded memory). */
  decryptPrivateKey(walletId: string, masterPassword: string): Promise<Uint8Array>;

  /** Safely release private key from memory (zero-fill). */
  releaseKey(key: Uint8Array): void;

  /** Check if keystore file exists for a wallet. */
  hasKey(walletId: string): Promise<boolean>;

  /** Delete keystore file for a wallet. */
  deleteKey(walletId: string): Promise<void>;
}
