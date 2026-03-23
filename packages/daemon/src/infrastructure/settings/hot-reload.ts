/**
 * HotReloadOrchestrator: dispatches settings changes to subsystem reloaders.
 *
 * When PUT /admin/settings modifies keys, this orchestrator determines which
 * subsystems need reloading and triggers the appropriate reload functions.
 *
 * Subsystem reload is fire-and-forget: errors are caught and logged,
 * never propagated to the API response (settings are already saved to DB).
 */

import type { Database } from 'better-sqlite3';
import type { INotificationChannel, ChainType, NetworkType, LogLevel } from '@waiaas/core';
import type { ConsoleLogger } from '@waiaas/core';
import type { NotificationService } from '../../notifications/notification-service.js';
import type { AdapterPool } from '../adapter-pool.js';
import { configKeyToNetwork } from '../adapter-pool.js';
import type { SettingsService } from './settings-service.js';
import type { AutoStopService, AutoStopConfig } from '../../services/autostop-service.js';
import type { BalanceMonitorService, BalanceMonitorConfig } from '../../services/monitoring/balance-monitor-service.js';
import type { WcServiceRef } from '../../services/wc-session-service.js';
import type { WcSigningBridgeRef } from '../../services/wc-signing-bridge.js';
import type { ApprovalWorkflow } from '../../workflow/approval-workflow.js';
import type { TelegramBotService } from '../telegram/telegram-bot-service.js';
import type { KillSwitchService } from '../../services/kill-switch-service.js';

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------

export interface HotReloadDeps {
  settingsService: SettingsService;
  notificationService?: NotificationService | null;
  adapterPool?: AdapterPool | null;
  autoStopService?: AutoStopService | null;
  balanceMonitorService?: BalanceMonitorService | null;
  wcServiceRef?: WcServiceRef | null;
  /** Mutable ref for WcSigningBridge hot-reload */
  wcSigningBridgeRef?: WcSigningBridgeRef | null;
  approvalWorkflow?: ApprovalWorkflow | null;
  sqlite?: Database | null;
  /** Mutable ref for Telegram Bot hot-reload */
  telegramBotRef?: { current: TelegramBotService | null };
  killSwitchService?: KillSwitchService | null;
  /** Duck-typed IncomingTxMonitorService to avoid circular imports */
  incomingTxMonitorService?: { updateConfig: (config: Record<string, unknown>) => void } | null;
  /** Duck-typed ActionProviderRegistry ref for hot-reload */
  actionProviderRegistryRef?: { current: import('../action/action-provider-registry.js').ActionProviderRegistry | null } | null;
  /** IRpcCaller for Aave V3 on-chain reads via RpcPool */
  rpcCaller?: { call: (params: { to: string; data: string; chainId?: number }) => Promise<string> } | null;
  /** Daemon logger for log level hot-reload */
  daemonLogger?: ConsoleLogger | null;
}

// ---------------------------------------------------------------------------
// Category to key mapping for change detection
// ---------------------------------------------------------------------------

const NOTIFICATION_KEYS = new Set([
  'notifications.enabled',
  'notifications.telegram_bot_token',
  'notifications.telegram_chat_id',
  'notifications.discord_webhook_url',
  'notifications.slack_webhook_url',
  'notifications.locale',
  'notifications.rate_limit_rpm',
  'notifications.notify_categories',
  'notifications.notify_events',
]);

const RPC_KEYS_PREFIX = 'rpc.';

const DISPLAY_KEYS = new Set(['display.currency']);

const SECURITY_KEYS = new Set([
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
  'policy.default_deny_x402_domains',
]);

const AUTOSTOP_KEYS_PREFIX = 'autostop.';

const MONITORING_KEYS_PREFIX = 'monitoring.';

const WALLETCONNECT_KEYS_PREFIX = 'walletconnect.';

const INCOMING_KEYS_PREFIX = 'incoming.';

const ACTIONS_KEYS_PREFIX = 'actions.';

const RPC_POOL_KEYS_PREFIX = 'rpc_pool.';

// Smart Account (ERC-4337) settings -- no subsystem reload needed.
// SmartAccountService reads settings on-demand per UserOperation.
const SMART_ACCOUNT_KEYS_PREFIX = 'smart_account.';

