/**
 * Tests for 2 UserOp MCP tools: build_userop, sign_userop.
 *
 * Verifies:
 * - Correct API endpoints called with correct parameters
 * - toToolResult applied to responses
 * - Optional fields forwarded correctly
 */

import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient, ApiResult } from '../api-client.js';
import { registerBuildUserop } from '../tools/build-userop.js';
import { registerSignUserop } from '../tools/sign-userop.js';

// --- Mock ApiClient factory ---
function createMockApiClient(responses: Map<string, ApiResult<unknown>>): ApiClient {
  const defaultOk: ApiResult<unknown> = { ok: true, data: { mock: true } };
  return {
    get: vi.fn(async (path: string) => responses.get(`GET:${path}`) ?? defaultOk),
    post: vi.fn(async (path: string, _body: unknown) => responses.get(`POST:${path}`) ?? defaultOk),
    put: vi.fn(async (path: string, _body: unknown) => responses.get(`PUT:${path}`) ?? defaultOk),
  } as unknown as ApiClient;
}

// --- Tool handler extraction helper ---
function getToolHandler(
  registerFn: (server: McpServer, apiClient: ApiClient) => void,
  apiClient: ApiClient,
): (args: Record<string, unknown>) => Promise<unknown> {
  let capturedHandler: ((args: Record<string, unknown>, extra: unknown) => Promise<unknown>) | undefined;
  const server = {
    tool: (...fnArgs: unknown[]) => {
      capturedHandler = fnArgs[fnArgs.length - 1] as typeof capturedHandler;
    },
  } as unknown as McpServer;

  registerFn(server, apiClient);
  if (!capturedHandler) throw new Error('Handler not captured');
  const handler = capturedHandler;
  return (args) => handler(args, {}) as Promise<unknown>;
}

// =========================================================================
// build_userop
// =========================================================================

describe('build_userop tool', () => {
  it('calls POST /v1/wallets/{id}/userop/build with TRANSFER request', async () => {
    const buildResult = {
      sender: '0xabc',
      nonce: '0x0',
      callData: '0xdef',
      factory: null,
      factoryData: null,
      entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032',
      buildId: 'build-001',
    };
    const responses = new Map<string, ApiResult<unknown>>([
      ['POST:/v1/wallets/w1/userop/build', { ok: true, data: buildResult }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerBuildUserop, apiClient);

    const result = await handler({
      wallet_id: 'w1',
      type: 'TRANSFER',
      to: '0xRecipient',
      amount: '1000000000000000000',
      network: 'ethereum-sepolia',
    }) as { content: Array<{ text: string }> };

    expect(apiClient.post).toHaveBeenCalledWith('/v1/wallets/w1/userop/build', {
      request: { type: 'TRANSFER', to: '0xRecipient', amount: '1000000000000000000' },
      network: 'ethereum-sepolia',
    });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['buildId']).toBe('build-001');
  });

  it('forwards optional fields: token, contract, method, abi, args, calls', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerBuildUserop, apiClient);

    await handler({
      wallet_id: 'w2',
      type: 'CONTRACT_CALL',
      contract: '0xContract',
      method: 'swap',
      abi: [{ name: 'swap', type: 'function' }],
      args: ['0xtoken', '100'],
      network: 'ethereum-mainnet',
    });

    expect(apiClient.post).toHaveBeenCalledWith('/v1/wallets/w2/userop/build', {
      request: {
        type: 'CONTRACT_CALL',
        contract: '0xContract',
        method: 'swap',
        abi: [{ name: 'swap', type: 'function' }],
        args: ['0xtoken', '100'],
      },
      network: 'ethereum-mainnet',
    });
  });
});

// =========================================================================
// sign_userop
// =========================================================================

describe('sign_userop tool', () => {
  it('calls POST /v1/wallets/{id}/userop/sign with buildId and userOperation', async () => {
    const signResult = {
      signedUserOperation: { sender: '0xabc', signature: '0xsig...' },
      txId: 'tx-001',
    };
    const responses = new Map<string, ApiResult<unknown>>([
      ['POST:/v1/wallets/w1/userop/sign', { ok: true, data: signResult }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerSignUserop, apiClient);

    const result = await handler({
      wallet_id: 'w1',
      build_id: 'build-001',
      sender: '0xabc',
      nonce: '0x0',
      call_data: '0xdef',
      call_gas_limit: '0x5208',
      verification_gas_limit: '0x10000',
      pre_verification_gas: '0x5000',
      max_fee_per_gas: '0x3b9aca00',
      max_priority_fee_per_gas: '0x59682f00',
    }) as { content: Array<{ text: string }> };

    expect(apiClient.post).toHaveBeenCalledWith('/v1/wallets/w1/userop/sign', {
      buildId: 'build-001',
      userOperation: {
        sender: '0xabc',
        nonce: '0x0',
        callData: '0xdef',
        callGasLimit: '0x5208',
        verificationGasLimit: '0x10000',
        preVerificationGas: '0x5000',
        maxFeePerGas: '0x3b9aca00',
        maxPriorityFeePerGas: '0x59682f00',
        signature: '0x',
      },
    });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['txId']).toBe('tx-001');
  });

  it('includes optional paymaster and factory fields', async () => {
    const apiClient = createMockApiClient(new Map());
    const handler = getToolHandler(registerSignUserop, apiClient);

    await handler({
      wallet_id: 'w1',
      build_id: 'build-002',
      sender: '0xabc',
      nonce: '0x1',
      call_data: '0xdef',
      call_gas_limit: '0x5208',
      verification_gas_limit: '0x10000',
      pre_verification_gas: '0x5000',
      max_fee_per_gas: '0x3b9aca00',
      max_priority_fee_per_gas: '0x59682f00',
      factory: '0xFactory',
      factory_data: '0xFactoryData',
      paymaster: '0xPaymaster',
      paymaster_data: '0xPmData',
      paymaster_verification_gas_limit: '0x8000',
      paymaster_post_op_gas_limit: '0x4000',
    });

    expect(apiClient.post).toHaveBeenCalledWith('/v1/wallets/w1/userop/sign', {
      buildId: 'build-002',
      userOperation: {
        sender: '0xabc',
        nonce: '0x1',
        callData: '0xdef',
        callGasLimit: '0x5208',
        verificationGasLimit: '0x10000',
        preVerificationGas: '0x5000',
        maxFeePerGas: '0x3b9aca00',
        maxPriorityFeePerGas: '0x59682f00',
        signature: '0x',
        factory: '0xFactory',
        factoryData: '0xFactoryData',
        paymaster: '0xPaymaster',
        paymasterData: '0xPmData',
        paymasterVerificationGasLimit: '0x8000',
        paymasterPostOpGasLimit: '0x4000',
      },
    });
  });
});
