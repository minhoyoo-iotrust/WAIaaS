/**
 * Unit tests for Aave V3 manual hex ABI encoding, config, and Zod schemas.
 *
 * Covers: AAVE_SELECTORS, encode* functions, AAVE_V3_ADDRESSES, getAaveAddresses, input schemas.
 */
import { describe, expect, it } from 'vitest';
import {
  AAVE_SELECTORS,
  MAX_UINT256,
  encodeSupplyCalldata,
  encodeBorrowCalldata,
  encodeRepayCalldata,
  encodeWithdrawCalldata,
  encodeApproveCalldata,
  encodeGetUserAccountDataCalldata,
  encodeGetReserveDataCalldata,
} from '../providers/aave-v3/aave-contracts.js';
import {
  AAVE_V3_ADDRESSES,
  AAVE_V3_DEFAULTS,
  AAVE_CHAIN_ID_MAP,
  getAaveAddresses,
} from '../providers/aave-v3/config.js';
import {
  AaveSupplyInputSchema,
  AaveBorrowInputSchema,
  AaveRepayInputSchema,
  AaveWithdrawInputSchema,
} from '../providers/aave-v3/schemas.js';

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------

const TEST_ASSET = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC
const TEST_USER = '0x1234567890123456789012345678901234567890';
const TEST_SPENDER = '0xABCDEF0123456789ABCDEF0123456789ABCDEF01';

// ---------------------------------------------------------------------------
// AAVE_SELECTORS
// ---------------------------------------------------------------------------

describe('AAVE_SELECTORS', () => {
  it('should have correct length (0x + 8 hex chars = 10)', () => {
    for (const [name, selector] of Object.entries(AAVE_SELECTORS)) {
      expect(selector).toMatch(/^0x[0-9a-f]{8}$/);
    }
  });

  it('should have correct supply selector', () => {
    expect(AAVE_SELECTORS.supply).toBe('0x617ba037');
  });

  it('should have correct borrow selector', () => {
    expect(AAVE_SELECTORS.borrow).toBe('0xa415bcad');
  });

  it('should have correct repay selector', () => {
    expect(AAVE_SELECTORS.repay).toBe('0x573ade81');
  });

  it('should have correct withdraw selector', () => {
    expect(AAVE_SELECTORS.withdraw).toBe('0x69328dec');
  });

  it('should have correct approve selector', () => {
    expect(AAVE_SELECTORS.approve).toBe('0x095ea7b3');
  });

  it('should have correct getUserAccountData selector', () => {
    expect(AAVE_SELECTORS.getUserAccountData).toBe('0xbf92857c');
  });

  it('should have correct getReserveData selector', () => {
    expect(AAVE_SELECTORS.getReserveData).toBe('0x35ea6a75');
  });
});

// ---------------------------------------------------------------------------
// MAX_UINT256
// ---------------------------------------------------------------------------

describe('MAX_UINT256', () => {
  it('should be 2^256 - 1', () => {
    expect(MAX_UINT256).toBe((1n << 256n) - 1n);
  });

  it('should produce 64 f chars when hex encoded', () => {
    const hex = MAX_UINT256.toString(16);
    expect(hex).toBe('f'.repeat(64));
  });
});

// ---------------------------------------------------------------------------
// encodeSupplyCalldata
// ---------------------------------------------------------------------------

describe('encodeSupplyCalldata', () => {
  it('should start with supply selector', () => {
    const calldata = encodeSupplyCalldata(TEST_ASSET, 1000000n, TEST_USER);
    expect(calldata.startsWith('0x617ba037')).toBe(true);
  });

  it('should encode amount correctly (1e18)', () => {
    const amount = 10n ** 18n; // 1 token with 18 decimals
    const calldata = encodeSupplyCalldata(TEST_ASSET, amount, TEST_USER);
    // Amount is the second 32-byte word (chars 10 + 64 to 10 + 128)
    const amountHex = calldata.slice(10 + 64, 10 + 128);
    expect(BigInt('0x' + amountHex)).toBe(amount);
  });

  it('should default referralCode to 0', () => {
    const calldata = encodeSupplyCalldata(TEST_ASSET, 1000000n, TEST_USER);
    // referralCode is the 4th 32-byte word (chars 10 + 192 to 10 + 256)
    const referralHex = calldata.slice(10 + 192, 10 + 256);
    expect(BigInt('0x' + referralHex)).toBe(0n);
  });

  it('should include onBehalfOf address', () => {
    const calldata = encodeSupplyCalldata(TEST_ASSET, 1000000n, TEST_USER);
    // onBehalfOf is the 3rd 32-byte word (chars 10 + 128 to 10 + 192)
    const onBehalfOfHex = calldata.slice(10 + 128, 10 + 192);
    expect(onBehalfOfHex.toLowerCase()).toContain(TEST_USER.slice(2).toLowerCase());
  });

  it('should produce correct total length (10 + 4 * 64 = 266)', () => {
    const calldata = encodeSupplyCalldata(TEST_ASSET, 1000000n, TEST_USER);
    expect(calldata.length).toBe(10 + 4 * 64); // 0x + selector(8) + 4 params * 64
  });
});

