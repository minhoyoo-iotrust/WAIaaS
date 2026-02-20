/**
 * ApprovalChannelRouter -- routes PENDING_APPROVAL transactions to the correct
 * signing channel based on wallet's owner_approval_method.
 *
 * Routing logic:
 *   1. Read wallet's owner_approval_method from DB
 *   2. If set: route to that specific channel
 *      - sdk_ntfy  -> NtfySigningChannel.sendRequest()
 *      - sdk_telegram -> TelegramSigningChannel.sendRequest()
 *      - walletconnect / telegram_bot / rest -> return method (no channel call)
 *   3. If SDK method but signing_sdk.enabled=false: fall through to global fallback
 *   4. Global fallback priority (CHAN-06):
 *      SDK ntfy > SDK Telegram > WalletConnect > Telegram Bot > REST
 *
 * CHAN-07: When signing_sdk.enabled !== 'true', SDK channels are skipped entirely.
 *
 * @see internal/design/74-wallet-sdk-daemon-components.md
 * @see .planning/phases/203-telegram-channel-routing-rest-admin/203-03-PLAN.md
 */

import type { ApprovalMethod } from '@waiaas/core';
import type { Database } from 'better-sqlite3';
import type { SettingsService } from '../../infrastructure/settings/settings-service.js';
import type { NtfySigningChannel } from './channels/ntfy-signing-channel.js';
import type { TelegramSigningChannel } from './channels/telegram-signing-channel.js';
import type { SendRequestParams } from './channels/ntfy-signing-channel.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApprovalChannelRouterDeps {
  sqlite: Database;
  settingsService: SettingsService;
  ntfyChannel?: NtfySigningChannel;
  telegramChannel?: TelegramSigningChannel;
}

export interface RouteResult {
  /** The approval method selected */
  method: ApprovalMethod;
  /** Non-null for SDK channels (ntfy/telegram), null for wc/telegram_bot/rest */
  channelResult: { requestId: string } | null;
}

// ---------------------------------------------------------------------------
// ApprovalChannelRouter
// ---------------------------------------------------------------------------

export class ApprovalChannelRouter {
  private readonly sqlite: Database;
  private readonly settings: SettingsService;
  private readonly ntfyChannel?: NtfySigningChannel;
  private readonly telegramChannel?: TelegramSigningChannel;

  constructor(deps: ApprovalChannelRouterDeps) {
    this.sqlite = deps.sqlite;
    this.settings = deps.settingsService;
    this.ntfyChannel = deps.ntfyChannel;
    this.telegramChannel = deps.telegramChannel;
  }

  // -------------------------------------------------------------------------
  // route() -- determine and execute the appropriate signing channel
  // -------------------------------------------------------------------------

  /**
   * Route a PENDING_APPROVAL transaction to the correct signing channel.
   *
   * @param walletId - The wallet ID to look up approval method for
   * @param params - Transaction parameters for SDK channel sendRequest()
   * @returns RouteResult with selected method and optional channel result
   * @throws Error if wallet not found in DB
   * @throws Error if SDK channel sendRequest() fails (propagated, no silent fallback)
   */
  async route(walletId: string, params: SendRequestParams): Promise<RouteResult> {
    // 1. Read wallet's owner_approval_method from DB
    const row = this.sqlite.prepare(
      'SELECT owner_approval_method FROM wallets WHERE id = ?',
    ).get(walletId) as { owner_approval_method: string | null } | undefined;

    if (!row) {
      throw new Error(`Wallet not found: ${walletId}`);
    }

    const explicitMethod = row.owner_approval_method as ApprovalMethod | null;

    // 2. If explicit method is set, try to use it
    if (explicitMethod) {
      const sdkEnabled = this.isSdkEnabled();

      // Non-SDK methods: return immediately without channel call
      if (explicitMethod === 'walletconnect') {
        return { method: 'walletconnect', channelResult: null };
      }
      if (explicitMethod === 'telegram_bot') {
        return { method: 'telegram_bot', channelResult: null };
      }
      if (explicitMethod === 'rest') {
        return { method: 'rest', channelResult: null };
      }

      // SDK methods: only use if SDK is enabled, otherwise fall through to global fallback
      if (explicitMethod === 'sdk_ntfy' && sdkEnabled && this.ntfyChannel) {
        const result = await this.ntfyChannel.sendRequest(params);
        return { method: 'sdk_ntfy', channelResult: { requestId: result.requestId } };
      }
      if (explicitMethod === 'sdk_telegram' && sdkEnabled && this.telegramChannel) {
        const result = await this.telegramChannel.sendRequest(params);
        return { method: 'sdk_telegram', channelResult: { requestId: result.requestId } };
      }

      // SDK method set but SDK disabled or channel not available -> fall through to global fallback
    }

    // 3. Global fallback priority (CHAN-06)
    return this.globalFallback(params);
  }

  // -------------------------------------------------------------------------
  // shutdown() -- clean up channels
  // -------------------------------------------------------------------------

  /**
   * Shutdown all managed signing channels.
   */
  shutdown(): void {
    this.ntfyChannel?.shutdown();
    this.telegramChannel?.shutdown();
  }

  // -------------------------------------------------------------------------
  // Private: global fallback logic (CHAN-06, CHAN-07)
  // -------------------------------------------------------------------------

  private async globalFallback(params: SendRequestParams): Promise<RouteResult> {
    const sdkEnabled = this.isSdkEnabled();

    // Priority 1: SDK ntfy (if SDK enabled and channel available)
    if (sdkEnabled && this.ntfyChannel) {
      const result = await this.ntfyChannel.sendRequest(params);
      return { method: 'sdk_ntfy', channelResult: { requestId: result.requestId } };
    }

    // Priority 2: SDK Telegram (if SDK enabled and channel available)
    if (sdkEnabled && this.telegramChannel) {
      const result = await this.telegramChannel.sendRequest(params);
      return { method: 'sdk_telegram', channelResult: { requestId: result.requestId } };
    }

    // Priority 3: WalletConnect (if project_id configured)
    if (this.isWalletConnectConfigured()) {
      return { method: 'walletconnect', channelResult: null };
    }

    // Priority 4: Telegram Bot (if enabled and bot_token configured)
    if (this.isTelegramBotConfigured()) {
      return { method: 'telegram_bot', channelResult: null };
    }

    // Priority 5: REST (always available as final fallback)
    return { method: 'rest', channelResult: null };
  }

  // -------------------------------------------------------------------------
  // Private: setting checks
  // -------------------------------------------------------------------------

  private isSdkEnabled(): boolean {
    try {
      return this.settings.get('signing_sdk.enabled') === 'true';
    } catch {
      return false;
    }
  }

  private isWalletConnectConfigured(): boolean {
    try {
      const projectId = this.settings.get('walletconnect.project_id');
      return !!projectId && projectId.trim().length > 0;
    } catch {
      return false;
    }
  }

  private isTelegramBotConfigured(): boolean {
    try {
      const enabled = this.settings.get('telegram.enabled');
      const botToken = this.settings.get('telegram.bot_token');
      return enabled === 'true' && !!botToken && botToken.trim().length > 0;
    } catch {
      return false;
    }
  }
}
