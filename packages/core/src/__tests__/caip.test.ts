import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  Caip2Schema,
  Caip19Schema,
  Caip19AssetTypeSchema,
  parseCaip2,
  formatCaip2,
  parseCaip19,
  formatCaip19,
  CAIP2_TO_NETWORK,
  NETWORK_TO_CAIP2,
  networkToCaip2,
  caip2ToNetwork,
  nativeAssetId,
  tokenAssetId,
  isNativeAsset,
} from '../caip/index.js';
import { NETWORK_TYPES, CHAIN_TYPES } from '../enums/chain.js';

// ─── CAIP-2 (Chain ID) ──────────────────────────────────────────

describe('Caip2Schema validation', () => {
  it('accepts eip155:1', () => {
    expect(Caip2Schema.parse('eip155:1')).toBe('eip155:1');
  });

  it('accepts solana mainnet chain ID', () => {
    expect(Caip2Schema.parse('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')).toBe(
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    );
  });

  it('accepts eip155:11155111 (Sepolia)', () => {
    expect(Caip2Schema.parse('eip155:11155111')).toBe('eip155:11155111');
  });

  it('accepts eip155:137 (Polygon)', () => {
    expect(Caip2Schema.parse('eip155:137')).toBe('eip155:137');
  });

  it('accepts underscore in reference (starknet:SN_GOERLI)', () => {
    expect(Caip2Schema.parse('starknet:SN_GOERLI')).toBe('starknet:SN_GOERLI');
  });

  it('rejects empty string', () => {
    expect(() => Caip2Schema.parse('')).toThrow(ZodError);
  });

  it('rejects string without colon', () => {
    expect(() => Caip2Schema.parse('eip155')).toThrow(ZodError);
  });

  it('rejects namespace longer than 8 chars', () => {
    expect(() => Caip2Schema.parse('toolongns:1')).toThrow(ZodError);
  });

  it('rejects namespace with uppercase', () => {
    expect(() => Caip2Schema.parse('EIP155:1')).toThrow(ZodError);
  });

  it('rejects reference longer than 32 chars', () => {
    const longRef = 'a'.repeat(33);
    expect(() => Caip2Schema.parse(`eip155:${longRef}`)).toThrow(ZodError);
  });

  it('rejects special chars not in [-_a-zA-Z0-9]', () => {
    expect(() => Caip2Schema.parse('eip155:abc@def')).toThrow(ZodError);
  });
});

describe('parseCaip2()', () => {
  it('parses eip155:1', () => {
    expect(parseCaip2('eip155:1')).toEqual({
      namespace: 'eip155',
      reference: '1',
    });
  });

  it('parses solana mainnet chain ID', () => {
    expect(parseCaip2('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')).toEqual({
      namespace: 'solana',
      reference: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    });
  });

  it('parses eip155:11155111 (Sepolia)', () => {
    expect(parseCaip2('eip155:11155111')).toEqual({
      namespace: 'eip155',
      reference: '11155111',
    });
  });

  it('throws ZodError for string without colon', () => {
    expect(() => parseCaip2('eip155')).toThrow(ZodError);
  });

  it('throws ZodError for empty string', () => {
    expect(() => parseCaip2('')).toThrow(ZodError);
  });
});

describe('formatCaip2()', () => {
  it('formats eip155:1', () => {
    expect(formatCaip2('eip155', '1')).toBe('eip155:1');
  });

  it('formats solana mainnet chain ID', () => {
    expect(formatCaip2('solana', '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')).toBe(
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
    );
  });

  it('throws ZodError for invalid namespace (uppercase)', () => {
    expect(() => formatCaip2('INVALID', '1')).toThrow(ZodError);
  });

  it('throws ZodError for empty reference', () => {
    expect(() => formatCaip2('eip155', '')).toThrow(ZodError);
  });
});

describe('CAIP-2 roundtrip', () => {
  it('parseCaip2(formatCaip2(...)) identity for eip155:1', () => {
    const result = parseCaip2(formatCaip2('eip155', '1'));
    expect(result).toEqual({ namespace: 'eip155', reference: '1' });
  });

  it('format(parse(...)) identity for solana chain ID', () => {
    const original = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
    const parsed = parseCaip2(original);
    expect(formatCaip2(parsed.namespace, parsed.reference)).toBe(original);
  });
});

// ─── CAIP-19 (Asset Type) ───────────────────────────────────────

