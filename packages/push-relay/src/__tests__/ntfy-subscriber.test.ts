import { describe, it, expect, vi, afterEach } from 'vitest';
import { NtfySubscriber } from '../subscriber/ntfy-subscriber.js';

describe('NtfySubscriber', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets connected and topicCount on start', () => {
    const subscriber = new NtfySubscriber({
      ntfyServer: 'https://ntfy.sh',
      signTopicPrefix: 'waiaas-sign',
      notifyTopicPrefix: 'waiaas-notify',
      walletNames: ['dcent', 'bot1'],
      onMessage: vi.fn(),
    });

    // Mock fetch to prevent actual SSE connections
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise(() => {}), // never resolves (simulates long-lived SSE)
    );

    subscriber.start();
    expect(subscriber.connected).toBe(true);
    expect(subscriber.topicCount).toBe(4); // 2 wallets × 2 topics
  });

  it('resets state on stop', async () => {
    const subscriber = new NtfySubscriber({
      ntfyServer: 'https://ntfy.sh',
      signTopicPrefix: 'waiaas-sign',
      notifyTopicPrefix: 'waiaas-notify',
      walletNames: ['dcent'],
      onMessage: vi.fn(),
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise(() => {}),
    );

    subscriber.start();
    await subscriber.stop();
    expect(subscriber.connected).toBe(false);
  });

  it('subscribes to correct ntfy SSE URLs', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise(() => {}),
    );

    const subscriber = new NtfySubscriber({
      ntfyServer: 'https://ntfy.example.com',
      signTopicPrefix: 'sign',
      notifyTopicPrefix: 'notify',
      walletNames: ['w1'],
      onMessage: vi.fn(),
    });

    subscriber.start();

    const urls = fetchSpy.mock.calls.map((c) => c[0] as string);
    expect(urls).toContain('https://ntfy.example.com/sign-w1/sse');
    expect(urls).toContain('https://ntfy.example.com/notify-w1/sse');
  });
});
