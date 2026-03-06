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
import { routeByTopic } from './message-router.js';
import { info, error, debug, setDebug, isDebug } from './logger.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };
export const VERSION: string = pkg.version;

// --version flag
if (process.argv.includes('--version')) {
  console.log(VERSION);
  process.exit(0);
}

// --debug flag or DEBUG=1 env
if (process.argv.includes('--debug') || process.env['DEBUG'] === '1') {
  setDebug(true);
}

const CONFIG_PATH = process.env['RELAY_CONFIG'] ?? resolve(process.cwd(), 'config.toml');
const DB_PATH = process.env['RELAY_DB'] ?? resolve(process.cwd(), 'relay.db');

async function main(): Promise<void> {
  info('Loading config from', CONFIG_PATH);
  const config = loadConfig(CONFIG_PATH);

  if (isDebug()) {
    debug('Config loaded:', JSON.stringify({
      ntfy_server: config.relay.ntfy_server,
      sign_topic_prefix: config.relay.sign_topic_prefix,
      notify_topic_prefix: config.relay.notify_topic_prefix,
      wallet_names: config.relay.wallet_names,
      server: { host: config.relay.server.host, port: config.relay.server.port },
      push_provider: config.relay.push.provider,
    }, null, 2));
  }

  // Initialize device registry
  const registry = new DeviceRegistry(DB_PATH);
  debug('Device registry initialized at', DB_PATH);

  // Initialize push provider
  let provider: IPushProvider;
  if (config.relay.push.provider === 'pushwoosh') {
    provider = new PushwooshProvider(config.relay.push.pushwoosh!);
    info('Push provider: Pushwoosh');
  } else {
    provider = new FcmProvider(config.relay.push.fcm!);
    info('Push provider: FCM');
  }

  // Validate provider config
  const valid = await provider.validateConfig();
  if (!valid) {
    error('Push provider config validation failed');
    process.exit(1);
  }

  // Initialize payload transformer (optional)
  let transformer: IPayloadTransformer | undefined;
  if (config.relay.push.payload) {
    transformer = new ConfigurablePayloadTransformer(config.relay.push.payload);
    info('Payload transformer: enabled (static_fields + category_map)');
  }

  // Initialize ntfy subscriber
  const subscriber = new NtfySubscriber({
    ntfyServer: config.relay.ntfy_server,
    signTopicPrefix: config.relay.sign_topic_prefix,
    notifyTopicPrefix: config.relay.notify_topic_prefix,
    walletNames: config.relay.wallet_names,
    transformer,
    onMessage: async (walletName, payload, topic) => {
      info(
        `Received ${payload.category} for wallet "${walletName}" on topic "${topic}" (title=${payload.title ?? 'none'})`,
      );
      debug('Message payload:', JSON.stringify(payload));

      const route = routeByTopic(
        walletName,
        topic,
        config.relay.sign_topic_prefix,
        config.relay.notify_topic_prefix,
        (token) => registry.getBySubscriptionToken(token),
      );

      if (route.action === 'skip_base') {
        info(`Base topic "${topic}" — skipping push (no broadcast)`);
        return;
      }
      if (route.action === 'skip_unknown') {
        info(`Cannot extract subscriptionToken from topic "${topic}", skipping`);
        return;
      }
      if (route.action === 'skip_no_device') {
        info(`No device found for subscriptionToken "${route.subscriptionToken}", skipping`);
        return;
      }

      try {
        debug(`Sending push to device: pushToken=${route.device!.pushToken.slice(0, 8)}...`);
        const result = await provider.send([route.device!.pushToken], payload);
        if (result.invalidTokens.length > 0) {
          registry.removeTokens(result.invalidTokens);
          info(`Removed ${result.invalidTokens.length} invalid token(s)`);
        }
        info(
          `${payload.category} → ${walletName} (device=${route.subscriptionToken}): sent=${result.sent}, failed=${result.failed}`,
        );
      } catch (sendErr) {
        error(
          `Failed to send push to ${walletName} (device=${route.subscriptionToken}):`,
          (sendErr as Error).message,
        );
      }
    },
    onError: (err) => {
      error('Error:', err.message);
    },
  });

  // Start ntfy subscription
  subscriber.start();
  info(
    `Subscribing to ${config.relay.wallet_names.length} wallet(s): ${config.relay.wallet_names.join(', ')}`,
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
      debug(`Restored topics for device: wallet=${device.walletName}, token=${device.subscriptionToken}`);
    }
  }
  if (restoredTopics > 0) {
    info(`Restored ${restoredTopics} device topic(s) from DB`);
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

  info(`v${VERSION} listening on ${config.relay.server.host}:${config.relay.server.port}`);
  if (isDebug()) {
    info('Debug mode enabled');
  }

  // Graceful shutdown
  const SHUTDOWN_TIMEOUT_MS = 10_000;

  async function shutdown(signal: string): Promise<void> {
    info(`${signal} received, shutting down...`);

    const shutdownTimer = setTimeout(() => {
      error('Shutdown timeout, forcing exit');
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
    info('Shutdown complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
