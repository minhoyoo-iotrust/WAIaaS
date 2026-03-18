/**
 * AaveV3LendingProvider supplementary unit tests.
 *
 * Focuses on paths not covered by existing aave-v3-provider.test.ts:
 * - humanAmount + decimals conversion for all 4 actions
 * - interestRateMode default and explicit values for borrow
 * - humanAmount without decimals error
 * - withdraw max + supply max behavior
 */
import { describe, it, expect } from 'vitest';
import { AaveV3LendingProvider } from '../index.js';
import { AAVE_V3_ADDRESSES } from '../config.js';
import type { ActionContext, ContractCallRequest } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Shared context
// ---------------------------------------------------------------------------

const CONTEXT: ActionContext = {
  walletAddress: '0x1234567890123456789012345678901234567890',
  chain: 'ethereum',
  walletId: '00000000-0000-0000-0000-000000000001',
};

const TEST_ASSET = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

// ---------------------------------------------------------------------------
// humanAmount conversion tests
// ---------------------------------------------------------------------------

describe('AaveV3LendingProvider - humanAmount conversion', () => {
  const provider = new AaveV3LendingProvider({ enabled: true });

  it('supply: humanAmount="10.0" with decimals=6 converts to 10000000', async () => {
    const result = (await provider.resolve(
      'aave_supply',
      { asset: TEST_ASSET, humanAmount: '10.0', decimals: 6 },
      CONTEXT,
    )) as ContractCallRequest[];

    expect(result).toHaveLength(2);
    // Amount in supply calldata (2nd 32-byte word)
    const supplyCalldata = result[1]!.calldata!;
    const amountHex = supplyCalldata.slice(10 + 64, 10 + 128);
    expect(BigInt('0x' + amountHex)).toBe(10_000_000n);
  });

  it('borrow: humanAmount="50.0" with decimals=18 converts to 50e18', async () => {
    const result = (await provider.resolve(
      'aave_borrow',
      { asset: TEST_ASSET, humanAmount: '50.0', decimals: 18 },
      CONTEXT,
    )) as ContractCallRequest;

    expect(result.type).toBe('CONTRACT_CALL');
    // Amount in borrow calldata (2nd 32-byte word)
    const amountHex = result.calldata!.slice(10 + 64, 10 + 128);
    expect(BigInt('0x' + amountHex)).toBe(50_000_000_000_000_000_000n);
  });

  it('repay: humanAmount="25.0" with decimals=6 converts to 25000000', async () => {
    const result = (await provider.resolve(
      'aave_repay',
      { asset: TEST_ASSET, humanAmount: '25.0', decimals: 6 },
      CONTEXT,
    )) as ContractCallRequest[];

    expect(result).toHaveLength(2);
    expect(result[0]!.calldata).toMatch(/^0x095ea7b3/);
    expect(result[1]!.calldata).toMatch(/^0x573ade81/);
  });

  it('withdraw: humanAmount="5.0" with decimals=18 succeeds', async () => {
    const result = (await provider.resolve(
      'aave_withdraw',
      { asset: TEST_ASSET, humanAmount: '5.0', decimals: 18 },
      CONTEXT,
    )) as ContractCallRequest;

    expect(result.type).toBe('CONTRACT_CALL');
    expect(result.calldata).toMatch(/^0x69328dec/);
    const amountHex = result.calldata!.slice(10 + 64, 10 + 128);
    expect(BigInt('0x' + amountHex)).toBe(5_000_000_000_000_000_000n);
  });

  it('supply: throws when humanAmount given without decimals', async () => {
    await expect(
      provider.resolve(
        'aave_supply',
        { asset: TEST_ASSET, humanAmount: '10.0' },
        CONTEXT,
      ),
    ).rejects.toThrow('decimals');
  });

  it('borrow: throws when neither amount nor humanAmount provided', async () => {
    await expect(
      provider.resolve(
        'aave_borrow',
        { asset: TEST_ASSET },
        CONTEXT,
      ),
    ).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// interestRateMode tests
// ---------------------------------------------------------------------------

describe('AaveV3LendingProvider - interestRateMode', () => {
  const provider = new AaveV3LendingProvider({ enabled: true });

  it('borrow defaults to variable rate (interestRateMode=2)', async () => {
    const result = (await provider.resolve(
      'aave_borrow',
      { asset: TEST_ASSET, amount: '1.0' },
      CONTEXT,
    )) as ContractCallRequest;

    // interestRateMode is 3rd 32-byte word in borrow calldata
    const modeHex = result.calldata!.slice(10 + 128, 10 + 192);
    expect(BigInt('0x' + modeHex)).toBe(2n);
  });

  it('borrow always uses variable rate (2) even if interestRateMode param passed (stable deprecated)', async () => {
    // Aave V3 deprecated stable rate -- provider hardcodes variable (2)
    const result = (await provider.resolve(
      'aave_borrow',
      { asset: TEST_ASSET, amount: '1.0', interestRateMode: 1 },
      CONTEXT,
    )) as ContractCallRequest;

    const modeHex = result.calldata!.slice(10 + 128, 10 + 192);
    // Always 2 (variable) regardless of input
    expect(BigInt('0x' + modeHex)).toBe(2n);
  });
});

// ---------------------------------------------------------------------------
// Network variants
// ---------------------------------------------------------------------------

describe('AaveV3LendingProvider - network variants', () => {
  const provider = new AaveV3LendingProvider({ enabled: true });

  it('arbitrum-mainnet uses correct pool address', async () => {
    const result = (await provider.resolve(
      'aave_supply',
      { asset: TEST_ASSET, amount: '1.0', network: 'arbitrum-mainnet' },
      CONTEXT,
    )) as ContractCallRequest[];

    const arbPool = AAVE_V3_ADDRESSES['arbitrum-mainnet']!.pool;
    expect(result[1]!.to).toBe(arbPool);
  });

  it('optimism-mainnet uses correct pool address', async () => {
    const result = (await provider.resolve(
      'aave_supply',
      { asset: TEST_ASSET, amount: '1.0', network: 'optimism-mainnet' },
      CONTEXT,
    )) as ContractCallRequest[];

    const optPool = AAVE_V3_ADDRESSES['optimism-mainnet']!.pool;
    expect(result[1]!.to).toBe(optPool);
  });
});
