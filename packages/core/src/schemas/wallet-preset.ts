// Zod SSoT for wallet preset types
import { z } from 'zod';
import type { WalletLinkConfig } from './signing-protocol.js';

/** Wallet preset type identifiers (lowercase kebab-case). */
export const WALLET_PRESET_TYPES = ['dcent'] as const;

export const WalletPresetTypeSchema = z.enum(WALLET_PRESET_TYPES);
export type WalletPresetType = z.infer<typeof WalletPresetTypeSchema>;

/** Wallet preset configuration — defines auto-setup parameters for a wallet type. */
export interface WalletPreset {
  /** Display name (human-readable). */
  displayName: string;
  /** Preferred approval method for this wallet type. */
  approvalMethod: 'sdk_push' | 'sdk_telegram' | 'walletconnect' | 'telegram_bot' | 'rest';
  /** Preferred wallet identifier for signing SDK registry. */
  preferredWallet: string;
  /** Whether signing SDK should be enabled for this preset. */
  signingEnabled: boolean;
  /** Optional description for Admin UI display. */
  description?: string;
  /** WalletLinkConfig for signing SDK WalletLinkRegistry auto-registration. */
  walletLinkConfig: WalletLinkConfig;
}

/**
 * Builtin preset registry.
 * Key = WalletPresetType, Value = WalletPreset config.
 * Phase 266 auto-setup reads from this registry.
 */
export const BUILTIN_PRESETS: Record<WalletPresetType, WalletPreset> = {
  dcent: {
    displayName: "D'CENT Wallet",
    approvalMethod: 'sdk_push',
    preferredWallet: 'dcent',
    signingEnabled: true,
    description: "D'CENT hardware wallet with push notification signing",
    walletLinkConfig: {
      name: 'dcent',
      displayName: "D'CENT Wallet",
      universalLink: {
        base: 'https://link.dcentwallet.com',
        signPath: '/waiaas/sign',
      },
      deepLink: {
        scheme: 'dcent-wallet',
        signPath: '/waiaas/sign',
      },
    },
  },
};
