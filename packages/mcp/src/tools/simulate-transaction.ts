/**
 * simulate_transaction tool: Simulate a transaction without executing it.
 *
 * Returns policy tier, estimated fees, balance changes, and warnings.
 * Supports all 5 transaction types (TRANSFER, TOKEN_TRANSFER, CONTRACT_CALL,
 * APPROVE, BATCH) with the same parameter structure as send_token/call_contract etc.
 *
 * @see Phase 309 Plan 02 Task 2
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerSimulateTransaction(server: McpServer, apiClient: ApiClient, walletContext?: WalletContext): void {
  server.tool(
    'simulate_transaction',
    withWalletPrefix('Simulate a transaction without executing it. Returns policy tier, estimated fees, balance changes, and warnings. No side effects.', walletContext?.walletName),
    {
      to: z.string().describe('Destination address'),
      amount: z.string().describe('Amount in smallest units (wei for EVM, lamports for Solana). Example: "1000000000000000000" = 1 ETH'),
      type: z.enum(['TRANSFER', 'TOKEN_TRANSFER', 'CONTRACT_CALL', 'APPROVE', 'BATCH']).optional()
        .describe('Transaction type. Default: TRANSFER'),
      token: z.object({
        address: z.string().describe('Token mint/contract address'),
        decimals: z.number().describe('Token decimals'),
        symbol: z.string().describe('Token symbol'),
        assetId: z.string().optional().describe('CAIP-19 asset identifier'),
      }).optional().describe('Required for TOKEN_TRANSFER'),
      // CONTRACT_CALL fields
      calldata: z.string().optional().describe('Hex-encoded calldata (EVM)'),
      abi: z.array(z.record(z.string(), z.unknown())).optional().describe('ABI fragment (EVM)'),
      value: z.string().optional().describe('Native token value in smallest units (wei for EVM). Example: "1000000000000000000" = 1 ETH'),
      programId: z.string().optional().describe('Solana program ID'),
      instructionData: z.string().optional().describe('Base64-encoded instruction data (Solana)'),
      accounts: z.array(z.object({
        pubkey: z.string(),
        isSigner: z.boolean(),
        isWritable: z.boolean(),
      })).optional().describe('Solana accounts'),
      // APPROVE fields
      spender: z.string().optional().describe('Spender address (APPROVE type)'),
      // BATCH fields
      instructions: z.array(z.record(z.string(), z.unknown())).optional().describe('Batch instructions array'),
      // Common fields
      network: z.string().optional().describe('Target network (e.g., "polygon-mainnet" or CAIP-2 "eip155:137").'),
      wallet_id: z.string().optional().describe('Wallet ID for multi-wallet sessions'),
      gas_condition: z.object({
        max_gas_price: z.string().optional(),
        max_priority_fee: z.string().optional(),
        timeout: z.number().optional(),
      }).optional().describe('Gas price condition (included for request compatibility, ignored by simulation)'),
    },
    async (args) => {
      const body: Record<string, unknown> = { to: args.to, amount: args.amount };
      if (args.type) body.type = args.type;
      if (args.token) body.token = args.token;
      if (args.calldata !== undefined) body.calldata = args.calldata;
      if (args.abi !== undefined) body.abi = args.abi;
      if (args.value !== undefined) body.value = args.value;
      if (args.programId !== undefined) body.programId = args.programId;
      if (args.instructionData !== undefined) body.instructionData = args.instructionData;
      if (args.accounts !== undefined) body.accounts = args.accounts;
      if (args.spender !== undefined) body.spender = args.spender;
      if (args.instructions !== undefined) body.instructions = args.instructions;
      if (args.network !== undefined) body.network = args.network;
      if (args.wallet_id) body.walletId = args.wallet_id;
      if (args.gas_condition) {
        body.gasCondition = {
          maxGasPrice: args.gas_condition.max_gas_price,
          maxPriorityFee: args.gas_condition.max_priority_fee,
          timeout: args.gas_condition.timeout,
        };
      }
      const result = await apiClient.post('/v1/transactions/simulate', body);
      return toToolResult(result);
    },
  );
}