// ---------------------------------------------------------------------------
// encodeBorrowCalldata
// ---------------------------------------------------------------------------

describe('encodeBorrowCalldata', () => {
  it('should start with borrow selector', () => {
    const calldata = encodeBorrowCalldata(TEST_ASSET, 1000000n, TEST_USER);
    expect(calldata.startsWith('0xa415bcad')).toBe(true);
  });

  it('should default interestRateMode to 2 (variable)', () => {
    const calldata = encodeBorrowCalldata(TEST_ASSET, 1000000n, TEST_USER);
    // interestRateMode is the 3rd 32-byte word (chars 10 + 128 to 10 + 192)
    const rateHex = calldata.slice(10 + 128, 10 + 192);
    expect(BigInt('0x' + rateHex)).toBe(2n);
  });

  it('should encode parameter order: asset, amount, interestRateMode, referralCode, onBehalfOf', () => {
    const amount = 50_000_000n;
    const calldata = encodeBorrowCalldata(TEST_ASSET, amount, TEST_USER, 2n, 0);

    // Extract each word
    const assetHex = calldata.slice(10, 10 + 64);
    const amountHex = calldata.slice(10 + 64, 10 + 128);
    const rateHex = calldata.slice(10 + 128, 10 + 192);
    const referralHex = calldata.slice(10 + 192, 10 + 256);
    const onBehalfHex = calldata.slice(10 + 256, 10 + 320);

    expect(assetHex.toLowerCase()).toContain(TEST_ASSET.slice(2).toLowerCase());
    expect(BigInt('0x' + amountHex)).toBe(amount);
    expect(BigInt('0x' + rateHex)).toBe(2n);
    expect(BigInt('0x' + referralHex)).toBe(0n);
    expect(onBehalfHex.toLowerCase()).toContain(TEST_USER.slice(2).toLowerCase());
  });

  it('should produce correct total length (10 + 5 * 64 = 330)', () => {
    const calldata = encodeBorrowCalldata(TEST_ASSET, 1000000n, TEST_USER);
    expect(calldata.length).toBe(10 + 5 * 64);
  });
});

// ---------------------------------------------------------------------------
// encodeRepayCalldata
// ---------------------------------------------------------------------------

describe('encodeRepayCalldata', () => {
  it('should start with repay selector', () => {
    const calldata = encodeRepayCalldata(TEST_ASSET, 1000000n, TEST_USER);
    expect(calldata.startsWith('0x573ade81')).toBe(true);
  });

  it('should encode MAX_UINT256 for full repay (64 f chars)', () => {
    const calldata = encodeRepayCalldata(TEST_ASSET, MAX_UINT256, TEST_USER);
    // Amount is the 2nd 32-byte word (chars 10 + 64 to 10 + 128)
    const amountHex = calldata.slice(10 + 64, 10 + 128);
    expect(amountHex).toBe('f'.repeat(64));
  });

  it('should produce correct total length (10 + 4 * 64 = 266)', () => {
    const calldata = encodeRepayCalldata(TEST_ASSET, 1000000n, TEST_USER);
    expect(calldata.length).toBe(10 + 4 * 64);
  });
});

// ---------------------------------------------------------------------------
// encodeWithdrawCalldata
// ---------------------------------------------------------------------------

