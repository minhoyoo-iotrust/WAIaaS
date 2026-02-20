/**
 * SignRequestBuilder -- builds SignRequest objects for PENDING_APPROVAL transactions.
 *
 * Transforms transaction metadata into a SignRequest with a signing message
 * (doc 73 Section 5 template), response channel config, and a universal link URL
 * for the target wallet app.
 *
 * Intentionally does NOT go through ApprovalWorkflow -- SignRequestBuilder is
 * invoked *after* the pipeline has already set the transaction to PENDING_APPROVAL
 * state. It produces the data needed to notify the owner via ntfy/Telegram channels.
 *
 * @see internal/design/73-signing-protocol-v1.md (Section 3, 5)
 * @see internal/design/74-wallet-sdk-daemon-components.md
 */

import {
  type SignRequest,
  SignRequestSchema,
  WAIaaSError,
} from '@waiaas/core';
import type { SettingsService } from '../../infrastructure/settings/settings-service.js';
import type { WalletLinkRegistry } from './wallet-link-registry.js';
import { generateId } from '../../infrastructure/database/id.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BuildRequestParams {
  txId: string;
  chain: 'solana' | 'evm';
  network: string;
  type: string;
  from: string;
  to: string;
  amount?: string;
  symbol?: string;
  policyTier: 'APPROVAL' | 'DELAY';
  walletName?: string;
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

  constructor(opts: {
    settingsService: SettingsService;
    walletLinkRegistry: WalletLinkRegistry;
  }) {
    this.settings = opts.settingsService;
    this.walletLinkRegistry = opts.walletLinkRegistry;
  }

  // -------------------------------------------------------------------------
  // buildRequest
  // -------------------------------------------------------------------------

  /**
   * Build a SignRequest from a PENDING_APPROVAL transaction.
   *
   * @param params - Transaction metadata
   * @returns The SignRequest, universal link URL, and ntfy request topic
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
    const walletConfig = this.walletLinkRegistry.getWallet(walletName);

    // 4. Generate requestId (UUID v7)
    const requestId = generateId();

    // 5. Build signing message (doc 73 Section 5 template)
    const now = new Date();
    const message = this.buildSigningMessage(params, params.network, requestId, now);

    // 6. Build display message (concise human-readable version)
    const displayMessage = this.buildDisplayMessage(params);

    // 7. Calculate expiresAt from settings
    const expiryMinStr = this.settings.get('signing_sdk.request_expiry_min');
    const expiryMin = parseInt(expiryMinStr, 10) || 30;
    const expiresAt = new Date(now.getTime() + expiryMin * 60 * 1000);

    // 8. Determine response channel
    const preferredChannel = this.settings.get('signing_sdk.preferred_channel');
    const responseTopicPrefix = this.settings.get('signing_sdk.ntfy_response_topic_prefix');

    let responseChannel: SignRequest['responseChannel'];

    if (preferredChannel === 'telegram') {
      // Telegram channel -- bot username from telegram settings
      const botToken = this.settings.get('telegram.bot_token');
      responseChannel = {
        type: 'telegram' as const,
        botUsername: botToken ? 'waiaas_bot' : 'waiaas_bot',
      };
    } else {
      // Default: ntfy channel
      const ntfyServer = this.settings.get('notifications.ntfy_server');
      responseChannel = {
        type: 'ntfy' as const,
        responseTopic: `${responseTopicPrefix}-${requestId}`,
        ...(ntfyServer !== 'https://ntfy.sh' ? { serverUrl: ntfyServer } : {}),
      };
    }

    // 9. Assemble SignRequest + validate with Zod
    const request = SignRequestSchema.parse({
      version: '1',
      requestId,
      chain: params.chain,
      network: params.network,
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

    // 11. Build request topic for ntfy publish
    const requestTopicPrefix = this.settings.get('signing_sdk.ntfy_request_topic_prefix');
    const ntfyTopic = walletConfig.ntfy?.requestTopic ?? `${requestTopicPrefix}-${walletName}`;

    return {
      request,
      universalLinkUrl,
      requestTopic: ntfyTopic,
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
