/**
 * Tests for provider humanAmount variants.
 *
 * Phase 405-02: Verifies that 10 smallest-unit providers accept humanAmount
 * as an alternative to amount, with XOR validation and decimal conversion.
 * CLOB providers (Hyperliquid, Drift, Polymarket) must NOT have humanAmount.
 */

import { describe, it, expect } from 'vitest';
import { resolveProviderHumanAmount } from '../common/resolve-human-amount.js';

// ---------------------------------------------------------------------------
// resolveProviderHumanAmount unit tests
// ---------------------------------------------------------------------------

describe('resolveProviderHumanAmount', () => {
  it('converts humanAmount with 18 decimals', () => {
    const params: Record<string, unknown> = { humanAmount: '1.5', decimals: 18 };
    resolveProviderHumanAmount(params, 'amount', 'humanAmount');
    expect(params.amount).toBe('1500000000000000000');
    expect(params.humanAmount).toBeUndefined();
    expect(params.decimals).toBeUndefined();
  });

  it('converts humanAmount with 6 decimals (USDC)', () => {
    const params: Record<string, unknown> = { humanAmount: '100', decimals: 6 };
    resolveProviderHumanAmount(params, 'amount', 'humanAmount');
    expect(params.amount).toBe('100000000');
  });

  it('converts humanAmount with 9 decimals (SOL)', () => {
    const params: Record<string, unknown> = { humanAmount: '1', decimals: 9 };
    resolveProviderHumanAmount(params, 'amount', 'humanAmount');
    expect(params.amount).toBe('1000000000');
  });

  it('uses custom field names (sellAmount/humanSellAmount)', () => {
    const params: Record<string, unknown> = { humanSellAmount: '2.5', decimals: 18 };
    resolveProviderHumanAmount(params, 'sellAmount', 'humanSellAmount');
    expect(params.sellAmount).toBe('2500000000000000000');
    expect(params.humanSellAmount).toBeUndefined();
  });

  it('uses custom field names (amountIn/humanAmountIn)', () => {
    const params: Record<string, unknown> = { humanAmountIn: '1', decimals: 18 };
    resolveProviderHumanAmount(params, 'amountIn', 'humanAmountIn');
    expect(params.amountIn).toBe('1000000000000000000');
  });

  it('uses custom field names (fromAmount/humanFromAmount)', () => {
    const params: Record<string, unknown> = { humanFromAmount: '0.5', decimals: 18 };
    resolveProviderHumanAmount(params, 'fromAmount', 'humanFromAmount');
    expect(params.fromAmount).toBe('500000000000000000');
  });

  it('does nothing when humanAmount is not present', () => {
    const params: Record<string, unknown> = { amount: '999' };
    resolveProviderHumanAmount(params, 'amount', 'humanAmount');
    expect(params.amount).toBe('999');
  });

  it('throws when humanAmount is present but decimals is missing', () => {
    const params: Record<string, unknown> = { humanAmount: '1.5' };
    expect(() => resolveProviderHumanAmount(params, 'amount', 'humanAmount')).toThrow(
      /decimals is required/,
    );
  });

  it('throws when decimals is not a valid integer', () => {
    const params: Record<string, unknown> = { humanAmount: '1.5', decimals: 'abc' };
    expect(() => resolveProviderHumanAmount(params, 'amount', 'humanAmount')).toThrow(
      /decimals is required/,
    );
  });
});

// ---------------------------------------------------------------------------
// Provider schema tests -- import actual schemas
// ---------------------------------------------------------------------------

// Jupiter Swap
describe('jupiter_swap humanAmount schema', () => {
  it('accepts humanAmount without amount', async () => {
    const { JupiterSwapActionProvider } = await import('../providers/jupiter-swap/index.js');
    const provider = new JupiterSwapActionProvider();
    const schema = provider.actions[0]!.inputSchema;
    const result = schema.safeParse({
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      humanAmount: '1',
      decimals: 9,
    });
    expect(result.success).toBe(true);
  });

  it('accepts amount without humanAmount (backward compat)', async () => {
    const { JupiterSwapActionProvider } = await import('../providers/jupiter-swap/index.js');
    const provider = new JupiterSwapActionProvider();
    const schema = provider.actions[0]!.inputSchema;
    const result = schema.safeParse({
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      amount: '1000000000',
    });
    expect(result.success).toBe(true);
  });
});

// 0x Swap
describe('zerox_swap humanSellAmount schema', () => {
  it('accepts humanSellAmount without sellAmount', async () => {
    const { ZeroExSwapActionProvider } = await import('../providers/zerox-swap/index.js');
    const provider = new ZeroExSwapActionProvider();
    const schema = provider.actions[0]!.inputSchema;
    const result = schema.safeParse({
      sellToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      buyToken: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      humanSellAmount: '1.5',
      decimals: 18,
    });
    expect(result.success).toBe(true);
  });
});

// Pendle (amountIn -> humanAmountIn)
describe('pendle humanAmountIn schema', () => {
  it('accepts humanAmountIn without amountIn', async () => {
    const { PendleBuyPTInputSchema } = await import('../providers/pendle/input-schemas.js');
    const result = PendleBuyPTInputSchema.safeParse({
      market: '0xmarket',
      tokenIn: '0xtoken',
      humanAmountIn: '1',
      decimals: 18,
    });
    expect(result.success).toBe(true);
  });
});

