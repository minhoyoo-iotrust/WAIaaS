import type { ChainType } from '../enums/chain.js';

/**
 * Local keystore interface.
 * Manages cryptographic key pairs with AES-256-GCM encryption and Argon2id KDF.
 * Keys are stored as per-agent JSON files in ~/.waiaas/keystore/.
 *
 * Design reference: 26-keystore-spec.md
 */
export interface ILocalKeyStore {
  /** Generate a key pair and store encrypted with master password. */
  generateKeyPair(
    agentId: string,
    chain: ChainType,
    masterPassword: string,
  ): Promise<{
    publicKey: string;
    encryptedPrivateKey: Uint8Array;
  }>;

  /** Decrypt private key from keystore (returns guarded memory). */
  decryptPrivateKey(agentId: string, masterPassword: string): Promise<Uint8Array>;

  /** Safely release private key from memory (zero-fill). */
  releaseKey(key: Uint8Array): void;

  /** Check if keystore file exists for an agent. */
  hasKey(agentId: string): Promise<boolean>;

  /** Delete keystore file for an agent. */
  deleteKey(agentId: string): Promise<void>;
}
