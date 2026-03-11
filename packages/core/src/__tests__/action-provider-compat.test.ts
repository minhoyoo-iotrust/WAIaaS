/**
 * Tests for IActionProvider backward compatibility after resolve() return type extension.
 *
 * Covers:
 * 1. Existing return types (ContractCallRequest, ContractCallRequest[], ApiDirectResult)
 * 2. New return types (SignedDataAction, SignedHttpAction, ResolvedAction[])
 * 3. ActionDefinition riskLevel 4-grade ('low', 'medium', 'high', 'critical')
 * 4. isApiDirectResult() type guard with new action types
 */
import { describe, it, expect } from 'vitest';
import type {
  IActionProvider,
  ActionProviderMetadata,
  ActionDefinition,
  ActionContext,
  ApiDirectResult,
} from '../interfaces/action-provider.types.js';
import { ActionDefinitionSchema } from '../interfaces/action-provider.types.js';
import { isApiDirectResult } from '../interfaces/action-provider.types.js';
import type { ContractCallRequest } from '../schemas/transaction.schema.js';
import type {
  SignedDataAction,
  SignedHttpAction,
  ResolvedAction,
} from '../schemas/resolved-action.schema.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const metadata: ActionProviderMetadata = {
  name: 'test_provider',
  description: 'A test provider for backward compat verification',
  version: '1.0.0',
  chains: ['solana'],
  mcpExpose: false,
  requiresApiKey: false,
  requiredApis: [],
  requiresSigningKey: false,
};

const baseActionDef: ActionDefinition = {
  name: 'test_action',
  description: 'A test action for backward compat',
  chain: 'solana',
  inputSchema: {},
  riskLevel: 'low',
  defaultTier: 'INSTANT',
};

const context: ActionContext = {
  walletAddress: 'test-address',
  chain: 'solana',
  walletId: 'w-test',
};

const contractCallResult: ContractCallRequest = {
  type: 'CONTRACT_CALL',
  to: 'target-address',
  value: '0',
};

const apiDirectResult: ApiDirectResult = {
  __apiDirect: true,
  externalId: 'ext-123',
  status: 'success',
  provider: 'test_provider',
  action: 'test_action',
  data: { result: 'ok' },
};

const signedDataResult: SignedDataAction = {
  kind: 'signedData',
  signingScheme: 'eip712',
  payload: { test: true },
  venue: 'test-venue',
  operation: 'test-op',
};

const signedHttpResult: SignedHttpAction = {
  kind: 'signedHttp',
  method: 'POST',
  url: 'https://api.example.com/v1/order',
  headers: {},
  signingScheme: 'erc8128',
  venue: 'test-venue',
  operation: 'test-op',
};

// ---------------------------------------------------------------------------
// Return type compatibility tests
// ---------------------------------------------------------------------------

describe('IActionProvider resolve() return type compatibility', () => {
  it('accepts ContractCallRequest return (existing)', () => {
    const provider: IActionProvider = {
      metadata,
      actions: [baseActionDef],
      async resolve() {
        return contractCallResult;
      },
    };
    expect(provider.metadata.name).toBe('test_provider');
  });

  it('accepts ContractCallRequest[] return (existing)', () => {
    const provider: IActionProvider = {
      metadata,
      actions: [baseActionDef],
      async resolve() {
        return [contractCallResult, contractCallResult];
      },
    };
    expect(provider.actions).toHaveLength(1);
  });

  it('accepts ApiDirectResult return (existing)', () => {
    const provider: IActionProvider = {
      metadata,
      actions: [baseActionDef],
      async resolve() {
        return apiDirectResult;
      },
    };
    expect(provider.metadata.requiresSigningKey).toBe(false);
  });

  it('accepts SignedDataAction return (new)', () => {
    const provider: IActionProvider = {
      metadata,
      actions: [baseActionDef],
      async resolve() {
        return signedDataResult;
      },
    };
    expect(provider.metadata.name).toBe('test_provider');
  });

  it('accepts SignedHttpAction return (new)', () => {
    const provider: IActionProvider = {
      metadata,
      actions: [baseActionDef],
      async resolve() {
        return signedHttpResult;
      },
    };
    expect(provider.metadata.name).toBe('test_provider');
  });

  it('accepts ResolvedAction[] return (new)', () => {
    const resolvedArray: ResolvedAction[] = [
      { ...contractCallResult, kind: 'contractCall' as const },
      signedDataResult,
      signedHttpResult,
    ];
    const provider: IActionProvider = {
      metadata,
      actions: [baseActionDef],
      async resolve() {
        return resolvedArray;
      },
    };
    expect(provider.actions).toHaveLength(1);
  });

  it('resolve() returns correct value at runtime', async () => {
    const provider: IActionProvider = {
      metadata,
      actions: [baseActionDef],
      async resolve(_name, _params, _ctx) {
        return signedDataResult;
      },
    };
    const result = await provider.resolve('test_action', {}, context);
    expect(result).toEqual(signedDataResult);
  });
});

// ---------------------------------------------------------------------------
// ActionDefinition riskLevel 4-grade tests
// ---------------------------------------------------------------------------

describe('ActionDefinition riskLevel 4-grade', () => {
  const validRiskLevels = ['low', 'medium', 'high', 'critical'] as const;

  for (const level of validRiskLevels) {
    it(`accepts riskLevel '${level}'`, () => {
      const result = ActionDefinitionSchema.safeParse({
        name: `test_${level}`,
        description: 'A test action for risk level validation',
        chain: 'solana',
        inputSchema: {},
        riskLevel: level,
        defaultTier: 'INSTANT',
      });
      expect(result.success).toBe(true);
    });
  }

  it('rejects invalid riskLevel', () => {
    const result = ActionDefinitionSchema.safeParse({
      name: 'test_invalid',
      description: 'A test action for risk level validation',
      chain: 'solana',
      inputSchema: {},
      riskLevel: 'extreme',
      defaultTier: 'INSTANT',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isApiDirectResult type guard with new action types
// ---------------------------------------------------------------------------

describe('isApiDirectResult type guard', () => {
  it('returns true for ApiDirectResult', () => {
    expect(isApiDirectResult(apiDirectResult)).toBe(true);
  });

  it('returns false for SignedDataAction', () => {
    expect(isApiDirectResult(signedDataResult)).toBe(false);
  });

  it('returns false for SignedHttpAction', () => {
    expect(isApiDirectResult(signedHttpResult)).toBe(false);
  });

  it('returns false for ContractCallRequest', () => {
    expect(isApiDirectResult(contractCallResult)).toBe(false);
  });

  it('returns false for ContractCallRequest[]', () => {
    expect(isApiDirectResult([contractCallResult])).toBe(false);
  });

  it('returns false for ResolvedAction[]', () => {
    expect(isApiDirectResult([signedDataResult, signedHttpResult])).toBe(false);
  });
});