describe('Caip19Schema / Caip19AssetTypeSchema validation', () => {
  it('Caip19Schema is same reference as Caip19AssetTypeSchema', () => {
    expect(Caip19Schema).toBe(Caip19AssetTypeSchema);
  });

  it('accepts eip155:1/slip44:60', () => {
    expect(Caip19Schema.parse('eip155:1/slip44:60')).toBe('eip155:1/slip44:60');
  });

  it('accepts ERC-20 USDC asset type', () => {
    const uri = 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
    expect(Caip19Schema.parse(uri)).toBe(uri);
  });

  it('accepts solana slip44:501', () => {
    const uri = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501';
    expect(Caip19Schema.parse(uri)).toBe(uri);
  });

  it('accepts solana SPL token', () => {
    const uri =
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    expect(Caip19Schema.parse(uri)).toBe(uri);
  });

  it('accepts asset reference with . and % characters', () => {
    const uri = 'eip155:1/erc20:token.name%20encoded';
    expect(Caip19Schema.parse(uri)).toBe(uri);
  });

  it('rejects empty string', () => {
    expect(() => Caip19Schema.parse('')).toThrow(ZodError);
  });

  it('rejects string without slash (missing asset part)', () => {
    expect(() => Caip19Schema.parse('eip155:1')).toThrow(ZodError);
  });

  it('rejects asset reference longer than 128 chars', () => {
    const longRef = 'a'.repeat(129);
    expect(() => Caip19Schema.parse(`eip155:1/erc20:${longRef}`)).toThrow(
      ZodError,
    );
  });
});

