/**
 * waiaas://wallet/balance resource: Current balance of the agent wallet.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toResourceResult } from '../api-client.js';
import { type AgentContext, withAgentPrefix } from '../server.js';

const RESOURCE_URI = 'waiaas://wallet/balance';

export function registerWalletBalance(server: McpServer, apiClient: ApiClient, agentContext?: AgentContext): void {
  server.resource(
    'Wallet Balance',
    RESOURCE_URI,
    {
      description: withAgentPrefix('Current balance of the agent wallet', agentContext?.agentName),
      mimeType: 'application/json',
    },
    async () => {
      const result = await apiClient.get('/v1/wallet/balance');
      return toResourceResult(RESOURCE_URI, result);
    },
  );
}