// Aave V3
describe('aave_v3 humanAmount schema', () => {
  it('accepts humanAmount without amount', async () => {
    const { AaveSupplyInputSchema } = await import('../providers/aave-v3/schemas.js');
    const result = AaveSupplyInputSchema.safeParse({
      asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      humanAmount: '100',
      decimals: 6,
    });
    expect(result.success).toBe(true);
  });
});

// Kamino
describe('kamino humanAmount schema', () => {
  it('accepts humanAmount without amount', async () => {
    const { KaminoSupplyInputSchema } = await import('../providers/kamino/schemas.js');
    const result = KaminoSupplyInputSchema.safeParse({
      asset: 'So11111111111111111111111111111111111111112',
      humanAmount: '50',
      decimals: 9,
    });
    expect(result.success).toBe(true);
  });
});

// Lido
describe('lido_staking humanAmount schema', () => {
  it('accepts humanAmount without amount', async () => {
    const { LidoStakingActionProvider } = await import('../providers/lido-staking/index.js');
    const provider = new LidoStakingActionProvider();
    const schema = provider.actions[0]!.inputSchema;
    const result = schema.safeParse({
      humanAmount: '1.5',
      decimals: 18,
    });
    expect(result.success).toBe(true);
  });
});

// Jito
describe('jito_staking humanAmount schema', () => {
  it('accepts humanAmount without amount', async () => {
    const { JitoStakingActionProvider } = await import('../providers/jito-staking/index.js');
    const provider = new JitoStakingActionProvider();
    const schema = provider.actions[0]!.inputSchema;
    const result = schema.safeParse({
      humanAmount: '1.5',
      decimals: 9,
    });
    expect(result.success).toBe(true);
  });
});

// Across
describe('across_bridge humanAmount schema', () => {
  it('accepts humanAmount without amount', async () => {
    const { AcrossBridgeActionProvider } = await import('../providers/across/index.js');
    const provider = new AcrossBridgeActionProvider();
    // Get the 'execute' action schema (index 1)
    const execAction = provider.actions.find((a) => a.name === 'execute');
    expect(execAction).toBeDefined();
    const result = execAction!.inputSchema.safeParse({
      fromChain: 'ethereum',
      toChain: 'arbitrum',
      inputToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      outputToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      humanAmount: '1000',
      decimals: 6,
    });
    expect(result.success).toBe(true);
  });
});

// D'CENT Swap
describe('dcent_swap humanAmount schema', () => {
  it('accepts humanAmount without amount', async () => {
    const { DcentSwapActionProvider } = await import('../providers/dcent-swap/index.js');
    const provider = new DcentSwapActionProvider();
    const dexSwap = provider.actions.find((a) => a.name === 'dex_swap');
    expect(dexSwap).toBeDefined();
    const result = dexSwap!.inputSchema.safeParse({
      fromAsset: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      toAsset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      humanAmount: '1',
      decimals: 18,
      fromDecimals: 18,
      toDecimals: 6,
    });
    expect(result.success).toBe(true);
  });
});

// LI.FI
describe('lifi humanFromAmount schema', () => {
  it('accepts humanFromAmount without fromAmount', async () => {
    const { LiFiActionProvider } = await import('../providers/lifi/index.js');
    const provider = new LiFiActionProvider();
    const schema = provider.actions[0]!.inputSchema;
    const result = schema.safeParse({
      fromChain: 'ethereum',
      toChain: 'base',
      fromToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      toToken: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      humanFromAmount: '100',
      decimals: 6,
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CLOB providers negative tests -- humanAmount must NOT exist
// ---------------------------------------------------------------------------

describe('CLOB providers exclude humanAmount', () => {
  it('hyperliquid perp schema has no humanAmount field', async () => {
    const { HyperliquidPerpProvider } = await import('../providers/hyperliquid/index.js');
    const provider = new HyperliquidPerpProvider(null as any, null as any, true);
    const placeOrderAction = provider.actions.find((a) => a.name === 'hl_place_order');
    expect(placeOrderAction).toBeDefined();
    const schemaShape = (placeOrderAction!.inputSchema as any).shape ?? {};
    expect(schemaShape.humanAmount).toBeUndefined();
    expect(schemaShape.humanSize).toBeUndefined();
  });

  it('drift perp schema has no humanAmount field', async () => {
    const { DriftPerpProvider } = await import('../providers/drift/index.js');
    const provider = new DriftPerpProvider();
    const placeOrderAction = provider.actions.find((a) => a.name === 'drift_open_position');
    expect(placeOrderAction).toBeDefined();
    const schemaShape = (placeOrderAction!.inputSchema as any).shape ?? {};
    expect(schemaShape.humanAmount).toBeUndefined();
    expect(schemaShape.humanSize).toBeUndefined();
  });

  it('polymarket schema has no humanAmount field', async () => {
    const { PolymarketOrderProvider } = await import('../providers/polymarket/order-provider.js');
    const provider = new PolymarketOrderProvider(null as any, null as any, null, null);
    const placeOrderAction = provider.actions.find((a) => a.name === 'pm_buy');
    expect(placeOrderAction).toBeDefined();
    const schemaShape = (placeOrderAction!.inputSchema as any).shape ?? {};
    expect(schemaShape.humanAmount).toBeUndefined();
  });
});
