/**
 * Erc8004RegistryClient unit tests.
 *
 * Uses viem encodeFunctionData/decodeFunctionData for calldata
 * round-trip verification. No mocks needed -- pure ABI encoding tests.
 */
import { describe, it, expect } from 'vitest';
import { decodeFunctionData } from 'viem';
import { Erc8004RegistryClient } from '../providers/erc8004/erc8004-registry-client.js';
import { type Erc8004Config, ERC8004_DEFAULTS } from '../providers/erc8004/config.js';
import { IDENTITY_REGISTRY_ABI } from '../providers/erc8004/identity-abi.js';
import { REPUTATION_REGISTRY_ABI } from '../providers/erc8004/reputation-abi.js';
import { VALIDATION_REGISTRY_ABI } from '../providers/erc8004/validation-abi.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_CONFIG: Erc8004Config = {
  ...ERC8004_DEFAULTS,
  enabled: true,
  validationRegistryAddress: '0x1234567890123456789012345678901234567890',
};

const EMPTY_VALIDATION_CONFIG: Erc8004Config = {
  ...ERC8004_DEFAULTS,
  enabled: true,
  validationRegistryAddress: '', // feature-gated
};

function createClient(config = TEST_CONFIG) {
  return new Erc8004RegistryClient(config);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Erc8004RegistryClient', () => {
  describe('getRegistryAddress', () => {
    it('returns identity registry address', () => {
      const client = createClient();
      const addr = client.getRegistryAddress('identity');
      expect(addr).toBe(ERC8004_DEFAULTS.identityRegistryAddress);
    });

    it('returns reputation registry address', () => {
      const client = createClient();
      const addr = client.getRegistryAddress('reputation');
      expect(addr).toBe(ERC8004_DEFAULTS.reputationRegistryAddress);
    });

    it('returns validation registry address when configured', () => {
      const client = createClient();
      const addr = client.getRegistryAddress('validation');
      expect(addr).toBe('0x1234567890123456789012345678901234567890');
    });

    it('throws ChainError when validation address is empty', () => {
      const client = createClient(EMPTY_VALIDATION_CONFIG);
      expect(() => client.getRegistryAddress('validation')).toThrow(
        'Validation Registry not configured',
      );
    });
  });

  describe('Identity Registry encoding', () => {
    it('encodeRegister produces valid calldata', () => {
      const client = createClient();
      const calldata = client.encodeRegister('https://example.com/agent.json');

      expect(calldata).toMatch(/^0x/);

      // Decode to verify correct function and args
      const decoded = decodeFunctionData({
        abi: IDENTITY_REGISTRY_ABI,
        data: calldata,
      });
      expect(decoded.functionName).toBe('register');
      expect(decoded.args?.[0]).toBe('https://example.com/agent.json');
    });

    it('encodeRegisterWithMetadata produces valid calldata', () => {
      const client = createClient();
      const metadata = [
        { key: 'version', value: '1.0.0' },
        { key: 'type', value: 'swap-agent' },
      ];
      const calldata = client.encodeRegisterWithMetadata(
        'https://example.com/agent.json',
        metadata,
      );

      expect(calldata).toMatch(/^0x/);

      const decoded = decodeFunctionData({
        abi: IDENTITY_REGISTRY_ABI,
        data: calldata,
      });
      expect(decoded.functionName).toBe('register');
      // Second arg is the metadata tuple array
      expect(decoded.args).toHaveLength(2);
    });

    it('encodeSetAgentWallet produces valid calldata', () => {
      const client = createClient();
      const calldata = client.encodeSetAgentWallet(
        42n,
        '0x1234567890123456789012345678901234567890',
        1700000000n,
        '0xabcdef',
      );

      expect(calldata).toMatch(/^0x/);

      const decoded = decodeFunctionData({
        abi: IDENTITY_REGISTRY_ABI,
        data: calldata,
      });
      expect(decoded.functionName).toBe('setAgentWallet');
      expect(decoded.args?.[0]).toBe(42n);
    });

    it('encodeUnsetAgentWallet produces valid calldata', () => {
      const client = createClient();
      const calldata = client.encodeUnsetAgentWallet(42n);

      expect(calldata).toMatch(/^0x/);

      const decoded = decodeFunctionData({
        abi: IDENTITY_REGISTRY_ABI,
        data: calldata,
      });
      expect(decoded.functionName).toBe('unsetAgentWallet');
      expect(decoded.args?.[0]).toBe(42n);
    });

    it('encodeSetAgentURI produces valid calldata', () => {
      const client = createClient();
      const calldata = client.encodeSetAgentURI(42n, 'https://new-uri.com/agent.json');

      expect(calldata).toMatch(/^0x/);

      const decoded = decodeFunctionData({
        abi: IDENTITY_REGISTRY_ABI,
        data: calldata,
      });
      expect(decoded.functionName).toBe('setAgentURI');
      expect(decoded.args?.[0]).toBe(42n);
      expect(decoded.args?.[1]).toBe('https://new-uri.com/agent.json');
    });

    it('encodeSetMetadata produces valid calldata with bytes-encoded value', () => {
      const client = createClient();
      const calldata = client.encodeSetMetadata(42n, 'version', '2.0.0');

      expect(calldata).toMatch(/^0x/);

      const decoded = decodeFunctionData({
        abi: IDENTITY_REGISTRY_ABI,
        data: calldata,
      });
      expect(decoded.functionName).toBe('setMetadata');
      expect(decoded.args?.[0]).toBe(42n);
      expect(decoded.args?.[1]).toBe('version');
      // Third arg is bytes-encoded value
      expect(typeof decoded.args?.[2]).toBe('string');
    });
  });

  describe('Reputation Registry encoding', () => {
    it('encodeGiveFeedback produces valid calldata', () => {
      const client = createClient();
      const calldata = client.encodeGiveFeedback(
        42n,
        80n,
        0,
        'swap',
        'speed',
        'https://api.example.com',
        'https://feedback.example.com/1',
        '0x' + '0'.repeat(64) as `0x${string}`,
      );

      expect(calldata).toMatch(/^0x/);

      const decoded = decodeFunctionData({
        abi: REPUTATION_REGISTRY_ABI,
        data: calldata,
      });
      expect(decoded.functionName).toBe('giveFeedback');
      expect(decoded.args?.[0]).toBe(42n); // agentId
      expect(decoded.args?.[1]).toBe(80n); // value
      expect(decoded.args?.[2]).toBe(0);   // valueDecimals
    });

    it('encodeRevokeFeedback produces valid calldata', () => {
      const client = createClient();
      const calldata = client.encodeRevokeFeedback(42n, 3n);

      expect(calldata).toMatch(/^0x/);

      const decoded = decodeFunctionData({
        abi: REPUTATION_REGISTRY_ABI,
        data: calldata,
      });
      expect(decoded.functionName).toBe('revokeFeedback');
      expect(decoded.args?.[0]).toBe(42n);
      expect(decoded.args?.[1]).toBe(3n);
    });
  });

  describe('Validation Registry encoding', () => {
    it('encodeValidationRequest produces valid calldata', () => {
      const client = createClient();
      const calldata = client.encodeValidationRequest(
        '0x1234567890123456789012345678901234567890',
        42n,
        'https://validation.example.com/request/1',
        '0x' + 'ab'.repeat(32) as `0x${string}`,
      );

      expect(calldata).toMatch(/^0x/);

      const decoded = decodeFunctionData({
        abi: VALIDATION_REGISTRY_ABI,
        data: calldata,
      });
      expect(decoded.functionName).toBe('validationRequest');
      expect(decoded.args?.[1]).toBe(42n); // agentId
    });
  });

  describe('agentId conversion error handling', () => {
    it('encodeRegister accepts any valid URI string', () => {
      const client = createClient();
      // register does not use agentId, just ensure it works
      expect(() => client.encodeRegister('')).not.toThrow();
    });

    it('encodeSetAgentURI handles large bigint agentId', () => {
      const client = createClient();
      const largeId = 2n ** 128n;
      const calldata = client.encodeSetAgentURI(largeId, 'https://example.com');

      const decoded = decodeFunctionData({
        abi: IDENTITY_REGISTRY_ABI,
        data: calldata,
      });
      expect(decoded.args?.[0]).toBe(largeId);
    });
  });

  describe('all encode methods return 0x-prefixed hex', () => {
    const client = createClient();

    const methods: Array<[string, () => `0x${string}`]> = [
      ['encodeRegister', () => client.encodeRegister('test')],
      ['encodeRegisterWithMetadata', () => client.encodeRegisterWithMetadata('test', [])],
      ['encodeSetAgentWallet', () => client.encodeSetAgentWallet(1n, '0x' + '1'.repeat(40) as `0x${string}`, 0n, '0x')],
      ['encodeUnsetAgentWallet', () => client.encodeUnsetAgentWallet(1n)],
      ['encodeSetAgentURI', () => client.encodeSetAgentURI(1n, 'https://x.com')],
      ['encodeSetMetadata', () => client.encodeSetMetadata(1n, 'k', 'v')],
      ['encodeGiveFeedback', () => client.encodeGiveFeedback(1n, 50n, 0, '', '', '', '', '0x' + '0'.repeat(64) as `0x${string}`)],
      ['encodeRevokeFeedback', () => client.encodeRevokeFeedback(1n, 0n)],
      ['encodeValidationRequest', () => client.encodeValidationRequest('0x' + '1'.repeat(40) as `0x${string}`, 1n, 'uri', '0x' + '0'.repeat(64) as `0x${string}`)],
    ];

    for (const [name, fn] of methods) {
      it(`${name} returns 0x-prefixed hex`, () => {
        const result = fn();
        expect(result).toMatch(/^0x[a-fA-F0-9]+$/);
      });
    }
  });
});
