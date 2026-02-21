/**
 * Tests for incoming transaction safety rules.
 *
 * Covers all 3 rule implementations with edge cases:
 * - DustAttackRule: below/above threshold, null usdPrice
 * - UnknownTokenRule: unregistered token, registered token, native transfer
 * - LargeAmountRule: above/below multiplier, null avg, null price
 */

import { describe, it, expect } from 'vitest';
import type { IncomingTransaction } from '@waiaas/core';
import type { SafetyRuleContext } from '../safety-rules.js';
import {
  DustAttackRule,
  UnknownTokenRule,
  LargeAmountRule,
} from '../safety-rules.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTx(overrides: Partial<IncomingTransaction> = {}): IncomingTransaction {
  return {
    id: 'tx-001',
    txHash: '0xabc',
    walletId: 'wallet-001',
    fromAddress: '0xsender',
    amount: '1000000000', // 1 SOL in lamports (9 decimals)
    tokenAddress: null,
    chain: 'solana',
    network: 'mainnet',
    status: 'DETECTED',
    blockNumber: 100,
    detectedAt: 1700000000,
    confirmedAt: null,
    isSuspicious: false,
    ...overrides,
  };
}

function makeContext(overrides: Partial<SafetyRuleContext> = {}): SafetyRuleContext {
  return {
    dustThresholdUsd: 0.01,
    amountMultiplier: 10,
    isRegisteredToken: true,
    usdPrice: 100, // $100 per whole token
    avgIncomingUsd: 500, // average incoming is $500
    decimals: 9,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// DustAttackRule
// ---------------------------------------------------------------------------

describe('DustAttackRule', () => {
  const rule = new DustAttackRule();

  it('has name "dust"', () => {
    expect(rule.name).toBe('dust');
  });

  it('flags transaction below dust threshold', () => {
    // amount=10 lamports, price=$100, decimals=9 -> USD = 10 * 100 / 1e9 = 0.000001
    const tx = makeTx({ amount: '10' });
    const ctx = makeContext({ dustThresholdUsd: 0.01 });
    expect(rule.check(tx, ctx)).toBe(true);
  });

  it('does not flag transaction above dust threshold', () => {
    // amount=1e9 (1 SOL), price=$100 -> USD = 100
    const tx = makeTx({ amount: '1000000000' });
    const ctx = makeContext({ dustThresholdUsd: 0.01 });
    expect(rule.check(tx, ctx)).toBe(false);
  });

  it('returns false when usdPrice is null (safe default)', () => {
    const tx = makeTx({ amount: '10' });
    const ctx = makeContext({ usdPrice: null });
    expect(rule.check(tx, ctx)).toBe(false);
  });

  it('flags when USD value exactly equals threshold', () => {
    // amount * price / 10^decimals = 0.01
    // amount = 0.01 * 1e9 / 100 = 100000
    const tx = makeTx({ amount: '100000' });
    const ctx = makeContext({ dustThresholdUsd: 0.01, usdPrice: 100, decimals: 9 });
    // 100000 * 100 / 1e9 = 0.01 -- NOT less than threshold
    expect(rule.check(tx, ctx)).toBe(false);
  });

  it('handles EVM decimals (18)', () => {
    // amount=100 wei, price=$2000, decimals=18 -> USD = 100 * 2000 / 1e18 = 0.0000000000000002
    const tx = makeTx({ amount: '100', chain: 'ethereum' });
    const ctx = makeContext({ usdPrice: 2000, decimals: 18, dustThresholdUsd: 0.01 });
    expect(rule.check(tx, ctx)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// UnknownTokenRule
// ---------------------------------------------------------------------------

describe('UnknownTokenRule', () => {
  const rule = new UnknownTokenRule();

  it('has name "unknownToken"', () => {
    expect(rule.name).toBe('unknownToken');
  });

  it('flags token transfer with unregistered token', () => {
    const tx = makeTx({ tokenAddress: '0xunknown' });
    const ctx = makeContext({ isRegisteredToken: false });
    expect(rule.check(tx, ctx)).toBe(true);
  });

  it('does not flag token transfer with registered token', () => {
    const tx = makeTx({ tokenAddress: '0xknown' });
    const ctx = makeContext({ isRegisteredToken: true });
    expect(rule.check(tx, ctx)).toBe(false);
  });

  it('does not flag native transfer (tokenAddress = null)', () => {
    const tx = makeTx({ tokenAddress: null });
    const ctx = makeContext({ isRegisteredToken: false });
    expect(rule.check(tx, ctx)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// LargeAmountRule
// ---------------------------------------------------------------------------

describe('LargeAmountRule', () => {
  const rule = new LargeAmountRule();

  it('has name "largeAmount"', () => {
    expect(rule.name).toBe('largeAmount');
  });

  it('flags transaction above multiplier * average', () => {
    // amount=100e9 lamports (100 SOL), price=$100, decimals=9 -> USD = 10000
    // avgIncoming=$500, multiplier=10 -> threshold = $5000
    // 10000 > 5000 -> flagged
    const tx = makeTx({ amount: '100000000000' });
    const ctx = makeContext({
      usdPrice: 100,
      avgIncomingUsd: 500,
      amountMultiplier: 10,
      decimals: 9,
    });
    expect(rule.check(tx, ctx)).toBe(true);
  });

  it('does not flag transaction below multiplier * average', () => {
    // amount=1e9 (1 SOL), price=$100 -> USD = 100
    // avgIncoming=$500, multiplier=10 -> threshold = $5000
    // 100 < 5000 -> not flagged
    const tx = makeTx({ amount: '1000000000' });
    const ctx = makeContext({
      usdPrice: 100,
      avgIncomingUsd: 500,
      amountMultiplier: 10,
      decimals: 9,
    });
    expect(rule.check(tx, ctx)).toBe(false);
  });

  it('returns false when avgIncomingUsd is null (safe default)', () => {
    const tx = makeTx({ amount: '100000000000' });
    const ctx = makeContext({ avgIncomingUsd: null });
    expect(rule.check(tx, ctx)).toBe(false);
  });

  it('returns false when usdPrice is null (safe default)', () => {
    const tx = makeTx({ amount: '100000000000' });
    const ctx = makeContext({ usdPrice: null });
    expect(rule.check(tx, ctx)).toBe(false);
  });

  it('does not flag when exactly at multiplier * average', () => {
    // amount=50e9 (50 SOL), price=$100 -> USD = 5000
    // avgIncoming=$500, multiplier=10 -> threshold = $5000
    // 5000 > 5000 is false -> not flagged
    const tx = makeTx({ amount: '50000000000' });
    const ctx = makeContext({
      usdPrice: 100,
      avgIncomingUsd: 500,
      amountMultiplier: 10,
      decimals: 9,
    });
    expect(rule.check(tx, ctx)).toBe(false);
  });
});
