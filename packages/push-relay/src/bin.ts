#!/usr/bin/env node

import { serve } from '@hono/node-server';
import { resolve } from 'node:path';
import { loadConfig } from './config.js';
import { NtfySubscriber } from './subscriber/ntfy-subscriber.js';
import { DeviceRegistry } from './registry/device-registry.js';
import { PushwooshProvider } from './providers/pushwoosh-provider.js';
import { FcmProvider } from './providers/fcm-provider.js';
import type { IPushProvider } from './providers/push-provider.js';
import { createServer } from './server.js';

const CONFIG_PATH = process.env['RELAY_CONFIG'] ?? resolve(process.cwd(), 'config.toml');
const DB_PATH = process.env['RELAY_DB'] ?? resolve(process.cwd(), 'relay.db');

async function main(): Promise<void> {
  console.log('[push-relay] Loading config from', CONFIG_PATH);
  const config = loadConfig(CONFIG_PATH);

  // Initialize device registry
  const registry = new DeviceRegistry(DB_PATH);

  // Initialize push provider
  let provider: IPushProvider;
  if (config.relay.push.provider === 'pushwoosh') {
    provider = new PushwooshProvider(config.relay.push.pushwoosh!);
    console.log('[push-relay] Push provider: Pushwoosh');
  } else {
    provider = new FcmProvider(config.relay.push.fcm!);
    console.log('[push-relay] Push provider: FCM');
  }

  // Validate provider config
  const valid = await provider.validateConfig();
  if (!valid) {
    console.error('[push-relay] Push provider config validation failed');
    process.exit(1);
  }

  // Initialize ntfy subscriber
  const subscriber = new NtfySubscriber({
    ntfyServer: config.relay.ntfy_server,
    signTopicPrefix: config.relay.sign_topic_prefix,
    notifyTopicPrefix: config.relay.notify_topic_prefix,
    walletNames: config.relay.wallet_names,
    onMessage: async (walletName, payload) => {
      const tokens = registry.getTokensByWalletName(walletName);
      if (tokens.length === 0) return;

      const result = await provider.send(tokens, payload);
      if (result.invalidTokens.length > 0) {
        registry.removeTokens(result.invalidTokens);
        console.log(`[push-relay] Removed ${result.invalidTokens.length} invalid token(s)`);
      }
      console.log(
        `[push-relay] ${payload.category} → ${walletName}: sent=${result.sent}, failed=${result.failed}`,
      );
    },
    onError: (err) => {
      console.error('[push-relay] Error:', err.message);
    },
  });

  // Start ntfy subscription
  subscriber.start();
  console.log(
    `[push-relay] Subscribing to ${config.relay.wallet_names.length} wallet(s): ${config.relay.wallet_names.join(', ')}`,
  );

  // Create and start HTTP server
  const app = createServer({
    registry,
    subscriber,
    provider,
    apiKey: config.relay.server.api_key,
  });

  const server = serve({
    fetch: app.fetch,
    port: config.relay.server.port,
    hostname: config.relay.server.host,
  });

  console.log(
    `[push-relay] Server listening on ${config.relay.server.host}:${config.relay.server.port}`,
  );

  // Graceful shutdown
  const SHUTDOWN_TIMEOUT_MS = 10_000;

  async function shutdown(signal: string): Promise<void> {
    console.log(`[push-relay] ${signal} received, shutting down...`);

    // 1. Stop accepting new SSE messages
    await subscriber.stop();

    // 2. Close HTTP server
    server.close();

    // 3. Close database
    registry.close();

    console.log('[push-relay] Shutdown complete');
    process.exit(0);
  }

  const shutdownTimer = setTimeout(() => {
    console.error('[push-relay] Shutdown timeout, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  shutdownTimer.unref();

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
