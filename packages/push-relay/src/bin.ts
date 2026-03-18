#!/usr/bin/env node

import { serve } from '@hono/node-server';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { loadConfig } from './config.js';
import { DeviceRegistry } from './registry/device-registry.js';
import { PushwooshProvider } from './providers/pushwoosh-provider.js';
import { FcmProvider } from './providers/fcm-provider.js';
import type { IPushProvider } from './providers/push-provider.js';
import { createServer } from './server.js';
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

  // Start sign_responses cleanup interval (every 60 seconds)
  const cleanupInterval = setInterval(() => {
    const cleaned = registry.cleanupExpiredResponses();
    if (cleaned > 0) debug(`Cleaned ${cleaned} expired sign response(s)`);
  }, 60_000);
  cleanupInterval.unref();

  // Create and start HTTP server
  const app = createServer({
    registry,
    provider,
    apiKey: config.relay.server.api_key,
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

    // 1. Stop cleanup interval
    clearInterval(cleanupInterval);

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
