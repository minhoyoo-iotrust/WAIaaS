/**
 * Jupiter Swap configuration type and defaults.
 */

export interface JupiterSwapConfig {
  enabled: boolean;
  apiBaseUrl: string;
  apiKey: string;
  defaultSlippageBps: number;
  maxSlippageBps: number;
  maxPriceImpactPct: number;
  jitoTipLamports: number;
  requestTimeoutMs: number;
}

export const JUPITER_SWAP_DEFAULTS: JupiterSwapConfig = {
  enabled: false,
  apiBaseUrl: 'https://api.jup.ag/swap/v1',
  apiKey: '',
  defaultSlippageBps: 50,    // 0.5%
  maxSlippageBps: 500,       // 5%
  maxPriceImpactPct: 1.0,    // 1%
  jitoTipLamports: 1000,
  requestTimeoutMs: 10_000,
};

export const JUPITER_PROGRAM_ID = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
