/**
 * WAIaaS built-in DeFi Action Provider implementations.
 *
 * Exports registerBuiltInProviders() for daemon lifecycle integration
 * and individual provider classes for direct usage.
 */
import type { IActionProvider } from '@waiaas/core';
import { JupiterSwapActionProvider } from './providers/jupiter-swap/index.js';

// Re-export provider classes
export { JupiterSwapActionProvider } from './providers/jupiter-swap/index.js';
export { JUPITER_PROGRAM_ID, JUPITER_SWAP_DEFAULTS } from './providers/jupiter-swap/config.js';
export type { JupiterSwapConfig } from './providers/jupiter-swap/config.js';

// Re-export common utilities
export { ActionApiClient } from './common/action-api-client.js';
export { asBps, asPct, clampSlippageBps, bpsToPct, pctToBps } from './common/slippage.js';
export type { SlippageBps, SlippagePct } from './common/slippage.js';

// ---------------------------------------------------------------------------
// Built-in provider registration
// ---------------------------------------------------------------------------

interface ActionsConfig {
  jupiter_swap?: Partial<import('./providers/jupiter-swap/config.js').JupiterSwapConfig>;
  [key: string]: unknown;
}

interface ProviderRegistry {
  register(provider: IActionProvider): void;
}

export function registerBuiltInProviders(
  registry: ProviderRegistry,
  actionsConfig?: ActionsConfig,
): { loaded: string[]; skipped: string[] } {
  const loaded: string[] = [];
  const skipped: string[] = [];

  const providers: Array<{ key: string; factory: () => IActionProvider }> = [
    {
      key: 'jupiter_swap',
      factory: () => new JupiterSwapActionProvider(actionsConfig?.jupiter_swap),
    },
  ];

  for (const { key, factory } of providers) {
    const cfg = actionsConfig?.[key] as { enabled?: boolean } | undefined;
    if (cfg?.enabled) {
      try {
        registry.register(factory());
        loaded.push(key);
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
