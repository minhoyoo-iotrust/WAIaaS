/**
 * createMcpServer: factory that creates an MCP server with 6 tools + 3 resources.
 *
 * Each tool/resource is registered via a dedicated register function
 * from its own module, following Dependency Injection pattern.
 *
 * AgentContext (MCPS-01..03): optional agentName for server naming
 * and description prefixing to identify agent in Claude Desktop.
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

export interface AgentContext {
  agentName?: string; // e.g., 'trading-bot'
}

/**
 * Prefix description with agent name for multi-agent identification (MCPS-03).
 */
export function withAgentPrefix(description: string, agentName?: string): string {
  return agentName ? `[${agentName}] ${description}` : description;
}

export function createMcpServer(apiClient: ApiClient, agentContext?: AgentContext): McpServer {
  const serverName = agentContext?.agentName
    ? `waiaas-${agentContext.agentName}`
    : 'waiaas-wallet';

  const server = new McpServer({
    name: serverName,
    version: '0.0.0',
  });

  // Register 6 tools
  registerSendToken(server, apiClient, agentContext);
  registerGetBalance(server, apiClient, agentContext);
  registerGetAddress(server, apiClient, agentContext);
  registerListTransactions(server, apiClient, agentContext);
  registerGetTransaction(server, apiClient, agentContext);
  registerGetNonce(server, apiClient, agentContext);

  // Register 3 resources
  registerWalletBalance(server, apiClient, agentContext);
  registerWalletAddress(server, apiClient, agentContext);
  registerSystemStatus(server, apiClient, agentContext);

  return server;
}
