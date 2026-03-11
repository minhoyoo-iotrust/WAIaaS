/**
 * Tests for OrderBuilder: Order struct construction from user parameters.
 *
 * Plan 371-01 Task 1: OrderBuilder tests.
 */
import { describe, it, expect } from 'vitest';
import { OrderBuilder } from '../order-builder.js';
import { ORDER_SIDE, SIGNATURE_TYPE, ZERO_ADDRESS } from '../config.js';
import type { Hex } from 'viem';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WALLET = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Hex;

// ---------------------------------------------------------------------------
// buildBuyOrder tests
// ---------------------------------------------------------------------------

describe('OrderBuilder.buildBuyOrder', () => {
  it('calculates correct makerAmount/takerAmount for BUY', () => {
    // price "0.65", size "100"
    // makerAmount = 0.65 * 100 = 65 USDC.e = 65_000_000
    // takerAmount = 100 tokens = 100_000_000
    const order = OrderBuilder.buildBuyOrder({
      walletAddress: WALLET,
      tokenId: '12345',
      price: '0.65',
      size: '100',
      orderType: 'GTC',
    });

    expect(order.makerAmount).toBe(65_000_000n);
    expect(order.takerAmount).toBe(100_000_000n);
    expect(order.side).toBe(ORDER_SIDE.BUY);
  });

  it('handles price "0.5" and size "200"', () => {
    // makerAmount = 0.5 * 200 = 100 USDC.e = 100_000_000
    // takerAmount = 200 tokens = 200_000_000
    const order = OrderBuilder.buildBuyOrder({
      walletAddress: WALLET,
      tokenId: '99999',
      price: '0.5',
      size: '200',
      orderType: 'GTC',
    });

    expect(order.makerAmount).toBe(100_000_000n);
    expect(order.takerAmount).toBe(200_000_000n);
  });

  it('handles price "0.01" (penny odds)', () => {
    // makerAmount = 0.01 * 1000 = 10 USDC.e = 10_000_000
    // takerAmount = 1000 tokens = 1_000_000_000
    const order = OrderBuilder.buildBuyOrder({
      walletAddress: WALLET,
      tokenId: '1',
      price: '0.01',
      size: '1000',
      orderType: 'GTC',
    });

    expect(order.makerAmount).toBe(10_000_000n);
    expect(order.takerAmount).toBe(1_000_000_000n);
  });

  it('handles price "0.99" (near certainty)', () => {
    // makerAmount = 0.99 * 50 = 49.5 USDC.e = 49_500_000
    // takerAmount = 50 tokens = 50_000_000
    const order = OrderBuilder.buildBuyOrder({
      walletAddress: WALLET,
      tokenId: '1',
      price: '0.99',
      size: '50',
      orderType: 'GTC',
    });

    expect(order.makerAmount).toBe(49_500_000n);
    expect(order.takerAmount).toBe(50_000_000n);
  });

  it('sets correct default fields', () => {
    const order = OrderBuilder.buildBuyOrder({
      walletAddress: WALLET,
      tokenId: '12345',
      price: '0.65',
      size: '100',
      orderType: 'GTC',
    });

    expect(order.maker).toBe(WALLET);
    expect(order.signer).toBe(WALLET);
    expect(order.taker).toBe(ZERO_ADDRESS);
    expect(order.tokenId).toBe(12345n);
    expect(order.nonce).toBe(0n);
    expect(order.feeRateBps).toBe(0n);
    expect(order.signatureType).toBe(SIGNATURE_TYPE.EOA);
  });

  it('GTC has expiration=0', () => {
    const order = OrderBuilder.buildBuyOrder({
      walletAddress: WALLET,
      tokenId: '1',
      price: '0.5',
      size: '10',
      orderType: 'GTC',
    });
    expect(order.expiration).toBe(0n);
  });

  it('GTD has specified expiration timestamp', () => {
    const order = OrderBuilder.buildBuyOrder({
      walletAddress: WALLET,
      tokenId: '1',
      price: '0.5',
      size: '10',
      orderType: 'GTD',
      expiration: 1700000000,
    });
    expect(order.expiration).toBe(1700000000n);
  });

  it('FOK has expiration=0 (CLOB-side handling)', () => {
    const order = OrderBuilder.buildBuyOrder({
      walletAddress: WALLET,
      tokenId: '1',
      price: '0.5',
      size: '10',
      orderType: 'FOK',
    });
    expect(order.expiration).toBe(0n);
  });

  it('IOC has expiration=0 (CLOB-side handling)', () => {
    const order = OrderBuilder.buildBuyOrder({
      walletAddress: WALLET,
      tokenId: '1',
      price: '0.5',
      size: '10',
      orderType: 'IOC',
    });
    expect(order.expiration).toBe(0n);
  });

  it('generates unique salt for each order', () => {
    const orders = Array.from({ length: 10 }, () =>
      OrderBuilder.buildBuyOrder({
        walletAddress: WALLET,
        tokenId: '1',
        price: '0.5',
        size: '10',
        orderType: 'GTC',
      }),
    );

    const salts = new Set(orders.map((o) => o.salt));
    expect(salts.size).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// buildSellOrder tests
// ---------------------------------------------------------------------------

describe('OrderBuilder.buildSellOrder', () => {
  it('calculates correct makerAmount/takerAmount for SELL', () => {
    // price "0.65", size "100"
    // makerAmount = 100 tokens = 100_000_000
    // takerAmount = 0.65 * 100 = 65 USDC.e = 65_000_000
    const order = OrderBuilder.buildSellOrder({
      walletAddress: WALLET,
      tokenId: '12345',
      price: '0.65',
      size: '100',
      orderType: 'GTC',
    });

    expect(order.makerAmount).toBe(100_000_000n);
    expect(order.takerAmount).toBe(65_000_000n);
    expect(order.side).toBe(ORDER_SIDE.SELL);
  });

  it('amounts are inverted compared to BUY', () => {
    const buyOrder = OrderBuilder.buildBuyOrder({
      walletAddress: WALLET,
      tokenId: '1',
      price: '0.65',
      size: '100',
      orderType: 'GTC',
    });
    const sellOrder = OrderBuilder.buildSellOrder({
      walletAddress: WALLET,
      tokenId: '1',
      price: '0.65',
      size: '100',
      orderType: 'GTC',
    });

    expect(buyOrder.makerAmount).toBe(sellOrder.takerAmount);
    expect(buyOrder.takerAmount).toBe(sellOrder.makerAmount);
  });
});

// ---------------------------------------------------------------------------
// calculateBuyAmount tests
// ---------------------------------------------------------------------------

describe('OrderBuilder.calculateBuyAmount', () => {
  it('returns price * size in USDC.e 6 decimal bigint', () => {
    expect(OrderBuilder.calculateBuyAmount('0.65', '100')).toBe(65_000_000n);
    expect(OrderBuilder.calculateBuyAmount('0.5', '200')).toBe(100_000_000n);
    expect(OrderBuilder.calculateBuyAmount('0.01', '1000')).toBe(10_000_000n);
  });
});
