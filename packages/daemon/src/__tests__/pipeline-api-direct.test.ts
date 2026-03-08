/**
 * Tests for ApiDirectResult Stage 5 branch and requiresSigningKey key decrypt.
 *
 * @see HDESIGN-01: ApiDirectResult pipeline integration
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isApiDirectResult, type ApiDirectResult } from '@waiaas/core';
import { ActionProviderRegistry } from '../infrastructure/action/action-provider-registry.js';
import { z } from 'zod';
import type {
  IActionProvider,
  ActionProviderMetadata,
  ActionDefinition,
  ActionContext,
  ContractCallRequest,
} from '@waiaas/core';

// ---------------------------------------------------------------------------
// Mock providers
// ---------------------------------------------------------------------------

/** Provider that returns ApiDirectResult (e.g., Hyperliquid). */
class ApiDirectProvider implements IActionProvider {
  readonly metadata: ActionProviderMetadata = {
    name: 'api_direct_test',
    description: 'Test provider returning ApiDirectResult',
    version: '1.0.0',
    chains: ['ethereum'],
    mcpExpose: true,
    requiresApiKey: false,
    requiredApis: [],
    requiresSigningKey: true,
  };

  readonly actions: readonly ActionDefinition[] = [
    {
      name: 'test_action',
      description: 'A test action that returns an API direct result',
      chain: 'ethereum',
      inputSchema: z.object({ market: z.string() }),
      riskLevel: 'high',
      defaultTier: 'APPROVAL',
    },
  ];

  async resolve(
    _actionName: string,
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ApiDirectResult> {
    // Verify privateKey is provided (requiresSigningKey=true)
    if (!context.privateKey) {
      throw new Error('privateKey not provided');
    }
    return {
      __apiDirect: true,
      externalId: 'order-123',
      status: 'success',
      provider: 'api_direct_test',
      action: 'test_action',
      data: { oid: 12345 },
      metadata: { market: params.market as string, side: 'BUY' },
    };
  }
}

/** Standard provider that returns ContractCallRequest. */
class StandardProvider implements IActionProvider {
  readonly metadata: ActionProviderMetadata = {
    name: 'standard_test',
    description: 'Test provider returning ContractCallRequest',
    version: '1.0.0',
    chains: ['ethereum'],
    mcpExpose: false,
    requiresApiKey: false,
    requiredApis: [],
    requiresSigningKey: false,
  };

  readonly actions: readonly ActionDefinition[] = [
    {
      name: 'standard_action',
      description: 'A standard action returning ContractCallRequest result',
      chain: 'ethereum',
      inputSchema: z.object({ to: z.string() }),
      riskLevel: 'low',
      defaultTier: 'INSTANT',
    },
  ];

  async resolve(
    _actionName: string,
    _params: Record<string, unknown>,
    _context: ActionContext,
  ): Promise<ContractCallRequest> {
    return {
      type: 'CONTRACT_CALL' as const,
      to: '0x1234567890abcdef1234567890abcdef12345678',
      calldata: '0xdeadbeef',
      value: '0',
    };
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ActionProviderRegistry ApiDirectResult support', () => {
  let registry: ActionProviderRegistry;

  beforeEach(() => {
    registry = new ActionProviderRegistry();
  });

  describe('executeResolve with ApiDirectResult', () => {
    it('returns ApiDirectResult when provider returns one', async () => {
      const provider = new ApiDirectProvider();
      registry.register(provider);

      const context: ActionContext = {
        walletAddress: '0xabc',
        chain: 'ethereum',
        walletId: 'w-1',
        privateKey: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      };

      const result = await registry.executeResolve(
        'api_direct_test/test_action',
        { market: 'ETH' },
        context,
      );

      // executeResolve should return the ApiDirectResult wrapped or directly
      expect(result).toBeDefined();
      // When result is ApiDirectResult, it should be returned as-is (not validated as ContractCallRequest)
      expect(result.length).toBe(1);
      const item = result[0]!;
      expect(isApiDirectResult(item)).toBe(true);
      if (isApiDirectResult(item)) {
        expect(item.externalId).toBe('order-123');
        expect(item.provider).toBe('api_direct_test');
        expect(item.action).toBe('test_action');
      }
    });

    it('returns ContractCallRequest[] for standard provider (unchanged)', async () => {
      const provider = new StandardProvider();
      registry.register(provider);

      const context: ActionContext = {
        walletAddress: '0xabc',
        chain: 'ethereum',
        walletId: 'w-1',
      };

      const result = await registry.executeResolve(
        'standard_test/standard_action',
        { to: '0x123' },
        context,
      );

      expect(result.length).toBe(1);
      expect(isApiDirectResult(result[0]!)).toBe(false);
      expect((result[0] as ContractCallRequest).type).toBe('CONTRACT_CALL');
    });
  });

  describe('requiresSigningKey metadata', () => {
    it('registers provider with requiresSigningKey=true', () => {
      const provider = new ApiDirectProvider();
      registry.register(provider);

      const registered = registry.getProvider('api_direct_test');
      expect(registered).toBeDefined();
      expect(registered!.metadata.requiresSigningKey).toBe(true);
    });

    it('registers provider with requiresSigningKey=false (default)', () => {
      const provider = new StandardProvider();
      registry.register(provider);

      const registered = registry.getProvider('standard_test');
      expect(registered).toBeDefined();
      expect(registered!.metadata.requiresSigningKey).toBe(false);
    });
  });
});
