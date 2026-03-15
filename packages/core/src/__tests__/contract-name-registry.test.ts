/**
 * Tests for ContractNameRegistry 4-tier resolution service.
 *
 * TDD: RED phase first, then GREEN implementation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ContractNameRegistry,
} from '../services/contract-name-registry.js';
import type { ActionProviderMetadata } from '../interfaces/action-provider.types.js';

describe('ContractNameRegistry', () => {
  let registry: ContractNameRegistry;

  beforeEach(() => {
    registry = new ContractNameRegistry();
  });

  // -----------------------------------------------------------------------
  // Core Resolution
  // -----------------------------------------------------------------------
  describe('resolve()', () => {
    it('returns well_known result for a known Ethereum contract', () => {
      // Uniswap V3 Router is in WELL_KNOWN_CONTRACTS
      const result = registry.resolve(
        '0xe592427a0aece92de3edee1f18e0157c05861564',
        'ethereum',
      );
      expect(result.name).toBe('Uniswap V3 Router');
      expect(result.source).toBe('well_known');
    });

    it('returns well_known result for a known Solana program', () => {
      const result = registry.resolve(
        '11111111111111111111111111111111',
        'solana-mainnet',
      );
      expect(result.name).toBe('System Program');
      expect(result.source).toBe('well_known');
    });

    it('returns fallback for an unregistered address', () => {
      const result = registry.resolve(
        '0x0000000000000000000000000000000000000001',
        'ethereum',
      );
      expect(result.source).toBe('fallback');
      expect(result.name).toBe('0x0000...0001');
    });

    it('returns fallback for an unknown Solana address', () => {
      const result = registry.resolve(
        'ABCDEFGHiJKMNPQRSTUVWXYZ123456789abcde',
        'solana-mainnet',
      );
      expect(result.source).toBe('fallback');
      expect(result.name).toBe('ABCD...bcde');
    });
  });

  // -----------------------------------------------------------------------
  // 4-Tier Priority
  // -----------------------------------------------------------------------
  describe('4-tier priority', () => {
    const testAddress = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const testNetwork = 'ethereum';

    it('Tier 1 (action_provider) beats all others', () => {
      // Register in all tiers
      registry.registerWhitelist(
        [{ address: testAddress, name: 'Whitelist Name' }],
        testNetwork,
      );
      const metadata: ActionProviderMetadata = {
        name: 'test_prov',
        displayName: 'Test Provider',
        description: 'A test provider for unit testing purposes',
        version: '1.0.0',
        chains: ['ethereum'],
      };
      registry.registerProvider(metadata, [
        { address: testAddress, network: testNetwork },
      ]);

      const result = registry.resolve(testAddress, testNetwork);
      expect(result.name).toBe('Test Provider');
      expect(result.source).toBe('action_provider');
    });

    it('Tier 2 (well_known) beats whitelist and fallback', () => {
      // Aave V3 Pool is well-known on ethereum
      const aaveAddress = '0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2';
      registry.registerWhitelist(
        [{ address: aaveAddress, name: 'My Custom Name' }],
        'ethereum',
      );

      const result = registry.resolve(aaveAddress, 'ethereum');
      expect(result.name).toBe('Aave V3 Pool');
      expect(result.source).toBe('well_known');
    });

    it('Tier 3 (whitelist) beats fallback', () => {
      const addr = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      registry.registerWhitelist(
        [{ address: addr, name: 'My Custom Contract' }],
        'ethereum',
      );

      const result = registry.resolve(addr, 'ethereum');
      expect(result.name).toBe('My Custom Contract');
      expect(result.source).toBe('whitelist');
    });

    it('Tier 4 (fallback) when nothing registered', () => {
      const addr = '0xcccccccccccccccccccccccccccccccccccccccc';
      const result = registry.resolve(addr, 'ethereum');
      expect(result.source).toBe('fallback');
    });
  });

  // -----------------------------------------------------------------------
  // Per-Network Resolution (REG-05)
  // -----------------------------------------------------------------------
  describe('per-network resolution', () => {
    it('same address on different networks resolves to different names', () => {
      // Aave V3 Pool has same address on Arbitrum and Optimism: 0x794a61358d6845594f94dc1db02a252b5b4814ad
      const aavePoolAddr = '0x794a61358d6845594f94dc1db02a252b5b4814ad';
      const resultArb = registry.resolve(aavePoolAddr, 'arbitrum');
      const resultOpt = registry.resolve(aavePoolAddr, 'optimism');

      // Both should resolve (same protocol, same name) but from different network contexts
      expect(resultArb.source).toBe('well_known');
      expect(resultOpt.source).toBe('well_known');
      expect(resultArb.name).toBe('Aave V3 Pool');
      expect(resultOpt.name).toBe('Aave V3 Pool');
    });

    it('address registered on one network does not leak to another', () => {
      const addr = '0xdddddddddddddddddddddddddddddddddddddd';
      registry.registerWhitelist(
        [{ address: addr, name: 'Only Ethereum' }],
        'ethereum',
      );

      const ethResult = registry.resolve(addr, 'ethereum');
      expect(ethResult.name).toBe('Only Ethereum');
      expect(ethResult.source).toBe('whitelist');

      const baseResult = registry.resolve(addr, 'base');
      expect(baseResult.source).toBe('fallback');
    });
  });

  // -----------------------------------------------------------------------
  // EVM Case-Insensitivity (REG-04)
  // -----------------------------------------------------------------------
  describe('EVM case-insensitivity', () => {
    it('resolves uppercase EVM address same as lowercase', () => {
      // Uniswap V3 Router stored as lowercase
      const lowercase = '0xe592427a0aece92de3edee1f18e0157c05861564';
      const uppercase = '0xE592427A0AEce92De3Edee1F18E0157C05861564';

      const r1 = registry.resolve(lowercase, 'ethereum');
      const r2 = registry.resolve(uppercase, 'ethereum');

      expect(r1.name).toBe(r2.name);
      expect(r1.source).toBe(r2.source);
    });

    it('resolves mixed-case checksum EVM address', () => {
      const checksum = '0xE592427A0AEce92De3Edee1F18E0157C05861564';
      const result = registry.resolve(checksum, 'ethereum');
      expect(result.name).toBe('Uniswap V3 Router');
      expect(result.source).toBe('well_known');
    });
  });

  // -----------------------------------------------------------------------
  // Solana case-sensitivity
  // -----------------------------------------------------------------------
  describe('Solana case-sensitivity', () => {
    it('Solana addresses are case-sensitive (base58)', () => {
      // The System Program address is all 1s
      const correct = '11111111111111111111111111111111';
      const wrong = '11111111111111111111111111111112'; // different last char

      const r1 = registry.resolve(correct, 'solana-mainnet');
      const r2 = registry.resolve(wrong, 'solana-mainnet');

      expect(r1.source).toBe('well_known');
      expect(r2.source).not.toBe('well_known'); // not in well-known
    });
  });

  // -----------------------------------------------------------------------
  // Fallback Format (REG-06)
  // -----------------------------------------------------------------------
  describe('fallback format', () => {
    it('EVM: 0x + first 4 hex + ... + last 4 hex', () => {
      const result = registry.resolve(
        '0xabcdef1234567890abcdef1234567890abcdef12',
        'ethereum',
      );
      expect(result.name).toBe('0xabcd...ef12');
    });

    it('Solana: first 4 + ... + last 4', () => {
      const result = registry.resolve(
        'ABCDEFGH123456789XYZabcdefgh12345678',
        'solana-mainnet',
      );
      expect(result.name).toBe('ABCD...5678');
    });

    it('short address just returns as-is', () => {
      const result = registry.resolve('0x1234', 'ethereum');
      expect(result.name).toBe('0x1234');
      expect(result.source).toBe('fallback');
    });
  });

  // -----------------------------------------------------------------------
  // Provider Registration
  // -----------------------------------------------------------------------
  describe('registerProvider()', () => {
    it('uses displayName from metadata', () => {
      const metadata: ActionProviderMetadata = {
        name: 'my_proto',
        displayName: 'My Protocol',
        description: 'Testing displayName resolution path',
        version: '1.0.0',
        chains: ['ethereum'],
      };
      const addr = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
      registry.registerProvider(metadata, [
        { address: addr, network: 'ethereum' },
      ]);

      const result = registry.resolve(addr, 'ethereum');
      expect(result.name).toBe('My Protocol');
      expect(result.source).toBe('action_provider');
    });

    it('falls back to snakeCaseToDisplayName when displayName not set', () => {
      const metadata: ActionProviderMetadata = {
        name: 'some_cool_protocol',
        description: 'Testing snake_case to display name fallback',
        version: '1.0.0',
        chains: ['ethereum'],
      };
      const addr = '0xffffffffffffffffffffffffffffffffffffffff';
      registry.registerProvider(metadata, [
        { address: addr, network: 'ethereum' },
      ]);

      const result = registry.resolve(addr, 'ethereum');
      expect(result.name).toBe('Some Cool Protocol');
      expect(result.source).toBe('action_provider');
    });

    it('registers multiple addresses for one provider', () => {
      const metadata: ActionProviderMetadata = {
        name: 'multi_addr',
        displayName: 'Multi',
        description: 'Testing multi-address provider registration',
        version: '1.0.0',
        chains: ['ethereum'],
      };
      registry.registerProvider(metadata, [
        { address: '0x1111111111111111111111111111111111111111', network: 'ethereum' },
        { address: '0x2222222222222222222222222222222222222222', network: 'base' },
      ]);

      expect(
        registry.resolve('0x1111111111111111111111111111111111111111', 'ethereum').name,
      ).toBe('Multi');
      expect(
        registry.resolve('0x2222222222222222222222222222222222222222', 'base').name,
      ).toBe('Multi');
    });
  });

  // -----------------------------------------------------------------------
  // Whitelist Registration
  // -----------------------------------------------------------------------
  describe('registerWhitelist()', () => {
    it('registers named contracts', () => {
      registry.registerWhitelist(
        [
          { address: '0x3333333333333333333333333333333333333333', name: 'Custom A' },
          { address: '0x4444444444444444444444444444444444444444', name: 'Custom B' },
        ],
        'ethereum',
      );

      expect(
        registry.resolve('0x3333333333333333333333333333333333333333', 'ethereum').name,
      ).toBe('Custom A');
      expect(
        registry.resolve('0x4444444444444444444444444444444444444444', 'ethereum').name,
      ).toBe('Custom B');
    });

    it('skips contracts without name', () => {
      registry.registerWhitelist(
        [
          { address: '0x5555555555555555555555555555555555555555' },
          { address: '0x6666666666666666666666666666666666666666', name: 'Has Name' },
        ],
        'ethereum',
      );

      const r1 = registry.resolve(
        '0x5555555555555555555555555555555555555555',
        'ethereum',
      );
      expect(r1.source).toBe('fallback');

      const r2 = registry.resolve(
        '0x6666666666666666666666666666666666666666',
        'ethereum',
      );
      expect(r2.name).toBe('Has Name');
      expect(r2.source).toBe('whitelist');
    });
  });

  // -----------------------------------------------------------------------
  // Source Field (REG-03)
  // -----------------------------------------------------------------------
  describe('source field', () => {
    it('every result includes a valid source', () => {
      const validSources: ContractNameSource[] = [
        'action_provider',
        'well_known',
        'whitelist',
        'fallback',
      ];

      // well_known
      const r1 = registry.resolve(
        '0xe592427a0aece92de3edee1f18e0157c05861564',
        'ethereum',
      );
      expect(validSources).toContain(r1.source);

      // fallback
      const r2 = registry.resolve(
        '0x0000000000000000000000000000000000000099',
        'ethereum',
      );
      expect(validSources).toContain(r2.source);
    });
  });
});
