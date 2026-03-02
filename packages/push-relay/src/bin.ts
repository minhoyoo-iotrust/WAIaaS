#!/usr/bin/env node

import { serve } from '@hono/node-server';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { loadConfig } from './config.js';
import { NtfySubscriber } from './subscriber/ntfy-subscriber.js';
import { DeviceRegistry } from './registry/device-registry.js';
import { PushwooshProvider } from './providers/pushwoosh-provider.js';
import { FcmProvider } from './providers/fcm-provider.js';
import type { IPushProvider } from './providers/push-provider.js';
import { ConfigurablePayloadTransformer } from './transformer/payload-transformer.js';
import type { IPayloadTransformer } from './transformer/payload-transformer.js';
import { createServer } from './server.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };
export const VERSION: string = pkg.version;

// --version flag
if (process.argv.includes('--version')) {
  console.log(VERSION);
  process.exit(0);
}

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

  // Initialize payload transformer (optional)
  let transformer: IPayloadTransformer | undefined;
  if (config.relay.push.payload) {
    transformer = new ConfigurablePayloadTransformer(config.relay.push.payload);
    console.log('[push-relay] Payload transformer: enabled (static_fields + category_map)');
  }

  // Initialize ntfy subscriber
  const subscriber = new NtfySubscriber({
    ntfyServer: config.relay.ntfy_server,
    signTopicPrefix: config.relay.sign_topic_prefix,
    notifyTopicPrefix: config.relay.notify_topic_prefix,
    walletNames: config.relay.wallet_names,
    transformer,
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

  // Restore subscription-token-based topics from DB
  const devices = registry.listAll();
  let restoredTopics = 0;
  for (const device of devices) {
    if (device.subscriptionToken) {
      subscriber.addTopics(
        device.walletName,
        `${config.relay.sign_topic_prefix}-${device.walletName}-${device.subscriptionToken}`,
        `${config.relay.notify_topic_prefix}-${device.walletName}-${device.subscriptionToken}`,
      );
      restoredTopics++;
    }
  }
  if (restoredTopics > 0) {
    console.log(`[push-relay] Restored ${restoredTopics} device topic(s) from DB`);
  }

  // Create and start HTTP server
  const app = createServer({
    registry,
    subscriber,
    provider,
    apiKey: config.relay.server.api_key,
    ntfyServer: config.relay.ntfy_server,
    signTopicPrefix: config.relay.sign_topic_prefix,
    notifyTopicPrefix: config.relay.notify_topic_prefix,
    version: VERSION,
  });

  const server = serve({
    fetch: app.fetch,
    port: config.relay.server.port,
    hostname: config.relay.server.host,
  });

  console.log(
    `[push-relay] v${VERSION} listening on ${config.relay.server.host}:${config.relay.server.port}`,
  );

  // Graceful shutdown
  const SHUTDOWN_TIMEOUT_MS = 10_000;

  async function shutdown(signal: string): Promise<void> {
    console.log(`[push-relay] ${signal} received, shutting down...`);

    const shutdownTimer = setTimeout(() => {
      console.error('[push-relay] Shutdown timeout, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    shutdownTimer.unref();

    // 1. Stop accepting new SSE messages
    await subscriber.stop();

    // 2. Close HTTP server
    server.close();

    // 3. Close database
    registry.close();

    clearTimeout(shutdownTimer);
    console.log('[push-relay] Shutdown complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
