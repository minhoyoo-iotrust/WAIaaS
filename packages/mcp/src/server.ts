/**
 * createMcpServer: factory that creates an MCP server with 14 tools + 4 resource groups (3 static + 1 template).
 *
 * Each tool/resource is registered via a dedicated register function
 * from its own module, following Dependency Injection pattern.
 *
 * WalletContext (MCPS-01..03): optional walletName for server naming
 * and description prefixing to identify wallet in Claude Desktop.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from './api-client.js';

// Tool registrations
import { registerSendToken } from './tools/send-token.js';
import { registerGetBalance } from './tools/get-balance.js';
import { registerGetAddress } from './tools/get-address.js';
import { registerGetAssets } from './tools/get-assets.js';
import { registerListTransactions } from './tools/list-transactions.js';
import { registerGetTransaction } from './tools/get-transaction.js';
import { registerGetNonce } from './tools/get-nonce.js';
import { registerCallContract } from './tools/call-contract.js';
import { registerApproveToken } from './tools/approve-token.js';
import { registerSendBatch } from './tools/send-batch.js';
import { registerGetWalletInfo } from './tools/get-wallet-info.js';
import { registerEncodeCalldata } from './tools/encode-calldata.js';
import { registerSignTransaction } from './tools/sign-transaction.js';
import { registerSetDefaultNetwork } from './tools/set-default-network.js';

// Resource registrations (Task 2)
import { registerWalletBalance } from './resources/wallet-balance.js';
import { registerWalletAddress } from './resources/wallet-address.js';
import { registerSystemStatus } from './resources/system-status.js';
import { registerSkillResources } from './resources/skills.js';

export interface WalletContext {
  walletName?: string; // e.g., 'trading-bot'
}

/**
 * Prefix description with wallet name for multi-wallet identification (MCPS-03).
 */
export function withWalletPrefix(description: string, walletName?: string): string {
  return walletName ? `[${walletName}] ${description}` : description;
}

export function createMcpServer(apiClient: ApiClient, walletContext?: WalletContext): McpServer {
  const serverName = walletContext?.walletName
    ? `waiaas-${walletContext.walletName}`
    : 'waiaas-wallet';

  const server = new McpServer({
    name: serverName,
    version: '0.0.0',
  });

  // Register 14 tools
  registerSendToken(server, apiClient, walletContext);
  registerGetBalance(server, apiClient, walletContext);
  registerGetAddress(server, apiClient, walletContext);
  registerGetAssets(server, apiClient, walletContext);
  registerListTransactions(server, apiClient, walletContext);
  registerGetTransaction(server, apiClient, walletContext);
  registerGetNonce(server, apiClient, walletContext);
  registerCallContract(server, apiClient, walletContext);
  registerApproveToken(server, apiClient, walletContext);
  registerSendBatch(server, apiClient, walletContext);
  registerGetWalletInfo(server, apiClient, walletContext);
  registerEncodeCalldata(server, apiClient, walletContext);
  registerSignTransaction(server, apiClient, walletContext);
  registerSetDefaultNetwork(server, apiClient, walletContext);

  // Register 4 resource groups (3 static + 1 template)
  registerWalletBalance(server, apiClient, walletContext);
  registerWalletAddress(server, apiClient, walletContext);
  registerSystemStatus(server, apiClient, walletContext);
  registerSkillResources(server, apiClient, walletContext);

  return server;
}
