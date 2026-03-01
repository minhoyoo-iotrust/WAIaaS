/**
 * WAIaaS built-in DeFi Action Provider implementations.
 *
 * Exports registerBuiltInProviders() for daemon lifecycle integration
 * and individual provider classes for direct usage.
 */
import type { IActionProvider, NetworkType } from '@waiaas/core';
import { deriveEnvironment } from '@waiaas/core';
import { JupiterSwapActionProvider } from './providers/jupiter-swap/index.js';
import { ZeroExSwapActionProvider } from './providers/zerox-swap/index.js';
import { LiFiActionProvider } from './providers/lifi/index.js';
import { LidoStakingActionProvider } from './providers/lido-staking/index.js';
import { getLidoAddresses, type LidoStakingConfig } from './providers/lido-staking/config.js';
import { JitoStakingActionProvider } from './providers/jito-staking/index.js';
import { getJitoAddresses, type JitoStakingConfig } from './providers/jito-staking/config.js';
import { AaveV3LendingProvider } from './providers/aave-v3/index.js';
import { type AaveV3Config } from './providers/aave-v3/config.js';
import type { IRpcCaller } from './providers/aave-v3/aave-rpc.js';
import { KaminoLendingProvider } from './providers/kamino/index.js';
import type { KaminoConfig } from './providers/kamino/config.js';
import { PendleYieldProvider } from './providers/pendle/index.js';
import type { PendleConfig } from './providers/pendle/config.js';

// Re-export provider classes
export { JupiterSwapActionProvider } from './providers/jupiter-swap/index.js';
export { JUPITER_PROGRAM_ID, JUPITER_SWAP_DEFAULTS } from './providers/jupiter-swap/config.js';
export type { JupiterSwapConfig } from './providers/jupiter-swap/config.js';

export { ZeroExSwapActionProvider } from './providers/zerox-swap/index.js';
export { ALLOWANCE_HOLDER_ADDRESSES, ZEROX_SWAP_DEFAULTS, CHAIN_ID_MAP, getAllowanceHolderAddress } from './providers/zerox-swap/config.js';
export type { ZeroExSwapConfig } from './providers/zerox-swap/config.js';

export { LiFiActionProvider } from './providers/lifi/index.js';
export { LIFI_DEFAULTS, LIFI_CHAIN_MAP, getLiFiChainId } from './providers/lifi/config.js';
export type { LiFiConfig } from './providers/lifi/config.js';
export { LiFiApiClient } from './providers/lifi/lifi-api-client.js';
export { BridgeStatusTracker, BridgeMonitoringTracker } from './providers/lifi/bridge-status-tracker.js';

export { LidoStakingActionProvider } from './providers/lido-staking/index.js';
export { LIDO_STAKING_DEFAULTS, LIDO_MAINNET_ADDRESSES, LIDO_TESTNET_ADDRESSES, getLidoAddresses } from './providers/lido-staking/config.js';
export type { LidoStakingConfig } from './providers/lido-staking/config.js';
export { LidoWithdrawalTracker } from './providers/lido-staking/withdrawal-tracker.js';

export { JitoStakingActionProvider } from './providers/jito-staking/index.js';
export { JITO_STAKING_DEFAULTS, JITO_MAINNET_ADDRESSES, getJitoAddresses } from './providers/jito-staking/config.js';
export type { JitoStakingConfig } from './providers/jito-staking/config.js';
export { JitoEpochTracker } from './providers/jito-staking/epoch-tracker.js';

export { AaveV3LendingProvider } from './providers/aave-v3/index.js';
export { AAVE_V3_DEFAULTS, AAVE_V3_ADDRESSES, getAaveAddresses, AAVE_CHAIN_ID_MAP } from './providers/aave-v3/config.js';
export type { AaveV3Config, AaveChainAddresses } from './providers/aave-v3/config.js';
export type { IRpcCaller, UserAccountData, ReserveData } from './providers/aave-v3/aave-rpc.js';
export { decodeGetUserAccountData, decodeGetReserveData, simulateHealthFactor, rayToApy, hfToNumber, LIQUIDATION_THRESHOLD_HF, WARNING_THRESHOLD_HF } from './providers/aave-v3/aave-rpc.js';