describe('parseCaip19()', () => {
  it('parses eip155:1/slip44:60', () => {
    expect(parseCaip19('eip155:1/slip44:60')).toEqual({
      chainId: 'eip155:1',
      assetNamespace: 'slip44',
      assetReference: '60',
    });
  });

  it('parses ERC-20 USDC asset type', () => {
    expect(
      parseCaip19(
        'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      ),
    ).toEqual({
      chainId: 'eip155:1',
      assetNamespace: 'erc20',
      assetReference: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    });
  });

  it('parses Solana SPL token', () => {
    expect(
      parseCaip19(
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      ),
    ).toEqual({
      chainId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      assetNamespace: 'token',
      assetReference: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    });
  });

  it('throws ZodError for chain ID only (missing asset part)', () => {
    expect(() => parseCaip19('eip155:1')).toThrow(ZodError);
  });

  it('throws ZodError for empty string', () => {
    expect(() => parseCaip19('')).toThrow(ZodError);
  });
});

describe('formatCaip19()', () => {
  it('formats eip155:1/slip44:60', () => {
    expect(formatCaip19('eip155:1', 'slip44', '60')).toBe(
      'eip155:1/slip44:60',
    );
  });

  it('formats ERC-20 USDC asset type', () => {
    expect(
      formatCaip19(
        'eip155:1',
        'erc20',
        '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      ),
    ).toBe('eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48');
  });

  it('throws ZodError for invalid chain ID component', () => {
    expect(() => formatCaip19('INVALID', 'erc20', '0xabc')).toThrow(ZodError);
  });

  it('throws ZodError for invalid asset namespace (uppercase)', () => {
    expect(() => formatCaip19('eip155:1', 'ERC20', '0xabc')).toThrow(ZodError);
  });
});

describe('CAIP-19 roundtrip', () => {
  it('parseCaip19(formatCaip19(...)) identity for EVM token', () => {
    const chainId = 'eip155:1';
    const ns = 'erc20';
    const ref = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
    const result = parseCaip19(formatCaip19(chainId, ns, ref));
    expect(result).toEqual({
      chainId,
      assetNamespace: ns,
      assetReference: ref,
    });
  });

  it('parseCaip19(formatCaip19(...)) identity for Solana token', () => {
    const chainId = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
    const ns = 'token';
    const ref = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const result = parseCaip19(formatCaip19(chainId, ns, ref));
    expect(result).toEqual({
      chainId,
      assetNamespace: ns,
      assetReference: ref,
    });
  });
});

// ─── Network Map (CAIP-2 <-> NetworkType) ───────────────────────

describe('CAIP2_TO_NETWORK / NETWORK_TO_CAIP2 maps', () => {
  it('CAIP2_TO_NETWORK has 13 entries', () => {
    expect(Object.keys(CAIP2_TO_NETWORK)).toHaveLength(13);
  });

  it('NETWORK_TO_CAIP2 has 13 entries', () => {
    expect(Object.keys(NETWORK_TO_CAIP2)).toHaveLength(13);
  });

  it('every value maps to valid ChainType and NetworkType', () => {
    for (const [, { chain, network }] of Object.entries(CAIP2_TO_NETWORK)) {
      expect((CHAIN_TYPES as readonly string[]).includes(chain)).toBe(true);
      expect((NETWORK_TYPES as readonly string[]).includes(network)).toBe(true);
    }
  });

  it('has 10 EVM entries and 3 Solana entries', () => {
    const evmEntries = Object.keys(CAIP2_TO_NETWORK).filter((k) => k.startsWith('eip155:'));
    const solanaEntries = Object.keys(CAIP2_TO_NETWORK).filter((k) => k.startsWith('solana:'));
    expect(evmEntries).toHaveLength(10);
    expect(solanaEntries).toHaveLength(3);
  });

  it('bidirectional roundtrip consistency', () => {
    for (const [caip2, { network }] of Object.entries(CAIP2_TO_NETWORK)) {
      expect(NETWORK_TO_CAIP2[network]).toBe(caip2);
    }
  });
});

describe('networkToCaip2()', () => {
  it('returns eip155:1 for ethereum-mainnet', () => {
    expect(networkToCaip2('ethereum-mainnet')).toBe('eip155:1');
  });

  it('returns solana mainnet chain ID for mainnet', () => {
    expect(networkToCaip2('mainnet')).toBe('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
  });

  it('all 13 NetworkType values resolve without error', () => {
    for (const network of NETWORK_TYPES) {
      expect(() => networkToCaip2(network)).not.toThrow();
    }
  });

  it('throws for unknown network string', () => {
    expect(() => networkToCaip2('unknown-net' as any)).toThrow('Unknown network');
  });
});

describe('caip2ToNetwork()', () => {
  it('returns { chain: ethereum, network: ethereum-mainnet } for eip155:1', () => {
    expect(caip2ToNetwork('eip155:1')).toEqual({
      chain: 'ethereum',
      network: 'ethereum-mainnet',
    });
  });

  it('returns { chain: solana, network: mainnet } for solana mainnet chain ID', () => {
    expect(caip2ToNetwork('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')).toEqual({
      chain: 'solana',
      network: 'mainnet',
    });
  });

  it('throws for unknown CAIP-2 string', () => {
    expect(() => caip2ToNetwork('eip155:999')).toThrow('Unknown CAIP-2 chain ID');
  });
});

// ─── Asset Helpers ──────────────────────────────────────────────

describe('nativeAssetId()', () => {
  it('returns eip155:1/slip44:60 for ethereum-mainnet', () => {
    expect(nativeAssetId('ethereum-mainnet')).toBe('eip155:1/slip44:60');
  });

  it('returns eip155:137/slip44:966 for polygon-mainnet (NOT 60!)', () => {
    expect(nativeAssetId('polygon-mainnet')).toBe('eip155:137/slip44:966');
  });

  it('returns eip155:80002/slip44:966 for polygon-amoy', () => {
    expect(nativeAssetId('polygon-amoy')).toBe('eip155:80002/slip44:966');
  });

  it('returns solana mainnet native asset for mainnet', () => {
    expect(nativeAssetId('mainnet')).toBe(
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501',
    );
  });

  it('returns eip155:8453/slip44:60 for base-mainnet', () => {
    expect(nativeAssetId('base-mainnet')).toBe('eip155:8453/slip44:60');
  });

  it('all 13 native asset IDs are valid CAIP-19 strings', () => {
    for (const network of NETWORK_TYPES) {
      const assetId = nativeAssetId(network);
      expect(() => Caip19Schema.parse(assetId)).not.toThrow();
    }
  });
});

describe('tokenAssetId()', () => {
  it('lowercases EVM address and uses erc20 namespace', () => {
    const result = tokenAssetId(
      'ethereum-mainnet',
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    );
    expect(result).toBe(
      'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    );
  });

  it('preserves Solana base58 case and uses token namespace', () => {
    const result = tokenAssetId(
      'mainnet',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    );
    expect(result).toBe(
      'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    );
  });

  it('lowercases Polygon EVM address', () => {
    const result = tokenAssetId(
      'polygon-mainnet',
      '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
    );
    expect(result).toBe(
      'eip155:137/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
    );
  });

  it('all token asset IDs are valid CAIP-19 strings', () => {
    const evmAddr = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
    const solAddr = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    for (const network of NETWORK_TYPES) {
      const addr = ['mainnet', 'devnet', 'testnet'].includes(network) ? solAddr : evmAddr;
      const assetId = tokenAssetId(network, addr);
      expect(() => Caip19Schema.parse(assetId)).not.toThrow();
    }
  });

  it('already-lowercase EVM address produces same result (idempotent)', () => {
    const lower = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
    const mixed = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    expect(tokenAssetId('ethereum-mainnet', lower)).toBe(
      tokenAssetId('ethereum-mainnet', mixed),
    );
  });
});

describe('isNativeAsset()', () => {
  it('returns true for ETH native asset', () => {
    expect(isNativeAsset('eip155:1/slip44:60')).toBe(true);
  });

  it('returns true for SOL native asset', () => {
    expect(isNativeAsset('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501')).toBe(true);
  });

  it('returns false for ERC-20 token', () => {
    expect(
      isNativeAsset('eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'),
    ).toBe(false);
  });

  it('returns false for Solana SPL token', () => {
    expect(
      isNativeAsset(
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      ),
    ).toBe(false);
  });
});
