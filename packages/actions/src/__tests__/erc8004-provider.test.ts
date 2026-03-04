/**
 * Erc8004ActionProvider unit tests.
 *
 * Covers: metadata, 8 action definitions, resolve() for all actions,
 * feature gate, registration file builder, and registerBuiltInProviders.
 * Uses viem decodeFunctionData for calldata round-trip verification.
 */
import { describe, it, expect } from 'vitest';
import { decodeFunctionData } from 'viem';
import { Erc8004ActionProvider } from '../providers/erc8004/index.js';
import { ERC8004_DEFAULTS, type Erc8004Config } from '../providers/erc8004/config.js';
import { ERC8004_MAINNET_ADDRESSES } from '../providers/erc8004/constants.js';
import { buildRegistrationFile } from '../providers/erc8004/registration-file.js';
import { IDENTITY_REGISTRY_ABI } from '../providers/erc8004/identity-abi.js';
import { REPUTATION_REGISTRY_ABI } from '../providers/erc8004/reputation-abi.js';
import { VALIDATION_REGISTRY_ABI } from '../providers/erc8004/validation-abi.js';
import type { ActionContext, ContractCallRequest } from '@waiaas/core';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const TEST_CONFIG: Partial<Erc8004Config> = {
  enabled: true,
  identityRegistryAddress: ERC8004_MAINNET_ADDRESSES.identity,
  reputationRegistryAddress: ERC8004_MAINNET_ADDRESSES.reputation,
  validationRegistryAddress: '0x1234567890123456789012345678901234567890',
  registrationFileBaseUrl: 'https://agent.example.com',
};

const EMPTY_VALIDATION_CONFIG: Partial<Erc8004Config> = {
  ...TEST_CONFIG,
  validationRegistryAddress: '', // feature-gated
};

const CONTEXT: ActionContext = {
  walletAddress: '0x0000000000000000000000000000000000000001',
  chain: 'ethereum',
  walletId: '00000000-0000-0000-0000-000000000001',
};

function asResult(result: ContractCallRequest | ContractCallRequest[]): ContractCallRequest {
  return Array.isArray(result) ? result[0]! : result;
}

// ---------------------------------------------------------------------------
// Metadata tests
// ---------------------------------------------------------------------------