export { KaminoLendingProvider } from './providers/kamino/index.js';
export { KAMINO_DEFAULTS, KAMINO_PROGRAM_ID, KAMINO_MAIN_MARKET, resolveMarketAddress } from './providers/kamino/config.js';
export type { KaminoConfig } from './providers/kamino/config.js';
export type { IKaminoSdkWrapper, KaminoInstruction, KaminoObligation, KaminoReserve } from './providers/kamino/kamino-sdk-wrapper.js';
export { MockKaminoSdkWrapper } from './providers/kamino/kamino-sdk-wrapper.js';
export { calculateHealthFactor, simulateKaminoHealthFactor, hfToStatus, KAMINO_LIQUIDATION_THRESHOLD, KAMINO_DEFAULT_HF_THRESHOLD } from './providers/kamino/hf-simulation.js';

export { PendleYieldProvider } from './providers/pendle/index.js';
export { PENDLE_DEFAULTS, PENDLE_CHAIN_ID_MAP, getPendleChainId } from './providers/pendle/config.js';
export type { PendleConfig } from './providers/pendle/config.js';
export { PendleApiClient } from './providers/pendle/pendle-api-client.js';

// Re-export common utilities
export { ActionApiClient } from './common/action-api-client.js';
export { asBps, asPct, clampSlippageBps, bpsToPct, pctToBps } from './common/slippage.js';
export type { SlippageBps, SlippagePct } from './common/slippage.js';

// Re-export async status tracker interface and types (v28.3 DEFI-04)
export {
  BRIDGE_STATUS_VALUES,
  BridgeStatusEnum,
} from './common/async-status-tracker.js';
export type {
  IAsyncStatusTracker,
  AsyncTrackingResult,
  BridgeStatus,
} from './common/async-status-tracker.js';

// ---------------------------------------------------------------------------
// Built-in provider registration
// ---------------------------------------------------------------------------

/** Minimal settings reader interface compatible with SettingsService.get(). */
export interface SettingsReader {
  get(key: string): string;
}

interface ProviderRegistry {
  register(provider: IActionProvider): void;
}

/**
 * Register built-in DeFi action providers from Admin Settings.
 *
 * Reads provider config from SettingsReader (DB > config.toml > default fallback chain).
 * Each provider is registered when its `actions.{name}_enabled` setting is 'true'.
 */
