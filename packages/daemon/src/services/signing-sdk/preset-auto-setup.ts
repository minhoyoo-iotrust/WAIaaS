/**
 * PresetAutoSetupService — 4-step atomic auto-setup pipeline.
 *
 * When a wallet preset (e.g. D'CENT) is selected during owner registration,
 * this service configures all signing SDK settings in a single atomic operation:
 *
 * 1. Enable signing SDK (signing_sdk.enabled = 'true')
 * 2. Register WalletLinkConfig in WalletLinkRegistry
 * 3. Set preferred_channel in Settings (based on approval method)
 * 4. Register + enable signing on wallet app (via WalletAppService)
 *
 * On failure, all Settings changes are rolled back via snapshot restore.
 * The caller is responsible for wrapping DB changes in a SQLite transaction.
 *
 * @see Phase 266 — Auto-Setup Orchestration
 * @see Phase 467 — signing_enabled column replaces preferred_wallet setting
 */

import type { WalletPreset } from '@waiaas/core';
import { WAIaaSError } from '@waiaas/core';
import type { SettingsService } from '../../infrastructure/settings/settings-service.js';
import type { WalletLinkRegistry } from './wallet-link-registry.js';
import type { WalletAppService } from './wallet-app-service.js';

// ---------------------------------------------------------------------------
// Step names for the applied list
// ---------------------------------------------------------------------------

const STEP_SDK_ENABLED = 'signing_sdk_enabled';
const STEP_WALLET_REGISTERED = 'wallet_registered';
const STEP_PREFERRED_CHANNEL = 'preferred_channel_set';
const STEP_WALLET_APP_REGISTERED = 'wallet_app_registered';

// ---------------------------------------------------------------------------
// Settings keys used in snapshot (preferred_wallet removed in v33.4)
// ---------------------------------------------------------------------------

const SNAPSHOT_KEYS = [
  'signing_sdk.enabled',
  'signing_sdk.preferred_channel',
] as const;

// ---------------------------------------------------------------------------
// PresetAutoSetupService
// ---------------------------------------------------------------------------

export class PresetAutoSetupService {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly walletLinkRegistry: WalletLinkRegistry,
    private readonly walletAppService?: WalletAppService,
  ) {}

  /**
   * Apply preset auto-setup: 4 steps with Settings snapshot rollback.
   *
   * Steps:
   *   (1) enable signing SDK
   *   (2) register WalletLinkConfig
   *   (3) set preferred_channel
   *   (4) register + enable signing on wallet app
   *
   * approval_method is handled by the caller (wallets.ts handler saves to DB).
   *
   * @returns { applied: string[] } — list of steps that were applied
   * @throws — re-throws after rolling back Settings snapshot
   */
  apply(preset: WalletPreset): { applied: string[] } {
    // Capture Settings snapshot for rollback
    const snapshot: Record<string, string> = {};
    for (const key of SNAPSHOT_KEYS) {
      snapshot[key] = this.settingsService.get(key);
    }

    const applied: string[] = [];

    try {
      // Step 1: Enable signing SDK
      const currentEnabled = this.settingsService.get('signing_sdk.enabled');
      if (currentEnabled !== 'true') {
        this.settingsService.set('signing_sdk.enabled', 'true');
        applied.push(STEP_SDK_ENABLED);
      }

      // Step 2: Register WalletLinkConfig (idempotent — skip if already registered)
      try {
        this.walletLinkRegistry.registerWallet(preset.walletLinkConfig);
        applied.push(STEP_WALLET_REGISTERED);
      } catch (err) {
        // SIGN_REQUEST_ALREADY_PROCESSED means wallet is already registered — skip (idempotent)
        if (
          err instanceof WAIaaSError &&
          err.code === 'SIGN_REQUEST_ALREADY_PROCESSED'
        ) {
          // Already registered, skip
        } else {
          throw err;
        }
      }

      // Step 3: Set preferred_channel based on approval method
      switch (preset.approvalMethod) {
        case 'sdk_push':
          this.settingsService.set('signing_sdk.preferred_channel', 'push_relay');
          applied.push(STEP_PREFERRED_CHANNEL);
          break;
        case 'sdk_telegram':
          this.settingsService.set('signing_sdk.preferred_channel', 'telegram');
          applied.push(STEP_PREFERRED_CHANNEL);
          break;
        case 'walletconnect':
          // WalletConnect is not a signing SDK channel — don't touch preferred_channel
          break;
        default:
          // Other approval methods: skip channel setting
          break;
      }

      // Step 4: Register wallet app + enable signing (v33.4: replaces preferred_wallet setting)
      // Use preferredWallet as app name (matches wallet_type / BUILTIN_PRESETS key)
      if (this.walletAppService) {
        const app = this.walletAppService.ensureRegistered(preset.preferredWallet, preset.displayName, { walletType: preset.preferredWallet });
        // Enable signing on this app (exclusive toggle handles disabling others)
        this.walletAppService.update(app.id, { signingEnabled: true });
        applied.push(STEP_WALLET_APP_REGISTERED);
      }

      return { applied };
    } catch (err) {
      // Rollback: restore all snapshot keys, each in its own try/catch
      for (const key of SNAPSHOT_KEYS) {
        try {
          this.settingsService.set(key, snapshot[key]!);
        } catch {
          // Swallow restore errors to avoid masking the original error
        }
      }
      throw err;
    }
  }
}
