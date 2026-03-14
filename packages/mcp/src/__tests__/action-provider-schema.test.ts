/**
 * Tests for MCP action provider typed schema registration (Phase 404).
 *
 * Verifies:
 * - jsonSchemaToZodParams converts JSON Schema properties to Zod schemas
 * - MCP tools use typed params from inputSchema when available
 * - Fallback to z.record(z.unknown()) when inputSchema is absent or empty
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient, ApiResult } from '../api-client.js';
import { registerActionProviderTools, jsonSchemaToZodParams } from '../tools/action-provider.js';

// --- Mock factories ---

function createMockApiClient(responses: Map<string, ApiResult<unknown>>): ApiClient {
  const defaultOk: ApiResult<unknown> = { ok: true, data: { mock: true } };
  return {
    get: vi.fn(async (path: string) => responses.get(`GET:${path}`) ?? defaultOk),
    post: vi.fn(async (path: string, _body: unknown) => responses.get(`POST:${path}`) ?? defaultOk),
    put: vi.fn(async (path: string, _body: unknown) => responses.get(`PUT:${path}`) ?? defaultOk),
  } as unknown as ApiClient;
}

function createMockServer(): {
  server: McpServer;
  toolCalls: Array<{ name: string; description: string; schema: Record<string, unknown>; handler: (...args: unknown[]) => Promise<unknown> }>;
} {
  const toolCalls: Array<{ name: string; description: string; schema: Record<string, unknown>; handler: (...args: unknown[]) => Promise<unknown> }> = [];

  const server = {
    tool: vi.fn((...args: unknown[]) => {
      const name = args[0] as string;
      const description = args[1] as string;
      const schema = args[2] as Record<string, unknown>;
      const handler = args[args.length - 1] as (...a: unknown[]) => Promise<unknown>;
      toolCalls.push({ name, description, schema, handler });

      return {
        enabled: true,
        enable: vi.fn(),
        disable: vi.fn(),
        remove: vi.fn(),
        update: vi.fn(),
      } as unknown as RegisteredTool;
    }),
  } as unknown as McpServer;

  return { server, toolCalls };
}

// --- jsonSchemaToZodParams tests ---

describe('jsonSchemaToZodParams', () => {
  it('should convert string properties to z.string()', () => {
    const jsonSchema = {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount in smallest unit' },
      },
      required: ['amount'],
    };
    const result = jsonSchemaToZodParams(jsonSchema);
    expect(result).toBeDefined();
    expect(result!.amount).toBeDefined();

    // Verify it's a Zod schema that accepts strings
    const parsed = result!.amount.safeParse('1000');
    expect(parsed.success).toBe(true);

    // Should reject non-strings
    const rejected = result!.amount.safeParse(1000);
    expect(rejected.success).toBe(false);
  });

  it('should convert number/integer properties to z.number()', () => {
    const jsonSchema = {
      type: 'object',
      properties: {
        slippage: { type: 'number' },
        count: { type: 'integer' },
      },
      required: ['slippage'],
    };
    const result = jsonSchemaToZodParams(jsonSchema);
    expect(result).toBeDefined();

    expect(result!.slippage.safeParse(0.5).success).toBe(true);
    expect(result!.count.safeParse(10).success).toBe(true);
  });

  it('should convert boolean properties to z.boolean()', () => {
    const jsonSchema = {
      type: 'object',
      properties: {
        autoCompound: { type: 'boolean' },
      },
      required: [],
    };
    const result = jsonSchemaToZodParams(jsonSchema);
    expect(result).toBeDefined();
    expect(result!.autoCompound.safeParse(true).success).toBe(true);
  });

  it('should make non-required fields optional', () => {
    const jsonSchema = {
      type: 'object',
      properties: {
        amount: { type: 'string' },
        slippage: { type: 'number' },
      },
      required: ['amount'],
    };
    const result = jsonSchemaToZodParams(jsonSchema);
    expect(result).toBeDefined();

    // slippage is optional -- should accept undefined
    const parsed = result!.slippage.safeParse(undefined);
    expect(parsed.success).toBe(true);

    // amount is required -- should reject undefined
    const rejected = result!.amount.safeParse(undefined);
    expect(rejected.success).toBe(false);
  });

  it('should handle array properties as z.array(z.unknown())', () => {
    const jsonSchema = {
      type: 'object',
      properties: {
        accounts: { type: 'array' },
      },
      required: [],
    };
    const result = jsonSchemaToZodParams(jsonSchema);
    expect(result).toBeDefined();
    expect(result!.accounts.safeParse([1, 'a', true]).success).toBe(true);
  });

  it('should return null for empty or missing properties', () => {
    expect(jsonSchemaToZodParams({})).toBeNull();
    expect(jsonSchemaToZodParams({ type: 'object' })).toBeNull();
    expect(jsonSchemaToZodParams({ type: 'object', properties: {} })).toBeNull();
  });

  it('should apply descriptions from JSON Schema', () => {
    const jsonSchema = {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'Amount in wei' },
      },
      required: ['amount'],
    };
    const result = jsonSchemaToZodParams(jsonSchema);
    expect(result).toBeDefined();
    // Zod stores description in _def
    expect((result!.amount as z.ZodString).description).toBe('Amount in wei');
  });
});

// --- MCP typed schema registration tests ---

describe('registerActionProviderTools typed schema', () => {
  it('should use typed params from inputSchema when available', async () => {
    const responses = new Map<string, ApiResult<unknown>>();
    responses.set('GET:/v1/actions/providers', {
      ok: true,
      data: {
        providers: [{
          name: 'test_swap',
          description: 'Test swap provider',
          version: '1.0.0',
          chains: ['solana'],
          mcpExpose: true,
          requiresApiKey: false,
          hasApiKey: false,
          actions: [{
            name: 'swap',
            description: 'Swap tokens on test exchange with best rate',
            chain: 'solana',
            riskLevel: 'medium',
            defaultTier: 'NOTIFY',
            inputSchema: {
              type: 'object',
              properties: {
                inputMint: { type: 'string', description: 'Input token mint address' },
                outputMint: { type: 'string', description: 'Output token mint address' },
                amount: { type: 'string', description: 'Amount in smallest unit (lamports)' },
                slippageBps: { type: 'number', description: 'Slippage tolerance in basis points' },
              },
              required: ['inputMint', 'outputMint', 'amount'],
            },
          }],
        }],
      },
    });

    const apiClient = createMockApiClient(responses);
    const { server, toolCalls } = createMockServer();

    await registerActionProviderTools(server, apiClient);

    expect(toolCalls).toHaveLength(1);
    const schema = toolCalls[0]!.schema;

    // Should have individual typed fields, not just a generic params wrapper
    expect(schema.inputMint).toBeDefined();
    expect(schema.outputMint).toBeDefined();
    expect(schema.amount).toBeDefined();
    expect(schema.slippageBps).toBeDefined();

    // Standard MCP fields should still be present
    expect(schema.network).toBeDefined();
    expect(schema.wallet_id).toBeDefined();
    expect(schema.gas_condition).toBeDefined();

    // Generic params should NOT be present when typed schema is used
    expect(schema.params).toBeUndefined();
  });

  it('should fallback to z.record(z.unknown()) when inputSchema is absent', async () => {
    const responses = new Map<string, ApiResult<unknown>>();
    responses.set('GET:/v1/actions/providers', {
      ok: true,
      data: {
        providers: [{
          name: 'legacy_provider',
          description: 'Legacy provider without schema',
          version: '1.0.0',
          chains: ['solana'],
          mcpExpose: true,
          requiresApiKey: false,
          hasApiKey: false,
          actions: [{
            name: 'legacy_action',
            description: 'Legacy action without inputSchema field',
            chain: 'solana',
            riskLevel: 'low',
            defaultTier: 'INSTANT',
            // No inputSchema field
          }],
        }],
      },
    });

    const apiClient = createMockApiClient(responses);
    const { server, toolCalls } = createMockServer();

    await registerActionProviderTools(server, apiClient);

    expect(toolCalls).toHaveLength(1);
    const schema = toolCalls[0]!.schema;

    // Should have generic params fallback
    expect(schema.params).toBeDefined();
  });

  it('should use typed params and pass them as params to REST API handler', async () => {
    const responses = new Map<string, ApiResult<unknown>>();
    responses.set('GET:/v1/actions/providers', {
      ok: true,
      data: {
        providers: [{
          name: 'typed_provider',
          description: 'Provider with typed schema',
          version: '1.0.0',
          chains: ['solana'],
          mcpExpose: true,
          requiresApiKey: false,
          hasApiKey: false,
          actions: [{
            name: 'typed_action',
            description: 'Action with typed inputSchema for handler test',
            chain: 'solana',
            riskLevel: 'low',
            defaultTier: 'INSTANT',
            inputSchema: {
              type: 'object',
              properties: {
                tokenAddress: { type: 'string' },
                amount: { type: 'string' },
              },
              required: ['tokenAddress', 'amount'],
            },
          }],
        }],
      },
    });

    const apiClient = createMockApiClient(responses);
    const { server, toolCalls } = createMockServer();

    await registerActionProviderTools(server, apiClient);

    // Invoke the handler with typed args
    const handler = toolCalls[0]!.handler;
    await handler({
      tokenAddress: '0x1234',
      amount: '1000000',
      network: 'ethereum-mainnet',
    });

    // Verify the REST API call passes individual fields as params
    expect(apiClient.post).toHaveBeenCalledWith(
      '/v1/actions/typed_provider/typed_action',
      expect.objectContaining({
        params: { tokenAddress: '0x1234', amount: '1000000' },
        network: 'ethereum-mainnet',
      }),
    );
  });
});
