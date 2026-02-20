/**
 * SignResponseHandler -- processes SignResponse from wallet apps.
 *
 * Handles approve/reject responses for PENDING_APPROVAL transactions:
 * - Validates SignResponse schema (Zod)
 * - Matches requestId to registered pending requests
 * - Checks request expiration
 * - Verifies signer address matches wallet owner
 * - Verifies cryptographic signature (EVM: EIP-191, Solana: Ed25519)
 * - Updates pending_approvals and transactions tables directly
 *
 * **Design Decision: ApprovalWorkflow bypass (intentional)**
 * SignResponseHandler directly updates pending_approvals/transactions tables,
 * bypassing ApprovalWorkflow. This is the same pattern used by Telegram bot
 * approval (/approve, /reject commands). Rationale: SignResponseHandler performs
 * its own cryptographic signature verification (SIWE/SIWS), making
 * ApprovalWorkflow's verification step redundant.
 *
 * @see internal/design/73-signing-protocol-v1.md (Section 4, 10, 11)
 * @see internal/design/74-wallet-sdk-daemon-components.md
 */

import type { Database as SQLiteDatabase } from 'better-sqlite3';
import {
  type SignRequest,
  type SignResponse,
  SignResponseSchema,
  WAIaaSError,
} from '@waiaas/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SignResponseHandlerDeps {
  /** Raw better-sqlite3 database handle for direct SQL (same pattern as Telegram bot) */
  sqlite: SQLiteDatabase;
}

export interface HandleResult {
  action: 'approved' | 'rejected';
  txId: string;
}

interface WalletRow {
  owner_address: string | null;
}

// ---------------------------------------------------------------------------
// Signature verification interfaces (injectable for testing)
// ---------------------------------------------------------------------------

/**
 * Verifies an EVM EIP-191 personal_sign signature.
 * Default implementation uses viem's verifyMessage.
 */
export type EvmVerifyFn = (params: {
  address: string;
  message: string;
  signature: string;
}) => Promise<boolean>;

/**
 * Verifies a Solana Ed25519 signature.
 * Default implementation uses @solana/kit's verifySignature.
 */
export type SolanaVerifyFn = (params: {
  publicKeyAddress: string;
  message: string;
  signature: string;
}) => Promise<boolean>;

// ---------------------------------------------------------------------------
// Default verification implementations
// ---------------------------------------------------------------------------

/**
 * Default EVM signature verification using viem.
 * Uses lazy import to avoid loading viem at module level.
 */
const defaultEvmVerify: EvmVerifyFn = async ({ address, message, signature }) => {
  const { verifyMessage } = await import('viem');
  return verifyMessage({
    address: address as `0x${string}`,
    message,
    signature: signature as `0x${string}`,
  });
};

/**
 * Default Solana signature verification using @solana/kit.
 * Decodes base64 signature, converts address to CryptoKey, verifies Ed25519.
 */
const defaultSolanaVerify: SolanaVerifyFn = async ({ publicKeyAddress, message, signature }) => {
  const { verifySignature, signatureBytes: toSignatureBytes, getPublicKeyFromAddress, address } =
    await import('@solana/kit');

  // Convert address string to CryptoKey
  const pubKey = await getPublicKeyFromAddress(address(publicKeyAddress));

  // Decode base64 signature to bytes
  const sigBytes = Buffer.from(signature, 'base64');
  const sigTyped = toSignatureBytes(new Uint8Array(sigBytes));

  // Encode message to bytes
  const messageBytes = new TextEncoder().encode(message);

  return verifySignature(pubKey, sigTyped, messageBytes);
};

// ---------------------------------------------------------------------------
// SignResponseHandler
// ---------------------------------------------------------------------------

export class SignResponseHandler {
  private readonly sqlite: SQLiteDatabase;

  /**
   * In-memory store: requestId -> { request, createdAt }.
   * Lost on daemon restart (acceptable -- 1-shot requests with expiry).
   */
  private readonly pendingRequests = new Map<
    string,
    { request: SignRequest; createdAt: Date }
  >();

  /**
   * Set of already-processed requestIds (for duplicate detection).
   * Also lost on daemon restart.
   */
  private readonly processedRequests = new Set<string>();

  /** Expiration timers by requestId */
  private readonly expirationTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Injectable verification functions (for testing) */
  private readonly evmVerify: EvmVerifyFn;
  private readonly solanaVerify: SolanaVerifyFn;

