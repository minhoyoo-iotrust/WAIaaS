/**
 * HotReloadOrchestrator: dispatches settings changes to subsystem reloaders.
 *
 * When PUT /admin/settings modifies keys, this orchestrator determines which
 * subsystems need reloading and triggers the appropriate reload functions.
 *
 * Subsystem reload is fire-and-forget: errors are caught and logged,
 * never propagated to the API response (settings are already saved to DB).
 */

import type { INotificationChannel } from '@waiaas/core';
import type { NotificationService } from '../../notifications/notification-service.js';
import type { AdapterPool } from '../adapter-pool.js';
import type { SettingsService } from './settings-service.js';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface HotReloadDeps {
  settingsService: SettingsService;
  notificationService?: NotificationService | null;
  adapterPool?: AdapterPool | null;
}

// ---------------------------------------------------------------------------
// Category to key mapping for change detection
// ---------------------------------------------------------------------------

const NOTIFICATION_KEYS = new Set([
  'notifications.enabled',
  'notifications.telegram_bot_token',
  'notifications.telegram_chat_id',
  'notifications.discord_webhook_url',
  'notifications.ntfy_server',
  'notifications.ntfy_topic',
  'notifications.locale',
  'notifications.rate_limit_rpm',
]);

const RPC_KEYS_PREFIX = 'rpc.';

const SECURITY_KEYS = new Set([
  'security.session_ttl',
  'security.max_sessions_per_wallet',
  'security.max_pending_tx',
  'security.rate_limit_global_ip_rpm',
  'security.rate_limit_session_rpm',
  'security.rate_limit_tx_rpm',
  'security.policy_defaults_delay_seconds',
  'security.policy_defaults_approval_timeout',
]);

// ---------------------------------------------------------------------------
// HotReloadOrchestrator
// ---------------------------------------------------------------------------

export class HotReloadOrchestrator {
  private deps: HotReloadDeps;

  constructor(deps: HotReloadDeps) {
    this.deps = deps;
  }

  /**
   * Handle changed settings keys. Determines affected subsystems and triggers reload.
   * Fire-and-forget: errors logged but never thrown.
   */
  async handleChangedKeys(changedKeys: string[]): Promise<void> {
    if (changedKeys.length === 0) return;

    const hasNotificationChanges = changedKeys.some((k) => NOTIFICATION_KEYS.has(k));
    const hasRpcChanges = changedKeys.some((k) => k.startsWith(RPC_KEYS_PREFIX));
    const hasSecurityChanges = changedKeys.some((k) => SECURITY_KEYS.has(k));

    const reloads: Promise<void>[] = [];

    if (hasNotificationChanges) {
      reloads.push(
        this.reloadNotifications().catch((err) => {
          console.warn('Hot-reload notifications failed:', err);
        }),
      );
    }

    if (hasRpcChanges) {
      reloads.push(
        this.reloadRpc(changedKeys.filter((k) => k.startsWith(RPC_KEYS_PREFIX))).catch((err) => {
          console.warn('Hot-reload RPC failed:', err);
        }),
      );
    }

    if (hasSecurityChanges) {
      // Security reload is synchronous (just read new values on next request)
      // No action needed -- SettingsService.get() already reads from DB first
      console.log('Hot-reload: Security parameters updated (effective on next request)');
    }

    await Promise.all(reloads);
  }

  /**
   * Reload notification channels with current settings from SettingsService.
   */
  private async reloadNotifications(): Promise<void> {
    const svc = this.deps.notificationService;
    if (!svc) return;

    const ss = this.deps.settingsService;
    const enabled = ss.get('notifications.enabled') === 'true';

    if (!enabled) {
      svc.replaceChannels([]);
      console.log('Hot-reload: Notifications disabled, channels cleared');
      return;
    }

    // Dynamically import channel constructors (same pattern as daemon.ts Step 4d)
    const { TelegramChannel, DiscordChannel, NtfyChannel } = await import(
      '../../notifications/index.js'
    );

    const newChannels: INotificationChannel[] = [];

    // Telegram
    const tgToken = ss.get('notifications.telegram_bot_token');
    const tgChatId = ss.get('notifications.telegram_chat_id');
    if (tgToken && tgChatId) {
      const telegram = new TelegramChannel();
      await telegram.initialize({ telegram_bot_token: tgToken, telegram_chat_id: tgChatId });
      newChannels.push(telegram);
    }

    // Discord
    const discordUrl = ss.get('notifications.discord_webhook_url');
    if (discordUrl) {
      const discord = new DiscordChannel();
      await discord.initialize({ discord_webhook_url: discordUrl });
      newChannels.push(discord);
    }

    // Ntfy
    const ntfyTopic = ss.get('notifications.ntfy_topic');
    if (ntfyTopic) {
      const ntfyServer = ss.get('notifications.ntfy_server');
      const ntfy = new NtfyChannel();
      await ntfy.initialize({ ntfy_server: ntfyServer, ntfy_topic: ntfyTopic });
      newChannels.push(ntfy);
    }

    svc.replaceChannels(newChannels);

    // Update config (locale, rate limit)
    const locale = ss.get('notifications.locale') as 'en' | 'ko';
    const rateLimitRpm = parseInt(ss.get('notifications.rate_limit_rpm'), 10) || 20;
    svc.updateConfig({ locale, rateLimitRpm });

    console.log(
      `Hot-reload: Notifications reloaded (${newChannels.length} channels: ${newChannels.map((c) => c.name).join(', ') || 'none'})`,
    );
  }

  /**
   * Reload RPC adapters by evicting changed network adapters from the pool.
   * Next request for that chain:network will lazy-create a new adapter with the new URL.
   */
  private async reloadRpc(changedRpcKeys: string[]): Promise<void> {
    const pool = this.deps.adapterPool;
    if (!pool) return;

    for (const key of changedRpcKeys) {
      // key format: 'rpc.solana_mainnet' or 'rpc.evm_ethereum_sepolia' or 'rpc.evm_default_network'
      const field = key.replace('rpc.', '');

      if (field === 'evm_default_network') continue; // No adapter to evict for this key

      if (field.startsWith('solana_')) {
        const network = field.replace('solana_', '');
        await pool.evict('solana' as any, network as any);
        console.log(`Hot-reload: Evicted solana:${network} adapter`);
      } else if (field.startsWith('evm_')) {
        // Convert evm_ethereum_sepolia -> ethereum-sepolia
        const network = field.replace('evm_', '').replace(/_/g, '-');
        await pool.evict('ethereum' as any, network as any);
        console.log(`Hot-reload: Evicted ethereum:${network} adapter`);
      }
    }
  }
}
