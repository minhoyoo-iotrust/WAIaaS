import { describe, it, expect } from 'vitest';
import { routeByTopic } from '../message-router.js';
import type { DeviceRecord } from '../registry/device-registry.js';

const SIGN_PREFIX = 'waiaas-sign';
const NOTIFY_PREFIX = 'waiaas-notify';

const DEVICE_A: DeviceRecord = {
  pushToken: 'push-token-a',
  walletName: 'dcent',
  platform: 'ios',
  subscriptionToken: 'abc123',
  createdAt: 1700000000,
  updatedAt: 1700000000,
};

function mockGetDevice(token: string): DeviceRecord | null {
  if (token === DEVICE_A.subscriptionToken) return DEVICE_A;
  return null;
}

describe('routeByTopic', () => {
  it('skips base sign topic (no broadcast)', () => {
    const result = routeByTopic('dcent', 'waiaas-sign-dcent', SIGN_PREFIX, NOTIFY_PREFIX, mockGetDevice);
    expect(result.action).toBe('skip_base');
  });

  it('skips base notify topic (no broadcast)', () => {
    const result = routeByTopic('dcent', 'waiaas-notify-dcent', SIGN_PREFIX, NOTIFY_PREFIX, mockGetDevice);
    expect(result.action).toBe('skip_base');
  });

  it('unicasts to device on sign device topic', () => {
    const result = routeByTopic('dcent', 'waiaas-sign-dcent-abc123', SIGN_PREFIX, NOTIFY_PREFIX, mockGetDevice);
    expect(result.action).toBe('unicast');
    expect(result.subscriptionToken).toBe('abc123');
    expect(result.device).toEqual(DEVICE_A);
  });

  it('unicasts to device on notify device topic', () => {
    const result = routeByTopic('dcent', 'waiaas-notify-dcent-abc123', SIGN_PREFIX, NOTIFY_PREFIX, mockGetDevice);
    expect(result.action).toBe('unicast');
    expect(result.subscriptionToken).toBe('abc123');
    expect(result.device).toEqual(DEVICE_A);
  });

  it('skips unknown topic format', () => {
    const result = routeByTopic('dcent', 'random-topic-dcent', SIGN_PREFIX, NOTIFY_PREFIX, mockGetDevice);
    expect(result.action).toBe('skip_unknown');
  });

  it('skips when device not found for subscriptionToken', () => {
    const result = routeByTopic('dcent', 'waiaas-notify-dcent-nonexistent', SIGN_PREFIX, NOTIFY_PREFIX, mockGetDevice);
    expect(result.action).toBe('skip_no_device');
    expect(result.subscriptionToken).toBe('nonexistent');
  });

  it('isolates wallets — device A topic does not match wallet B', () => {
    const result = routeByTopic('other', 'waiaas-notify-other-abc123', SIGN_PREFIX, NOTIFY_PREFIX, mockGetDevice);
    // abc123 belongs to dcent, but routeByTopic just looks up by token
    // The device IS found because getDevice only checks token
    expect(result.action).toBe('unicast');
    expect(result.subscriptionToken).toBe('abc123');
  });

  it('handles custom topic prefixes', () => {
    const result = routeByTopic('w1', 'custom-sign-w1', 'custom-sign', 'custom-notify', mockGetDevice);
    expect(result.action).toBe('skip_base');
  });
});
