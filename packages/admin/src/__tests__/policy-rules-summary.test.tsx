import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/preact';
import { PolicyRulesSummary } from '../components/policy-rules-summary';

afterEach(cleanup);

describe('PolicyRulesSummary', () => {
  // ---- SPENDING_LIMIT ----
  it('SPENDING_LIMIT: renders tier bars', () => {
    const { container } = render(
      <PolicyRulesSummary
        type="SPENDING_LIMIT"
        rules={{ instant_max: '100', notify_max: '500', delay_max: '1000' }}
      />,
    );

    expect(screen.getByText('Instant')).toBeDefined();
    expect(screen.getByText('Notify')).toBeDefined();
    expect(screen.getByText('Delay')).toBeDefined();
    expect(screen.getByText('Approval')).toBeDefined();
    expect(screen.getByText('100')).toBeDefined();
    expect(screen.getByText('500')).toBeDefined();
    expect(screen.getByText('1,000')).toBeDefined();
  });

  it('SPENDING_LIMIT: renders cumulative limits', () => {
    render(
      <PolicyRulesSummary
        type="SPENDING_LIMIT"
        rules={{
          instant_max: '100',
          notify_max: '500',
          delay_max: '1000',
          daily_limit_usd: 5000,
          monthly_limit_usd: 50000,
        }}
      />,
    );

    expect(screen.getByText('Daily (24h)')).toBeDefined();
    expect(screen.getByText('$5,000')).toBeDefined();
    expect(screen.getByText('Monthly (30d)')).toBeDefined();
    expect(screen.getByText('$50,000')).toBeDefined();
  });

  it('SPENDING_LIMIT: no cumulative section when limits absent', () => {
    render(
      <PolicyRulesSummary
        type="SPENDING_LIMIT"
        rules={{ instant_max: '100', notify_max: '500', delay_max: '1000' }}
      />,
    );

    expect(screen.queryByText('Cumulative Limits')).toBeNull();
  });

  // ---- ALLOWED_TOKENS ----
  it('ALLOWED_TOKENS: renders symbol badges', () => {
    render(
      <PolicyRulesSummary
        type="ALLOWED_TOKENS"
        rules={{ tokens: [{ symbol: 'USDC' }, { symbol: 'SOL' }] }}
      />,
    );

    expect(screen.getByText('USDC')).toBeDefined();
    expect(screen.getByText('SOL')).toBeDefined();
  });

  it('ALLOWED_TOKENS: truncated address when no symbol', () => {
    render(
      <PolicyRulesSummary
        type="ALLOWED_TOKENS"
        rules={{ tokens: [{ address: '0x1234567890abcdef' }] }}
      />,
    );

    expect(screen.getByText('0x123456...')).toBeDefined();
  });

  it('ALLOWED_TOKENS: empty tokens shows No tokens', () => {
    render(
      <PolicyRulesSummary type="ALLOWED_TOKENS" rules={{ tokens: [] }} />,
    );

    expect(screen.getByText('No tokens')).toBeDefined();
  });

  // ---- RATE_LIMIT ----
  it('RATE_LIMIT: renders formatted rate (hours)', () => {
    render(
      <PolicyRulesSummary
        type="RATE_LIMIT"
        rules={{ max_requests: 100, window_seconds: 3600 }}
      />,
    );

    expect(screen.getByText('100 req / 1h')).toBeDefined();
  });

  it('RATE_LIMIT: seconds format', () => {
    render(
      <PolicyRulesSummary
        type="RATE_LIMIT"
        rules={{ max_requests: 10, window_seconds: 30 }}
      />,
    );

    expect(screen.getByText('10 req / 30s')).toBeDefined();
  });

  // ---- WHITELIST ----
  it('WHITELIST: renders address count', () => {
    render(
      <PolicyRulesSummary
        type="WHITELIST"
        rules={{ allowed_addresses: ['addr1', 'addr2', 'addr3'] }}
      />,
    );

    expect(screen.getByText('3 addresses')).toBeDefined();
  });

  // ---- TIME_RESTRICTION ----
  it('TIME_RESTRICTION: renders days and hours', () => {
    render(
      <PolicyRulesSummary
        type="TIME_RESTRICTION"
        rules={{
          allowed_days: [1, 2, 3, 4, 5],
          allowed_hours: { start: 9, end: 17 },
        }}
      />,
    );

    expect(screen.getByText('Mon-Fri 09:00-17:00')).toBeDefined();
  });

  it('TIME_RESTRICTION: non-consecutive days', () => {
    render(
      <PolicyRulesSummary
        type="TIME_RESTRICTION"
        rules={{ allowed_days: [0, 3, 6] }}
      />,
    );

    expect(screen.getByText(/Sun, Wed, Sat/)).toBeDefined();
  });

  // ---- CONTRACT_WHITELIST ----
  it('CONTRACT_WHITELIST: renders contract names, max 3 + overflow', () => {
    render(
      <PolicyRulesSummary
        type="CONTRACT_WHITELIST"
        rules={{
          contracts: [
            { name: 'Uniswap' },
            { name: 'Aave' },
            { name: 'Compound' },
            { name: 'Curve' },
          ],
        }}
      />,
    );

    expect(screen.getByText('Uniswap')).toBeDefined();
    expect(screen.getByText('Aave')).toBeDefined();
    expect(screen.getByText('Compound')).toBeDefined();
    expect(screen.getByText('+1 more')).toBeDefined();
  });

  it('CONTRACT_WHITELIST: empty shows No contracts', () => {
    render(
      <PolicyRulesSummary
        type="CONTRACT_WHITELIST"
        rules={{ contracts: [] }}
      />,
    );

    expect(screen.getByText('No contracts')).toBeDefined();
  });

  // ---- METHOD_WHITELIST ----
  it('METHOD_WHITELIST: renders counts', () => {
    render(
      <PolicyRulesSummary
        type="METHOD_WHITELIST"
        rules={{
          methods: [
            { contractAddress: '0x1', selectors: ['0xaa', '0xbb'] },
            { contractAddress: '0x2', selectors: ['0xcc'] },
          ],
        }}
      />,
    );

    expect(screen.getByText('2 contracts, 3 methods')).toBeDefined();
  });

  // ---- APPROVED_SPENDERS ----
  it('APPROVED_SPENDERS: renders spender count', () => {
    render(
      <PolicyRulesSummary
        type="APPROVED_SPENDERS"
        rules={{ spenders: [{ address: '0x1' }, { address: '0x2' }] }}
      />,
    );

    expect(screen.getByText('2 spenders')).toBeDefined();
  });

  // ---- APPROVE_AMOUNT_LIMIT ----
  it('APPROVE_AMOUNT_LIMIT: maxAmount + blockUnlimited', () => {
    render(
      <PolicyRulesSummary
        type="APPROVE_AMOUNT_LIMIT"
        rules={{ maxAmount: '1000000', blockUnlimited: true }}
      />,
    );

    expect(screen.getByText('Max: 1,000,000 + Block unlimited')).toBeDefined();
  });

  it('APPROVE_AMOUNT_LIMIT: maxAmount only', () => {
    render(
      <PolicyRulesSummary
        type="APPROVE_AMOUNT_LIMIT"
        rules={{ maxAmount: '500' }}
      />,
    );

    expect(screen.getByText('Max: 500')).toBeDefined();
  });

  it('APPROVE_AMOUNT_LIMIT: blockUnlimited only', () => {
    render(
      <PolicyRulesSummary
        type="APPROVE_AMOUNT_LIMIT"
        rules={{ blockUnlimited: true }}
      />,
    );

    expect(screen.getByText('Block unlimited only')).toBeDefined();
  });

  it('APPROVE_AMOUNT_LIMIT: no limits', () => {
    render(
      <PolicyRulesSummary type="APPROVE_AMOUNT_LIMIT" rules={{}} />,
    );

    expect(screen.getByText('No limits')).toBeDefined();
  });

  // ---- APPROVE_TIER_OVERRIDE ----
  it('APPROVE_TIER_OVERRIDE: renders tier badge', () => {
    render(
      <PolicyRulesSummary
        type="APPROVE_TIER_OVERRIDE"
        rules={{ tier: 'INSTANT' }}
      />,
    );

    expect(screen.getByText('INSTANT')).toBeDefined();
  });

  it('APPROVE_TIER_OVERRIDE: default tier DELAY', () => {
    render(
      <PolicyRulesSummary type="APPROVE_TIER_OVERRIDE" rules={{}} />,
    );

    expect(screen.getByText('DELAY')).toBeDefined();
  });

  // ---- ALLOWED_NETWORKS ----
  it('ALLOWED_NETWORKS: renders network badges, max 3 + overflow', () => {
    render(
      <PolicyRulesSummary
        type="ALLOWED_NETWORKS"
        rules={{
          networks: [
            { network: 'ethereum' },
            { network: 'polygon' },
            { network: 'arbitrum' },
            { network: 'optimism' },
          ],
        }}
      />,
    );

    expect(screen.getByText('ethereum')).toBeDefined();
    expect(screen.getByText('polygon')).toBeDefined();
    expect(screen.getByText('arbitrum')).toBeDefined();
    expect(screen.getByText('+1 more')).toBeDefined();
  });

  it('ALLOWED_NETWORKS: empty shows No networks', () => {
    render(
      <PolicyRulesSummary type="ALLOWED_NETWORKS" rules={{ networks: [] }} />,
    );

    expect(screen.getByText('No networks')).toBeDefined();
  });

  // ---- X402_ALLOWED_DOMAINS ----
  it('X402_ALLOWED_DOMAINS: renders domain badges, max 3 + overflow', () => {
    render(
      <PolicyRulesSummary
        type="X402_ALLOWED_DOMAINS"
        rules={{
          domains: ['example.com', 'api.test', 'foo.bar', 'baz.qux'],
        }}
      />,
    );

    expect(screen.getByText('example.com')).toBeDefined();
    expect(screen.getByText('api.test')).toBeDefined();
    expect(screen.getByText('foo.bar')).toBeDefined();
    expect(screen.getByText('+1 more')).toBeDefined();
  });

  it('X402_ALLOWED_DOMAINS: empty shows No domains', () => {
    render(
      <PolicyRulesSummary
        type="X402_ALLOWED_DOMAINS"
        rules={{ domains: [] }}
      />,
    );

    expect(screen.getByText('No domains')).toBeDefined();
  });

  // ---- default fallback ----
  it('default: renders JSON fallback', () => {
    render(
      <PolicyRulesSummary type="UNKNOWN_TYPE" rules={{ foo: 'bar' }} />,
    );

    expect(screen.getByText('{"foo":"bar"}')).toBeDefined();
  });

  it('default: truncates long JSON', () => {
    const longValue = 'x'.repeat(80);
    const { container } = render(
      <PolicyRulesSummary type="UNKNOWN_TYPE" rules={{ a: longValue }} />,
    );

    const summary = container.querySelector('.rules-summary')!;
    expect(summary.textContent!.endsWith('...')).toBe(true);
    expect(summary.textContent!.length).toBeLessThanOrEqual(63); // 60 chars + '...'
  });
});