  constructor(
    deps: SignResponseHandlerDeps,
    opts?: {
      evmVerify?: EvmVerifyFn;
      solanaVerify?: SolanaVerifyFn;
    },
  ) {
    this.sqlite = deps.sqlite;
    this.evmVerify = opts?.evmVerify ?? defaultEvmVerify;
    this.solanaVerify = opts?.solanaVerify ?? defaultSolanaVerify;
  }

  // -------------------------------------------------------------------------
  // registerRequest -- store pending request for later matching
  // -------------------------------------------------------------------------

  /**
   * Register a SignRequest for later response matching.
   * Sets an expiration timer to auto-remove the request after expiresAt.
   */
  registerRequest(request: SignRequest): void {
    this.pendingRequests.set(request.requestId, {
      request,
      createdAt: new Date(),
    });

    // Set expiration timer
    const expiresAtMs = new Date(request.expiresAt).getTime();
    const timeoutMs = Math.max(0, expiresAtMs - Date.now());
    const timer = setTimeout(() => {
      this.pendingRequests.delete(request.requestId);
      this.expirationTimers.delete(request.requestId);
    }, timeoutMs);

    // Unref the timer so it doesn't prevent process exit
    if (typeof timer === 'object' && 'unref' in timer) {
      timer.unref();
    }

    this.expirationTimers.set(request.requestId, timer);
  }

  // -------------------------------------------------------------------------
  // handle -- process a SignResponse
  // -------------------------------------------------------------------------

  /**
   * Process a SignResponse: validate, match, verify signature, update DB.
   *
   * @param signResponse - The response from the wallet app
   * @returns { action: 'approved' | 'rejected', txId }
   * @throws WAIaaSError with appropriate error code on validation failure
   */
  async handle(signResponse: SignResponse): Promise<HandleResult> {
    // 1. Zod validation
    try {
      SignResponseSchema.parse(signResponse);
    } catch {
      throw new WAIaaSError('INVALID_SIGN_RESPONSE', {
        message: 'Sign response failed schema validation',
      });
    }

    const { requestId, action, signerAddress } = signResponse;

    // 2. Check if already processed (duplicate detection)
    if (this.processedRequests.has(requestId)) {
      throw new WAIaaSError('SIGN_REQUEST_ALREADY_PROCESSED', {
        message: `Sign request ${requestId} has already been processed`,
      });
    }

    // 3. Find pending request
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      throw new WAIaaSError('SIGN_REQUEST_NOT_FOUND', {
        message: `No pending sign request found for requestId: ${requestId}`,
      });
    }

    const { request } = pending;

    // 4. Check expiration
    if (new Date() > new Date(request.expiresAt)) {
      this.pendingRequests.delete(requestId);
      this.clearTimer(requestId);
      throw new WAIaaSError('SIGN_REQUEST_EXPIRED', {
        message: `Sign request ${requestId} has expired`,
      });
    }

    // 5. Verify signer address matches wallet owner
    const txId = request.metadata.txId;
    const walletRow = this.sqlite
      .prepare(
        `SELECT w.owner_address FROM wallets w
         JOIN transactions t ON t.wallet_id = w.id
         WHERE t.id = ?`,
      )
      .get(txId) as WalletRow | undefined;

    if (walletRow?.owner_address) {
      // Case-insensitive comparison for EVM addresses (0x-prefixed hex)
      const normalizedSigner = signerAddress.toLowerCase();
      const normalizedOwner = walletRow.owner_address.toLowerCase();
      if (normalizedSigner !== normalizedOwner) {
        throw new WAIaaSError('SIGNER_ADDRESS_MISMATCH', {
          message: `Signer address ${signerAddress} does not match wallet owner ${walletRow.owner_address}`,
        });
      }
    }