describe('Erc8004ActionProvider', () => {
  const provider = new Erc8004ActionProvider(TEST_CONFIG);

  describe('metadata', () => {
    it('should have name erc8004_agent', () => {
      expect(provider.metadata.name).toBe('erc8004_agent');
    });

    it('should have version 1.0.0', () => {
      expect(provider.metadata.version).toBe('1.0.0');
    });

    it('should target ethereum chain', () => {
      expect(provider.metadata.chains).toContain('ethereum');
    });

    it('should expose via MCP', () => {
      expect(provider.metadata.mcpExpose).toBe(true);
    });

    it('should not require API key', () => {
      expect(provider.metadata.requiresApiKey).toBe(false);
    });

    it('should define 8 actions', () => {
      expect(provider.actions).toHaveLength(8);
    });
  });

  describe('action definitions', () => {
    const actionMap = new Map(provider.actions.map(a => [a.name, a]));

    it('register_agent is high risk with APPROVAL tier', () => {
      const action = actionMap.get('register_agent')!;
      expect(action.riskLevel).toBe('high');
      expect(action.defaultTier).toBe('APPROVAL');
    });

    it('set_agent_wallet is high risk with APPROVAL tier', () => {
      const action = actionMap.get('set_agent_wallet')!;
      expect(action.riskLevel).toBe('high');
      expect(action.defaultTier).toBe('APPROVAL');
    });

    it('unset_agent_wallet is high risk with APPROVAL tier', () => {
      const action = actionMap.get('unset_agent_wallet')!;
      expect(action.riskLevel).toBe('high');
      expect(action.defaultTier).toBe('APPROVAL');
    });

    it('set_agent_uri is medium risk with DELAY tier', () => {
      const action = actionMap.get('set_agent_uri')!;
      expect(action.riskLevel).toBe('medium');
      expect(action.defaultTier).toBe('DELAY');
    });

    it('set_metadata is low risk with NOTIFY tier', () => {
      const action = actionMap.get('set_metadata')!;
      expect(action.riskLevel).toBe('low');
      expect(action.defaultTier).toBe('NOTIFY');
    });

    it('give_feedback is low risk with NOTIFY tier', () => {
      const action = actionMap.get('give_feedback')!;
      expect(action.riskLevel).toBe('low');
      expect(action.defaultTier).toBe('NOTIFY');
    });

    it('revoke_feedback is low risk with INSTANT tier', () => {
      const action = actionMap.get('revoke_feedback')!;
      expect(action.riskLevel).toBe('low');
      expect(action.defaultTier).toBe('INSTANT');
    });

    it('request_validation is medium risk with DELAY tier', () => {
      const action = actionMap.get('request_validation')!;
      expect(action.riskLevel).toBe('medium');
      expect(action.defaultTier).toBe('DELAY');
    });
  });

  // -------------------------------------------------------------------------
  // resolve tests
  // -------------------------------------------------------------------------

  describe('resolve: register_agent', () => {
    it('returns ContractCallRequest with identity registry address', async () => {
      const result = asResult(
        await provider.resolve('register_agent', { name: 'Test Agent' }, CONTEXT),
      );
      expect(result.type).toBe('CONTRACT_CALL');
      expect(result.to).toBe(ERC8004_MAINNET_ADDRESSES.identity);
    });

    it('produces valid register calldata', async () => {
      const result = asResult(
        await provider.resolve('register_agent', { name: 'Test Agent' }, CONTEXT),
      );
      const decoded = decodeFunctionData({
        abi: IDENTITY_REGISTRY_ABI,
        data: result.calldata as `0x${string}`,
      });
      expect(decoded.functionName).toBe('register');
    });

    it('uses registerWithMetadata when metadata provided', async () => {
      const result = asResult(
        await provider.resolve(
          'register_agent',
          { name: 'Test Agent', metadata: { version: '1.0' } },
          CONTEXT,
        ),
      );
      const decoded = decodeFunctionData({
        abi: IDENTITY_REGISTRY_ABI,
        data: result.calldata as `0x${string}`,
      });
      expect(decoded.functionName).toBe('register');
      expect(decoded.args).toHaveLength(2); // agentURI + metadata[]
    });

    it('throws ZodError for missing required name', async () => {
      await expect(
        provider.resolve('register_agent', {}, CONTEXT),
      ).rejects.toThrow();
    });
  });

  describe('resolve: set_agent_wallet', () => {
    it('returns ContractCallRequest with identity registry address', async () => {
      const result = asResult(
        await provider.resolve('set_agent_wallet', { agentId: '42' }, CONTEXT),
      );
      expect(result.type).toBe('CONTRACT_CALL');
      expect(result.to).toBe(ERC8004_MAINNET_ADDRESSES.identity);
    });

    it('produces valid setAgentWallet calldata with placeholder signature', async () => {
      const result = asResult(
        await provider.resolve('set_agent_wallet', { agentId: '42' }, CONTEXT),
      );
      const decoded = decodeFunctionData({
        abi: IDENTITY_REGISTRY_ABI,
        data: result.calldata as `0x${string}`,
      });
      expect(decoded.functionName).toBe('setAgentWallet');
      expect(decoded.args?.[0]).toBe(42n); // agentId
    });
  });

  describe('resolve: unset_agent_wallet', () => {
    it('returns ContractCallRequest with identity registry address', async () => {
      const result = asResult(
        await provider.resolve('unset_agent_wallet', { agentId: '42' }, CONTEXT),
      );
      expect(result.type).toBe('CONTRACT_CALL');
      expect(result.to).toBe(ERC8004_MAINNET_ADDRESSES.identity);
    });

    it('produces valid unsetAgentWallet calldata', async () => {
      const result = asResult(
        await provider.resolve('unset_agent_wallet', { agentId: '42' }, CONTEXT),
      );
      const decoded = decodeFunctionData({
        abi: IDENTITY_REGISTRY_ABI,
        data: result.calldata as `0x${string}`,
      });
      expect(decoded.functionName).toBe('unsetAgentWallet');
      expect(decoded.args?.[0]).toBe(42n);
    });
  });

  describe('resolve: set_agent_uri', () => {
    it('returns ContractCallRequest with identity registry address', async () => {
      const result = asResult(
        await provider.resolve(
          'set_agent_uri',
          { agentId: '42', uri: 'https://example.com/agent.json' },
          CONTEXT,
        ),
      );
      expect(result.type).toBe('CONTRACT_CALL');
      expect(result.to).toBe(ERC8004_MAINNET_ADDRESSES.identity);
    });

    it('produces valid setAgentURI calldata', async () => {
      const result = asResult(
        await provider.resolve(
          'set_agent_uri',
          { agentId: '42', uri: 'https://example.com/agent.json' },
          CONTEXT,
        ),
      );
      const decoded = decodeFunctionData({
        abi: IDENTITY_REGISTRY_ABI,
        data: result.calldata as `0x${string}`,
      });
      expect(decoded.functionName).toBe('setAgentURI');
      expect(decoded.args?.[0]).toBe(42n);
      expect(decoded.args?.[1]).toBe('https://example.com/agent.json');
    });
  });

  describe('resolve: set_metadata', () => {
    it('returns ContractCallRequest with identity registry', async () => {
      const result = asResult(
        await provider.resolve(
          'set_metadata',
          { agentId: '42', key: 'version', value: '1.0' },
          CONTEXT,
        ),
      );
      expect(result.type).toBe('CONTRACT_CALL');
      expect(result.to).toBe(ERC8004_MAINNET_ADDRESSES.identity);
    });

    it('produces valid setMetadata calldata', async () => {
      const result = asResult(
        await provider.resolve(
          'set_metadata',
          { agentId: '42', key: 'version', value: '1.0' },
          CONTEXT,
        ),
      );
      const decoded = decodeFunctionData({
        abi: IDENTITY_REGISTRY_ABI,
        data: result.calldata as `0x${string}`,
      });
      expect(decoded.functionName).toBe('setMetadata');
      expect(decoded.args?.[1]).toBe('version');
    });
  });

  describe('resolve: give_feedback', () => {
    it('returns ContractCallRequest with reputation registry address', async () => {
      const result = asResult(
        await provider.resolve(
          'give_feedback',
          { agentId: '42', value: 80 },
          CONTEXT,
        ),
      );
      expect(result.type).toBe('CONTRACT_CALL');
      expect(result.to).toBe(ERC8004_MAINNET_ADDRESSES.reputation);
    });

    it('produces valid giveFeedback calldata', async () => {
      const result = asResult(
        await provider.resolve(
          'give_feedback',
          { agentId: '42', value: 80, tag1: 'swap', tag2: 'speed' },
          CONTEXT,
        ),
      );
      const decoded = decodeFunctionData({
        abi: REPUTATION_REGISTRY_ABI,
        data: result.calldata as `0x${string}`,
      });
      expect(decoded.functionName).toBe('giveFeedback');
      expect(decoded.args?.[0]).toBe(42n);
      expect(decoded.args?.[1]).toBe(80n);
    });

    it('accepts negative feedback values', async () => {
      const result = asResult(
        await provider.resolve(
          'give_feedback',
          { agentId: '42', value: -50 },
          CONTEXT,
        ),
      );
      const decoded = decodeFunctionData({
        abi: REPUTATION_REGISTRY_ABI,
        data: result.calldata as `0x${string}`,
      });
      expect(decoded.args?.[1]).toBe(-50n);
    });
  });

  describe('resolve: revoke_feedback', () => {
    it('returns ContractCallRequest with reputation registry', async () => {
      const result = asResult(
        await provider.resolve(
          'revoke_feedback',
          { agentId: '42', feedbackIndex: 0 },
          CONTEXT,
        ),
      );
      expect(result.type).toBe('CONTRACT_CALL');
      expect(result.to).toBe(ERC8004_MAINNET_ADDRESSES.reputation);
    });

    it('produces valid revokeFeedback calldata', async () => {
      const result = asResult(
        await provider.resolve(
          'revoke_feedback',
          { agentId: '42', feedbackIndex: 3 },
          CONTEXT,
        ),
      );
      const decoded = decodeFunctionData({
        abi: REPUTATION_REGISTRY_ABI,
        data: result.calldata as `0x${string}`,
      });
      expect(decoded.functionName).toBe('revokeFeedback');
      expect(decoded.args?.[0]).toBe(42n);
      expect(decoded.args?.[1]).toBe(3n);
    });
  });

  describe('resolve: request_validation', () => {
    it('throws when validation registry address is empty', async () => {
      const emptyProvider = new Erc8004ActionProvider(EMPTY_VALIDATION_CONFIG);
      await expect(
        emptyProvider.resolve(
          'request_validation',
          {
            agentId: '42',
            validatorAddress: '0x1234567890123456789012345678901234567890',
            requestDescription: 'Test validation',
          },
          CONTEXT,
        ),
      ).rejects.toThrow('Validation Registry not configured');
    });

    it('returns ContractCallRequest when validation address configured', async () => {
      const result = asResult(
        await provider.resolve(
          'request_validation',
          {
            agentId: '42',
            validatorAddress: '0x1234567890123456789012345678901234567890',
            requestDescription: 'Test validation request',
          },
          CONTEXT,
        ),
      );
      expect(result.type).toBe('CONTRACT_CALL');
      expect(result.to).toBe('0x1234567890123456789012345678901234567890');
    });

    it('produces valid validationRequest calldata', async () => {
      const result = asResult(
        await provider.resolve(
          'request_validation',
          {
            agentId: '42',
            validatorAddress: '0x1234567890123456789012345678901234567890',
            requestDescription: 'Test validation',
          },
          CONTEXT,
        ),
      );
      const decoded = decodeFunctionData({
        abi: VALIDATION_REGISTRY_ABI,
        data: result.calldata as `0x${string}`,
      });
      expect(decoded.functionName).toBe('validationRequest');
    });
  });

  describe('resolve: unknown action', () => {
    it('throws ChainError for unknown action name', async () => {
      await expect(
        provider.resolve('unknown_action', {}, CONTEXT),
      ).rejects.toThrow('Unknown ERC-8004 action');
    });
  });

  describe('resolve: invalid agentId', () => {
    it('throws for non-numeric agentId', async () => {
      await expect(
        provider.resolve('set_agent_uri', { agentId: 'not-a-number', uri: 'https://x.com' }, CONTEXT),
      ).rejects.toThrow('Invalid agentId');
    });
  });
});

