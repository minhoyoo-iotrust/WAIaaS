/**
 * BundlerClient and PaymasterClient factory for ERC-4337 smart accounts.
 *
 * Creates viem BundlerClient/PaymasterClient from Admin Settings URLs.
 * Supports chain-specific URL overrides (smart_account.bundler_url.{networkId}).
 *
 * Gas estimation strategy for smart account UserOperations:
 *
 * The project CLAUDE.md mandates: (estimatedGas * 120n) / 100n bigint arithmetic.
 *
 * Implementation in stage5ExecuteSmartAccount (stages.ts):
 * 1. bundlerClient.prepareUserOperation() -> calls eth_estimateUserOperationGas
 * 2. Apply 120% safety margin to callGasLimit, verificationGasLimit, preVerificationGas
 * 3. Pass overridden gas limits via userOperation parameter in sendUserOperation()
 *
 * This explicit override ensures the project safety margin is applied regardless
 * of individual Bundler service behavior (Pimlico, Stackup, Alchemy, etc.).
 *
 * @see internal/objectives/m30-06-erc4337-account-abstraction.md
 */
import { createBundlerClient, createPaymasterClient } from 'viem/account-abstraction';
import type { SmartAccount, BundlerClient, PaymasterClient } from 'viem/account-abstraction';
import { http } from 'viem';
import type { PublicClient } from 'viem';
import { WAIaaSError } from '@waiaas/core';
import type { SettingsService } from '../settings/settings-service.js';

export interface BundlerClientOptions {
  /** viem PublicClient for the target chain */
  client: PublicClient;
  /** SmartAccount instance from SmartAccountService */
  account: SmartAccount;
  /** Network ID for chain-specific URL resolution (e.g., 'ethereum-sepolia') */
  networkId: string;
  /** SettingsService for reading bundler/paymaster URLs */
  settingsService: SettingsService;
}

/**
 * Resolve the Bundler URL for a given network.
 * Priority: chain-specific (smart_account.bundler_url.{networkId}) > default (smart_account.bundler_url)
 *
 * Returns null if no URL is configured (both chain-specific and default are empty).
 */
export function resolveBundlerUrl(settingsService: SettingsService, networkId: string): string | null {
  // Try chain-specific URL first
  try {
    const chainSpecific = settingsService.get(`smart_account.bundler_url.${networkId}`);
    if (chainSpecific) return chainSpecific;
  } catch {
    // Unknown chain-specific key -- fall through to default
  }
  const defaultUrl = settingsService.get('smart_account.bundler_url');
  return defaultUrl || null;
}

/**
 * Resolve the Paymaster URL for a given network.
 * Priority: chain-specific (smart_account.paymaster_url.{networkId}) > default (smart_account.paymaster_url)
 *
 * Returns null if no URL is configured (both chain-specific and default are empty).
 */
export function resolvePaymasterUrl(settingsService: SettingsService, networkId: string): string | null {
  // Try chain-specific URL first
  try {
    const chainSpecific = settingsService.get(`smart_account.paymaster_url.${networkId}`);
    if (chainSpecific) return chainSpecific;
  } catch {
    // Unknown chain-specific key -- fall through to default
  }
  const defaultUrl = settingsService.get('smart_account.paymaster_url');
  return defaultUrl || null;
}

/**
 * Create a BundlerClient for submitting UserOperations.
 *
 * Throws WAIaaSError('CHAIN_ERROR') if no bundler URL is configured.
 * Optionally includes a PaymasterClient if paymaster_url is configured.
 */
export function createSmartAccountBundlerClient(opts: BundlerClientOptions): BundlerClient {
  const bundlerUrl = resolveBundlerUrl(opts.settingsService, opts.networkId);
  if (!bundlerUrl) {
    throw new WAIaaSError('CHAIN_ERROR', {
      message: 'Bundler URL not configured. Set smart_account.bundler_url in Admin Settings.',
    });
  }

  const paymasterUrl = resolvePaymasterUrl(opts.settingsService, opts.networkId);

  // Build paymaster option: if URL exists, create PaymasterClient and use its methods
  const paymasterOpt = paymasterUrl
    ? (() => {
        const pmClient = createPaymasterClient({ transport: http(paymasterUrl) });
        return {
          getPaymasterData: pmClient.getPaymasterData,
          getPaymasterStubData: pmClient.getPaymasterStubData,
        };
      })()
    : undefined;

  return createBundlerClient({
    client: opts.client,
    account: opts.account,
    transport: http(bundlerUrl),
    ...(paymasterOpt ? { paymaster: paymasterOpt } : {}),
  }) as BundlerClient;
}

/**
 * Create a standalone PaymasterClient (for direct usage).
 * Returns null if paymaster_url is not configured (agent pays gas directly).
 */
export function createSmartAccountPaymasterClient(
  settingsService: SettingsService,
  networkId: string,
): PaymasterClient | null {
  const paymasterUrl = resolvePaymasterUrl(settingsService, networkId);
  if (!paymasterUrl) return null;
  return createPaymasterClient({ transport: http(paymasterUrl) });
}
