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
import type { AutoStopService, AutoStopConfig } from '../../services/autostop-service.js';
import type { BalanceMonitorService, BalanceMonitorConfig } from '../../services/monitoring/balance-monitor-service.js';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface HotReloadDeps {
  settingsService: SettingsService;
  notificationService?: NotificationService | null;
  adapterPool?: AdapterPool | null;
  autoStopService?: AutoStopService | null;
  balanceMonitorService?: BalanceMonitorService | null;
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
  'notifications.slack_webhook_url',
  'notifications.locale',
  'notifications.rate_limit_rpm',
]);

const RPC_KEYS_PREFIX = 'rpc.';

const DISPLAY_KEYS = new Set(['display.currency']);

const SECURITY_KEYS = new Set([
  'security.session_ttl',
  'security.max_sessions_per_wallet',
  'security.max_pending_tx',
  'security.rate_limit_global_ip_rpm',
  'security.rate_limit_session_rpm',
  'security.rate_limit_tx_rpm',
  'security.policy_defaults_delay_seconds',
  'security.policy_defaults_approval_timeout',
  'policy.default_deny_tokens',
  'policy.default_deny_contracts',
  'policy.default_deny_spenders',
]);

const AUTOSTOP_KEYS_PREFIX = 'autostop.';

const MONITORING_KEYS_PREFIX = 'monitoring.';

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
    const hasDisplayChanges = changedKeys.some((k) => DISPLAY_KEYS.has(k));
    const hasAutostopChanges = changedKeys.some((k) => k.startsWith(AUTOSTOP_KEYS_PREFIX));
    const hasMonitoringChanges = changedKeys.some((k) => k.startsWith(MONITORING_KEYS_PREFIX));

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

    if (hasDisplayChanges) {
      // Display currency reload is synchronous -- SettingsService.get() reads from DB directly
      // No subsystem restart needed; next read picks up the new value immediately
      console.log('Hot-reload: Display currency updated (effective immediately)');
    }

    if (hasAutostopChanges) {
      try {
        this.reloadAutoStop();
      } catch (err) {
        console.warn('Hot-reload autostop failed:', err);
      }
    }

    if (hasMonitoringChanges) {
      try {
        this.reloadBalanceMonitor();
      } catch (err) {
        console.warn('Hot-reload balance monitor failed:', err);
      }
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
    const { TelegramChannel, DiscordChannel, NtfyChannel, SlackChannel } = await import(
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

    // Slack
    const slackUrl = ss.get('notifications.slack_webhook_url');
    if (slackUrl) {
      const slack = new SlackChannel();
      await slack.initialize({ slack_webhook_url: slackUrl });
      newChannels.push(slack);
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
   * Reload AutoStop engine with current settings from SettingsService.
   * Synchronous: reads new values and calls autoStopService.updateConfig().
   */
  private reloadAutoStop(): void {
    const svc = this.deps.autoStopService;
    if (!svc) return;

    const ss = this.deps.settingsService;
    const newConfig: Partial<AutoStopConfig> = {
      consecutiveFailuresThreshold: parseInt(ss.get('autostop.consecutive_failures_threshold'), 10),
      unusualActivityThreshold: parseInt(ss.get('autostop.unusual_activity_threshold'), 10),
      unusualActivityWindowSec: parseInt(ss.get('autostop.unusual_activity_window_sec'), 10),
      idleTimeoutSec: parseInt(ss.get('autostop.idle_timeout_sec'), 10),
      idleCheckIntervalSec: parseInt(ss.get('autostop.idle_check_interval_sec'), 10),
      enabled: ss.get('autostop.enabled') === 'true',
    };

    svc.updateConfig(newConfig);
    console.log('Hot-reload: AutoStop engine config updated (effective immediately)');
  }

  /**
   * Reload Balance Monitor with current settings from SettingsService.
   * Synchronous: reads new values and calls balanceMonitorService.updateConfig().
   */
  private reloadBalanceMonitor(): void {
    const svc = this.deps.balanceMonitorService;
    if (!svc) return;

    const ss = this.deps.settingsService;
    const newConfig: Partial<BalanceMonitorConfig> = {
      checkIntervalSec: parseInt(ss.get('monitoring.check_interval_sec'), 10),
      lowBalanceThresholdSol: parseFloat(ss.get('monitoring.low_balance_threshold_sol')),
      lowBalanceThresholdEth: parseFloat(ss.get('monitoring.low_balance_threshold_eth')),
      cooldownHours: parseInt(ss.get('monitoring.cooldown_hours'), 10),
      enabled: ss.get('monitoring.enabled') === 'true',
    };

    svc.updateConfig(newConfig);
    console.log('Hot-reload: Balance monitor config updated (effective immediately)');
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
