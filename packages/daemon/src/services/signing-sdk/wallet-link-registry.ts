/**
 * WalletLinkRegistry -- manages wallet registration for the Signing SDK.
 *
 * Stores wallet link configurations as a JSON array in SettingsService
 * under the 'signing_sdk.wallets' key. Provides CRUD operations and
 * universal link URL generation for registered wallets.
 *
 * @see internal/design/74-wallet-sdk-daemon-components.md
 */

import {
  type WalletLinkConfig,
  WalletLinkConfigSchema,
  type SignRequest,
  buildUniversalLinkUrl,
  WAIaaSError,
} from '@waiaas/core';
import { z } from 'zod';
import type { SettingsService } from '../../infrastructure/settings/settings-service.js';

// ---------------------------------------------------------------------------
// Internal: JSON array schema for wallet configs
// ---------------------------------------------------------------------------

const WalletLinkConfigArraySchema = z.array(WalletLinkConfigSchema);

// ---------------------------------------------------------------------------
// WalletLinkRegistry
// ---------------------------------------------------------------------------

export class WalletLinkRegistry {
  private readonly settings: SettingsService;

  constructor(settings: SettingsService) {
    this.settings = settings;
  }

  // -------------------------------------------------------------------------
  // Read: getWallet / getAllWallets
  // -------------------------------------------------------------------------

  /**
   * Get a wallet configuration by name.
   * @throws WAIaaSError('WALLET_NOT_REGISTERED') if wallet is not found.
   */
  getWallet(name: string): WalletLinkConfig {
    const wallets = this.loadWallets();
    const wallet = wallets.find((w) => w.name === name);
    if (!wallet) {
      throw new WAIaaSError('WALLET_NOT_REGISTERED', {
        message: `Wallet '${name}' not registered in signing SDK`,
        details: { walletName: name },
      });
    }
    return wallet;
  }

  /**
   * Get all registered wallet configurations.
   */
  getAllWallets(): WalletLinkConfig[] {
    return this.loadWallets();
  }

  // -------------------------------------------------------------------------
  // Write: registerWallet / removeWallet
  // -------------------------------------------------------------------------

  /**
   * Register a new wallet configuration.
   * @throws WAIaaSError('WALLET_NOT_REGISTERED') is NOT thrown -- instead throws
   *         a generic error if the wallet name already exists (duplicate prevention).
   */
  registerWallet(config: WalletLinkConfig): void {
    // Validate input against schema
    const validated = WalletLinkConfigSchema.parse(config);

    const wallets = this.loadWallets();
    const existing = wallets.find((w) => w.name === validated.name);
    if (existing) {
      throw new WAIaaSError('SIGN_REQUEST_ALREADY_PROCESSED', {
        message: `Wallet '${validated.name}' is already registered`,
        details: { walletName: validated.name },
      });
    }

    wallets.push(validated);
    this.saveWallets(wallets);
  }

  /**
   * Remove a wallet configuration by name.
   * @throws WAIaaSError('WALLET_NOT_REGISTERED') if wallet is not found.
   */
  removeWallet(name: string): void {
    const wallets = this.loadWallets();
    const index = wallets.findIndex((w) => w.name === name);
    if (index === -1) {
      throw new WAIaaSError('WALLET_NOT_REGISTERED', {
        message: `Wallet '${name}' not registered in signing SDK`,
        details: { walletName: name },
      });
    }
    wallets.splice(index, 1);
    this.saveWallets(wallets);
  }

  // -------------------------------------------------------------------------
  // URL generation: buildSignUrl
  // -------------------------------------------------------------------------

  /**
   * Build a universal link URL for a wallet signing request.
   * Combines getWallet() + buildUniversalLinkUrl().
   * @throws WAIaaSError('WALLET_NOT_REGISTERED') if wallet is not found.
   */
  buildSignUrl(walletName: string, request: SignRequest): string {
    const wallet = this.getWallet(walletName);
    return buildUniversalLinkUrl(wallet, request);
  }

  // -------------------------------------------------------------------------
  // Private: load/save from SettingsService
  // -------------------------------------------------------------------------

  private loadWallets(): WalletLinkConfig[] {
    const json = this.settings.get('signing_sdk.wallets');
    try {
      const parsed = JSON.parse(json);
      return WalletLinkConfigArraySchema.parse(parsed);
    } catch {
      // If the stored JSON is invalid, return empty array (graceful degradation)
      return [];
    }
  }

  private saveWallets(wallets: WalletLinkConfig[]): void {
    this.settings.set('signing_sdk.wallets', JSON.stringify(wallets));
  }
}
