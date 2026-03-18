/**
 * Tests for resolveConfig().
 * Covers: default daemonUrl, missing sessionToken, non-string daemonUrl.
 */
import { describe, it, expect } from 'vitest';
import { resolveConfig } from '../src/config.js';

describe('resolveConfig()', () => {
  it('resolves with default daemonUrl when not provided', () => {
    const config = resolveConfig({ sessionToken: 'tok' });
    expect(config).toEqual({ sessionToken: 'tok', daemonUrl: 'http://localhost:3100' });
  });

  it('resolves with custom daemonUrl', () => {
    const config = resolveConfig({ sessionToken: 'tok', daemonUrl: 'http://custom:9000/' });
    expect(config).toEqual({ sessionToken: 'tok', daemonUrl: 'http://custom:9000' });
  });

  it('throws when sessionToken is missing', () => {
    expect(() => resolveConfig({})).toThrow('sessionToken is required');
  });

  it('throws when sessionToken is empty string', () => {
    expect(() => resolveConfig({ sessionToken: '' })).toThrow('sessionToken is required');
  });

  it('throws when sessionToken is not a string', () => {
    expect(() => resolveConfig({ sessionToken: 123 })).toThrow('sessionToken is required');
  });

  it('throws when daemonUrl is not a string', () => {
    expect(() => resolveConfig({ sessionToken: 'tok', daemonUrl: 12345 })).toThrow('daemonUrl must be a string');
  });
});
