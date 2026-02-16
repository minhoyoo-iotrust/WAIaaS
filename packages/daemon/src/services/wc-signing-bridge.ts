/**
 * WcSigningBridge - Fire-and-forget WC signing request bridge.
 *
 * When an APPROVAL tier transaction is created and the wallet has an active
 * WalletConnect session, this bridge sends a signing request to the Owner
 * wallet (via personal_sign for EVM / solana_signMessage for Solana).
 *
 * On successful signature response, it verifies the signature using the
 * existing ownerAuth verification logic (verifySIWE / Ed25519) and calls
 * approvalWorkflow.approve() or .reject() accordingly.
 *
 * Key design decisions:
 *   - Fire-and-forget: requestSignature() is called with `void` prefix,
 *     never blocking the pipeline.
 *   - Timeout sync: WC request expiry is derived from pending_approvals.expires_at.
 *   - Optional dependency: Pipeline works without WcSigningBridge (checked via ctx.wcSigningBridge?.)
 *
 * @see packages/daemon/src/pipeline/stages.ts (stage4Wait APPROVAL branch)
 * @see packages/daemon/src/services/wc-session-service.ts
 * @see packages/daemon/src/workflow/approval-workflow.ts
 */

import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import type { Database } from 'better-sqlite3';
import { createSiweMessage } from 'viem/siwe';
import type { EventBus } from '@waiaas/core';
import { verifySIWE } from '../api/middleware/siwe-verify.js';
import { decodeBase58 } from '../api/middleware/address-validation.js';
import type { WcSessionService } from './wc-session-service.js';
import type { ApprovalWorkflow } from '../workflow/approval-workflow.js';
import type { NotificationService } from '../notifications/notification-service.js';

type SodiumNative = typeof import('sodium-native');

const require = createRequire(import.meta.url);

function loadSodium(): SodiumNative {
  return require('sodium-native') as SodiumNative;
}

// ---------------------------------------------------------------------------
// WC error code constants
// ---------------------------------------------------------------------------

/** WC user rejection error codes (4001 = standard, 5000 = legacy) */
const WC_USER_REJECTED = [4001, 5000];
/** WC request expired error code */
const WC_REQUEST_EXPIRED = 8000;

