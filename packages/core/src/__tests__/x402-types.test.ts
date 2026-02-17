import { describe, it, expect } from 'vitest';
import {
  CAIP2_TO_NETWORK,
  NETWORK_TO_CAIP2,
  parseCaip2,
  resolveX402Network,
  X402FetchRequestSchema,
  X402FetchResponseSchema,
  X402PaymentInfoSchema,
  PaymentRequiredV2Schema,
  PaymentPayloadV2Schema,
  PaymentRequirementsV2Schema,
  NETWORK_TYPES,
  CHAIN_TYPES,
} from '../index.js';

describe('CAIP-2 Mapping', () => {
  it('CAIP2_TO_NETWORK has 13 entries', () => {
    expect(Object.keys(CAIP2_TO_NETWORK)).toHaveLength(13);
  });

  it('NETWORK_TO_CAIP2 has 13 entries', () => {
    expect(Object.keys(NETWORK_TO_CAIP2)).toHaveLength(13);
  });

  it('every CAIP-2 entry maps to a valid NetworkType', () => {
    for (const [, { network }] of Object.entries(CAIP2_TO_NETWORK)) {
      expect((NETWORK_TYPES as readonly string[]).includes(network)).toBe(true);
    }
  });

  it('every CAIP-2 entry maps to a valid ChainType', () => {
    for (const [, { chain }] of Object.entries(CAIP2_TO_NETWORK)) {
      expect((CHAIN_TYPES as readonly string[]).includes(chain)).toBe(true);
    }
  });

  it('has 10 EVM entries and 3 Solana entries', () => {
    const evmEntries = Object.keys(CAIP2_TO_NETWORK).filter((k) => k.startsWith('eip155:'));
    const solanaEntries = Object.keys(CAIP2_TO_NETWORK).filter((k) => k.startsWith('solana:'));
    expect(evmEntries).toHaveLength(10);
    expect(solanaEntries).toHaveLength(3);
  });

  it('bidirectional mapping consistency (CAIP2 -> Network -> CAIP2 roundtrip)', () => {
    for (const [caip2, { network }] of Object.entries(CAIP2_TO_NETWORK)) {
      const reverseCaip2 = NETWORK_TO_CAIP2[network];
      expect(reverseCaip2).toBe(caip2);
    }
  });
});

describe('resolveX402Network', () => {
  it('returns correct chain+network for known EVM CAIP-2 IDs', () => {
    expect(resolveX402Network('eip155:1')).toEqual({ chain: 'ethereum', network: 'ethereum-mainnet' });
    expect(resolveX402Network('eip155:8453')).toEqual({ chain: 'ethereum', network: 'base-mainnet' });
    expect(resolveX402Network('eip155:84532')).toEqual({ chain: 'ethereum', network: 'base-sepolia' });
  });

  it('returns correct chain+network for known Solana CAIP-2 IDs', () => {
    expect(resolveX402Network('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')).toEqual({ chain: 'solana', network: 'mainnet' });
    expect(resolveX402Network('solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1')).toEqual({ chain: 'solana', network: 'devnet' });
  });

  it('throws for unknown CAIP-2 ID', () => {
    expect(() => resolveX402Network('eip155:999')).toThrow('Unsupported x402 network');
    expect(() => resolveX402Network('bitcoin:mainnet')).toThrow('Unsupported x402 network');
  });
});

describe('parseCaip2', () => {
  it('splits namespace and reference correctly', () => {
    expect(parseCaip2('eip155:1')).toEqual({ namespace: 'eip155', reference: '1' });
    expect(parseCaip2('eip155:11155111')).toEqual({ namespace: 'eip155', reference: '11155111' });
    expect(parseCaip2('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')).toEqual({
      namespace: 'solana',
      reference: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    });
  });

  it('throws for invalid CAIP-2 format (no colon)', () => {
    expect(() => parseCaip2('eip155')).toThrow('Invalid CAIP-2 identifier');
    expect(() => parseCaip2('')).toThrow('Invalid CAIP-2 identifier');
  });
});

describe('X402FetchRequestSchema', () => {
  it('parses valid request', () => {
    const result = X402FetchRequestSchema.parse({
      url: 'https://api.example.com/resource',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"key":"value"}',
    });
    expect(result.url).toBe('https://api.example.com/resource');
    expect(result.method).toBe('POST');
    expect(result.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(result.body).toBe('{"key":"value"}');
  });

  it('defaults method to GET', () => {
    const result = X402FetchRequestSchema.parse({
      url: 'https://api.example.com/resource',
    });
    expect(result.method).toBe('GET');
  });

  it('rejects invalid url', () => {
    expect(() => X402FetchRequestSchema.parse({ url: 'not-a-url' })).toThrow();
  });

  it('headers and body are optional', () => {
    const result = X402FetchRequestSchema.parse({
      url: 'https://api.example.com/resource',
      method: 'GET',
    });
    expect(result.headers).toBeUndefined();
    expect(result.body).toBeUndefined();
  });
});

describe('X402FetchResponseSchema', () => {
  it('parses valid response', () => {
    const result = X402FetchResponseSchema.parse({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"result":"ok"}',
    });
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toBe('application/json');
    expect(result.body).toBe('{"result":"ok"}');
    expect(result.payment).toBeUndefined();
  });

  it('payment is optional', () => {
    const result = X402FetchResponseSchema.safeParse({
      status: 200,
      headers: {},
      body: '',
    });
    expect(result.success).toBe(true);
  });

  it('parses response with payment info', () => {
    const result = X402FetchResponseSchema.parse({
      status: 200,
      headers: {},
      body: '{}',
      payment: {
        amount: '1000000',
        asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        network: 'eip155:8453',
        payTo: '0x1234567890abcdef1234567890abcdef12345678',
        txId: '0xabc123',
      },
    });
    expect(result.payment).toBeDefined();
    expect(result.payment!.amount).toBe('1000000');
    expect(result.payment!.txId).toBe('0xabc123');
  });

  it('payment requires all fields when present', () => {
    const result = X402FetchResponseSchema.safeParse({
      status: 200,
      headers: {},
      body: '{}',
      payment: {
        amount: '1000000',
        // missing asset, network, payTo, txId
      },
    });
    expect(result.success).toBe(false);
  });
});

describe('X402PaymentInfoSchema', () => {
  it('parses valid payment info', () => {
    const result = X402PaymentInfoSchema.parse({
      amount: '500000',
      asset: 'USDC',
      network: 'eip155:8453',
      payTo: '0xdeadbeef',
      txId: '0xtx123',
    });
    expect(result.amount).toBe('500000');
    expect(result.network).toBe('eip155:8453');
  });
});

describe('@x402/core re-exports', () => {
  it('PaymentRequiredV2Schema is exported and functional', () => {
    expect(PaymentRequiredV2Schema).toBeDefined();
    expect(typeof PaymentRequiredV2Schema.parse).toBe('function');
  });

  it('PaymentPayloadV2Schema is exported and functional', () => {
    expect(PaymentPayloadV2Schema).toBeDefined();
    expect(typeof PaymentPayloadV2Schema.parse).toBe('function');
  });

  it('PaymentRequirementsV2Schema is exported and functional', () => {
    expect(PaymentRequirementsV2Schema).toBeDefined();
    expect(typeof PaymentRequirementsV2Schema.parse).toBe('function');
  });
});