    // 6. Handle action
    if (action === 'approve') {
      return this.handleApprove(request, signResponse);
    } else {
      return this.handleReject(request, signResponse);
    }
  }

  // -------------------------------------------------------------------------
  // Private: handleApprove
  // -------------------------------------------------------------------------

  private async handleApprove(
    request: SignRequest,
    response: SignResponse,
  ): Promise<HandleResult> {
    const { requestId, signature, signerAddress } = response;
    const txId = request.metadata.txId;

    // Signature is required for approve
    if (!signature) {
      throw new WAIaaSError('INVALID_SIGN_RESPONSE', {
        message: 'Missing signature for approve action',
      });
    }

    // Verify cryptographic signature
    let isValid = false;
    try {
      if (request.chain === 'evm') {
        isValid = await this.evmVerify({
          address: signerAddress,
          message: request.message,
          signature,
        });
      } else if (request.chain === 'solana') {
        isValid = await this.solanaVerify({
          publicKeyAddress: signerAddress,
          message: request.message,
          signature,
        });
      }
    } catch {
      isValid = false;
    }

    if (!isValid) {
      throw new WAIaaSError('INVALID_SIGNATURE', {
        message: 'Cryptographic signature verification failed',
      });
    }

    // Direct DB update (ApprovalWorkflow bypass -- same pattern as Telegram bot)
    const now = Math.floor(Date.now() / 1000);
    this.sqlite
      .prepare(
        `UPDATE pending_approvals SET approved_at = ?, owner_signature = ?, approval_channel = 'signing_sdk'
         WHERE tx_id = ? AND approved_at IS NULL AND rejected_at IS NULL`,
      )
      .run(now, signature, txId);

    this.sqlite
      .prepare(
        `UPDATE transactions SET status = 'EXECUTING', reserved_amount = NULL, reserved_amount_usd = NULL
         WHERE id = ? AND status = 'QUEUED'`,
      )
      .run(txId);

    // Cleanup
    this.pendingRequests.delete(requestId);
    this.processedRequests.add(requestId);
    this.clearTimer(requestId);

    return { action: 'approved', txId };
  }

  // -------------------------------------------------------------------------
  // Private: handleReject
  // -------------------------------------------------------------------------

  private async handleReject(
    request: SignRequest,
    response: SignResponse,
  ): Promise<HandleResult> {
    const { requestId, signature, signerAddress } = response;
    const txId = request.metadata.txId;

    // Optional signature verification for reject
    if (signature) {
      try {
        let isValid = false;
        if (request.chain === 'evm') {
          isValid = await this.evmVerify({
            address: signerAddress,
            message: request.message,
            signature,
          });
        } else if (request.chain === 'solana') {
          isValid = await this.solanaVerify({
            publicKeyAddress: signerAddress,
            message: request.message,
            signature,
          });
        }
        if (!isValid) {
          throw new WAIaaSError('INVALID_SIGNATURE', {
            message: 'Cryptographic signature verification failed for reject action',
          });
        }
      } catch (err) {
        if (err instanceof WAIaaSError && err.code === 'INVALID_SIGNATURE') {
          throw err;
        }
        // Signature verification errors on reject are non-fatal if not INVALID_SIGNATURE
      }
    }

    // Direct DB update (ApprovalWorkflow bypass -- same pattern as Telegram bot)
    const now = Math.floor(Date.now() / 1000);
    this.sqlite
      .prepare(
        `UPDATE pending_approvals SET rejected_at = ?, approval_channel = 'signing_sdk'
         WHERE tx_id = ? AND approved_at IS NULL AND rejected_at IS NULL`,
      )
      .run(now, txId);

    this.sqlite
      .prepare(
        `UPDATE transactions SET status = 'CANCELLED', error = 'Rejected via signing SDK', reserved_amount = NULL, reserved_amount_usd = NULL
         WHERE id = ? AND status = 'QUEUED'`,
      )
      .run(txId);

    // Cleanup
    this.pendingRequests.delete(requestId);
    this.processedRequests.add(requestId);
    this.clearTimer(requestId);

    return { action: 'rejected', txId };
  }

  // -------------------------------------------------------------------------
  // Private: Timer cleanup
  // -------------------------------------------------------------------------

  private clearTimer(requestId: string): void {
    const timer = this.expirationTimers.get(requestId);
    if (timer) {
      clearTimeout(timer);
      this.expirationTimers.delete(requestId);
    }
  }

  // -------------------------------------------------------------------------
  // Cleanup: destroy (for graceful shutdown)
  // -------------------------------------------------------------------------

  /**
   * Clear all pending timers. Call during daemon shutdown.
   */
  destroy(): void {
    for (const timer of this.expirationTimers.values()) {
      clearTimeout(timer);
    }
    this.expirationTimers.clear();
    this.pendingRequests.clear();
    this.processedRequests.clear();
  }
}
