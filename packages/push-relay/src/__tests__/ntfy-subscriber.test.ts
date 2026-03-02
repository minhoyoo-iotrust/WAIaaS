import { describe, it, expect, vi, afterEach } from 'vitest';
import { createServer } from 'node:http';
import type { Server, IncomingMessage, ServerResponse } from 'node:http';
import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib';
import { NtfySubscriber } from '../subscriber/ntfy-subscriber.js';
import { ConfigurablePayloadTransformer } from '../transformer/payload-transformer.js';
import type { AddressInfo } from 'node:net';

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

// ── Test HTTP Server Helpers ──────────────────────────────────────────

type SseServerHandler = (req: IncomingMessage, res: ServerResponse) => void;

function createTestServer(handler: SseServerHandler): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, port });
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function sseHandler(
  topicData: Record<string, { lines: string[]; encoding?: 'gzip' | 'deflate' | 'br' }>,
): SseServerHandler {
  return (req, res) => {
    // URL pattern: /{topic}/sse
    const parts = req.url?.split('/').filter(Boolean) ?? [];
    const topic = parts[0] ?? '';

    const entry = topicData[topic];
    if (!entry) {
      // Hang forever for topics we don't have data for (simulate long-poll SSE)
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      // Don't end — keep connection open
      return;
    }

    const text = entry.lines.join('\n') + '\n';
    const raw = Buffer.from(text, 'utf-8');

    if (entry.encoding) {
      let compressed: Buffer;
      if (entry.encoding === 'gzip') compressed = gzipSync(raw);
      else if (entry.encoding === 'deflate') compressed = deflateSync(raw);
      else compressed = brotliCompressSync(raw);

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Content-Encoding': entry.encoding,
      });
      res.end(compressed);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end(raw);
    }
  };
}

// ── Integration Tests: NtfySubscriber ────────────────────────────────

