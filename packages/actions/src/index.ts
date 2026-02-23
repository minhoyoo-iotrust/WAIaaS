/**
 * WAIaaS built-in DeFi Action Provider implementations.
 *
 * Exports registerBuiltInProviders() for daemon lifecycle integration
 * and individual provider classes for direct usage.
 */
import type { IActionProvider } from '@waiaas/core';
import { JupiterSwapActionProvider } from './providers/jupiter-swap/index.js';
import { ZeroExSwapActionProvider } from './providers/zerox-swap/index.js';

// Re-export provider classes
export { JupiterSwapActionProvider } from './providers/jupiter-swap/index.js';
export { JUPITER_PROGRAM_ID, JUPITER_SWAP_DEFAULTS } from './providers/jupiter-swap/config.js';
export type { JupiterSwapConfig } from './providers/jupiter-swap/config.js';

export { ZeroExSwapActionProvider } from './providers/zerox-swap/index.js';
export { ALLOWANCE_HOLDER_ADDRESSES, ZEROX_SWAP_DEFAULTS, CHAIN_ID_MAP, getAllowanceHolderAddress } from './providers/zerox-swap/config.js';
export type { ZeroExSwapConfig } from './providers/zerox-swap/config.js';

// Re-export common utilities
export { ActionApiClient } from './common/action-api-client.js';
export { asBps, asPct, clampSlippageBps, bpsToPct, pctToBps } from './common/slippage.js';
export type { SlippageBps, SlippagePct } from './common/slippage.js';

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