export function registerBuiltInProviders(
  registry: ProviderRegistry,
  settingsReader: SettingsReader,
  options?: { rpcCaller?: IRpcCaller },
): { loaded: string[]; skipped: string[] } {
  const loaded: string[] = [];
  const skipped: string[] = [];

  const providers: Array<{
    key: string;
    enabledKey: string;
    factory: () => IActionProvider | null;
  }> = [
    {
      key: 'jupiter_swap',
      enabledKey: 'actions.jupiter_swap_enabled',
      factory: () => {
        const config: import('./providers/jupiter-swap/config.js').JupiterSwapConfig = {
          enabled: true,
          apiBaseUrl: settingsReader.get('actions.jupiter_swap_api_base_url'),
          apiKey: settingsReader.get('actions.jupiter_swap_api_key'),
          defaultSlippageBps: Number(settingsReader.get('actions.jupiter_swap_default_slippage_bps')),
          maxSlippageBps: Number(settingsReader.get('actions.jupiter_swap_max_slippage_bps')),
          maxPriceImpactPct: Number(settingsReader.get('actions.jupiter_swap_max_price_impact_pct')),
          jitoTipLamports: Number(settingsReader.get('actions.jupiter_swap_jito_tip_lamports')),
          requestTimeoutMs: Number(settingsReader.get('actions.jupiter_swap_request_timeout_ms')),
        };
        return new JupiterSwapActionProvider(config);
      },
    },
    {
      key: 'zerox_swap',
      enabledKey: 'actions.zerox_swap_enabled',
      factory: () => {
        const config: Partial<import('./providers/zerox-swap/config.js').ZeroExSwapConfig> = {
          enabled: true,
          apiKey: settingsReader.get('actions.zerox_swap_api_key'),
          defaultSlippageBps: Number(settingsReader.get('actions.zerox_swap_default_slippage_bps')),
          maxSlippageBps: Number(settingsReader.get('actions.zerox_swap_max_slippage_bps')),
          requestTimeoutMs: Number(settingsReader.get('actions.zerox_swap_request_timeout_ms')),
        };
        return new ZeroExSwapActionProvider(config);
      },
    },
    {
      key: 'lifi',
      enabledKey: 'actions.lifi_enabled',
      factory: () => {
        const config: import('./providers/lifi/config.js').LiFiConfig = {
          enabled: true,
          apiBaseUrl: settingsReader.get('actions.lifi_api_base_url'),
          apiKey: settingsReader.get('actions.lifi_api_key'),
          defaultSlippagePct: Number(settingsReader.get('actions.lifi_default_slippage_pct')),
          maxSlippagePct: Number(settingsReader.get('actions.lifi_max_slippage_pct')),
          requestTimeoutMs: 15_000,
        };
        return new LiFiActionProvider(config);
      },
    },
    {
      key: 'lido_staking',
      enabledKey: 'actions.lido_staking_enabled',
      factory: () => {
        // Lido is Ethereum-only; default to mainnet
        const evmNetwork: NetworkType = 'ethereum-mainnet';
        const isTestnet = deriveEnvironment(evmNetwork) === 'testnet';
        const addresses = getLidoAddresses(isTestnet ? 'testnet' : 'mainnet');

        // Admin Settings overrides individual addresses; empty string falls back to environment default
        const stethOverride = settingsReader.get('actions.lido_staking_steth_address');
        const withdrawalOverride = settingsReader.get('actions.lido_staking_withdrawal_queue_address');

        const config: LidoStakingConfig = {
          enabled: true,
          stethAddress: stethOverride || addresses.stethAddress,
          withdrawalQueueAddress: withdrawalOverride || addresses.withdrawalQueueAddress,
        };
        return new LidoStakingActionProvider(config);
      },
    },
    {
      key: 'jito_staking',
      enabledKey: 'actions.jito_staking_enabled',
      factory: () => {
        // Jito is mainnet-only -- no testnet pool exists.
        // Read admin override addresses; empty string falls back to mainnet defaults.
        const stakePoolOverride = settingsReader.get('actions.jito_staking_stake_pool_address');
        const jitosolMintOverride = settingsReader.get('actions.jito_staking_jitosol_mint');

        const addresses = getJitoAddresses('mainnet');

        const config: JitoStakingConfig = {
          enabled: true,
          stakePoolAddress: stakePoolOverride || addresses.stakePoolAddress,
          jitosolMint: jitosolMintOverride || addresses.jitosolMint,
          stakePoolProgram: addresses.stakePoolProgram,
        };
        return new JitoStakingActionProvider(config);
      },
    },
    {
      key: 'aave_v3',
      enabledKey: 'actions.aave_v3_enabled',
      factory: () => {
        const config: AaveV3Config = { enabled: true };
        return new AaveV3LendingProvider(config, options?.rpcCaller);
      },
    },
    {
      key: 'kamino',
      enabledKey: 'actions.kamino_enabled',
      factory: () => {
        const config: KaminoConfig = {
          enabled: true,
          market: settingsReader.get('actions.kamino_market') || 'main',
          hfThreshold: Number(settingsReader.get('actions.kamino_hf_threshold')) || 1.2,
        };
        return new KaminoLendingProvider(config);
      },
    },
    {
      key: 'pendle_yield',
      enabledKey: 'actions.pendle_yield_enabled',
      factory: () => {
        const config: PendleConfig = {
          enabled: true,
          apiBaseUrl: settingsReader.get('actions.pendle_yield_api_base_url') || 'https://api-v2.pendle.finance',
          apiKey: settingsReader.get('actions.pendle_yield_api_key') || '',
          defaultSlippageBps: Number(settingsReader.get('actions.pendle_yield_default_slippage_bps')) || 100,
          maxSlippageBps: Number(settingsReader.get('actions.pendle_yield_max_slippage_bps')) || 500,
          requestTimeoutMs: Number(settingsReader.get('actions.pendle_yield_request_timeout_ms')) || 10_000,
        };
        return new PendleYieldProvider(config);
      },
    },
  ];

  for (const { key, enabledKey, factory } of providers) {
    if (settingsReader.get(enabledKey) === 'true') {
      try {
        const provider = factory();
        if (provider) {
          registry.register(provider);
          loaded.push(key);
        } else {
          skipped.push(key);
        }
      } catch (err) {
        console.warn(`Built-in provider '${key}' registration failed:`, err);
        skipped.push(key);
      }
    } else {
      skipped.push(key);
    }
  }

  return { loaded, skipped };
}
