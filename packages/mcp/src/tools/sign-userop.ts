/**
 * sign_userop tool: Sign a completed UserOperation (with gas/paymaster fields).
 *
 * Wraps POST /v1/wallets/:id/userop/sign. Requires a buildId from build_userop
 * and the full UserOperationV07 with gas and optional paymaster fields filled in
 * by the platform. Returns signed UserOperation with signature and txId.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type ApiClient, toToolResult } from '../api-client.js';
import { type WalletContext, withWalletPrefix } from '../server.js';

export function registerSignUserop(
  server: McpServer,
  apiClient: ApiClient,
  walletContext?: WalletContext,
): void {
  server.tool(
    'sign_userop',
    withWalletPrefix(
      'Sign a completed UserOperation (with gas/paymaster fields). Returns signed UserOperation with signature and txId for tracking.',
      walletContext?.walletName,
    ),
    {
      wallet_id: z.string().describe('Smart Account wallet ID (UUID).'),
      build_id: z.string().describe('Build ID from build_userop response.'),
      sender: z.string().describe('Smart Account address (0x hex).'),
      nonce: z.string().describe('Account nonce (0x hex).'),
      call_data: z.string().describe('Encoded call data (0x hex).'),
      call_gas_limit: z.string().describe('Gas limit for call execution (0x hex).'),
      verification_gas_limit: z.string().describe('Gas limit for verification (0x hex).'),
      pre_verification_gas: z.string().describe('Pre-verification gas (0x hex).'),
      max_fee_per_gas: z.string().describe('Max fee per gas (0x hex).'),
      max_priority_fee_per_gas: z.string().describe('Max priority fee per gas (0x hex).'),
      signature: z.string().optional().describe('Placeholder signature (0x hex). Default: 0x.'),
      factory: z.string().optional().describe('Factory address for undeployed accounts.'),
      factory_data: z.string().optional().describe('Factory data for undeployed accounts.'),
      paymaster: z.string().optional().describe('Paymaster address.'),
      paymaster_data: z.string().optional().describe('Paymaster data.'),
      paymaster_verification_gas_limit: z.string().optional().describe('Paymaster verification gas limit.'),
      paymaster_post_op_gas_limit: z.string().optional().describe('Paymaster post-op gas limit.'),
    },
    async (args) => {
      const userOperation: Record<string, unknown> = {
        sender: args.sender,
        nonce: args.nonce,
        callData: args.call_data,
        callGasLimit: args.call_gas_limit,
        verificationGasLimit: args.verification_gas_limit,
        preVerificationGas: args.pre_verification_gas,
        maxFeePerGas: args.max_fee_per_gas,
        maxPriorityFeePerGas: args.max_priority_fee_per_gas,
        signature: args.signature ?? '0x',
      };
      if (args.factory) userOperation.factory = args.factory;
      if (args.factory_data) userOperation.factoryData = args.factory_data;
      if (args.paymaster) userOperation.paymaster = args.paymaster;
      if (args.paymaster_data) userOperation.paymasterData = args.paymaster_data;
      if (args.paymaster_verification_gas_limit) userOperation.paymasterVerificationGasLimit = args.paymaster_verification_gas_limit;
      if (args.paymaster_post_op_gas_limit) userOperation.paymasterPostOpGasLimit = args.paymaster_post_op_gas_limit;
      const body = { buildId: args.build_id, userOperation };
      const result = await apiClient.post(
        `/v1/wallets/${args.wallet_id}/userop/sign`,
        body,
      );
      return toToolResult(result);
    },
  );
}