const DAEMON_KEYS = new Set(['daemon.log_level']);

const TELEGRAM_BOT_KEYS = new Set([
  'telegram.bot_token',
  'telegram.locale',
  'notifications.telegram_bot_token', // shared token triggers bot reload too
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

    const hasDaemonChanges = changedKeys.some((k) => DAEMON_KEYS.has(k));
    const hasNotificationChanges = changedKeys.some((k) => NOTIFICATION_KEYS.has(k));
    const hasRpcChanges = changedKeys.some((k) => k.startsWith(RPC_KEYS_PREFIX));
    const hasSecurityChanges = changedKeys.some((k) => SECURITY_KEYS.has(k));
    const hasDisplayChanges = changedKeys.some((k) => DISPLAY_KEYS.has(k));
    const hasAutostopChanges = changedKeys.some((k) => k.startsWith(AUTOSTOP_KEYS_PREFIX));
    const hasMonitoringChanges = changedKeys.some((k) => k.startsWith(MONITORING_KEYS_PREFIX));
    const hasWalletConnectChanges = changedKeys.some((k) => k.startsWith(WALLETCONNECT_KEYS_PREFIX));
    const hasTelegramBotChanges = changedKeys.some((k) => TELEGRAM_BOT_KEYS.has(k));
    const hasIncomingChanges = changedKeys.some((k) => k.startsWith(INCOMING_KEYS_PREFIX));
    const hasActionsChanges = changedKeys.some((k) => k.startsWith(ACTIONS_KEYS_PREFIX));
    const hasRpcPoolChanges = changedKeys.some((k) => k.startsWith(RPC_POOL_KEYS_PREFIX));
    const hasSmartAccountChanges = changedKeys.some((k) => k.startsWith(SMART_ACCOUNT_KEYS_PREFIX));

    const reloads: Promise<void>[] = [];

    // Daemon log level hot-reload (synchronous)
    if (hasDaemonChanges) {
      const ss = this.deps.settingsService;
      const newLevel = (ss.get('daemon.log_level') || 'info') as LogLevel;
      if (this.deps.daemonLogger) {
        this.deps.daemonLogger.setLevel(newLevel);
      }
      console.info(`Hot-reload: Log level changed to '${newLevel}'`);
    }

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
        this.reloadAutoStop(changedKeys.filter((k) => k.startsWith(AUTOSTOP_KEYS_PREFIX)));
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

    if (hasWalletConnectChanges) {
      reloads.push(
        this.reloadWalletConnect().catch((err) => {
          console.warn('Hot-reload WalletConnect failed:', err);
        }),
      );
    }

    if (hasTelegramBotChanges) {
      reloads.push(
        this.reloadTelegramBot().catch((err) => {
          console.warn('Hot-reload Telegram Bot failed:', err);
        }),
      );
    }

    if (hasIncomingChanges) {
      try {
        this.reloadIncomingMonitor();
      } catch (err) {
        console.warn('Hot-reload incoming monitor failed:', err);
      }
    }

    if (hasActionsChanges) {
      reloads.push(
        this.reloadActionProviders(changedKeys.filter((k) => k.startsWith(ACTIONS_KEYS_PREFIX))).catch((err) => {
          console.warn('Hot-reload action providers failed:', err);
        }),
      );
    }

    if (hasRpcPoolChanges) {
      reloads.push(
        this.reloadRpcPool(changedKeys.filter((k) => k.startsWith(RPC_POOL_KEYS_PREFIX))).catch((err) => {
          console.warn('Hot-reload RPC pool failed:', err);
        }),
      );
    }

    if (hasSmartAccountChanges) {
      // No-op: SmartAccountService reads settings on-demand per UserOperation.
      // No subsystem restart or reload needed.
      console.log('Hot-reload: Smart account settings updated (effective on next request)');
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
    // NtfyChannel removed from hot-reload in v29.10 -- per-wallet topics now in wallet_apps table
    const { TelegramChannel, DiscordChannel, SlackChannel } = await import(
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

    // Ntfy: global ntfy_topic removed in v29.10 -- per-wallet topics now in wallet_apps table.
    // Per-wallet ntfy channels are managed by the signing SDK / notification routing layer.

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
   * Also handles per-rule enable/disable via registry.setEnabled() (PLUG-04).
   */
  private reloadAutoStop(changedKeys?: string[]): void {
    const svc = this.deps.autoStopService;
    if (!svc) return;

    const ss = this.deps.settingsService;

    // Handle per-rule enable/disable settings (autostop.rule.{id}.enabled)
    const rulePrefix = 'autostop.rule.';
    const ruleEnableSuffix = '.enabled';
    const perRuleKeys = changedKeys?.filter(
      (k) => k.startsWith(rulePrefix) && k.endsWith(ruleEnableSuffix),
    );

    if (perRuleKeys && perRuleKeys.length > 0) {
      const registry = svc.registry;
      for (const key of perRuleKeys) {
        // Extract rule ID from 'autostop.rule.{id}.enabled'
        const ruleId = key.slice(rulePrefix.length, -ruleEnableSuffix.length);
        const enabled = ss.get(key) === 'true';
        try {
          registry.setEnabled(ruleId, enabled);
          console.log(`Hot-reload: AutoStop rule '${ruleId}' ${enabled ? 'enabled' : 'disabled'}`);
        } catch {
          // Rule not found in registry -- ignore
        }
      }
    }

    // Handle global autostop config changes
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
   * Reload Incoming TX Monitor with current settings from SettingsService.
   * Synchronous: reads new values and calls incomingTxMonitorService.updateConfig().
   */
  private reloadIncomingMonitor(): void {
    const svc = this.deps.incomingTxMonitorService;
    if (!svc) return;

    const ss = this.deps.settingsService;
    svc.updateConfig({
      enabled: ss.get('incoming.enabled') === 'true',
      pollIntervalSec: parseInt(ss.get('incoming.poll_interval') || '30', 10),
      retentionDays: parseInt(ss.get('incoming.retention_days') || '90', 10),
      dustThresholdUsd: parseFloat(ss.get('incoming.suspicious_dust_usd') || '0.01'),
      amountMultiplier: parseFloat(ss.get('incoming.suspicious_amount_multiplier') || '10'),
      cooldownMinutes: parseInt(ss.get('incoming.cooldown_minutes') || '5', 10),
    });
    console.log('Hot-reload: Incoming TX monitor config updated');
  }

  /**
   * Reload WalletConnect by shutting down old SignClient and re-initializing.
   * Uses the mutable WcServiceRef so route handlers pick up the new instance.
   * Also creates/destroys WcSigningBridge to match WcSessionService lifecycle.
   */
  private async reloadWalletConnect(): Promise<void> {
    const ref = this.deps.wcServiceRef;
    if (!ref) return;

    const sqlite = this.deps.sqlite;
    if (!sqlite) return;

    // 1. Shutdown existing service
    if (ref.current) {
      try {
        await ref.current.shutdown();
      } catch {
        // Best-effort shutdown
      }
      ref.current = null;
    }

    // 1b. Destroy existing WcSigningBridge
    const bridgeRef = this.deps.wcSigningBridgeRef;
    if (bridgeRef) {
      bridgeRef.current = null;
    }

    // 2. Check if new project_id exists
    const ss = this.deps.settingsService;
    const projectId = ss.get('walletconnect.project_id');

    if (!projectId) {
      console.log('Hot-reload: WalletConnect disabled (project_id cleared)');
      return;
    }

    // 3. Create and initialize new WcSessionService
    const { WcSessionService } = await import('../../services/wc-session-service.js');
    const newService = new WcSessionService({ sqlite, settingsService: ss });
    await newService.initialize();
    ref.current = newService;

    // 4. Create WcSigningBridge (requires approvalWorkflow)
    if (bridgeRef && this.deps.approvalWorkflow) {
      const { WcSigningBridge } = await import('../../services/wc-signing-bridge.js');
      bridgeRef.current = new WcSigningBridge({
        wcServiceRef: ref,
        approvalWorkflow: this.deps.approvalWorkflow,
        sqlite,
        notificationService: this.deps.notificationService ?? undefined,
      });
      console.log('Hot-reload: WalletConnect service + signing bridge re-initialized');
    } else {
      console.log('Hot-reload: WalletConnect service re-initialized (no signing bridge — approvalWorkflow unavailable)');
    }
  }

  /**
   * Reload Telegram Bot by stopping the old instance and creating a new one.
   * Uses the mutable telegramBotRef so daemon keeps a live reference.
   */
  private async reloadTelegramBot(): Promise<void> {
    const ref = this.deps.telegramBotRef;
    if (!ref) return;

    const sqlite = this.deps.sqlite;
    if (!sqlite) return;

    // 1. Stop existing bot
    if (ref.current) {
      ref.current.stop();
      ref.current = null;
    }

    // 2. Check if bot_token exists (bot enabled when token is present)
    const ss = this.deps.settingsService;
    // Token priority: telegram.bot_token > notifications.telegram_bot_token
    const botToken = ss.get('telegram.bot_token') || ss.get('notifications.telegram_bot_token');

    if (!botToken) {
      console.log('Hot-reload: Telegram Bot stopped (no token)');
      return;
    }

    // 3. Create and start new bot
    const { TelegramBotService, TelegramApi } = await import('../telegram/index.js');
    const locale = (ss.get('telegram.locale') || ss.get('notifications.locale') || 'en') as 'en' | 'ko';
    const api = new TelegramApi(botToken);

    ref.current = new TelegramBotService({
      sqlite,
      api,
      locale,
      killSwitchService: this.deps.killSwitchService ?? undefined,
      notificationService: this.deps.notificationService ?? undefined,
      settingsService: ss,
    });
    ref.current.start();

    console.log('Hot-reload: Telegram Bot re-started with new settings');
  }

  /**
   * Reload action providers when actions.* settings change.
   * Unregisters all built-in providers, then re-registers enabled ones.
   */
  private async reloadActionProviders(_changedKeys: string[]): Promise<void> {
    const ref = this.deps.actionProviderRegistryRef;
    if (!ref?.current) return;

    const registry = ref.current;
    const ss = this.deps.settingsService;

    // Built-in provider names (must match keys used in registerBuiltInProviders)
    const BUILTIN_NAMES = [
      'jupiter_swap', 'zerox_swap', 'lifi',
      'lido_staking', 'jito_staking',
      'aave_v3', 'kamino',
      'pendle_yield', 'drift_perp',
      'erc8004_agent',
      'hyperliquid_perp', 'hyperliquid_spot', 'hyperliquid_sub',
      'dcent_swap',
      'across_bridge',
    ];

    // Unregister all built-in providers first
    for (const name of BUILTIN_NAMES) {
      registry.unregister(name);
    }

    // Re-register enabled ones (forward rpcCaller for Aave V3 on-chain reads)
    const { registerBuiltInProviders } = await import('@waiaas/actions');
    const result = registerBuiltInProviders(registry, ss, {
      rpcCaller: this.deps.rpcCaller ?? undefined,
    });

    console.log(
      `Hot-reload: Action providers reloaded (${result.loaded.length} enabled: ${result.loaded.join(', ') || 'none'}, ${result.skipped.length} disabled: ${result.skipped.join(', ') || 'none'})`,
    );
  }

  /**
   * Reload RPC Pool URLs when rpc_pool.* settings change.
   * For each changed network:
   * 1. Parse the JSON array of user-managed URLs from SettingsService
   * 2. Build merged URL list: [user URLs] + [config.toml URL] + [built-in defaults]
   * 3. Replace the network's URL list in RpcPool atomically
   * 4. Evict cached adapters so next resolve() uses the new pool
   */
  private async reloadRpcPool(changedPoolKeys: string[]): Promise<void> {
    const pool = this.deps.adapterPool;
    if (!pool) return;

    const rpcPool = pool.pool;
    if (!rpcPool) return;

    const ss = this.deps.settingsService;

    // Dynamically import BUILT_IN_RPC_DEFAULTS
    const { BUILT_IN_RPC_DEFAULTS } = await import('@waiaas/core');

    for (const key of changedPoolKeys) {
      // key format: 'rpc_pool.solana-mainnet' or 'rpc_pool.ethereum-sepolia'
      const network = key.replace('rpc_pool.', '');

      // 1. Parse user-managed URL list from settings
      const rawJson = ss.get(key);
      let userUrls: string[] = [];
      try {
        const parsed = JSON.parse(rawJson);
        if (Array.isArray(parsed)) {
          userUrls = parsed.filter((u: unknown) => typeof u === 'string' && u.length > 0);
        }
      } catch {
        // Invalid JSON -- treat as empty
        userUrls = [];
      }

      // 2. Get config.toml URL for this network (if any)
      const configUrls: string[] = [];
      const configKey = this.networkToConfigKey(network);
      if (configKey) {
        const configUrl = ss.get(`rpc.${configKey}`);
        if (configUrl) {
          configUrls.push(configUrl);
        }
      }

      // 3. Get built-in defaults for this network
      const builtInUrls = (BUILT_IN_RPC_DEFAULTS as Record<string, readonly string[]>)[network] ?? [];

      // 4. Merge: user URLs (highest priority) -> config.toml -> built-in defaults
      // Deduplicate while preserving order
      const seen = new Set<string>();
      const mergedUrls: string[] = [];
      for (const url of [...userUrls, ...configUrls, ...builtInUrls]) {
        if (!seen.has(url)) {
          seen.add(url);
          mergedUrls.push(url);
        }
      }

      // 5. Atomic replace in RpcPool
      rpcPool.replaceNetwork(network, mergedUrls);
      console.log(`Hot-reload: RpcPool ${network} updated (${mergedUrls.length} URLs: ${userUrls.length} user + ${configUrls.length} config + dedup built-in)`);

      // 6. Evict cached adapters for affected network
      // Determine chain type from network name
      const solanaNetworks = new Set(['solana-mainnet', 'solana-devnet', 'solana-testnet']);
      if (solanaNetworks.has(network)) {
        await pool.evict('solana' as ChainType, network as NetworkType);
      } else {
        await pool.evict('ethereum' as ChainType, network as NetworkType);
      }
    }
  }

  /**
   * Reverse map: network name -> config.toml rpc field key.
   * solana-mainnet -> solana_mainnet, solana-devnet -> solana_devnet
   * ethereum-sepolia -> evm_ethereum_sepolia, base-mainnet -> evm_base_mainnet
   */
  private networkToConfigKey(network: string): string | null {
    const solanaNetworks = new Set(['solana-mainnet', 'solana-devnet', 'solana-testnet']);
    if (solanaNetworks.has(network)) {
      // solana-mainnet -> solana_mainnet (strip 'solana-', prefix 'solana_')
      return `solana_${network.slice('solana-'.length)}`;
    }
    // EVM: ethereum-sepolia -> evm_ethereum_sepolia
    return `evm_${network.replace(/-/g, '_')}`;
  }

  /**
   * Reload RPC adapters by evicting changed network adapters from the pool.
   * Next request for that chain:network will lazy-create a new adapter with the new URL.
   */
  private async reloadRpc(changedRpcKeys: string[]): Promise<void> {
    const pool = this.deps.adapterPool;
    if (!pool) return;

    for (const key of changedRpcKeys) {
      // key format: 'rpc.solana_mainnet' or 'rpc.evm_ethereum_sepolia'
      const field = key.replace('rpc.', '');

      if (field.startsWith('solana_')) {
        const network = `solana-${field.replace('solana_', '')}`;
        await pool.evict('solana' as ChainType, network as NetworkType);
        console.log(`Hot-reload: Evicted solana:${network} adapter`);
      } else if (field.startsWith('evm_')) {
        // Convert evm_ethereum_sepolia -> ethereum-sepolia
        const network = field.replace('evm_', '').replace(/_/g, '-');
        await pool.evict('ethereum' as ChainType, network as NetworkType);
        console.log(`Hot-reload: Evicted ethereum:${network} adapter`);
      }
    }

    // Reset RpcPool cooldown for affected networks so next resolve starts fresh
    const rpcPool = pool.pool;
    if (rpcPool) {
      for (const key of changedRpcKeys) {
        const field = key.replace('rpc.', '');
        const network = configKeyToNetwork(field);
        if (network && rpcPool.hasNetwork(network)) {
          rpcPool.reset(network);
          console.log(`Hot-reload: Reset RpcPool cooldown for ${network}`);
        }
      }
    }
  }
}
