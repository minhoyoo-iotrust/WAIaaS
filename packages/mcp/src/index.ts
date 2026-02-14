#!/usr/bin/env node

/**
 * @waiaas/mcp entrypoint.
 *
 * Starts MCP server on stdio transport.
 * Connects to WAIaaS daemon via SessionManager + ApiClient.
 *
 * CRITICAL: All logging via console.error (SMGI-D04).
 * stdout is reserved for stdio JSON-RPC transport.
 *
 * Degraded mode (SMGI-03): if SessionManager fails to load token,
 * server still starts -- tools return session_expired message.
 *
 * Graceful shutdown (BUG-020):
 * - stdin end/close detection for client disconnect (MCPS-01)
 * - SIGTERM/SIGINT with 3s force-exit timeout (MCPS-02)
 * - Idempotent shutdown -- multiple calls safe (MCPS-03)
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';
import { SessionManager } from './session-manager.js';
import { ApiClient } from './api-client.js';

const BASE_URL = process.env['WAIAAS_BASE_URL'] ?? 'http://127.0.0.1:3100';
const DATA_DIR = process.env['WAIAAS_DATA_DIR'];
const ENV_TOKEN = process.env['WAIAAS_SESSION_TOKEN'];
const WALLET_ID = process.env['WAIAAS_WALLET_ID'];
const WALLET_NAME = process.env['WAIAAS_WALLET_NAME'];

// --- Shutdown infrastructure (BUG-020) ---

export interface ShutdownDeps {
  sessionManager: { dispose(): void };
  server: { close(): Promise<void> };
  exit?: (code: number) => void; // DI for testing, default process.exit
}

/**
 * Create an idempotent shutdown handler with force-exit timeout.
 * MCPS-02: 3s timeout for graceful shutdown.
 * MCPS-03: Multiple calls are safe (once guard).
 */
export function createShutdownHandler(
  deps: ShutdownDeps,
  opts: { forceTimeoutMs?: number } = {},
): () => void {
  const forceTimeout = opts.forceTimeoutMs ?? 3_000;
  const exitFn = deps.exit ?? process.exit;
  let shuttingDown = false;

  return () => {
    if (shuttingDown) return; // MCPS-03: idempotent
    shuttingDown = true;
    console.error('[waiaas-mcp] shutting down');
    deps.sessionManager.dispose();
    void deps.server.close();
    // MCPS-02: force exit after timeout
    setTimeout(() => {
      console.error('[waiaas-mcp] force exit after timeout');
      exitFn(0);
    }, forceTimeout).unref();
  };
}

/**
 * Register stdin close + signal handlers for graceful shutdown.
 * MCPS-01: stdin end/close -> shutdown within 5s.
 * MCPS-02: SIGTERM -> shutdown with 3s force timeout.
 */
export function registerShutdownListeners(shutdown: () => void): void {
  process.stdin.on('end', () => {
    console.error('[waiaas-mcp] stdin closed (client disconnected), shutting down');
    shutdown();
  });
  // 'close' fires after 'end' in some edge cases (e.g., pipe broken)
  process.stdin.on('close', () => {
    console.error('[waiaas-mcp] stdin close event, shutting down');
    shutdown();
  });
  process.on('SIGTERM', () => {
    console.error('[waiaas-mcp] SIGTERM received');
    shutdown();
  });
  process.on('SIGINT', () => {
    shutdown();
  });
}

// --- Main ---

async function main(): Promise<void> {
  if (WALLET_NAME) {
    console.error(`[waiaas-mcp] Wallet: ${WALLET_NAME} (id: ${WALLET_ID ?? 'default'})`);
  }

  const sessionManager = new SessionManager({
    baseUrl: BASE_URL,
    dataDir: DATA_DIR,
    envToken: ENV_TOKEN,
    walletId: WALLET_ID,
  });

  const apiClient = new ApiClient(sessionManager, BASE_URL);
  const server = createMcpServer(apiClient, { walletName: WALLET_NAME });
  const transport = new StdioServerTransport();

  // Register shutdown handlers BEFORE server.connect.
  // stdin may close immediately if client exits during startup.
  const shutdown = createShutdownHandler({ sessionManager, server });
  registerShutdownListeners(shutdown);

  // Connect transport FIRST so stdio JSON-RPC responds to initialize immediately.
  // sessionManager.start() involves disk I/O that can delay under load (BUG-011).
  // If a tool call arrives before start() completes, degraded mode handles it (SMGI-03).
  await server.connect(transport);
  console.error('[waiaas-mcp] Server started on stdio transport');

  await sessionManager.start();
}

main().catch((err: unknown) => {
  console.error('[waiaas-mcp] Fatal error:', err);
  process.exit(1);
});
