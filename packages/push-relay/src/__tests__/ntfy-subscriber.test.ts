import { describe, it, expect, vi, afterEach } from 'vitest';
import { NtfySubscriber } from '../subscriber/ntfy-subscriber.js';

// ── Fixtures ──────────────────────────────────────────────────────────

function encodeBase64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), 'utf-8').toString('base64url');
}

const validSignRequest = {
  version: '1',
  requestId: '550e8400-e29b-41d4-a716-446655440000',
  chain: 'solana',
  network: 'devnet',
  message: 'base64tx',
  displayMessage: 'Send 1 SOL',
  metadata: {
    txId: '550e8400-e29b-41d4-a716-446655440001',
    type: 'TRANSFER',
    from: 'sender',
    to: 'receiver',
    amount: '1',
    symbol: 'SOL',
    policyTier: 'APPROVAL',
  },
  responseChannel: { type: 'ntfy', responseTopic: 'resp-topic' },
  expiresAt: '2026-12-31T23:59:59Z',
};

const validNotification = {
  version: '1',
  eventType: 'transaction.confirmed',
  walletId: 'wallet-1',
  walletName: 'dcent',
  category: 'transaction',
  title: 'Transaction Confirmed',
  body: 'Your transaction has been confirmed.',
  timestamp: 1700000000,
};

// ── Helpers ───────────────────────────────────────────────────────────

function createSseStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const data = encoder.encode(lines.join('\n') + '\n');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}

function createSseResponse(lines: string[]): Response {
  return new Response(createSseStream(lines), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────

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

    vi.spyOn(globalThis, 'fetch').mockImplementation(
      () => new Promise(() => {}),
    );

    subscriber.start();
    expect(subscriber.connected).toBe(true);
    expect(subscriber.topicCount).toBe(4);
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

  it('processes SSE sign_request messages and calls onMessage', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    const encoded = encodeBase64url(validSignRequest);
    const ntfyMessage = JSON.stringify({
      topic: 'sign-w1',
      message: encoded,
      title: 'Sign Request',
      priority: 5,
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = url as string;
      if (urlStr.includes('sign-w1')) {
        return Promise.resolve(createSseResponse([`data: ${ntfyMessage}`]));
      }
      return new Promise(() => {});
    });

    const subscriber = new NtfySubscriber({
      ntfyServer: 'https://ntfy.sh',
      signTopicPrefix: 'sign',
      notifyTopicPrefix: 'notify',
      walletNames: ['w1'],
      onMessage,
    });

    subscriber.start();
    await new Promise((r) => setTimeout(r, 100));
    await subscriber.stop();

    expect(onMessage).toHaveBeenCalled();
    const call = onMessage.mock.calls[0]!;
    expect(call[0]).toBe('w1');
    expect(call[1].category).toBe('sign_request');
    expect(call[1].priority).toBe('high');
  });

  it('processes SSE notification messages', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    const encoded = encodeBase64url(validNotification);
    const ntfyMessage = JSON.stringify({
      topic: 'notify-w1',
      message: encoded,
      title: 'Notification',
      priority: 3,
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = url as string;
      if (urlStr.includes('notify-w1')) {
        return Promise.resolve(createSseResponse([`data: ${ntfyMessage}`]));
      }
      return new Promise(() => {});
    });

    const subscriber = new NtfySubscriber({
      ntfyServer: 'https://ntfy.sh',
      signTopicPrefix: 'sign',
      notifyTopicPrefix: 'notify',
      walletNames: ['w1'],
      onMessage,
    });

    subscriber.start();
    await new Promise((r) => setTimeout(r, 100));
    await subscriber.stop();

    expect(onMessage).toHaveBeenCalled();
    const call = onMessage.mock.calls[0]!;
    expect(call[1].category).toBe('notification');
    expect(call[1].priority).toBe('normal');
  });

  it('skips non-data SSE lines and empty messages', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    const encoded = encodeBase64url(validSignRequest);
    const ntfyMessage = JSON.stringify({
      topic: 'sign-w1',
      message: encoded,
      title: 'test',
      priority: 3,
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = url as string;
      if (urlStr.includes('sign-w1')) {
        return Promise.resolve(createSseResponse([
          'event: message',
          ': comment',
          'data: ',
          `data: ${ntfyMessage}`,
        ]));
      }
      return new Promise(() => {});
    });

    const subscriber = new NtfySubscriber({
      ntfyServer: 'https://ntfy.sh',
      signTopicPrefix: 'sign',
      notifyTopicPrefix: 'notify',
      walletNames: ['w1'],
      onMessage,
    });

    subscriber.start();
    await new Promise((r) => setTimeout(r, 100));
    await subscriber.stop();

    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it('calls onError for parse errors in SSE data', async () => {
    const onError = vi.fn();
    const onMessage = vi.fn().mockResolvedValue(undefined);

    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = url as string;
      if (urlStr.includes('sign-w1')) {
        return Promise.resolve(createSseResponse([
          'data: not-valid-json',
        ]));
      }
      return new Promise(() => {});
    });

    const subscriber = new NtfySubscriber({
      ntfyServer: 'https://ntfy.sh',
      signTopicPrefix: 'sign',
      notifyTopicPrefix: 'notify',
      walletNames: ['w1'],
      onMessage,
      onError,
    });

    subscriber.start();
    await new Promise((r) => setTimeout(r, 100));
    await subscriber.stop();

    expect(onError).toHaveBeenCalled();
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('calls onError on connection failure', async () => {
    const onError = vi.fn();

    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      return Promise.resolve(new Response(null, { status: 500 }));
    });

    const subscriber = new NtfySubscriber({
      ntfyServer: 'https://ntfy.sh',
      signTopicPrefix: 'sign',
      notifyTopicPrefix: 'notify',
      walletNames: ['w1'],
      onMessage: vi.fn(),
      onError,
    });

    subscriber.start();
    await new Promise((r) => setTimeout(r, 100));
    await subscriber.stop();

    expect(onError).toHaveBeenCalled();
  });

  it('skips messages without message field', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    const ntfyMessage = JSON.stringify({
      topic: 'sign-w1',
      title: 'no message field',
      priority: 3,
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = url as string;
      if (urlStr.includes('sign-w1')) {
        return Promise.resolve(createSseResponse([`data: ${ntfyMessage}`]));
      }
      return new Promise(() => {});
    });

    const subscriber = new NtfySubscriber({
      ntfyServer: 'https://ntfy.sh',
      signTopicPrefix: 'sign',
      notifyTopicPrefix: 'notify',
      walletNames: ['w1'],
      onMessage,
    });

    subscriber.start();
    await new Promise((r) => setTimeout(r, 100));
    await subscriber.stop();

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('skips messages with unknown topic type', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    const ntfyMessage = JSON.stringify({
      topic: 'unknown-topic-w1',
      message: encodeBase64url(validSignRequest),
      title: 'unknown',
      priority: 3,
    });

    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      const urlStr = url as string;
      if (urlStr.includes('sign-w1')) {
        return Promise.resolve(createSseResponse([`data: ${ntfyMessage}`]));
      }
      return new Promise(() => {});
    });

    const subscriber = new NtfySubscriber({
      ntfyServer: 'https://ntfy.sh',
      signTopicPrefix: 'sign',
      notifyTopicPrefix: 'notify',
      walletNames: ['w1'],
      onMessage,
    });

    subscriber.start();
    await new Promise((r) => setTimeout(r, 100));
    await subscriber.stop();

    expect(onMessage).not.toHaveBeenCalled();
  });
});
