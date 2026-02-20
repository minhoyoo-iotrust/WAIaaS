/**
 * TelegramSigningChannel -- sends SignRequests via Telegram inline button message.
 *
 * When a PENDING_APPROVAL transaction triggers a SignRequest:
 *   1. Builds the SignRequest via SignRequestBuilder
 *   2. Registers the request with SignResponseHandler for later matching
 *   3. Sends a Telegram message to the admin chat with an inline "Open in Wallet"
 *      button containing the universal link URL
 *
 * Unlike NtfySigningChannel, TelegramSigningChannel does NOT subscribe to a response
 * topic. The response arrives via the /sign_response Telegram bot command, which
 * delegates to SignResponseHandler. This is a one-way push channel.
 *
 * Implements ISigningChannel interface for consistent channel abstraction.
 *
 * @see internal/design/73-signing-protocol-v1.md (Section 7.2, 7.3)
 * @see internal/design/74-wallet-sdk-daemon-components.md
 */

import type { SignRequestBuilder, BuildRequestParams } from '../sign-request-builder.js';
import type { SignResponseHandler } from '../sign-response-handler.js';
import type { SettingsService } from '../../../infrastructure/settings/settings-service.js';
import type { TelegramApi } from '../../../infrastructure/telegram/telegram-api.js';
import { escapeMarkdownV2 } from '../../../infrastructure/telegram/telegram-bot-service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TelegramSigningChannelOpts {
  signRequestBuilder: SignRequestBuilder;
  signResponseHandler: SignResponseHandler;
  settingsService: SettingsService;
  telegramApi: TelegramApi;
}

export interface SendRequestParams extends BuildRequestParams {
  walletId: string;
}

export interface SendRequestResult {
  requestId: string;
  requestTopic: string;
  responseTopic: string;
}

// ---------------------------------------------------------------------------
// TelegramSigningChannel
// ---------------------------------------------------------------------------

export class TelegramSigningChannel {
  private readonly signRequestBuilder: SignRequestBuilder;
  private readonly signResponseHandler: SignResponseHandler;
  private readonly settings: SettingsService;
  private readonly telegramApi: TelegramApi;

  constructor(opts: TelegramSigningChannelOpts) {
    this.signRequestBuilder = opts.signRequestBuilder;
    this.signResponseHandler = opts.signResponseHandler;
    this.settings = opts.settingsService;
    this.telegramApi = opts.telegramApi;
  }

  // -------------------------------------------------------------------------
  // sendRequest -- send Telegram message with universal link inline button
  // -------------------------------------------------------------------------

  /**
   * Send a SignRequest via Telegram message with an inline "Open in Wallet" button.
   *
   * @param params - Transaction metadata + walletId
   * @returns requestId, requestTopic (empty for Telegram), responseTopic (empty)
   * @throws Error if telegram chat_id is not configured
   */
  async sendRequest(params: SendRequestParams): Promise<SendRequestResult> {
    // 1. Build SignRequest via SignRequestBuilder
    const { request, universalLinkUrl, requestTopic } =
      this.signRequestBuilder.buildRequest(params);

    // 2. Register request with SignResponseHandler for later matching
    this.signResponseHandler.registerRequest(request);

    // 3. Get admin chat_id from settings
    const chatIdStr = this.settings.get('notifications.telegram_chat_id');
    if (!chatIdStr) {
      throw new Error('Telegram chat_id is not configured in notifications.telegram_chat_id');
    }
    const chatId = parseInt(chatIdStr, 10);
    if (isNaN(chatId)) {
      throw new Error('Invalid telegram_chat_id: must be a numeric value');
    }

    // 4. Format display message with MarkdownV2 escaping
    const header = '*WAIaaS Sign Request*';
    const body = escapeMarkdownV2(request.displayMessage);
    const txInfo = `TX: \`${escapeMarkdownV2(request.metadata.txId.slice(0, 8))}\\.\\.\\.\``;
    const chain = `Chain: ${escapeMarkdownV2(request.chain)}/${escapeMarkdownV2(request.network)}`;
    const text = `${header}\n\n${body}\n${txInfo}\n${chain}`;

    // 5. Send Telegram message with inline keyboard (universal link button)
    await this.telegramApi.sendMessage(chatId, text, {
      inline_keyboard: [
        [{ text: 'Open in Wallet', url: universalLinkUrl }],
      ],
    });

    // 6. Return result (no ntfy topics for Telegram channel)
    return {
      requestId: request.requestId,
      requestTopic,
      responseTopic: '',
    };
  }

  // -------------------------------------------------------------------------
  // shutdown -- no-op (no active subscriptions)
  // -------------------------------------------------------------------------

  /**
   * Shutdown the channel. No-op for Telegram (no SSE subscriptions to clean up).
   */
  shutdown(): void {
    // No active subscriptions to clean up
  }
}
