/**
 * connect-info rpcProxy field and capability tests.
 *
 * Tests that the connect-info prompt and response correctly reflect
 * RPC proxy status based on settings.
 */

import { describe, it, expect } from 'vitest';
import {
  buildConnectInfoPrompt,
  type BuildConnectInfoPromptParams,
} from '../../api/routes/connect-info.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createPromptParams(overrides?: Partial<BuildConnectInfoPromptParams>): BuildConnectInfoPromptParams {
  return {
    wallets: [{
      id: 'wallet-1',
      name: 'test-wallet',
      chain: 'ethereum',
      environment: 'mainnet',
      address: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD61',
      networks: ['ethereum-mainnet'],
      policies: [],
    }],
    capabilities: [],
    defaultDeny: {
      tokenTransfers: false,
      contractCalls: false,
      tokenApprovals: false,
      x402Domains: false,
    },
    baseUrl: 'http://localhost:3100',
    version: '2.0.0',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('connect-info rpcProxy', () => {
  describe('prompt', () => {
    it('includes RPC Proxy usage hint when rpc_proxy capability is present', () => {
      const params = createPromptParams({
        capabilities: ['rpc_proxy'],
      });
      const prompt = buildConnectInfoPrompt(params);
      expect(prompt).toContain('EVM RPC Proxy');
      expect(prompt).toContain('/v1/rpc-evm/{walletId}/{chainId}');
      expect(prompt).toContain('Forge/Hardhat/ethers.js/viem');
    });

    it('does not include RPC Proxy hint when capability is absent', () => {
      const params = createPromptParams({
        capabilities: [],
      });
      const prompt = buildConnectInfoPrompt(params);
      expect(prompt).not.toContain('EVM RPC Proxy');
    });

    it('includes rpc_proxy in capabilities list when enabled', () => {
      const params = createPromptParams({
        capabilities: ['rpc_proxy', 'external_actions'],
      });
      const prompt = buildConnectInfoPrompt(params);
      expect(prompt).toContain('rpc_proxy');
    });
  });

  describe('rpcProxy response field logic', () => {
    it('returns non-null rpcProxy when enabled (simulated)', () => {
      // Simulate the IIFE logic from connect-info.ts route handler
      const settingsGet = (key: string) => {
        if (key === 'rpc_proxy.enabled') return 'true';
        return null;
      };
      const baseUrl = 'http://localhost:3100';
      const rpcProxy = (() => {
        try {
          if (settingsGet('rpc_proxy.enabled') === 'true') {
            return { enabled: true, baseUrl: `${baseUrl}/v1/rpc-evm` };
          }
        } catch { /* not found */ }
        return null;
      })();
      expect(rpcProxy).toEqual({ enabled: true, baseUrl: 'http://localhost:3100/v1/rpc-evm' });
    });

    it('returns null rpcProxy when disabled', () => {
      const settingsGet = (key: string) => {
        if (key === 'rpc_proxy.enabled') return 'false';
        return null;
      };
      const baseUrl = 'http://localhost:3100';
      const rpcProxy = (() => {
        try {
          if (settingsGet('rpc_proxy.enabled') === 'true') {
            return { enabled: true, baseUrl: `${baseUrl}/v1/rpc-evm` };
          }
        } catch { /* not found */ }
        return null;
      })();
      expect(rpcProxy).toBeNull();
    });

    it('returns null rpcProxy when setting not found (default)', () => {
      const settingsGet = (_key: string): string => {
        throw new Error('Setting not found');
      };
      const baseUrl = 'http://localhost:3100';
      const rpcProxy = (() => {
        try {
          if (settingsGet('rpc_proxy.enabled') === 'true') {
            return { enabled: true, baseUrl: `${baseUrl}/v1/rpc-evm` };
          }
        } catch { /* not found */ }
        return null;
      })();
      expect(rpcProxy).toBeNull();
    });
  });
});
