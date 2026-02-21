/**
 * Tests for X402_ALLOWED_DOMAINS domain policy evaluation.
 *
 * TDD RED phase: these tests define the expected behavior of matchDomain
 * and evaluateX402Domain before implementation exists.
 */

import { describe, it, expect } from 'vitest';
import { matchDomain, evaluateX402Domain } from '../services/x402/x402-domain-policy.js';

// ---------------------------------------------------------------------------
// matchDomain
// ---------------------------------------------------------------------------

describe('matchDomain', () => {
  describe('exact matching', () => {
    it('returns true for identical domains', () => {
      expect(matchDomain('api.example.com', 'api.example.com')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(matchDomain('API.Example.COM', 'api.example.com')).toBe(true);
    });

    it('is case-insensitive (target uppercase)', () => {
      expect(matchDomain('api.example.com', 'API.EXAMPLE.COM')).toBe(true);
    });

    it('returns false for non-matching domains', () => {
      expect(matchDomain('other.com', 'api.example.com')).toBe(false);
    });
  });

  describe('wildcard matching', () => {
    it('matches single subdomain', () => {
      expect(matchDomain('*.example.com', 'sub.example.com')).toBe(true);
    });

    it('matches multi-level subdomains', () => {
      expect(matchDomain('*.example.com', 'a.b.example.com')).toBe(true);
    });

    it('does NOT match root domain (dot-boundary)', () => {
      expect(matchDomain('*.example.com', 'example.com')).toBe(false);
    });

    it('matches TLD wildcard', () => {
      expect(matchDomain('*.com', 'anything.com')).toBe(true);
    });

    it('is case-insensitive with wildcard', () => {
      expect(matchDomain('*.EXAMPLE.COM', 'sub.example.com')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('returns false for empty pattern', () => {
      expect(matchDomain('', 'api.example.com')).toBe(false);
    });

    it('returns false for empty target', () => {
      expect(matchDomain('api.example.com', '')).toBe(false);
    });

    it('wildcard alone does not match arbitrary string', () => {
      // "*.example.com" should not match "notexample.com"
      expect(matchDomain('*.example.com', 'notexample.com')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// evaluateX402Domain
// ---------------------------------------------------------------------------

describe('evaluateX402Domain', () => {
  describe('no X402_ALLOWED_DOMAINS policy', () => {
    it('returns deny when no policies exist', () => {
      const result = evaluateX402Domain([], 'api.example.com');
      expect(result).not.toBeNull();
      expect(result!.allowed).toBe(false);
      expect(result!.tier).toBe('INSTANT');
      expect(result!.reason).toContain('x402 payments disabled');
      expect(result!.reason).toContain('X402_ALLOWED_DOMAINS');
    });

    it('returns deny when only other policy types exist', () => {
      const resolved = [
        {
          id: 'p1',
          walletId: null,
          type: 'SPENDING_LIMIT',
          rules: JSON.stringify({ instant_max: '1000', notify_max: '5000', delay_max: '10000', delay_seconds: 300 }),
          priority: 100,
          enabled: true,
          network: null,
        },
      ];
      const result = evaluateX402Domain(resolved, 'api.example.com');
      expect(result).not.toBeNull();
      expect(result!.allowed).toBe(false);
      expect(result!.reason).toContain('x402 payments disabled');
    });

    it('returns null (allow) when default_deny_x402_domains is false', () => {
      const settingsService = { get: (key: string) => key === 'policy.default_deny_x402_domains' ? 'false' : 'true' };
      const result = evaluateX402Domain([], 'api.example.com', settingsService);
      expect(result).toBeNull();
    });

    it('returns deny when default_deny_x402_domains is true', () => {
      const settingsService = { get: (key: string) => key === 'policy.default_deny_x402_domains' ? 'true' : 'true' };
      const result = evaluateX402Domain([], 'api.example.com', settingsService);
      expect(result).not.toBeNull();
      expect(result!.allowed).toBe(false);
    });

    it('returns deny when no settingsService provided (default deny)', () => {
      const result = evaluateX402Domain([], 'api.example.com', undefined);
      expect(result).not.toBeNull();
      expect(result!.allowed).toBe(false);
    });
  });

  describe('domain allowed', () => {
    it('returns null (continue) when domain is in exact match list', () => {
      const resolved = [
        {
          id: 'p1',
          walletId: null,
          type: 'X402_ALLOWED_DOMAINS',
          rules: JSON.stringify({ domains: ['api.example.com', 'other.com'] }),
          priority: 100,
          enabled: true,
          network: null,
        },
      ];
      const result = evaluateX402Domain(resolved, 'api.example.com');
      expect(result).toBeNull();
    });

    it('returns null (continue) when domain matches wildcard', () => {
      const resolved = [
        {
          id: 'p1',
          walletId: null,
          type: 'X402_ALLOWED_DOMAINS',
          rules: JSON.stringify({ domains: ['*.example.com'] }),
          priority: 100,
          enabled: true,
          network: null,
        },
      ];
      const result = evaluateX402Domain(resolved, 'sub.example.com');
      expect(result).toBeNull();
    });

    it('returns null for case-insensitive domain match', () => {
      const resolved = [
        {
          id: 'p1',
          walletId: null,
          type: 'X402_ALLOWED_DOMAINS',
          rules: JSON.stringify({ domains: ['API.EXAMPLE.COM'] }),
          priority: 100,
          enabled: true,
          network: null,
        },
      ];
      const result = evaluateX402Domain(resolved, 'api.example.com');
      expect(result).toBeNull();
    });
  });

  describe('domain denied', () => {
    it('returns deny when domain not in allowed list', () => {
      const resolved = [
        {
          id: 'p1',
          walletId: null,
          type: 'X402_ALLOWED_DOMAINS',
          rules: JSON.stringify({ domains: ['api.example.com'] }),
          priority: 100,
          enabled: true,
          network: null,
        },
      ];
      const result = evaluateX402Domain(resolved, 'evil.com');
      expect(result).not.toBeNull();
      expect(result!.allowed).toBe(false);
      expect(result!.tier).toBe('INSTANT');
      expect(result!.reason).toContain("Domain 'evil.com' not in");
    });

    it('wildcard dot-boundary: denies root domain', () => {
      const resolved = [
        {
          id: 'p1',
          walletId: null,
          type: 'X402_ALLOWED_DOMAINS',
          rules: JSON.stringify({ domains: ['*.example.com'] }),
          priority: 100,
          enabled: true,
          network: null,
        },
      ];
      const result = evaluateX402Domain(resolved, 'example.com');
      expect(result).not.toBeNull();
      expect(result!.allowed).toBe(false);
    });
  });
});
