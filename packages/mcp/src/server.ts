/**
 * createMcpServer: factory that creates an MCP server with 42 tools + 4 resource groups (3 static + 1 template).
 *
 * Each tool/resource is registered via a dedicated register function
 * from its own module, following Dependency Injection pattern.
 *
 * WalletContext (MCPS-01..03): optional walletName for server naming
 * and description prefixing to identify wallet in Claude Desktop.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from './api-client.js';
import { PKG_VERSION } from './version.js';

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
import { registerX402Fetch } from './tools/x402-fetch.js';
import { registerWcConnect } from './tools/wc-connect.js';
import { registerWcStatus } from './tools/wc-status.js';
import { registerWcDisconnect } from './tools/wc-disconnect.js';
import { registerConnectInfo } from './tools/connect-info.js';
import { registerGetPolicies } from './tools/get-policies.js';
import { registerListSessions } from './tools/list-sessions.js';
import { registerGetTokens } from './tools/get-tokens.js';
import { registerListIncomingTransactions } from './tools/list-incoming-transactions.js';
import { registerGetIncomingSummary } from './tools/get-incoming-summary.js';
import { registerGetDefiPositions } from './tools/get-defi-positions.js';
import { registerGetHealthFactor } from './tools/get-health-factor.js';
import { registerSimulateTransaction } from './tools/simulate-transaction.js';
import { registerErc8004GetAgentInfo } from './tools/erc8004-get-agent-info.js';
import { registerErc8004GetReputation } from './tools/erc8004-get-reputation.js';
import { registerErc8004GetValidationStatus } from './tools/erc8004-get-validation-status.js';
import { registerGetProviderStatus } from './tools/get-provider-status.js';
import { registerSignMessage } from './tools/sign-message.js';
import { registerErc8128SignRequest } from './tools/erc8128-sign-request.js';
import { registerErc8128VerifySignature } from './tools/erc8128-verify-signature.js';
import { registerListNfts } from './tools/list-nfts.js';
import { registerGetNftMetadata } from './tools/get-nft-metadata.js';
import { registerTransferNft } from './tools/transfer-nft.js';
import { registerBuildUserop } from './tools/build-userop.js';
import { registerSignUserop } from './tools/sign-userop.js';
import { registerHyperliquidTools } from './tools/hyperliquid.js';
import { registerPolymarketTools } from './tools/polymarket.js';
import { registerListOffchainActions } from './tools/list-offchain-actions.js';
import { registerListCredentials } from './tools/list-credentials.js';
import { registerGetRpcProxyUrl } from './tools/get-rpc-proxy-url.js';
import { registerResolveAsset } from './tools/resolve-asset.js';

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
    version: PKG_VERSION,
  });

  // Register 42 tools
  registerConnectInfo(server, apiClient);
  registerListSessions(server, apiClient);
  registerGetPolicies(server, apiClient, walletContext);
  registerGetTokens(server, apiClient, walletContext);
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
  registerX402Fetch(server, apiClient, walletContext);
  registerWcConnect(server, apiClient, walletContext);
  registerWcStatus(server, apiClient, walletContext);
  registerWcDisconnect(server, apiClient, walletContext);
  registerListIncomingTransactions(server, apiClient, walletContext);
  registerGetIncomingSummary(server, apiClient, walletContext);
  registerGetDefiPositions(server, apiClient, walletContext);
  registerGetHealthFactor(server, apiClient, walletContext);
  registerSimulateTransaction(server, apiClient, walletContext);
  registerErc8004GetAgentInfo(server, apiClient, walletContext);
  registerErc8004GetReputation(server, apiClient, walletContext);
  registerErc8004GetValidationStatus(server, apiClient, walletContext);
  registerGetProviderStatus(server, apiClient, walletContext);
  registerSignMessage(server, apiClient, walletContext);
  registerErc8128SignRequest(server, apiClient, walletContext);
  registerErc8128VerifySignature(server, apiClient, walletContext);
  registerListNfts(server, apiClient, walletContext);
  registerGetNftMetadata(server, apiClient, walletContext);
  registerTransferNft(server, apiClient, walletContext);
  registerBuildUserop(server, apiClient, walletContext);
  registerSignUserop(server, apiClient, walletContext);
  registerHyperliquidTools(server, apiClient, walletContext);
  registerPolymarketTools(server, apiClient, walletContext);
  registerListOffchainActions(server, apiClient, walletContext);
  registerListCredentials(server, apiClient, walletContext);
  registerGetRpcProxyUrl(server, apiClient, walletContext);
  registerResolveAsset(server, apiClient);

  // Register 4 resource groups (3 static + 1 template)
  registerWalletBalance(server, apiClient, walletContext);
  registerWalletAddress(server, apiClient, walletContext);
  registerSystemStatus(server, apiClient, walletContext);
  registerSkillResources(server, apiClient, walletContext);

  return server;
}
