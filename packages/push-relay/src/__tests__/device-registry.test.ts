import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdirSync, rmSync } from 'node:fs';
import { DeviceRegistry } from '../registry/device-registry.js';

let registry: DeviceRegistry;
let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `push-relay-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
  registry = new DeviceRegistry(join(tmpDir, 'test.db'));
});

afterEach(() => {
  registry.close();
  rmSync(tmpDir, { recursive: true });
});

describe('DeviceRegistry', () => {
  it('registers a device and retrieves tokens by wallet name', () => {
    registry.register('dcent', 'token-1', 'ios');
    registry.register('dcent', 'token-2', 'android');

    const tokens = registry.getTokensByWalletName('dcent');
    expect(tokens).toHaveLength(2);
    expect(tokens).toContain('token-1');
    expect(tokens).toContain('token-2');
  });

  it('returns empty array for unknown wallet', () => {
    expect(registry.getTokensByWalletName('unknown')).toEqual([]);
  });

  it('upserts on duplicate push_token', () => {
    registry.register('dcent', 'token-1', 'ios');
    registry.register('other-wallet', 'token-1', 'android');

    const dcentTokens = registry.getTokensByWalletName('dcent');
    expect(dcentTokens).toEqual([]);

    const otherTokens = registry.getTokensByWalletName('other-wallet');
    expect(otherTokens).toEqual(['token-1']);
  });

  it('unregisters a token', () => {
    registry.register('dcent', 'token-1', 'ios');
    expect(registry.unregister('token-1')).toBe(true);
    expect(registry.getTokensByWalletName('dcent')).toEqual([]);
  });

  it('returns false when unregistering non-existent token', () => {
    expect(registry.unregister('nonexistent')).toBe(false);
  });

  it('removes multiple tokens', () => {
    registry.register('dcent', 'token-1', 'ios');
    registry.register('dcent', 'token-2', 'android');
    registry.register('dcent', 'token-3', 'ios');

    registry.removeTokens(['token-1', 'token-3']);
    const tokens = registry.getTokensByWalletName('dcent');
    expect(tokens).toEqual(['token-2']);
  });

  it('handles removeTokens with empty array', () => {
    registry.register('dcent', 'token-1', 'ios');
    registry.removeTokens([]);
    expect(registry.getTokensByWalletName('dcent')).toEqual(['token-1']);
  });

  it('counts registered devices', () => {
    expect(registry.count()).toBe(0);
    registry.register('dcent', 'token-1', 'ios');
    registry.register('dcent', 'token-2', 'android');
    expect(registry.count()).toBe(2);
  });
});
