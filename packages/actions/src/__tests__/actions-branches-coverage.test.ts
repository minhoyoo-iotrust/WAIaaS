/**
 * Coverage tests for actions package uncovered branches.
 * Targets: HyperliquidRateLimiter window reset and rate limit wait.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HyperliquidRateLimiter } from '../providers/hyperliquid/exchange-client.js';
import { buildRegistrationFile } from '../providers/erc8004/registration-file.js';
import { decodeReserveTokensAddresses } from '../providers/aave-v3/aave-rpc.js';

describe('HyperliquidRateLimiter branch coverage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resets window when >60s has passed since windowStart', async () => {
    const limiter = new HyperliquidRateLimiter(100);

    // Acquire some weight
    await limiter.acquire(50);
    expect(limiter.currentWeight).toBe(50);

    // Advance time by >60s
    vi.advanceTimersByTime(61_000);

    // Next acquire should reset window first (lines 34-36)
    await limiter.acquire(10);
    expect(limiter.currentWeight).toBe(10); // Reset to 0, then added 10
  });

  it('waits when weight exceeds max per minute', async () => {
    const limiter = new HyperliquidRateLimiter(100);

    // Fill up to max
    await limiter.acquire(90);
    expect(limiter.currentWeight).toBe(90);

    // Next acquire exceeds limit -- should wait (lines 38-44)
    const promise = limiter.acquire(20);

    // Advance time to trigger the wait resolution
    vi.advanceTimersByTime(60_000);

    await promise;
    // After wait, window resets and weight is the new acquire
    expect(limiter.currentWeight).toBe(20);
  });

  it('does not wait when waitMs <= 0 (edge case: exactly at window boundary)', async () => {
    const limiter = new HyperliquidRateLimiter(100);

    // Fill up to max
    await limiter.acquire(100);

    // Advance to exactly 60s
    vi.advanceTimersByTime(60_000);

    // Now acquire should reset window (>60s check succeeds)
    // and not trigger wait
    await limiter.acquire(10);
    expect(limiter.currentWeight).toBe(10);
  });

  it('reset() clears state', () => {
    const limiter = new HyperliquidRateLimiter(100);
    // reset is already tested elsewhere but ensures full path
    limiter.reset();
    expect(limiter.currentWeight).toBe(0);
  });
});

describe('buildRegistrationFile branch coverage', () => {
  it('appends user-provided services when options.services is provided', () => {
    const file = buildRegistrationFile({
      name: 'test-agent',
      services: [{ name: 'custom', endpoint: 'https://custom.api' }],
    });
    const services = file.services as Array<{ name: string; endpoint: string }>;
    expect(services).toHaveLength(1);
    expect(services[0]!.name).toBe('custom');
  });

  it('combines baseUrl services and user services', () => {
    const file = buildRegistrationFile({
      name: 'test-agent',
      baseUrl: 'http://localhost:3100',
      services: [{ name: 'extra', endpoint: 'https://extra' }],
    });
    const services = file.services as Array<{ name: string; endpoint: string }>;
    expect(services).toHaveLength(3); // mcp + rest-api + extra
  });

  it('generates empty services when no baseUrl or services', () => {
    const file = buildRegistrationFile({ name: 'minimal' });
    const services = file.services as Array<{ name: string; endpoint: string }>;
    expect(services).toHaveLength(0);
  });

  it('uses default description when not provided', () => {
    const file = buildRegistrationFile({ name: 'test' });
    expect(file.description).toBe('WAIaaS-managed AI agent wallet');
  });

  it('uses custom description when provided', () => {
    const file = buildRegistrationFile({ name: 'test', description: 'Custom desc' });
    expect(file.description).toBe('Custom desc');
  });

  it('includes registrations with default chainId when agentId and registry are provided', () => {
    const file = buildRegistrationFile({
      name: 'test',
      agentId: 'agent-1',
      identityRegistryAddress: '0xreg',
    });
    const regs = file.registrations as Array<{ agentId: string; agentRegistry: string }>;
    expect(regs).toHaveLength(1);
    expect(regs[0]!.agentRegistry).toContain('eip155:1:');
  });

  it('uses custom chainId for registrations', () => {
    const file = buildRegistrationFile({
      name: 'test',
      agentId: 'agent-1',
      identityRegistryAddress: '0xreg',
      chainId: 137,
    });
    const regs = file.registrations as Array<{ agentId: string; agentRegistry: string }>;
    expect(regs[0]!.agentRegistry).toContain('eip155:137:');
  });
});

describe('decodeReserveTokensAddresses branch coverage', () => {
  it('throws when hex response is too short', () => {
    expect(() => decodeReserveTokensAddresses('0x1234')).toThrow('Invalid getReserveTokensAddresses response');
  });

  it('handles hex response without 0x prefix', () => {
    // 192 hex chars = 3 x 32 bytes (64 hex chars each)
    const addr1 = '0000000000000000000000001111111111111111111111111111111111111111';
    const addr2 = '0000000000000000000000002222222222222222222222222222222222222222';
    const addr3 = '0000000000000000000000003333333333333333333333333333333333333333';
    const hex = addr1 + addr2 + addr3;
    const result = decodeReserveTokensAddresses(hex);
    expect(result.aToken).toBeDefined();
    expect(result.stableDebtToken).toBeDefined();
    expect(result.variableDebtToken).toBeDefined();
  });
});
