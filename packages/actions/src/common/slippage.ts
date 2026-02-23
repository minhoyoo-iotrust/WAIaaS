/**
 * Slippage utilities with branded types to prevent unit confusion.
 */

export type SlippageBps = number & { __brand: 'bps' };
export type SlippagePct = number & { __brand: 'pct' };

export function asBps(value: number): SlippageBps {
  if (!Number.isInteger(value) || value < 1 || value > 10000) {
    throw new Error(`Invalid bps value: ${value} (must be integer 1-10000)`);
  }
  return value as SlippageBps;
}

export function asPct(value: number): SlippagePct {
  if (value < 0.001 || value > 1.0) {
    throw new Error(`Invalid pct value: ${value} (must be 0.001-1.0)`);
  }
  return value as SlippagePct;
}

export function clampSlippageBps(input: number, defaultBps: SlippageBps, maxBps: SlippageBps): SlippageBps {
  const value = input <= 0 ? defaultBps : Math.min(input, maxBps);
  return asBps(Math.round(value));
}

export function bpsToPct(bps: SlippageBps): number {
  return bps / 10000;
}

export function pctToBps(pct: SlippagePct): SlippageBps {
  return asBps(Math.round(pct * 10000));
}
