/**
 * WAIaaS built-in DeFi Action Provider implementations.
 *
 * Exports registerBuiltInProviders() for daemon lifecycle integration
 * and individual provider classes for direct usage.
 */
import type { IActionProvider, ILogger, NetworkType } from '@waiaas/core';
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
import { DriftPerpProvider } from './providers/drift/index.js';
import type { DriftConfig } from './providers/drift/config.js';
import { Erc8004ActionProvider } from './providers/erc8004/index.js';
import { type Erc8004Config, ERC8004_DEFAULTS } from './providers/erc8004/config.js';
import { DcentSwapActionProvider } from './providers/dcent-swap/index.js';
import type { DcentSwapConfig } from './providers/dcent-swap/config.js';
import { AcrossBridgeActionProvider } from './providers/across/index.js';
import { ACROSS_DEFAULTS } from './providers/across/config.js';
import type { AcrossConfig } from './providers/across/config.js';
import { HyperliquidPerpProvider, HyperliquidSpotProvider, HyperliquidSubAccountService, HyperliquidSubAccountProvider, HyperliquidExchangeClient, HyperliquidMarketData, HyperliquidRateLimiter, HL_DEFAULTS, HL_MAINNET_API_URL, HL_TESTNET_API_URL } from './providers/hyperliquid/index.js';
import { KaminoSdkWrapper } from './providers/kamino/kamino-sdk-wrapper.js';
import { DriftSdkWrapper } from './providers/drift/drift-sdk-wrapper.js';

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

export { DriftPerpProvider } from './providers/drift/index.js';
export { DRIFT_DEFAULTS, DRIFT_PROGRAM_ID } from './providers/drift/config.js';
export type { DriftConfig } from './providers/drift/config.js';
export { MockDriftSdkWrapper } from './providers/drift/drift-sdk-wrapper.js';
export type { IDriftSdkWrapper, DriftInstruction, DriftPosition, DriftMarginInfo } from './providers/drift/drift-sdk-wrapper.js';

export { Erc8004ActionProvider } from './providers/erc8004/index.js';
export type { Eip712Metadata } from './providers/erc8004/index.js';
export { ERC8004_DEFAULTS } from './providers/erc8004/config.js';
export type { Erc8004Config } from './providers/erc8004/config.js';
export { ERC8004_MAINNET_ADDRESSES, ERC8004_TESTNET_ADDRESSES } from './providers/erc8004/constants.js';
export { Erc8004RegistryClient } from './providers/erc8004/erc8004-registry-client.js';
export { buildRegistrationFile } from './providers/erc8004/registration-file.js';
export { IDENTITY_REGISTRY_ABI } from './providers/erc8004/identity-abi.js';
export { REPUTATION_REGISTRY_ABI } from './providers/erc8004/reputation-abi.js';
export { VALIDATION_REGISTRY_ABI } from './providers/erc8004/validation-abi.js';

export { DcentSwapActionProvider } from './providers/dcent-swap/index.js';
export { DCENT_SWAP_DEFAULTS } from './providers/dcent-swap/config.js';
export type { DcentSwapConfig } from './providers/dcent-swap/config.js';
export { DcentSwapApiClient } from './providers/dcent-swap/dcent-api-client.js';
export { caip19ToDcentId, dcentIdToCaip19 } from './providers/dcent-swap/currency-mapper.js';
export type { DcentQuoteResult, GetQuotesParams } from './providers/dcent-swap/dex-swap.js';

export { AcrossBridgeActionProvider } from './providers/across/index.js';
export { ACROSS_DEFAULTS, ACROSS_CHAIN_MAP, getAcrossChainId } from './providers/across/config.js';
export type { AcrossConfig } from './providers/across/config.js';
export { AcrossApiClient } from './providers/across/across-api-client.js';
export { AcrossBridgeStatusTracker, AcrossBridgeMonitoringTracker } from './providers/across/bridge-status-tracker.js';

export { HyperliquidPerpProvider } from './providers/hyperliquid/index.js';
export { HyperliquidSpotProvider, HyperliquidSubAccountService, HyperliquidSubAccountProvider } from './providers/hyperliquid/index.js';
export { HyperliquidExchangeClient, HyperliquidRateLimiter, createHyperliquidClient, HyperliquidMarketData } from './providers/hyperliquid/index.js';
export { HyperliquidSigner } from './providers/hyperliquid/index.js';
export { HL_MAINNET_API_URL, HL_TESTNET_API_URL, HL_DEFAULTS as HL_DEFAULTS_CONFIG, HL_SETTINGS, HL_ERRORS } from './providers/hyperliquid/index.js';
export type { MarketInfo as HlMarketInfo, ExchangeRequest as HlExchangeRequest } from './providers/hyperliquid/index.js';

