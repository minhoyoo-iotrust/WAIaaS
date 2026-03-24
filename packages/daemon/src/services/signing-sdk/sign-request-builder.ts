/**
 * SignRequestBuilder -- builds SignRequest objects for PENDING_APPROVAL transactions.
 *
 * Transforms transaction metadata into a SignRequest with a signing message
 * (doc 73 Section 5 template), response channel config, and a universal link URL
 * for the target wallet app.
 *
 * Intentionally does NOT go through ApprovalWorkflow -- SignRequestBuilder is
 * invoked *after* the pipeline has already set the transaction to PENDING_APPROVAL
 * state. It produces the data needed to notify the owner via Push Relay/Telegram channels.
 *
 * @see internal/design/73-signing-protocol-v1.md (Section 3, 5)
 * @see internal/design/74-wallet-sdk-daemon-components.md
 */

import {
  type ChainType,
  type NetworkType,
  type SignRequest,
  SignRequestSchema,
  WAIaaSError,
  networkToCaip2,
} from '@waiaas/core';
import type { SettingsService } from '../../infrastructure/settings/settings-service.js';
import type { WalletLinkRegistry } from './wallet-link-registry.js';
import { generateId } from '../../infrastructure/database/id.js';
import type Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BuildRequestParams {
  txId: string;
  chain: ChainType;
  network: string;
  type: string;
  from: string;
  to: string;
  amount?: string;
  symbol?: string;
  policyTier: 'APPROVAL' | 'DELAY';
  walletName?: string;
  /** EIP-712 approval type constraint: restricts channels to WC/REST only. */
  approvalType?: 'SIWE' | 'EIP712';
  /** Owner wallet address that should sign the approval. Looked up from DB if omitted. */
  signerAddress?: string;
}

export interface BuildRequestResult {
  request: SignRequest;
  universalLinkUrl: string;
  requestTopic: string;
}

// ---------------------------------------------------------------------------
// SignRequestBuilder
// ---------------------------------------------------------------------------

export class SignRequestBuilder {
  private readonly settings: SettingsService;
  private readonly walletLinkRegistry: WalletLinkRegistry;
  private readonly sqlite?: Database.Database;

  constructor(opts: {
    settingsService: SettingsService;
    walletLinkRegistry: WalletLinkRegistry;
    sqlite?: Database.Database;
  }) {
    this.settings = opts.settingsService;
    this.walletLinkRegistry = opts.walletLinkRegistry;
    this.sqlite = opts.sqlite;
  }

  // -------------------------------------------------------------------------
  // buildRequest
  // -------------------------------------------------------------------------

