/**
 * BundlerClient factory for ERC-4337 smart accounts (v30.9 wallet-based provider model).
 *
 * Creates viem BundlerClient from per-wallet provider data instead of global settings.
 * Each smart account wallet stores its own provider (pimlico/alchemy/custom) + API key.
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
 * @see internal/objectives/m30-09-smart-account-dx.md
 */
import { createBundlerClient, createPaymasterClient } from 'viem/account-abstraction';
import type { SmartAccount, BundlerClient } from 'viem/account-abstraction';
import { http } from 'viem';
import type { PublicClient } from 'viem';
import {
  WAIaaSError,
  resolveProviderChainId,
  buildProviderBundlerUrl,
} from '@waiaas/core';
import type { AaProviderName } from '@waiaas/core';

/**
 * Per-wallet provider data for bundler/paymaster URL resolution.
 * Populated from wallets table columns (API key already decrypted).
 */
export interface WalletProviderData {
  aaProvider: AaProviderName | null;
  aaProviderApiKey: string | null; // decrypted plaintext
  aaBundlerUrl: string | null; // for custom provider
  aaPaymasterUrl: string | null; // for custom provider
  aaPaymasterPolicyId: string | null; // #252: sponsorshipPolicyId for paymaster context
}

export interface BundlerClientOptions {
  /** viem PublicClient for the target chain */
  client: PublicClient;
  /** SmartAccount instance from SmartAccountService */
  account: SmartAccount;
  /** Network ID for chain-specific URL resolution (e.g., 'ethereum-sepolia') */
  networkId: string;
  /** Wallet provider data (replaces SettingsService) */
  walletProvider: WalletProviderData;
}

/**
 * Resolve the Bundler URL for a wallet's provider + network combination.
 *
 * - pimlico/alchemy: auto-assembles URL from chain mapping + API key
 * - custom: returns wallet's aaBundlerUrl directly
 * - null: throws CHAIN_ERROR (provider not configured)
 *
 * @throws WAIaaSError('CHAIN_ERROR') if provider not configured or network unsupported
 */
export function resolveWalletBundlerUrl(wallet: WalletProviderData, networkId: string): string {
  if (!wallet.aaProvider) {
    throw new WAIaaSError('CHAIN_ERROR', {
      message: 'Provider not configured for this wallet. Set aaProvider when creating the wallet.',
    });
  }

  if (wallet.aaProvider === 'custom') {
    if (!wallet.aaBundlerUrl) {
      throw new WAIaaSError('CHAIN_ERROR', {
        message: 'Custom provider requires bundler URL (aaBundlerUrl)',
      });
    }
    return wallet.aaBundlerUrl;
  }

  // Preset provider (pimlico/alchemy): resolve chain mapping + build URL
  const chainId = resolveProviderChainId(wallet.aaProvider, networkId);
  if (!chainId) {
    throw new WAIaaSError('CHAIN_ERROR', {
      message: `Provider ${wallet.aaProvider} does not support network ${networkId}`,
    });
  }

  if (!wallet.aaProviderApiKey) {
    throw new WAIaaSError('CHAIN_ERROR', {
      message: `Provider ${wallet.aaProvider} requires an API key`,
    });
  }

  return buildProviderBundlerUrl(wallet.aaProvider, chainId, wallet.aaProviderApiKey);
}

/**
 * Resolve the Paymaster URL for a wallet's provider + network combination.
 *
 * - pimlico/alchemy: same URL as bundler (unified endpoint)
 * - custom: returns wallet's aaPaymasterUrl (nullable)
 * - null: returns null (no provider configured)
 */
export function resolveWalletPaymasterUrl(wallet: WalletProviderData, networkId: string): string | null {
  if (!wallet.aaProvider) return null;

  if (wallet.aaProvider === 'custom') {
    return wallet.aaPaymasterUrl;
  }

  // Preset provider: same URL as bundler (unified endpoint)
  const chainId = resolveProviderChainId(wallet.aaProvider, networkId);
  if (!chainId || !wallet.aaProviderApiKey) return null;

  return buildProviderBundlerUrl(wallet.aaProvider, chainId, wallet.aaProviderApiKey);
}

/**
 * Create a BundlerClient for submitting UserOperations.
 *
 * Throws WAIaaSError('CHAIN_ERROR') if no bundler URL can be resolved.
 * Optionally includes a PaymasterClient if paymaster URL is available.
 */
export function createSmartAccountBundlerClient(opts: BundlerClientOptions): BundlerClient {
  const bundlerUrl = resolveWalletBundlerUrl(opts.walletProvider, opts.networkId);

  const paymasterUrl = resolveWalletPaymasterUrl(opts.walletProvider, opts.networkId);

  // Build paymaster option: if URL exists, create PaymasterClient and use its methods
  // #252: wrap with context if policyId is set (required for Alchemy, optional for Pimlico)
  const policyId = opts.walletProvider.aaPaymasterPolicyId;
  const paymasterOpt = paymasterUrl
    ? (() => {
        const pmClient = createPaymasterClient({ transport: http(paymasterUrl) });
        return policyId
          ? {
              getPaymasterData: (params: any) =>
                pmClient.getPaymasterData({ ...params, context: { sponsorshipPolicyId: policyId } }),
              getPaymasterStubData: (params: any) =>
                pmClient.getPaymasterStubData({ ...params, context: { sponsorshipPolicyId: policyId } }),
            }
          : {
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