// ---------------------------------------------------------------------------
// Registration file tests
// ---------------------------------------------------------------------------

describe('buildRegistrationFile', () => {
  it('produces valid JSON with required fields', () => {
    const file = buildRegistrationFile({ name: 'Test Agent' });
    expect(file.type).toBe('https://eips.ethereum.org/EIPS/eip-8004#registration-v1');
    expect(file.name).toBe('Test Agent');
    expect(file.active).toBe(true);
    expect(file.supportedTrust).toEqual(['reputation']);
  });

  it('includes default description when not provided', () => {
    const file = buildRegistrationFile({ name: 'Test' });
    expect(file.description).toBe('WAIaaS-managed AI agent wallet');
  });

  it('uses provided description', () => {
    const file = buildRegistrationFile({ name: 'Test', description: 'Custom desc' });
    expect(file.description).toBe('Custom desc');
  });

  it('auto-adds MCP and REST endpoints when baseUrl provided', () => {
    const file = buildRegistrationFile({ name: 'Test', baseUrl: 'https://agent.example.com' });
    const services = file.services as Array<{ name: string; endpoint: string }>;
    expect(services).toHaveLength(2);
    expect(services[0]!.name).toBe('mcp');
    expect(services[0]!.endpoint).toBe('https://agent.example.com/mcp');
    expect(services[1]!.name).toBe('rest-api');
    expect(services[1]!.endpoint).toBe('https://agent.example.com/v1');
  });

  it('includes registrations when agentId and registry provided', () => {
    const file = buildRegistrationFile({
      name: 'Test',
      agentId: '42',
      identityRegistryAddress: '0xAbCdEf',
      chainId: 1,
    });
    const regs = file.registrations as Array<{ agentId: string; agentRegistry: string }>;
    expect(regs).toHaveLength(1);
    expect(regs[0]!.agentId).toBe('42');
    expect(regs[0]!.agentRegistry).toBe('eip155:1:0xAbCdEf');
  });

  it('omits registrations when agentId not provided', () => {
    const file = buildRegistrationFile({ name: 'Test' });
    expect(file.registrations).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// registerBuiltInProviders integration
// ---------------------------------------------------------------------------

describe('registerBuiltInProviders integration', () => {
  it('should register erc8004_agent when actions.erc8004_agent_enabled is true', async () => {
    const { registerBuiltInProviders } = await import('../index.js');
    const registered: Array<{ metadata: { name: string } }> = [];
    const registry = {
      register: (provider: unknown) => registered.push(provider as { metadata: { name: string } }),
    };
    const settingsReader = {
      get: (key: string) => {
        if (key === 'actions.erc8004_agent_enabled') return 'true';
        if (key === 'actions.erc8004_identity_registry_address') return ERC8004_MAINNET_ADDRESSES.identity;
        if (key === 'actions.erc8004_reputation_registry_address') return ERC8004_MAINNET_ADDRESSES.reputation;
        if (key === 'actions.erc8004_validation_registry_address') return '';
        return '';
      },
    };

    const result = registerBuiltInProviders(registry, settingsReader);
    expect(result.loaded).toContain('erc8004_agent');
    expect(registered.some((p) => p.metadata.name === 'erc8004_agent')).toBe(true);
  });

  it('should skip erc8004_agent when actions.erc8004_agent_enabled is false', async () => {
    const { registerBuiltInProviders } = await import('../index.js');
    const registered: Array<{ metadata: { name: string } }> = [];
    const registry = {
      register: (provider: unknown) => registered.push(provider as { metadata: { name: string } }),
    };
    const settingsReader = {
      get: (key: string) => {
        if (key === 'actions.erc8004_agent_enabled') return 'false';
        return '';
      },
    };

    const result = registerBuiltInProviders(registry, settingsReader);
    expect(result.loaded).not.toContain('erc8004_agent');
    expect(result.skipped).toContain('erc8004_agent');
  });
});
