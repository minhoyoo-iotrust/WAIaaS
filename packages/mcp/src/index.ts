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
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';
import { SessionManager } from './session-manager.js';
import { ApiClient } from './api-client.js';

const BASE_URL = process.env['WAIAAS_BASE_URL'] ?? 'http://127.0.0.1:3100';
const DATA_DIR = process.env['WAIAAS_DATA_DIR'];
const ENV_TOKEN = process.env['WAIAAS_SESSION_TOKEN'];
const AGENT_ID = process.env['WAIAAS_AGENT_ID'];
const AGENT_NAME = process.env['WAIAAS_AGENT_NAME'];

async function main(): Promise<void> {
  if (AGENT_NAME) {
    console.error(`[waiaas-mcp] Agent: ${AGENT_NAME} (id: ${AGENT_ID ?? 'default'})`);
  }

  const sessionManager = new SessionManager({
    baseUrl: BASE_URL,
    dataDir: DATA_DIR,
    envToken: ENV_TOKEN,
    agentId: AGENT_ID,
  });

  // Eager init (design decision) -- degraded mode if token missing
  await sessionManager.start();

  const apiClient = new ApiClient(sessionManager, BASE_URL);
  const server = createMcpServer(apiClient, { agentName: AGENT_NAME });
  const transport = new StdioServerTransport();

  await server.connect(transport);
  console.error('[waiaas-mcp] Server started on stdio transport');

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.error('[waiaas-mcp] SIGTERM received, shutting down');
    sessionManager.dispose();
    void server.close();
  });
  process.on('SIGINT', () => {
    sessionManager.dispose();
    void server.close();
  });
}

main().catch((err: unknown) => {
  console.error('[waiaas-mcp] Fatal error:', err);
  process.exit(1);
});
