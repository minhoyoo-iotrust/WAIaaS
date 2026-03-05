/**
 * Tests for ERC-8128 MCP tools.
 *
 * Verifies:
 * - erc8128_sign_request calls POST /v1/erc8128/sign with correct params
 * - erc8128_verify_signature calls POST /v1/erc8128/verify with correct params
 * - Optional parameters are forwarded correctly
 * - Error responses return isError=true
 */

import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient, ApiResult } from '../api-client.js';
import { registerErc8128SignRequest } from '../tools/erc8128-sign-request.js';
import { registerErc8128VerifySignature } from '../tools/erc8128-verify-signature.js';

// --- Mock ApiClient factory ---
function createMockApiClient(responses: Map<string, ApiResult<unknown>>): ApiClient {
  const defaultOk: ApiResult<unknown> = { ok: true, data: { mock: true } };

  return {
    get: vi.fn(async (path: string) => responses.get(path) ?? defaultOk),
    post: vi.fn(async (path: string, _body: unknown) => responses.get(path) ?? defaultOk),
    put: vi.fn(async (path: string, _body: unknown) => responses.get(path) ?? defaultOk),
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

describe('erc8128_sign_request tool', () => {
  it('calls POST /v1/erc8128/sign with method and url', async () => {
    const mockData = {
      signatureInput: 'sig1=("@method" "@target-uri");created=1700000000;expires=1700000300;keyid="erc8128:1:0xabc";alg="eip191"',
      signature: 'sig1=:base64sig:',
      keyid: 'erc8128:1:0xabc',
      preset: 'standard',
      ttlSeconds: 300,
      nonce: 'uuid-v4-nonce',
      algorithm: 'eip191',
    };
    const responses = new Map<string, ApiResult<unknown>>([
      ['/v1/erc8128/sign', { ok: true, data: mockData }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerErc8128SignRequest, apiClient);

    const result = await handler({ method: 'GET', url: 'https://api.example.com/data' }) as { content: Array<{ text: string }> };

    expect(apiClient.post).toHaveBeenCalledWith('/v1/erc8128/sign', {
      method: 'GET',
      url: 'https://api.example.com/data',
    });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['signatureInput']).toBeDefined();
    expect(parsed['signature']).toBeDefined();
    expect(parsed['keyid']).toBe('erc8128:1:0xabc');
  });

  it('passes optional parameters (headers, body, wallet_id, preset, ttl_seconds, network)', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['/v1/erc8128/sign', { ok: true, data: { signatureInput: 'sig1=...', signature: 'sig1=:...:' } }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerErc8128SignRequest, apiClient);

    await handler({
      method: 'POST',
      url: 'https://api.example.com/submit',
      headers: { 'Content-Type': 'application/json' },
      body: '{"data":"test"}',
      wallet_id: 'wallet-123',
      network: 'evm-ethereum-mainnet',
      preset: 'strict',
      ttl_seconds: 600,
    });

    expect(apiClient.post).toHaveBeenCalledWith('/v1/erc8128/sign', {
      method: 'POST',
      url: 'https://api.example.com/submit',
      headers: { 'Content-Type': 'application/json' },
      body: '{"data":"test"}',
      walletId: 'wallet-123',
      network: 'evm-ethereum-mainnet',
      preset: 'strict',
      ttlSeconds: 600,
    });
  });

  it('returns error result on API failure', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['/v1/erc8128/sign', { ok: false as const, error: { code: 'ERC8128_DISABLED', message: 'ERC-8128 is disabled', retryable: false } }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerErc8128SignRequest, apiClient);

    const result = await handler({ method: 'GET', url: 'https://api.example.com/data' }) as { isError: boolean };

    expect(result.isError).toBe(true);
  });
});

describe('erc8128_verify_signature tool', () => {
  it('calls POST /v1/erc8128/verify with all required params', async () => {
    const mockData = { valid: true, recoveredAddress: '0xabcdef1234567890abcdef1234567890abcdef12', keyid: 'erc8128:1:0xabc' };
    const responses = new Map<string, ApiResult<unknown>>([
      ['/v1/erc8128/verify', { ok: true, data: mockData }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerErc8128VerifySignature, apiClient);

    const result = await handler({
      method: 'GET',
      url: 'https://api.example.com/data',
      headers: { 'Accept': 'application/json' },
      signature_input: 'sig1=("@method" "@target-uri");created=1700000000',
      signature: 'sig1=:base64sig:',
    }) as { content: Array<{ text: string }> };

    expect(apiClient.post).toHaveBeenCalledWith('/v1/erc8128/verify', {
      method: 'GET',
      url: 'https://api.example.com/data',
      headers: { 'Accept': 'application/json' },
      signatureInput: 'sig1=("@method" "@target-uri");created=1700000000',
      signature: 'sig1=:base64sig:',
    });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed['valid']).toBe(true);
    expect(parsed['recoveredAddress']).toBeDefined();
  });

  it('passes optional content_digest', async () => {
    const responses = new Map<string, ApiResult<unknown>>([
      ['/v1/erc8128/verify', { ok: true, data: { valid: true } }],
    ]);
    const apiClient = createMockApiClient(responses);
    const handler = getToolHandler(registerErc8128VerifySignature, apiClient);

    await handler({
      method: 'POST',
      url: 'https://api.example.com/submit',
      headers: { 'Content-Type': 'application/json' },
      signature_input: 'sig1=...',
      signature: 'sig1=:...:',
      content_digest: 'sha-256=:abc123base64:',
    });

    expect(apiClient.post).toHaveBeenCalledWith('/v1/erc8128/verify', {
      method: 'POST',
      url: 'https://api.example.com/submit',
      headers: { 'Content-Type': 'application/json' },
      signatureInput: 'sig1=...',
      signature: 'sig1=:...:',
      contentDigest: 'sha-256=:abc123base64:',
    });
  });
});