describe('encodeWithdrawCalldata', () => {
  it('should start with withdraw selector', () => {
    const calldata = encodeWithdrawCalldata(TEST_ASSET, 1000000n, TEST_USER);
    expect(calldata.startsWith('0x69328dec')).toBe(true);
  });

  it('should encode MAX_UINT256 for full withdraw (64 f chars)', () => {
    const calldata = encodeWithdrawCalldata(TEST_ASSET, MAX_UINT256, TEST_USER);
    // Amount is the 2nd 32-byte word
    const amountHex = calldata.slice(10 + 64, 10 + 128);
    expect(amountHex).toBe('f'.repeat(64));
  });

  it('should produce correct total length (10 + 3 * 64 = 202)', () => {
    const calldata = encodeWithdrawCalldata(TEST_ASSET, 1000000n, TEST_USER);
    expect(calldata.length).toBe(10 + 3 * 64);
  });
});

// ---------------------------------------------------------------------------
// encodeApproveCalldata
// ---------------------------------------------------------------------------

describe('encodeApproveCalldata', () => {
  it('should start with approve selector', () => {
    const calldata = encodeApproveCalldata(TEST_SPENDER, 1000000n);
    expect(calldata.startsWith('0x095ea7b3')).toBe(true);
  });

  it('should encode spender and amount', () => {
    const amount = 999_999_999n;
    const calldata = encodeApproveCalldata(TEST_SPENDER, amount);
    const spenderHex = calldata.slice(10, 10 + 64);
    const amountHex = calldata.slice(10 + 64, 10 + 128);

    expect(spenderHex.toLowerCase()).toContain(TEST_SPENDER.slice(2).toLowerCase());
    expect(BigInt('0x' + amountHex)).toBe(amount);
  });
});

// ---------------------------------------------------------------------------
// encodeGetUserAccountDataCalldata
// ---------------------------------------------------------------------------

describe('encodeGetUserAccountDataCalldata', () => {
  it('should start with getUserAccountData selector', () => {
    const calldata = encodeGetUserAccountDataCalldata(TEST_USER);
    expect(calldata.startsWith('0xbf92857c')).toBe(true);
  });

  it('should pad address to 32 bytes', () => {
    const calldata = encodeGetUserAccountDataCalldata(TEST_USER);
    // Total length: 10 (0x + 8 selector) + 64 (address) = 74
    expect(calldata.length).toBe(10 + 64);
    const addressHex = calldata.slice(10, 10 + 64);
    expect(addressHex.length).toBe(64);
    expect(addressHex.toLowerCase()).toContain(TEST_USER.slice(2).toLowerCase());
  });
});

// ---------------------------------------------------------------------------
// encodeGetReserveDataCalldata
// ---------------------------------------------------------------------------

describe('encodeGetReserveDataCalldata', () => {
  it('should start with getReserveData selector', () => {
    const calldata = encodeGetReserveDataCalldata(TEST_ASSET);
    expect(calldata.startsWith('0x35ea6a75')).toBe(true);
  });

  it('should have correct total length', () => {
    const calldata = encodeGetReserveDataCalldata(TEST_ASSET);
    expect(calldata.length).toBe(10 + 64);
  });
});

// ---------------------------------------------------------------------------
// AAVE_V3_ADDRESSES
// ---------------------------------------------------------------------------

describe('AAVE_V3_ADDRESSES', () => {
  it('should have exactly 5 chains', () => {
    expect(Object.keys(AAVE_V3_ADDRESSES)).toHaveLength(5);
  });

  it('should contain all required networks', () => {
    const networks = Object.keys(AAVE_V3_ADDRESSES);
    expect(networks).toContain('ethereum-mainnet');
    expect(networks).toContain('arbitrum-mainnet');
    expect(networks).toContain('optimism-mainnet');
    expect(networks).toContain('polygon-mainnet');
    expect(networks).toContain('base-mainnet');
  });

  it('should have Ethereum pool address different from others', () => {
    const ethPool = AAVE_V3_ADDRESSES['ethereum-mainnet'].pool;
    const arbPool = AAVE_V3_ADDRESSES['arbitrum-mainnet'].pool;
    expect(ethPool).not.toBe(arbPool);
  });

  it('should have all addresses starting with 0x', () => {
    for (const [network, addresses] of Object.entries(AAVE_V3_ADDRESSES)) {
      expect(addresses.pool.startsWith('0x')).toBe(true);
      expect(addresses.dataProvider.startsWith('0x')).toBe(true);
      expect(addresses.oracle.startsWith('0x')).toBe(true);
    }
  });

  it('should have correct chain IDs', () => {
    expect(AAVE_V3_ADDRESSES['ethereum-mainnet'].chainId).toBe(1);
    expect(AAVE_V3_ADDRESSES['arbitrum-mainnet'].chainId).toBe(42161);
    expect(AAVE_V3_ADDRESSES['optimism-mainnet'].chainId).toBe(10);
    expect(AAVE_V3_ADDRESSES['polygon-mainnet'].chainId).toBe(137);
    expect(AAVE_V3_ADDRESSES['base-mainnet'].chainId).toBe(8453);
  });
});

