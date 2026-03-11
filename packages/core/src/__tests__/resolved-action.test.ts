/**
 * Unit tests for ResolvedAction 3-kind discriminatedUnion.
 *
 * Tests schema parsing, normalization, and SigningSchemeEnum.
 * Plan 386-01 Task 1.
 */

import { describe, it, expect } from 'vitest';
import {
  SignedDataActionSchema,
  SignedHttpActionSchema,
  NormalizedContractCallSchema,
  ResolvedActionSchema,
  normalizeResolvedAction,
  normalizeResolvedActions,
} from '../schemas/resolved-action.schema.js';
import { SigningSchemeEnum, SIGNING_SCHEMES } from '../enums/signing-scheme.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const signedDataFixture = {
  kind: 'signedData' as const,
  signingScheme: 'eip712' as const,
  payload: { domain: { name: 'Hyperliquid' }, types: {}, message: {} },
  venue: 'hyperliquid',
  operation: 'place_order',
};

const signedHttpFixture = {
  kind: 'signedHttp' as const,
  method: 'GET' as const,
  url: 'https://api.example.com/data',
  headers: {},
  signingScheme: 'erc8128' as const,
  venue: 'external-api',
  operation: 'fetch',
};

const contractCallFixture = {
  kind: 'contractCall' as const,
  type: 'CONTRACT_CALL' as const,
  to: '0x1234567890abcdef1234567890abcdef12345678',
};

const legacyContractCallFixture = {
  type: 'CONTRACT_CALL' as const,
  to: '0x1234567890abcdef1234567890abcdef12345678',
};

// ---------------------------------------------------------------------------
// SigningSchemeEnum
// ---------------------------------------------------------------------------

