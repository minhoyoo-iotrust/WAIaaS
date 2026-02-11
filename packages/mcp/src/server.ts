/**
 * createMcpServer: factory that creates an MCP server with 6 tools + 3 resources.
 *
 * Each tool/resource is registered via a dedicated register function
 * from its own module, following Dependency Injection pattern.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from './api-client.js';

// Tool registrations (Task 2)
import { registerSendToken } from './tools/send-token.js';
import { registerGetBalance } from './tools/get-balance.js';
import { registerGetAddress } from './tools/get-address.js';
import { registerListTransactions } from './tools/list-transactions.js';
import { registerGetTransaction } from './tools/get-transaction.js';
import { registerGetNonce } from './tools/get-nonce.js';

// Resource registrations (Task 2)
import { registerWalletBalance } from './resources/wallet-balance.js';
import { registerWalletAddress } from './resources/wallet-address.js';
import { registerSystemStatus } from './resources/system-status.js';

export function createMcpServer(apiClient: ApiClient): McpServer {
  const server = new McpServer({
    name: 'waiaas-wallet',
    version: '0.0.0',
  });

  // Register 6 tools
  registerSendToken(server, apiClient);
  registerGetBalance(server, apiClient);
  registerGetAddress(server, apiClient);
  registerListTransactions(server, apiClient);
  registerGetTransaction(server, apiClient);
  registerGetNonce(server, apiClient);

  // Register 3 resources
  registerWalletBalance(server, apiClient);
  registerWalletAddress(server, apiClient);
  registerSystemStatus(server, apiClient);

  return server;
}