  /**
   * Build a SignRequest from a PENDING_APPROVAL transaction.
   *
   * @param params - Transaction metadata
   * @returns The SignRequest, universal link URL, and request topic
   * @throws WAIaaSError('SIGNING_SDK_DISABLED') if signing SDK is disabled
   * @throws WAIaaSError('WALLET_NOT_REGISTERED') if no wallet is configured
   */
  buildRequest(params: BuildRequestParams): BuildRequestResult {
    // 1. Check signing SDK enabled
    const enabled = this.settings.get('signing_sdk.enabled');
    if (enabled !== 'true') {
      throw new WAIaaSError('SIGNING_SDK_DISABLED');
    }

    // 2. Determine wallet name
    const walletName =
      params.walletName ||
      this.settings.get('signing_sdk.preferred_wallet') ||
      undefined;

    if (!walletName) {
      throw new WAIaaSError('WALLET_NOT_REGISTERED', {
        message: 'No wallet name specified and no preferred_wallet configured',
      });
    }

    // 3. Verify wallet exists (throws WALLET_NOT_REGISTERED if not found)
    this.walletLinkRegistry.getWallet(walletName);

    // 4. Generate requestId (UUID v7)
    const requestId = generateId();

    // 5. Build signing message (doc 73 Section 5 template)
    const now = new Date();
    const message = this.buildSigningMessage(params, params.network, requestId, now);

    // 6. Build display message (concise human-readable version)
    const displayMessage = this.buildDisplayMessage(params);

    // 7. Calculate expiresAt from settings, clamped to approval remaining time (#442)
    const expiryMinStr = this.settings.get('signing_sdk.request_expiry_min');
    const expiryMin = parseInt(expiryMinStr, 10) || 30;
    let effectiveExpiryMs = expiryMin * 60 * 1000;

    if (this.sqlite) {
      const approvalRow = this.sqlite.prepare(
        'SELECT expires_at FROM pending_approvals WHERE tx_id = ? AND approved_at IS NULL AND rejected_at IS NULL',
      ).get(params.txId) as { expires_at: number } | undefined;
      if (approvalRow) {
        const approvalRemainingMs = approvalRow.expires_at * 1000 - now.getTime();
        if (approvalRemainingMs > 0) {
          effectiveExpiryMs = Math.min(effectiveExpiryMs, approvalRemainingMs);
        } else {
          // Approval already expired — use minimal expiry
          effectiveExpiryMs = 1000;
        }
      }
    }

    const expiresAt = new Date(now.getTime() + effectiveExpiryMs);

    // 8. Determine response channel
    const preferredChannel = this.settings.get('signing_sdk.preferred_channel');

    let responseChannel: SignRequest['responseChannel'];

    if (preferredChannel === 'telegram') {
      // Telegram channel -- bot username from telegram settings
      const botToken = this.settings.get('telegram.bot_token');
      responseChannel = {
        type: 'telegram' as const,
        botUsername: botToken ? 'waiaas_bot' : 'waiaas_bot',
      };
    } else {
      // Default: Push Relay channel
      // push_relay_url is looked up from wallet_apps table
      let pushRelayUrl = '';
      if (this.sqlite) {
        const appRow = this.sqlite.prepare(
          'SELECT push_relay_url FROM wallet_apps WHERE name = ?',
        ).get(walletName) as { push_relay_url: string | null } | undefined;
        if (appRow?.push_relay_url) {
          pushRelayUrl = appRow.push_relay_url;
        }
      }
      responseChannel = {
        type: 'push_relay' as const,
        pushRelayUrl,
        requestId,
      };
    }

    // 8.5. Resolve CAIP-2 chain ID from network
    let caip2ChainId: string;
    try {
      caip2ChainId = networkToCaip2(params.network as NetworkType);
    } catch {
      // Fallback for unknown networks: use chain type prefix
      caip2ChainId = params.chain === 'solana' ? `solana:${params.network}` : `eip155:${params.network}`;
    }

    // 8.6. Resolve signer address (owner wallet address)
    let signerAddress = params.signerAddress || '';
    if (!signerAddress && this.sqlite) {
      // Look up owner_address from wallets table using the 'from' address (publicKey)
      const walletRow = this.sqlite.prepare(
        'SELECT owner_address FROM wallets WHERE public_key = ?',
      ).get(params.from) as { owner_address: string | null } | undefined;
      signerAddress = walletRow?.owner_address || '';
    }

    // 9. Assemble SignRequest + validate with Zod
    const request = SignRequestSchema.parse({
      version: '1',
      requestId,
      caip2ChainId,
      networkName: params.network,
      signerAddress,
      message,
      displayMessage,
      metadata: {
        txId: params.txId,
        type: params.type,
        from: params.from,
        to: params.to,
        ...(params.amount !== undefined ? { amount: params.amount } : {}),
        ...(params.symbol !== undefined ? { symbol: params.symbol } : {}),
        policyTier: params.policyTier,
      },
      responseChannel,
      expiresAt: expiresAt.toISOString(),
    });

    // 10. Build universal link URL
    const universalLinkUrl = this.walletLinkRegistry.buildSignUrl(walletName, request);

    // 11. Request topic: use subscription_token from wallet_apps if available (#449)
    let requestTopic = walletName;
    if (this.sqlite) {
      const appRow = this.sqlite.prepare(
        'SELECT subscription_token FROM wallet_apps WHERE name = ? AND subscription_token IS NOT NULL',
      ).get(walletName) as { subscription_token: string } | undefined;
      if (appRow?.subscription_token) {
        requestTopic = appRow.subscription_token;
      }
    }

    return {
      request,
      universalLinkUrl,
      requestTopic,
    };
  }

  // -------------------------------------------------------------------------
  // Private: buildSigningMessage (doc 73 Section 5 template)
  // -------------------------------------------------------------------------

  /**
   * Build signing message text per doc 73 Section 5 template.
   * Amount/symbol line is omitted when both are absent.
   */
  private buildSigningMessage(
    params: BuildRequestParams,
    network: string,
    requestId: string,
    now: Date,
  ): string {
    const lines: string[] = [
      'WAIaaS Transaction Approval',
      '',
      `Transaction: ${params.txId}`,
      `Type: ${params.type}`,
      `From: ${params.from}`,
      `To: ${params.to}`,
    ];

    // Amount line: only include if amount is present
    if (params.amount !== undefined) {
      const amountLine = params.symbol
        ? `Amount: ${params.amount} ${params.symbol}`
        : `Amount: ${params.amount}`;
      lines.push(amountLine);
    }

    lines.push(
      `Network: ${network}`,
      `Policy Tier: ${params.policyTier}`,
      '',
      'Approve this transaction by signing this message.',
      `Timestamp: ${now.toISOString()}`,
      `Nonce: ${requestId}`,
    );

    return lines.join('\n');
  }

  // -------------------------------------------------------------------------
  // Private: buildDisplayMessage (human-readable summary)
  // -------------------------------------------------------------------------

  /**
   * Build a concise display message for wallet app UI.
   */
  private buildDisplayMessage(params: BuildRequestParams): string {
    const amountPart = params.amount
      ? ` ${params.amount}${params.symbol ? ' ' + params.symbol : ''}`
      : '';
    return `${params.type}${amountPart} from ${params.from.slice(0, 8)}... to ${params.to.slice(0, 8)}...`;
  }
}
