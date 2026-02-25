// Zod SSoT for wallet preset types
import { z } from 'zod';

/** Wallet preset type identifiers (lowercase kebab-case). */
export const WALLET_PRESET_TYPES = ['dcent'] as const;

export const WalletPresetTypeSchema = z.enum(WALLET_PRESET_TYPES);
export type WalletPresetType = z.infer<typeof WalletPresetTypeSchema>;

/** Wallet preset configuration — defines auto-setup parameters for a wallet type. */
export interface WalletPreset {
  /** Display name (human-readable). */
  displayName: string;
  /** Preferred approval method for this wallet type. */
  approvalMethod: 'sdk_ntfy' | 'sdk_telegram' | 'walletconnect' | 'telegram_bot' | 'rest';
  /** Preferred wallet identifier for signing SDK registry. */
  preferredWallet: string;
  /** Whether signing SDK should be enabled for this preset. */
  signingEnabled: boolean;
  /** Optional description for Admin UI display. */
  description?: string;
}

/**
 * Builtin preset registry.
 * Key = WalletPresetType, Value = WalletPreset config.
 * Phase 266 auto-setup reads from this registry.
 */
export const BUILTIN_PRESETS: Record<WalletPresetType, WalletPreset> = {
  dcent: {
    displayName: "D'CENT Wallet",
    approvalMethod: 'walletconnect',
    preferredWallet: 'dcent',
    signingEnabled: true,
    description: "D'CENT hardware wallet with WalletConnect signing",
  },
};