// ---------------------------------------------------------------------------
// Base58 encode (Bitcoin alphabet) -- inline to avoid import of unexported fn
// ---------------------------------------------------------------------------

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58(buf: Buffer): string {
  let zeroes = 0;
  for (let i = 0; i < buf.length && buf[i] === 0; i++) {
    zeroes++;
  }

  const size = Math.ceil((buf.length * 138) / 100) + 1;
  const b58 = new Uint8Array(size);
  let length = 0;

  for (let i = zeroes; i < buf.length; i++) {
    let carry = buf[i]!;
    let j = 0;
    for (let k = size - 1; k >= 0 && (carry !== 0 || j < length); k--, j++) {
      carry += 256 * (b58[k] ?? 0);
      b58[k] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    length = j;
  }

  let start = size - length;
  while (start < size && b58[start] === 0) {
    start++;
  }

  let result = '1'.repeat(zeroes);
  for (let i = start; i < size; i++) {
    result += BASE58_ALPHABET[b58[i]!];
  }

  return result;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WcSigningBridgeDeps {
  wcSessionService: WcSessionService;
  approvalWorkflow: ApprovalWorkflow;
  sqlite: Database;
  notificationService?: NotificationService;
  eventBus?: EventBus;
}

interface SignRequest {
  message: string;
  method: string;
  params: unknown;
}

// ---------------------------------------------------------------------------
// WcSigningBridge
// ---------------------------------------------------------------------------

export class WcSigningBridge {
  private readonly wcSessionService: WcSessionService;
  private readonly approvalWorkflow: ApprovalWorkflow;
  private readonly sqlite: Database;
  private readonly notificationService?: NotificationService;
  private readonly eventBus?: EventBus;

  constructor(deps: WcSigningBridgeDeps) {
    this.wcSessionService = deps.wcSessionService;
    this.approvalWorkflow = deps.approvalWorkflow;
    this.sqlite = deps.sqlite;
    this.notificationService = deps.notificationService;
    this.eventBus = deps.eventBus;
  }

  /**
   * Send a WC signing request to the Owner wallet (fire-and-forget).
   *
   * Silently returns if WC is not initialized or no session exists.
   * On signature response: verify + approve/reject via ApprovalWorkflow.
   * On error: reject if user-rejected, ignore if expired (approval-expired worker handles it).
   */
  async requestSignature(walletId: string, txId: string, chain: string): Promise<void> {
    try {
      // Guard: WC not initialized
      const signClient = this.wcSessionService.getSignClient();
      if (!signClient) {
        this.fallbackToTelegram(walletId, txId, 'wc_not_initialized');
        return;
      }

      // Guard: no session for this wallet
      const topic = this.wcSessionService.getSessionTopic(walletId);
      if (!topic) {
        this.fallbackToTelegram(walletId, txId, 'no_wc_session');
        return;
      }

      // Guard: no session info (should not happen if topic exists, but defensive)
      const sessionInfo = this.wcSessionService.getSessionInfo(walletId);
      if (!sessionInfo) {
        this.fallbackToTelegram(walletId, txId, 'no_session_info');
        return;
      }

      const { ownerAddress, chainId } = sessionInfo;

      // Build chain-specific signing request
      const signRequest = this.buildSignRequest(chain, ownerAddress, txId, chainId);

      // Update approval_channel to 'walletconnect'
      this.sqlite
        .prepare(
          `UPDATE pending_approvals SET approval_channel = 'walletconnect'
           WHERE tx_id = ? AND approved_at IS NULL AND rejected_at IS NULL`,
        )
        .run(txId);

      // Calculate WC expiry from pending_approvals.expires_at
      const timeoutSeconds = this.resolveWcExpiry(txId);

      // Send WC signing request
      const result = await signClient.request({
        topic,
        chainId,
        request: {
          method: signRequest.method,
          params: signRequest.params,
        },
        expiry: timeoutSeconds,
      });

      // Handle successful signature response
      await this.handleSignatureResponse(
        chain, walletId, txId, signRequest.message, result, ownerAddress,
      );
    } catch (error: any) {
      // Handle WC errors (rejection, timeout, etc.)
      this.handleSignatureError(walletId, txId, error);
    }
  }

  // -------------------------------------------------------------------------
  // Private: build chain-specific signing request
  // -------------------------------------------------------------------------

  private buildSignRequest(
    chain: string,
    ownerAddress: string,
    txId: string,
    chainId: string,
  ): SignRequest {
    if (chain === 'ethereum') {
      return this.buildEvmSignRequest(ownerAddress, txId, chainId);
    }
    return this.buildSolanaSignRequest(ownerAddress, txId);
  }

  private buildEvmSignRequest(
    ownerAddress: string,
    txId: string,
    chainId: string,
  ): SignRequest {
    const nonce = randomBytes(16).toString('hex');
    const numericChainId = parseInt(chainId.split(':')[1] ?? '1', 10);

    const siweMessage = createSiweMessage({
      domain: 'waiaas.local',
      address: ownerAddress as `0x${string}`,
      uri: 'http://localhost:3000',
      version: '1',
      chainId: numericChainId,
      nonce,
      statement: `Approve transaction ${txId}`,
      expirationTime: new Date(Date.now() + 300_000),
    });

    // personal_sign params: [hexMessage, address]
    const hexMessage = '0x' + Buffer.from(siweMessage, 'utf8').toString('hex');
    const params = [hexMessage, ownerAddress];

    return { message: siweMessage, method: 'personal_sign', params };
  }

  private buildSolanaSignRequest(
    ownerAddress: string,
    txId: string,
  ): SignRequest {
    const message = `WAIaaS: Approve transaction ${txId}`;

    // WC Solana spec: base58-encoded message bytes
    const base58Message = encodeBase58(Buffer.from(message, 'utf8'));

    const params = { message: base58Message, pubkey: ownerAddress };

    return { message, method: 'solana_signMessage', params };
  }

  // -------------------------------------------------------------------------
  // Private: resolve WC expiry from pending_approvals
  // -------------------------------------------------------------------------

  private resolveWcExpiry(txId: string): number {
    try {
      const row = this.sqlite
        .prepare(
          `SELECT expires_at FROM pending_approvals
           WHERE tx_id = ? AND approved_at IS NULL AND rejected_at IS NULL`,
        )
        .get(txId) as { expires_at: number } | undefined;

      if (row) {
        const now = Math.floor(Date.now() / 1000);
        const remaining = row.expires_at - now;
        // WC requires positive expiry; minimum 60s to avoid instant expiry
        return Math.max(remaining, 60);
      }
    } catch {
      // Fallback on query error
    }
    return 300; // 5 minutes default
  }

  // -------------------------------------------------------------------------
  // Private: handle signature response (verify + approve)
  // -------------------------------------------------------------------------

  private async handleSignatureResponse(
    chain: string,
    _walletId: string,
    txId: string,
    message: string,
    result: unknown,
    ownerAddress: string,
  ): Promise<void> {
    if (chain === 'ethereum') {
      await this.handleEvmSignatureResponse(txId, message, result, ownerAddress);
    } else {
      this.handleSolanaSignatureResponse(txId, message, result, ownerAddress);
    }
  }

  private async handleEvmSignatureResponse(
    txId: string,
    message: string,
    result: unknown,
    ownerAddress: string,
  ): Promise<void> {
    // result is 0x-prefixed hex signature string
    const signature = typeof result === 'string' ? result : '';

    const verification = await verifySIWE({
      message,
      signature,
      expectedAddress: ownerAddress,
    });

    if (verification.valid) {
      try {
        this.approvalWorkflow.approve(txId, signature);
      } catch (err) {
        console.warn(`[WcSigningBridge] approve failed for ${txId}:`, err);
      }
    } else {
      console.warn(
        `[WcSigningBridge] EVM signature verification failed for ${txId}: ${verification.error}`,
      );
      // Do NOT reject -- Owner may retry via REST API or WC
    }
  }

  private handleSolanaSignatureResponse(
    txId: string,
    message: string,
    result: unknown,
    ownerAddress: string,
  ): void {
    // result is { signature: 'base58-string' } or raw string
    const resultObj = result as { signature?: string } | string;
    const sig58 = typeof resultObj === 'string'
      ? resultObj
      : (resultObj?.signature ?? '');

    if (!sig58) {
      console.warn(`[WcSigningBridge] Empty Solana signature for ${txId}`);
      return;
    }

    try {
      // Convert base58 signature to base64 (ownerAuth expects base64)
      const signatureBytes = decodeBase58(sig58);
      const base64Sig = signatureBytes.toString('base64');

      // Ed25519 verification (reuse owner-auth.ts pattern)
      const sodium = loadSodium();
      const messageBytes = Buffer.from(message, 'utf8');
      const publicKeyBytes = decodeBase58(ownerAddress);

      const valid = sodium.crypto_sign_verify_detached(signatureBytes, messageBytes, publicKeyBytes);

      if (valid) {
        try {
          this.approvalWorkflow.approve(txId, base64Sig);
        } catch (err) {
          console.warn(`[WcSigningBridge] approve failed for ${txId}:`, err);
        }
      } else {
        console.warn(`[WcSigningBridge] Solana Ed25519 verification failed for ${txId}`);
        // Do NOT reject -- Owner may retry
      }
    } catch (err) {
      console.warn(`[WcSigningBridge] Solana signature handling error for ${txId}:`, err);
    }
  }

  // -------------------------------------------------------------------------
  // Private: handle WC errors
  // -------------------------------------------------------------------------

  private handleSignatureError(walletId: string, txId: string, error: any): void {
    const errorCode = error?.code;

    if (typeof errorCode === 'number' && WC_USER_REJECTED.includes(errorCode)) {
      // User rejected in wallet -- reject the approval
      try {
        this.approvalWorkflow.reject(txId);
        // Update approval_channel to reflect rejection came via WC
        this.sqlite
          .prepare(
            `UPDATE pending_approvals SET approval_channel = 'walletconnect'
             WHERE tx_id = ? AND rejected_at IS NOT NULL`,
          )
          .run(txId);
      } catch (err) {
        console.warn(`[WcSigningBridge] reject failed for ${txId}:`, err);
      }
      return;
    }

    if (errorCode === WC_REQUEST_EXPIRED) {
      // Request expired -- fallback to Telegram if approval still pending
      console.warn(`[WcSigningBridge] WC request expired for ${txId}`);
      this.fallbackToTelegram(walletId, txId, 'wc_timeout');
      return;
    }

    // Other errors -- fallback to Telegram if approval still pending
    console.warn(`[WcSigningBridge] WC signing error for ${txId}:`, error?.message ?? error);
    this.fallbackToTelegram(walletId, txId, 'wc_error');
  }

  // -------------------------------------------------------------------------
  // Private: check if approval is still pending
  // -------------------------------------------------------------------------

  private isApprovalStillPending(txId: string): boolean {
    const row = this.sqlite
      .prepare(
        'SELECT 1 FROM pending_approvals WHERE tx_id = ? AND approved_at IS NULL AND rejected_at IS NULL',
      )
      .get(txId);
    return !!row;
  }

  // -------------------------------------------------------------------------
  // Private: fallback to Telegram channel
  // -------------------------------------------------------------------------

  private fallbackToTelegram(walletId: string, txId: string, reason: string): void {
    // Only act if approval is still pending
    if (!this.isApprovalStillPending(txId)) return;

    // Update approval_channel to 'telegram'
    this.sqlite
      .prepare(
        `UPDATE pending_approvals SET approval_channel = 'telegram'
         WHERE tx_id = ? AND approved_at IS NULL AND rejected_at IS NULL`,
      )
      .run(txId);

    // Emit EventBus event
    this.eventBus?.emit('approval:channel-switched', {
      walletId,
      txId,
      fromChannel: 'walletconnect',
      toChannel: 'telegram',
      reason,
      timestamp: Math.floor(Date.now() / 1000),
    });

    // Send channel-switched notification
    void this.notificationService?.notify(
      'APPROVAL_CHANNEL_SWITCHED',
      walletId,
      { from_channel: 'walletconnect', to_channel: 'telegram', reason },
      { txId },
    );

    console.log(`[WcSigningBridge] Fallback to Telegram for ${txId}: ${reason}`);
  }
}