// ---------------------------------------------------------------------------
// AAVE_CHAIN_ID_MAP
// ---------------------------------------------------------------------------

describe('AAVE_CHAIN_ID_MAP', () => {
  it('should have 5 entries', () => {
    expect(Object.keys(AAVE_CHAIN_ID_MAP)).toHaveLength(5);
  });

  it('should map ethereum-mainnet to 1', () => {
    expect(AAVE_CHAIN_ID_MAP['ethereum-mainnet']).toBe(1);
  });

  it('should map base-mainnet to 8453', () => {
    expect(AAVE_CHAIN_ID_MAP['base-mainnet']).toBe(8453);
  });
});

// ---------------------------------------------------------------------------
// AAVE_V3_DEFAULTS
// ---------------------------------------------------------------------------

describe('AAVE_V3_DEFAULTS', () => {
  it('should default to disabled', () => {
    expect(AAVE_V3_DEFAULTS.enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getAaveAddresses
// ---------------------------------------------------------------------------

describe('getAaveAddresses', () => {
  it('should return addresses for valid network', () => {
    const addresses = getAaveAddresses('ethereum-mainnet');
    expect(addresses.pool).toBe('0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2');
    expect(addresses.chainId).toBe(1);
  });

  it('should return different pool for base-mainnet', () => {
    const addresses = getAaveAddresses('base-mainnet');
    expect(addresses.pool).toBe('0xA238Dd80C259a72e81d7e4664a9801593F98d1c5');
    expect(addresses.chainId).toBe(8453);
  });

  it('should throw for invalid network', () => {
    expect(() => getAaveAddresses('solana-mainnet')).toThrow('Unsupported network');
  });
});

// ---------------------------------------------------------------------------
// Zod input schemas
// ---------------------------------------------------------------------------

describe('Zod input schemas', () => {
  describe('AaveSupplyInputSchema', () => {
    it('should accept valid input', () => {
      const result = AaveSupplyInputSchema.parse({
        asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        amount: '100.5',
      });
      expect(result.asset).toBeTruthy();
      expect(result.amount).toBe('100.5');
      expect(result.network).toBeUndefined();
    });

    it('should accept input with network', () => {
      const result = AaveSupplyInputSchema.parse({
        asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        amount: '100',
        network: 'base-mainnet',
      });
      expect(result.network).toBe('base-mainnet');
    });

    it('should reject missing asset', () => {
      expect(() => AaveSupplyInputSchema.parse({ amount: '100' })).toThrow();
    });

    it('should reject empty asset', () => {
      expect(() => AaveSupplyInputSchema.parse({ asset: '', amount: '100' })).toThrow();
    });
  });

  describe('AaveRepayInputSchema', () => {
    it('should accept max string literal', () => {
      const result = AaveRepayInputSchema.parse({
        asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        amount: 'max',
      });
      expect(result.amount).toBe('max');
    });

    it('should accept numeric amount', () => {
      const result = AaveRepayInputSchema.parse({
        asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        amount: '50.25',
      });
      expect(result.amount).toBe('50.25');
    });
  });

  describe('AaveWithdrawInputSchema', () => {
    it('should accept max string literal', () => {
      const result = AaveWithdrawInputSchema.parse({
        asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        amount: 'max',
      });
      expect(result.amount).toBe('max');
    });
  });

  describe('AaveBorrowInputSchema', () => {
    it('should accept valid input', () => {
      const result = AaveBorrowInputSchema.parse({
        asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        amount: '1000',
      });
      expect(result.amount).toBe('1000');
    });

    it('should reject empty amount', () => {
      expect(() => AaveBorrowInputSchema.parse({
        asset: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        amount: '',
      })).toThrow();
    });
  });
});