// Polymarket Prediction Market (Phase 373)
export { createPolymarketInfrastructure } from './providers/polymarket/index.js';
export type { PolymarketInfrastructure, PolymarketConfig, PolymarketDb } from './providers/polymarket/index.js';
export { PolymarketOrderProvider } from './providers/polymarket/index.js';
export { PolymarketCtfProvider } from './providers/polymarket/index.js';
export { PolymarketMarketData } from './providers/polymarket/index.js';
export { PolymarketPositionTracker } from './providers/polymarket/index.js';
export { PolymarketPnlCalculator } from './providers/polymarket/index.js';

// Re-export common utilities
export { ActionApiClient } from './common/action-api-client.js';
export { asBps, asPct, clampSlippageBps, bpsToPct, pctToBps } from './common/slippage.js';
export type { SlippageBps, SlippagePct } from './common/slippage.js';

// Re-export async status tracker interface and types (v28.3 DEFI-04)
export {
  BRIDGE_STATUS_VALUES,
  BridgeStatusEnum,
  ASYNC_TRACKING_STATE_VALUES,
  AsyncTrackingStateEnum,
  isTerminalState,
  isContinuePolling,
} from './common/async-status-tracker.js';
export type {
  IAsyncStatusTracker,
  AsyncTrackingResult,
  AsyncTrackingState,
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
  options?: { rpcCaller?: IRpcCaller; logger?: ILogger },
): { loaded: string[]; skipped: string[]; hyperliquidMarketData?: HyperliquidMarketData } {
  const loaded: string[] = [];
  const skipped: string[] = [];
  let hyperliquidMarketData: HyperliquidMarketData | undefined;
  const logger = options?.logger;

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
        return new JupiterSwapActionProvider(config, logger);
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
        return new ZeroExSwapActionProvider(config, logger);
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
        return new LiFiActionProvider(config, logger);
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

        const rpcUrl = settingsReader.get('rpc.solana_mainnet') || undefined;

        const config: JitoStakingConfig = {
          enabled: true,
          stakePoolAddress: stakePoolOverride || addresses.stakePoolAddress,
          jitosolMint: jitosolMintOverride || addresses.jitosolMint,
          stakePoolProgram: addresses.stakePoolProgram,
          rpcUrl,
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
        const kaminoRpcUrl = settingsReader.get('rpc.solana_mainnet') || '';
        const config: KaminoConfig = {
          enabled: true,
          market: settingsReader.get('actions.kamino_market') || 'main',
          hfThreshold: Number(settingsReader.get('actions.kamino_hf_threshold')) || 1.2,
          rpcUrl: kaminoRpcUrl,
        };
        return new KaminoLendingProvider(config, new KaminoSdkWrapper(kaminoRpcUrl, logger));
      },
    },
    {
      key: 'pendle_yield',
      enabledKey: 'actions.pendle_yield_enabled',
      factory: () => {
        const config: PendleConfig = {
          enabled: true,
          apiBaseUrl: settingsReader.get('actions.pendle_yield_api_base_url') || 'https://api-v2.pendle.finance/core',
          apiKey: settingsReader.get('actions.pendle_yield_api_key') || '',
          defaultSlippageBps: Number(settingsReader.get('actions.pendle_yield_default_slippage_bps')) || 100,
          maxSlippageBps: Number(settingsReader.get('actions.pendle_yield_max_slippage_bps')) || 500,
          requestTimeoutMs: Number(settingsReader.get('actions.pendle_yield_request_timeout_ms')) || 10_000,
        };
        return new PendleYieldProvider(config, logger);
      },
    },
    {
      key: 'drift_perp',
      enabledKey: 'actions.drift_enabled',
      factory: () => {
        const driftRpcUrl = settingsReader.get('rpc.solana_mainnet') || '';
        const config: DriftConfig = {
          enabled: true,
          subAccount: 0,
          rpcUrl: driftRpcUrl,
        };
        return new DriftPerpProvider(config, new DriftSdkWrapper(driftRpcUrl, config.subAccount, logger));
      },
    },
    {
      key: 'erc8004_agent',
      enabledKey: 'actions.erc8004_agent_enabled',
      factory: () => {
        const config: Erc8004Config = {
          ...ERC8004_DEFAULTS,
          enabled: true,
          identityRegistryAddress: settingsReader.get('actions.erc8004_identity_registry_address'),
          reputationRegistryAddress: settingsReader.get('actions.erc8004_reputation_registry_address'),
          validationRegistryAddress: settingsReader.get('actions.erc8004_validation_registry_address'),
          registrationFileBaseUrl: settingsReader.get('actions.erc8004_registration_file_base_url'),
          autoPublishRegistration: settingsReader.get('actions.erc8004_auto_publish_registration') === 'true',
          reputationCacheTtlSec: Number(settingsReader.get('actions.erc8004_reputation_cache_ttl_sec')) || 300,
        };
        return new Erc8004ActionProvider(config);
      },
    },
    {
      key: 'hyperliquid_perp',
      enabledKey: 'actions.hyperliquid_enabled',
      factory: () => {
        const isMainnet = settingsReader.get('actions.hyperliquid_network') !== 'testnet';
        const apiUrlOverride = settingsReader.get('actions.hyperliquid_api_url');
        const apiUrl = apiUrlOverride || (isMainnet ? HL_MAINNET_API_URL : HL_TESTNET_API_URL);
        const rateLimit = Number(settingsReader.get('actions.hyperliquid_rate_limit_weight_per_min')) || HL_DEFAULTS.RATE_LIMIT_WEIGHT_PER_MIN;
        const timeoutMs = Number(settingsReader.get('actions.hyperliquid_request_timeout_ms')) || HL_DEFAULTS.REQUEST_TIMEOUT_MS;

        const rateLimiter = new HyperliquidRateLimiter(rateLimit);
        const client = new HyperliquidExchangeClient(apiUrl, rateLimiter, timeoutMs);
        const md = new HyperliquidMarketData(client);
        // Expose MarketData to caller so HTTP routes can use it
        hyperliquidMarketData = md;

        // Register spot and sub-account providers alongside perp (shared client/marketData)
        try {
          registry.register(new HyperliquidSpotProvider(client, md, isMainnet));
          loaded.push('hyperliquid_spot');
        } catch { /* spot registration failed, continue */ }
        try {
          const subService = new HyperliquidSubAccountService(client, md, isMainnet);
          registry.register(new HyperliquidSubAccountProvider(subService));
          loaded.push('hyperliquid_sub');
        } catch { /* sub registration failed, continue */ }

        return new HyperliquidPerpProvider(client, md, isMainnet);
      },
    },
    {
      key: 'dcent_swap',
      enabledKey: 'actions.dcent_swap_enabled',
      factory: () => {
        const dcentConfig: DcentSwapConfig = {
          apiBaseUrl: settingsReader.get('actions.dcent_swap_api_url'),
          requestTimeoutMs: 15_000,
          defaultSlippageBps: Number(settingsReader.get('actions.dcent_swap_default_slippage_bps')),
          maxSlippageBps: Number(settingsReader.get('actions.dcent_swap_max_slippage_bps')),
          currencyCacheTtlMs: Number(settingsReader.get('actions.dcent_swap_currency_cache_ttl_ms')),
        };
        return new DcentSwapActionProvider(dcentConfig, logger);
      },
    },
    {
      key: 'across_bridge',
      enabledKey: 'actions.across_bridge_enabled',
      factory: () => {
        const acrossConfig: AcrossConfig = {
          enabled: true,
          apiBaseUrl: settingsReader.get('actions.across_bridge_api_base_url') || ACROSS_DEFAULTS.apiBaseUrl,
          integratorId: settingsReader.get('actions.across_bridge_integrator_id') || ACROSS_DEFAULTS.integratorId,
          fillDeadlineBufferSec: Number(settingsReader.get('actions.across_bridge_fill_deadline_buffer_sec')) || ACROSS_DEFAULTS.fillDeadlineBufferSec,
          defaultSlippagePct: Number(settingsReader.get('actions.across_bridge_default_slippage_pct')) || ACROSS_DEFAULTS.defaultSlippagePct,
          maxSlippagePct: Number(settingsReader.get('actions.across_bridge_max_slippage_pct')) || ACROSS_DEFAULTS.maxSlippagePct,
          requestTimeoutMs: Number(settingsReader.get('actions.across_bridge_request_timeout_ms')) || ACROSS_DEFAULTS.requestTimeoutMs,
        };
        return new AcrossBridgeActionProvider(acrossConfig, logger);
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

  return { loaded, skipped, hyperliquidMarketData };
}
