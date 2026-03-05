import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  matchDomain,
  evaluateErc8128Domain,
  checkErc8128RateLimit,
  _resetRateLimitCounters,
} from '../erc8128-domain-policy.js';

// Minimal SettingsReader mock
function createSettingsReader(overrides: Record<string, string> = {}) {
  return {
    get: (key: string) => overrides[key] ?? '',
  };
}

describe('matchDomain', () => {
  it('matches exact domain', () => {
    expect(matchDomain('api.example.com', 'api.example.com')).toBe(true);
  });

  it('matches wildcard subdomain', () => {
    expect(matchDomain('*.example.com', 'sub.example.com')).toBe(true);
  });

  it('does not match root domain with wildcard (dot-boundary)', () => {
    expect(matchDomain('*.example.com', 'example.com')).toBe(false);
  });

  it('matches deep wildcard subdomain', () => {
    expect(matchDomain('*.example.com', 'a.b.example.com')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(matchDomain('API.Example.COM', 'api.example.com')).toBe(true);
    expect(matchDomain('*.Example.COM', 'sub.example.com')).toBe(true);
  });

  it('does not match different domains', () => {
    expect(matchDomain('api.example.com', 'api.other.com')).toBe(false);
  });

  it('does not match partial domain suffix', () => {
    expect(matchDomain('*.example.com', 'notexample.com')).toBe(false);
  });
});

describe('evaluateErc8128Domain', () => {
  it('returns denied when no policy configured (default-deny)', () => {
    const result = evaluateErc8128Domain([], 'api.example.com');
    expect(result).not.toBeNull();
    expect(result!.allowed).toBe(false);
    expect(result!.reason).toContain('no ERC8128_ALLOWED_DOMAINS policy configured');
  });

  it('returns null when no policy but default_deny_erc8128_domains=false', () => {
    const settings = createSettingsReader({
      'policy.default_deny_erc8128_domains': 'false',
    });
    const result = evaluateErc8128Domain([], 'api.example.com', settings);
    expect(result).toBeNull();
  });

  it('returns null when domain matches policy', () => {
    const policies = [
      {
        id: 'p1',
        walletId: null,
        type: 'ERC8128_ALLOWED_DOMAINS',
        rules: JSON.stringify({ domains: ['api.example.com', '*.test.com'] }),
        priority: 1,
        enabled: true,
        network: null,
      },
    ];
    const result = evaluateErc8128Domain(policies, 'api.example.com');
    expect(result).toBeNull();
  });

  it('returns denied when domain does not match policy', () => {
    const policies = [
      {
        id: 'p1',
        walletId: null,
        type: 'ERC8128_ALLOWED_DOMAINS',
        rules: JSON.stringify({ domains: ['api.example.com'] }),
        priority: 1,
        enabled: true,
        network: null,
      },
    ];
    const result = evaluateErc8128Domain(policies, 'evil.com');
    expect(result).not.toBeNull();
    expect(result!.allowed).toBe(false);
    expect(result!.reason).toContain("'evil.com'");
  });

  it('matches wildcard domain in policy', () => {
    const policies = [
      {
        id: 'p1',
        walletId: null,
        type: 'ERC8128_ALLOWED_DOMAINS',
        rules: JSON.stringify({ domains: ['*.example.com'] }),
        priority: 1,
        enabled: true,
        network: null,
      },
    ];
    const result = evaluateErc8128Domain(policies, 'sub.example.com');
    expect(result).toBeNull();
  });

  it('ignores non-ERC8128 policies', () => {
    const policies = [
      {
        id: 'p1',
        walletId: null,
        type: 'X402_ALLOWED_DOMAINS',
        rules: JSON.stringify({ domains: ['api.example.com'] }),
        priority: 1,
        enabled: true,
        network: null,
      },
    ];
    // No ERC8128 policy found -> default deny
    const result = evaluateErc8128Domain(policies, 'api.example.com');
    expect(result).not.toBeNull();
    expect(result!.allowed).toBe(false);
  });
});

describe('checkErc8128RateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    _resetRateLimitCounters();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows first request (under limit)', () => {
    expect(checkErc8128RateLimit('api.example.com', 5)).toBe(true);
  });

  it('allows requests up to limit', () => {
    for (let i = 0; i < 5; i++) {
      expect(checkErc8128RateLimit('api.example.com', 5)).toBe(true);
    }
  });

  it('blocks when limit exceeded', () => {
    for (let i = 0; i < 5; i++) {
      checkErc8128RateLimit('api.example.com', 5);
    }
    expect(checkErc8128RateLimit('api.example.com', 5)).toBe(false);
  });

  it('tracks different domains independently', () => {
    for (let i = 0; i < 5; i++) {
      checkErc8128RateLimit('domain-a.com', 5);
    }
    // domain-a is at limit
    expect(checkErc8128RateLimit('domain-a.com', 5)).toBe(false);
    // domain-b still has capacity
    expect(checkErc8128RateLimit('domain-b.com', 5)).toBe(true);
  });

  it('resets after 60 seconds', () => {
    for (let i = 0; i < 5; i++) {
      checkErc8128RateLimit('api.example.com', 5);
    }
    expect(checkErc8128RateLimit('api.example.com', 5)).toBe(false);

    // Advance time past the 60s window
    vi.advanceTimersByTime(61_000);
    expect(checkErc8128RateLimit('api.example.com', 5)).toBe(true);
  });
});