describe('SigningSchemeEnum', () => {
  it('has exactly 7 values', () => {
    expect(SIGNING_SCHEMES).toHaveLength(7);
  });

  it('contains all expected schemes', () => {
    const expected = [
      'eip712',
      'personal',
      'hmac-sha256',
      'rsa-pss',
      'ecdsa-secp256k1',
      'ed25519',
      'erc8128',
    ];
    expect(SIGNING_SCHEMES).toEqual(expected);
  });

  it('parses valid scheme', () => {
    expect(SigningSchemeEnum.parse('eip712')).toBe('eip712');
  });

  it('rejects invalid scheme', () => {
    expect(() => SigningSchemeEnum.parse('sha256')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// SignedDataActionSchema
// ---------------------------------------------------------------------------

describe('SignedDataActionSchema', () => {
  it('parses valid signedData action', () => {
    const result = SignedDataActionSchema.parse(signedDataFixture);
    expect(result.kind).toBe('signedData');
    expect(result.signingScheme).toBe('eip712');
    expect(result.venue).toBe('hyperliquid');
    expect(result.operation).toBe('place_order');
  });

  it('parses with optional fields', () => {
    const result = SignedDataActionSchema.parse({
      ...signedDataFixture,
      credentialRef: 'cred-123',
      tracking: { trackerName: 'hyperliquid', metadata: { orderId: '123' } },
      policyContext: { actionCategory: 'perp', notionalUsd: 1000, leverage: 5 },
      actionProvider: 'hyperliquid_perp',
      actionName: 'place_order',
    });
    expect(result.credentialRef).toBe('cred-123');
    expect(result.tracking?.trackerName).toBe('hyperliquid');
    expect(result.policyContext?.actionCategory).toBe('perp');
  });

  it('rejects extra fields (strict mode)', () => {
    expect(() =>
      SignedDataActionSchema.parse({
        ...signedDataFixture,
        extraField: 'should fail',
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// SignedHttpActionSchema
// ---------------------------------------------------------------------------

describe('SignedHttpActionSchema', () => {
  it('parses valid signedHttp action', () => {
    const result = SignedHttpActionSchema.parse(signedHttpFixture);
    expect(result.kind).toBe('signedHttp');
    expect(result.method).toBe('GET');
    expect(result.signingScheme).toBe('erc8128');
    expect(result.venue).toBe('external-api');
  });

  it('parses with body and optional fields', () => {
    const result = SignedHttpActionSchema.parse({
      ...signedHttpFixture,
      method: 'POST',
      body: '{"key":"value"}',
      signingScheme: 'hmac-sha256',
      coveredComponents: ['@method', '@path', 'content-type'],
      preset: 'custom-api',
      ttlSec: 300,
      nonce: 'abc-123',
    });
    expect(result.body).toBe('{"key":"value"}');
    expect(result.coveredComponents).toHaveLength(3);
  });

  it('rejects unsupported signing scheme', () => {
    expect(() =>
      SignedHttpActionSchema.parse({
        ...signedHttpFixture,
        signingScheme: 'rsa-pss',
      }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// NormalizedContractCallSchema
// ---------------------------------------------------------------------------

describe('NormalizedContractCallSchema', () => {
  it('parses contractCall with kind field', () => {
    const result = NormalizedContractCallSchema.parse(contractCallFixture);
    expect(result.kind).toBe('contractCall');
    expect(result.type).toBe('CONTRACT_CALL');
    expect(result.to).toBe('0x1234567890abcdef1234567890abcdef12345678');
  });

  it('rejects without kind field', () => {
    expect(() =>
      NormalizedContractCallSchema.parse(legacyContractCallFixture),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// ResolvedActionSchema (discriminatedUnion)
// ---------------------------------------------------------------------------

describe('ResolvedActionSchema', () => {
  it('discriminates signedData', () => {
    const result = ResolvedActionSchema.parse(signedDataFixture);
    expect(result.kind).toBe('signedData');
  });

  it('discriminates signedHttp', () => {
    const result = ResolvedActionSchema.parse(signedHttpFixture);
    expect(result.kind).toBe('signedHttp');
  });

  it('discriminates contractCall', () => {
    const result = ResolvedActionSchema.parse(contractCallFixture);
    expect(result.kind).toBe('contractCall');
  });

  it('rejects unknown kind', () => {
    expect(() =>
      ResolvedActionSchema.parse({ kind: 'unknown', foo: 'bar' }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// normalizeResolvedAction
// ---------------------------------------------------------------------------

describe('normalizeResolvedAction', () => {
  it('normalizes legacy ContractCallRequest (no kind) to contractCall', () => {
    const result = normalizeResolvedAction(legacyContractCallFixture);
    expect(result.kind).toBe('contractCall');
    expect((result as { type: string }).type).toBe('CONTRACT_CALL');
  });

  it('passes through signedData unchanged', () => {
    const result = normalizeResolvedAction(signedDataFixture);
    expect(result.kind).toBe('signedData');
  });

  it('passes through signedHttp unchanged', () => {
    const result = normalizeResolvedAction(signedHttpFixture);
    expect(result.kind).toBe('signedHttp');
  });

  it('passes through contractCall with kind unchanged', () => {
    const result = normalizeResolvedAction(contractCallFixture);
    expect(result.kind).toBe('contractCall');
  });

  it('throws for empty object', () => {
    expect(() => normalizeResolvedAction({})).toThrow(
      'normalizeResolvedAction: input must have kind field or type=CONTRACT_CALL',
    );
  });

  it('throws for null', () => {
    expect(() => normalizeResolvedAction(null)).toThrow(
      'normalizeResolvedAction: input must be an object',
    );
  });

  it('throws for wrong type value', () => {
    expect(() => normalizeResolvedAction({ type: 'TRANSFER', to: '0x...' })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// normalizeResolvedActions (array helper)
// ---------------------------------------------------------------------------

describe('normalizeResolvedActions', () => {
  it('normalizes array of mixed items', () => {
    const results = normalizeResolvedActions([
      legacyContractCallFixture,
      signedDataFixture,
      signedHttpFixture,
    ]);
    expect(results).toHaveLength(3);
    expect(results[0].kind).toBe('contractCall');
    expect(results[1].kind).toBe('signedData');
    expect(results[2].kind).toBe('signedHttp');
  });

  it('wraps single item in array', () => {
    const results = normalizeResolvedActions(signedDataFixture);
    expect(results).toHaveLength(1);
    expect(results[0].kind).toBe('signedData');
  });
});
