/**
 * call_contract tool: Call a whitelisted smart contract.
 *
 * Supports CONTRACT_CALL type for both EVM (calldata/abi/value) and
 * Solana (programId/instructionData/accounts). Requires CONTRACT_WHITELIST
 * policy to be configured on the daemon.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerCallContract(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'call_contract',
    withWalletPrefix('Call a whitelisted smart contract. Requires CONTRACT_WHITELIST policy. For EVM: provide calldata (hex). For Solana: provide programId + instructionData + accounts.', walletContext?.walletName),
    {
      to: z.string().describe('Contract address'),
      calldata: z.string().optional().describe('Hex-encoded calldata (EVM)'),
      abi: z.array(z.record(z.unknown())).optional().describe('ABI fragment for decoding (EVM)'),
      value: z.string().optional().describe('Native token value in wei (EVM)'),
      programId: z.string().optional().describe('Program ID (Solana)'),
      instructionData: z.string().optional().describe('Base64-encoded instruction data (Solana)'),
      accounts: z.array(z.object({
        pubkey: z.string(),
        isSigner: z.boolean(),
        isWritable: z.boolean(),
      })).optional().describe('Account metas (Solana)'),
    },
    async (args) => {
      const body: Record<string, unknown> = { type: 'CONTRACT_CALL', to: args.to };
      if (args.calldata !== undefined) body.calldata = args.calldata;
      if (args.abi !== undefined) body.abi = args.abi;
      if (args.value !== undefined) body.value = args.value;
      if (args.programId !== undefined) body.programId = args.programId;
      if (args.instructionData !== undefined) body.instructionData = args.instructionData;
      if (args.accounts !== undefined) body.accounts = args.accounts;
      const result = await apiClient.post('/v1/transactions/send', body);
      return toToolResult(result);
    },
  );
}
