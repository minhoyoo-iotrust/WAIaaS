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
      abi: z.array(z.record(z.string(), z.unknown())).optional().describe('ABI fragment for decoding (EVM)'),
      value: z.string().optional().describe('Native token value in smallest units (wei). Example: "1000000000000000000" = 1 ETH'),
      programId: z.string().optional().describe('Program ID (Solana)'),
      instructionData: z.string().optional().describe('Base64-encoded instruction data (Solana)'),
      accounts: z.array(z.object({
        pubkey: z.string(),
        isSigner: z.boolean(),
        isWritable: z.boolean(),
      })).optional().describe('Account metas (Solana)'),
      network: z.string().optional().describe('Target network (e.g., "polygon-mainnet" or CAIP-2 "eip155:137"). Required for EVM wallets; auto-resolved for Solana.'),
      wallet_id: z.string().optional().describe('Target wallet ID. Required for multi-wallet sessions; auto-resolved when session has a single wallet.'),
      gas_condition: z.object({
        max_gas_price: z.string().optional().describe('Max gas price in wei (EVM baseFee+priorityFee)'),
        max_priority_fee: z.string().optional().describe('Max priority fee in wei (EVM) or micro-lamports (Solana)'),
        timeout: z.number().optional().describe('Max wait time in seconds (60-86400)'),
      }).optional().describe('Gas price condition for deferred execution. At least one of max_gas_price or max_priority_fee required.'),
    },
    async (args) => {
      const body: Record<string, unknown> = { type: 'CONTRACT_CALL', to: args.to };
      if (args.calldata !== undefined) body.calldata = args.calldata;
      if (args.abi !== undefined) body.abi = args.abi;
      if (args.value !== undefined) body.value = args.value;
      if (args.programId !== undefined) body.programId = args.programId;
      if (args.instructionData !== undefined) body.instructionData = args.instructionData;
      if (args.accounts !== undefined) body.accounts = args.accounts;
      if (args.network !== undefined) body.network = args.network;
      if (args.wallet_id) body.walletId = args.wallet_id;
      if (args.gas_condition) {
        body.gasCondition = {
          maxGasPrice: args.gas_condition.max_gas_price,
          maxPriorityFee: args.gas_condition.max_priority_fee,
          timeout: args.gas_condition.timeout,
        };
      }
      const result = await apiClient.post('/v1/transactions/send', body);
      return toToolResult(result);
    },
  );
}
