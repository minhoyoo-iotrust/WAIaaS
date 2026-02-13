/**
 * Tests for slug utilities used by mcp-setup multi-wallet support.
 */

import { describe, it, expect } from 'vitest';
import { toSlug, resolveSlugCollisions } from '../utils/slug.js';

describe('toSlug', () => {
  it('converts name to lowercase with hyphens', () => {
    expect(toSlug('Trading Bot')).toBe('trading-bot');
  });

  it('collapses consecutive hyphens', () => {
    expect(toSlug('my--bot')).toBe('my-bot');
  });

  it('trims leading/trailing hyphens', () => {
    expect(toSlug('-bot-')).toBe('bot');
  });

  it('returns "wallet" for empty string', () => {
    expect(toSlug('')).toBe('wallet');
  });

  it('returns "wallet" for special-chars-only input', () => {
    expect(toSlug('!!!')).toBe('wallet');
  });

  it('returns "wallet" for non-ASCII-only input (e.g. Korean)', () => {
    // Non-ASCII chars -> hyphens -> collapse -> trim -> empty -> 'wallet'
    expect(toSlug('\uD2B8\uB808\uC774\uB529\uBD07')).toBe('wallet');
  });
});

describe('resolveSlugCollisions', () => {
  it('returns slug as-is when no collisions', () => {
    const wallets = [
      { id: '01929abc-1111-7000-8000-000000000001', name: 'trading-bot' },
      { id: '01929abc-2222-7000-8000-000000000002', name: 'research-bot' },
    ];
    const result = resolveSlugCollisions(wallets);
    expect(result.get(wallets[0]!.id)).toBe('trading-bot');
    expect(result.get(wallets[1]!.id)).toBe('research-bot');
  });

  it('appends walletId first 8 chars on collision', () => {
    const wallets = [
      { id: '01929abc-1111-7000-8000-000000000001', name: 'bot' },
      { id: '01929def-2222-7000-8000-000000000002', name: 'bot' },
    ];
    const result = resolveSlugCollisions(wallets);
    expect(result.get(wallets[0]!.id)).toBe('bot-01929abc');
    expect(result.get(wallets[1]!.id)).toBe('bot-01929def');
  });

  it('uses id as slug source when name is null', () => {
    const wallets = [
      { id: 'abc12345-xxxx', name: null },
    ];
    const result = resolveSlugCollisions(wallets);
    expect(result.get(wallets[0]!.id)).toBe('abc12345-xxxx');
  });
});