describe('NtfySubscriber', () => {
  let servers: Server[] = [];

  afterEach(async () => {
    for (const s of servers) {
      await closeServer(s);
    }
    servers = [];
  });

  it('sets connected and topicCount on start', async () => {
    // Server that hangs all connections (never responds with data)
    const { server, port } = await createTestServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    });
    servers.push(server);

    const subscriber = new NtfySubscriber({
      ntfyServer: `http://127.0.0.1:${port}`,
      signTopicPrefix: 'waiaas-sign',
      notifyTopicPrefix: 'waiaas-notify',
      walletNames: ['dcent', 'bot1'],
      onMessage: vi.fn(),
    });

    subscriber.start();
    expect(subscriber.connected).toBe(true);
    expect(subscriber.topicCount).toBe(4);
    await subscriber.stop();
  });

  it('resets state on stop', async () => {
    const { server, port } = await createTestServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    });
    servers.push(server);

    const subscriber = new NtfySubscriber({
      ntfyServer: `http://127.0.0.1:${port}`,
      signTopicPrefix: 'waiaas-sign',
      notifyTopicPrefix: 'waiaas-notify',
      walletNames: ['dcent'],
      onMessage: vi.fn(),
    });

    subscriber.start();
    await subscriber.stop();
    expect(subscriber.connected).toBe(false);
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

    const { server, port } = await createTestServer(
      sseHandler({ 'sign-w1': { lines: [`data: ${ntfyMessage}`] } }),
    );
    servers.push(server);

    const subscriber = new NtfySubscriber({
      ntfyServer: `http://127.0.0.1:${port}`,
      signTopicPrefix: 'sign',
      notifyTopicPrefix: 'notify',
      walletNames: ['w1'],
      onMessage,
    });

    subscriber.start();
    await new Promise((r) => setTimeout(r, 200));
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

    const { server, port } = await createTestServer(
      sseHandler({ 'notify-w1': { lines: [`data: ${ntfyMessage}`] } }),
    );
    servers.push(server);

    const subscriber = new NtfySubscriber({
      ntfyServer: `http://127.0.0.1:${port}`,
      signTopicPrefix: 'sign',
      notifyTopicPrefix: 'notify',
      walletNames: ['w1'],
      onMessage,
    });

    subscriber.start();
    await new Promise((r) => setTimeout(r, 200));
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

    const { server, port } = await createTestServer(
      sseHandler({
        'sign-w1': {
          lines: [
            'event: message',
            ': comment',
            'data: ',
            `data: ${ntfyMessage}`,
          ],
        },
      }),
    );
    servers.push(server);

    const subscriber = new NtfySubscriber({
      ntfyServer: `http://127.0.0.1:${port}`,
      signTopicPrefix: 'sign',
      notifyTopicPrefix: 'notify',
      walletNames: ['w1'],
      onMessage,
    });

    subscriber.start();
    await new Promise((r) => setTimeout(r, 200));
    await subscriber.stop();

    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  it('calls onError for parse errors in SSE data', async () => {
    const onError = vi.fn();
    const onMessage = vi.fn().mockResolvedValue(undefined);

    const { server, port } = await createTestServer(
      sseHandler({ 'sign-w1': { lines: ['data: not-valid-json'] } }),
    );
    servers.push(server);

    const subscriber = new NtfySubscriber({
      ntfyServer: `http://127.0.0.1:${port}`,
      signTopicPrefix: 'sign',
      notifyTopicPrefix: 'notify',
      walletNames: ['w1'],
      onMessage,
      onError,
    });

    subscriber.start();
    await new Promise((r) => setTimeout(r, 200));
    await subscriber.stop();

    expect(onError).toHaveBeenCalled();
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('calls onError on connection failure (500)', async () => {
    const onError = vi.fn();

    const { server, port } = await createTestServer((_req, res) => {
      res.writeHead(500);
      res.end('Internal Server Error');
    });
    servers.push(server);

    const subscriber = new NtfySubscriber({
      ntfyServer: `http://127.0.0.1:${port}`,
      signTopicPrefix: 'sign',
      notifyTopicPrefix: 'notify',
      walletNames: ['w1'],
      onMessage: vi.fn(),
      onError,
    });

    subscriber.start();
    await new Promise((r) => setTimeout(r, 200));
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

    const { server, port } = await createTestServer(
      sseHandler({ 'sign-w1': { lines: [`data: ${ntfyMessage}`] } }),
    );
    servers.push(server);

    const subscriber = new NtfySubscriber({
      ntfyServer: `http://127.0.0.1:${port}`,
      signTopicPrefix: 'sign',
      notifyTopicPrefix: 'notify',
      walletNames: ['w1'],
      onMessage,
    });

    subscriber.start();
    await new Promise((r) => setTimeout(r, 200));
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

    const { server, port } = await createTestServer(
      sseHandler({ 'sign-w1': { lines: [`data: ${ntfyMessage}`] } }),
    );
    servers.push(server);

    const subscriber = new NtfySubscriber({
      ntfyServer: `http://127.0.0.1:${port}`,
      signTopicPrefix: 'sign',
      notifyTopicPrefix: 'notify',
      walletNames: ['w1'],
      onMessage,
    });

    subscriber.start();
    await new Promise((r) => setTimeout(r, 200));
    await subscriber.stop();

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('applies transformer to sign_request payload when transformer is provided', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    const encoded = encodeBase64url(validSignRequest);
    const ntfyMessage = JSON.stringify({
      topic: 'sign-w1',
      message: encoded,
      title: 'Sign Request',
      priority: 5,
    });

    const { server, port } = await createTestServer(
      sseHandler({ 'sign-w1': { lines: [`data: ${ntfyMessage}`] } }),
    );
    servers.push(server);

    const transformer = new ConfigurablePayloadTransformer({
      static_fields: { app_id: 'test-app' },
      category_map: {
        sign_request: { sound: 'alert.caf', badge: '1' },
      },
    });

    const subscriber = new NtfySubscriber({
      ntfyServer: `http://127.0.0.1:${port}`,
      signTopicPrefix: 'sign',
      notifyTopicPrefix: 'notify',
      walletNames: ['w1'],
      onMessage,
      transformer,
    });

    subscriber.start();
    await new Promise((r) => setTimeout(r, 200));
    await subscriber.stop();

    expect(onMessage).toHaveBeenCalled();
    const payload = onMessage.mock.calls[0]![1];
    expect(payload.category).toBe('sign_request');
    expect(payload.data.app_id).toBe('test-app');
    expect(payload.data.sound).toBe('alert.caf');
    expect(payload.data.badge).toBe('1');
  });

  it('applies transformer to notification payload with correct category_map', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    const encoded = encodeBase64url(validNotification);
    const ntfyMessage = JSON.stringify({
      topic: 'notify-w1',
      message: encoded,
      title: 'Notification',
      priority: 3,
    });

    const { server, port } = await createTestServer(
      sseHandler({ 'notify-w1': { lines: [`data: ${ntfyMessage}`] } }),
    );
    servers.push(server);

    const transformer = new ConfigurablePayloadTransformer({
      static_fields: { app_id: 'test-app' },
      category_map: {
        sign_request: { sound: 'alert.caf' },
        notification: { sound: 'default', channel: 'info' },
      },
    });

    const subscriber = new NtfySubscriber({
      ntfyServer: `http://127.0.0.1:${port}`,
      signTopicPrefix: 'sign',
      notifyTopicPrefix: 'notify',
      walletNames: ['w1'],
      onMessage,
      transformer,
    });

    subscriber.start();
    await new Promise((r) => setTimeout(r, 200));
    await subscriber.stop();

    expect(onMessage).toHaveBeenCalled();
    const payload = onMessage.mock.calls[0]![1];
    expect(payload.category).toBe('notification');
    expect(payload.data.app_id).toBe('test-app');
    expect(payload.data.sound).toBe('default');
    expect(payload.data.channel).toBe('info');
    expect(payload.data).not.toHaveProperty('badge');
  });

  it('does not transform payload when transformer is not provided (bypass)', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    const encoded = encodeBase64url(validSignRequest);
    const ntfyMessage = JSON.stringify({
      topic: 'sign-w1',
      message: encoded,
      title: 'Sign Request',
      priority: 5,
    });

    const { server, port } = await createTestServer(
      sseHandler({ 'sign-w1': { lines: [`data: ${ntfyMessage}`] } }),
    );
    servers.push(server);

    const subscriber = new NtfySubscriber({
      ntfyServer: `http://127.0.0.1:${port}`,
      signTopicPrefix: 'sign',
      notifyTopicPrefix: 'notify',
      walletNames: ['w1'],
      onMessage,
    });

    subscriber.start();
    await new Promise((r) => setTimeout(r, 200));
    await subscriber.stop();

    expect(onMessage).toHaveBeenCalled();
    const payload = onMessage.mock.calls[0]![1];
    expect(payload.data).not.toHaveProperty('app_id');
    expect(payload.data).not.toHaveProperty('sound');
  });

  // ── Compression Tests ────────────────────────────────────────────────

  it.each(['gzip', 'deflate', 'br'] as const)(
    'decompresses %s-encoded SSE responses (Content-Encoding header preserved by node:http)',
    async (encoding) => {
      const onMessage = vi.fn().mockResolvedValue(undefined);
      const encoded = encodeBase64url(validSignRequest);
      const ntfyMessage = JSON.stringify({
        topic: 'sign-w1',
        message: encoded,
        title: 'Sign Request',
        priority: 5,
      });

      const { server, port } = await createTestServer(
        sseHandler({ 'sign-w1': { lines: [`data: ${ntfyMessage}`], encoding } }),
      );
      servers.push(server);

      const subscriber = new NtfySubscriber({
        ntfyServer: `http://127.0.0.1:${port}`,
        signTopicPrefix: 'sign',
        notifyTopicPrefix: 'notify',
        walletNames: ['w1'],
        onMessage,
      });

      subscriber.start();
      await new Promise((r) => setTimeout(r, 300));
      await subscriber.stop();

      expect(onMessage).toHaveBeenCalled();
      const call = onMessage.mock.calls[0]!;
      expect(call[0]).toBe('w1');
      expect(call[1].category).toBe('sign_request');
    },
  );

  it('passes through uncompressed (no Content-Encoding) SSE responses', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    const encoded = encodeBase64url(validSignRequest);
    const ntfyMessage = JSON.stringify({
      topic: 'sign-w1',
      message: encoded,
      title: 'Sign Request',
      priority: 5,
    });

    const { server, port } = await createTestServer(
      sseHandler({ 'sign-w1': { lines: [`data: ${ntfyMessage}`] } }),
    );
    servers.push(server);

    const subscriber = new NtfySubscriber({
      ntfyServer: `http://127.0.0.1:${port}`,
      signTopicPrefix: 'sign',
      notifyTopicPrefix: 'notify',
      walletNames: ['w1'],
      onMessage,
    });

    subscriber.start();
    await new Promise((r) => setTimeout(r, 200));
    await subscriber.stop();

    expect(onMessage).toHaveBeenCalled();
    expect(onMessage.mock.calls[0]![1].category).toBe('sign_request');
  });

  // ── Dynamic Topic Tests (#237) ────────────────────────────────────────

  it('addTopics subscribes to new topics dynamically', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    const encoded = encodeBase64url(validSignRequest);
    const ntfyMessage = JSON.stringify({
      topic: 'sign-w1-abc123',
      message: encoded,
      title: 'Sign Request',
      priority: 5,
    });

    const { server, port } = await createTestServer(
      sseHandler({ 'sign-w1-abc123': { lines: [`data: ${ntfyMessage}`] } }),
    );
    servers.push(server);

    const subscriber = new NtfySubscriber({
      ntfyServer: `http://127.0.0.1:${port}`,
      signTopicPrefix: 'sign',
      notifyTopicPrefix: 'notify',
      walletNames: [],
      onMessage,
    });

    subscriber.start();
    expect(subscriber.topicCount).toBe(0);

    // Dynamically add topics
    subscriber.addTopics('w1', 'sign-w1-abc123', 'notify-w1-abc123');
    expect(subscriber.topicCount).toBe(2);

    await new Promise((r) => setTimeout(r, 300));
    await subscriber.stop();

    expect(onMessage).toHaveBeenCalled();
    expect(onMessage.mock.calls[0]![1].category).toBe('sign_request');
  });

  it('removeTopics unsubscribes from existing topics', async () => {
    const { server, port } = await createTestServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    });
    servers.push(server);

    const subscriber = new NtfySubscriber({
      ntfyServer: `http://127.0.0.1:${port}`,
      signTopicPrefix: 'sign',
      notifyTopicPrefix: 'notify',
      walletNames: [],
      onMessage: vi.fn(),
    });

    subscriber.start();
    subscriber.addTopics('w1', 'sign-w1-abc', 'notify-w1-abc');
    expect(subscriber.topicCount).toBe(2);

    subscriber.removeTopics('sign-w1-abc', 'notify-w1-abc');
    expect(subscriber.topicCount).toBe(0);

    await subscriber.stop();
  });

  it('addTopics does not duplicate already-subscribed topics', async () => {
    const { server, port } = await createTestServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    });
    servers.push(server);

    const subscriber = new NtfySubscriber({
      ntfyServer: `http://127.0.0.1:${port}`,
      signTopicPrefix: 'sign',
      notifyTopicPrefix: 'notify',
      walletNames: [],
      onMessage: vi.fn(),
    });

    subscriber.start();
    subscriber.addTopics('w1', 'sign-w1-abc', 'notify-w1-abc');
    expect(subscriber.topicCount).toBe(2);

    // Adding same topics again should not increase count
    subscriber.addTopics('w1', 'sign-w1-abc', 'notify-w1-abc');
    expect(subscriber.topicCount).toBe(2);

    await subscriber.stop();
  });

  it('removeTopics is safe for non-existent topics', async () => {
    const { server, port } = await createTestServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    });
    servers.push(server);

    const subscriber = new NtfySubscriber({
      ntfyServer: `http://127.0.0.1:${port}`,
      signTopicPrefix: 'sign',
      notifyTopicPrefix: 'notify',
      walletNames: [],
      onMessage: vi.fn(),
    });

    subscriber.start();
    expect(subscriber.topicCount).toBe(0);

    // Should not throw or go negative
    subscriber.removeTopics('nonexistent-sign', 'nonexistent-notify');
    expect(subscriber.topicCount).toBe(0);

    await subscriber.stop();
  });
});
