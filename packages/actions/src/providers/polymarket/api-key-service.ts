/**
 * PolymarketApiKeyService: Lazy API Key creation + encrypted storage.
 *
 * API keys are created on first CLOB operation per wallet and stored
 * with master-password-based encryption for secret and passphrase.
 *
 * @see design doc 80, Section 3.3
 */
import type { Hex } from 'viem';
import { PolymarketSigner } from './signer.js';
import type { PolymarketClobClient, ApiCredentials } from './clob-client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Database row for polymarket_api_keys */
export interface PolymarketApiKeyRow {
  id: string;
  wallet_id: string;
  api_key: string;
  api_secret_encrypted: string;
  api_passphrase_encrypted: string;
  signature_type: number;
  proxy_address: string | null;
  created_at: number;
}

/** Minimal DB interface for API key operations */
export interface ApiKeyDb {
  getApiKeyByWalletId(walletId: string): PolymarketApiKeyRow | null;
  insertApiKey(row: Omit<PolymarketApiKeyRow, 'created_at'>): void;
  deleteApiKeyByWalletId(walletId: string): void;
}

/** Encrypt/decrypt function signatures */
export type EncryptFn = (plaintext: string) => string;
export type DecryptFn = (ciphertext: string) => string;

/** UUID v7 generator */
export type UuidFn = () => string;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Manages Polymarket CLOB API credentials per wallet.
 * Lazy creation on first use, encrypted storage for secret + passphrase.
 */
export class PolymarketApiKeyService {
  constructor(
    private readonly clobClient: PolymarketClobClient,
    private readonly db: ApiKeyDb,
    private readonly encrypt: EncryptFn,
    private readonly decrypt: DecryptFn,
    private readonly generateId: UuidFn = () => crypto.randomUUID(),
  ) {}

  /**
   * Ensure API keys exist for a wallet. Create if not found.
   * Returns decrypted credentials ready for HMAC header generation.
   */
  async ensureApiKeys(
    walletId: string,
    walletAddress: Hex,
    privateKey: Hex,
  ): Promise<ApiCredentials> {
    // Check DB first
    const existing = this.db.getApiKeyByWalletId(walletId);
    if (existing) {
      return {
        apiKey: existing.api_key,
        secret: this.decrypt(existing.api_secret_encrypted),
        passphrase: this.decrypt(existing.api_passphrase_encrypted),
      };
    }

    // Create new API key via L1 auth
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await PolymarketSigner.signClobAuth(
      walletAddress,
      timestamp,
      0n,
      privateKey,
    );

    const creds = await this.clobClient.createApiKey(
      walletAddress,
      signature,
      timestamp,
    );

    // Encrypt and store
    this.db.insertApiKey({
      id: this.generateId(),
      wallet_id: walletId,
      api_key: creds.apiKey,
      api_secret_encrypted: this.encrypt(creds.secret),
      api_passphrase_encrypted: this.encrypt(creds.passphrase),
      signature_type: 0,
      proxy_address: null,
    });

    return creds;
  }

  /**
   * Get existing API keys for a wallet (decrypted). Returns null if not found.
   */
  getApiKeys(walletId: string): ApiCredentials | null {
    const row = this.db.getApiKeyByWalletId(walletId);
    if (!row) return null;

    return {
      apiKey: row.api_key,
      secret: this.decrypt(row.api_secret_encrypted),
      passphrase: this.decrypt(row.api_passphrase_encrypted),
    };
  }

  /**
   * Delete API keys for a wallet (both CLOB-side and DB-side).
   */
  async deleteApiKeys(
    walletId: string,
    walletAddress: Hex,
    privateKey: Hex,
  ): Promise<void> {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = await PolymarketSigner.signClobAuth(
      walletAddress,
      timestamp,
      0n,
      privateKey,
    );

    await this.clobClient.deleteApiKey(walletAddress, signature, timestamp);
    this.db.deleteApiKeyByWalletId(walletId);
  }
}
