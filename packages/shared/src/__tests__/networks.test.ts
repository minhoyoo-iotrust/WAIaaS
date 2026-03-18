import { describe, it, expect } from 'vitest';
import {
  CHAIN_TYPES,
  NETWORK_TYPES,
  SOLANA_NETWORK_TYPES,
  EVM_NETWORK_TYPES,
  ENVIRONMENT_TYPES,
  ENVIRONMENT_NETWORK_MAP,
  validateChainNetwork,
  NETWORK_DISPLAY_NAMES,
  NETWORK_NATIVE_SYMBOL,
  EVM_NETWORK_OPTIONS,
  EVM_RPC_SETTING_KEYS,
  SOLANA_RPC_SETTING_KEYS,
  RPC_KEY_LABELS,
} from '../networks.js';

describe('Network Constants', () => {
  // =========================================================================
  // CHAIN_TYPES
  // =========================================================================

  describe('CHAIN_TYPES', () => {
    it('contains solana and ethereum', () => {
      expect(CHAIN_TYPES).toContain('solana');
      expect(CHAIN_TYPES).toContain('ethereum');
      expect(CHAIN_TYPES).toHaveLength(2);
    });
  });

  // =========================================================================
  // NETWORK_TYPES
  // =========================================================================

  describe('NETWORK_TYPES', () => {
    it('contains 15 networks (3 Solana + 12 EVM)', () => {
      expect(NETWORK_TYPES.length).toBe(15);
    });

    it('includes both Solana and EVM networks', () => {
      expect(NETWORK_TYPES).toContain('solana-mainnet');
      expect(NETWORK_TYPES).toContain('ethereum-mainnet');
      expect(NETWORK_TYPES).toContain('base-sepolia');
      expect(NETWORK_TYPES).toContain('hyperevm-mainnet');
    });
  });

  // =========================================================================
  // SOLANA_NETWORK_TYPES
  // =========================================================================

  describe('SOLANA_NETWORK_TYPES', () => {
    it('has 3 solana networks', () => {
      expect(SOLANA_NETWORK_TYPES).toHaveLength(3);
    });

    it('all start with solana-', () => {
      for (const net of SOLANA_NETWORK_TYPES) {
        expect(net).toMatch(/^solana-/);
      }
    });

    it('all included in NETWORK_TYPES', () => {
      for (const net of SOLANA_NETWORK_TYPES) {
        expect(NETWORK_TYPES).toContain(net);
      }
    });
  });

  // =========================================================================
  // EVM_NETWORK_TYPES
  // =========================================================================

  describe('EVM_NETWORK_TYPES', () => {
    it('has 12 EVM networks', () => {
      expect(EVM_NETWORK_TYPES).toHaveLength(12);
    });

    it('all included in NETWORK_TYPES', () => {
      for (const net of EVM_NETWORK_TYPES) {
        expect(NETWORK_TYPES).toContain(net);
      }
    });

    it('does not include solana networks', () => {
      for (const net of EVM_NETWORK_TYPES) {
        expect(net).not.toMatch(/^solana-/);
      }
    });
  });

  // =========================================================================
  // ENVIRONMENT_TYPES
  // =========================================================================

  describe('ENVIRONMENT_TYPES', () => {
    it('contains testnet and mainnet', () => {
      expect(ENVIRONMENT_TYPES).toContain('testnet');
      expect(ENVIRONMENT_TYPES).toContain('mainnet');
      expect(ENVIRONMENT_TYPES).toHaveLength(2);
    });
  });

  // =========================================================================
  // ENVIRONMENT_NETWORK_MAP
  // =========================================================================

  describe('ENVIRONMENT_NETWORK_MAP', () => {
    it('has 4 keys', () => {
      expect(Object.keys(ENVIRONMENT_NETWORK_MAP)).toHaveLength(4);
    });

    it('solana:mainnet maps to solana-mainnet only', () => {
      expect(ENVIRONMENT_NETWORK_MAP['solana:mainnet']).toEqual(['solana-mainnet']);
    });

    it('solana:testnet maps to solana-devnet and solana-testnet', () => {
      expect(ENVIRONMENT_NETWORK_MAP['solana:testnet']).toContain('solana-devnet');
      expect(ENVIRONMENT_NETWORK_MAP['solana:testnet']).toContain('solana-testnet');
    });

    it('ethereum:mainnet contains only EVM mainnet networks', () => {
      for (const net of ENVIRONMENT_NETWORK_MAP['ethereum:mainnet']) {
        expect(EVM_NETWORK_TYPES).toContain(net);
      }
    });

    it('ethereum:testnet contains only EVM testnet networks', () => {
      for (const net of ENVIRONMENT_NETWORK_MAP['ethereum:testnet']) {
        expect(EVM_NETWORK_TYPES).toContain(net);
      }
    });
  });

  // =========================================================================
  // validateChainNetwork
  // =========================================================================

  describe('validateChainNetwork', () => {
    it('accepts solana + solana-mainnet', () => {
      expect(() => validateChainNetwork('solana', 'solana-mainnet')).not.toThrow();
    });

    it('accepts solana + solana-devnet', () => {
      expect(() => validateChainNetwork('solana', 'solana-devnet')).not.toThrow();
    });

    it('rejects solana + ethereum-mainnet', () => {
      expect(() => validateChainNetwork('solana', 'ethereum-mainnet')).toThrow('Invalid network');
    });

    it('accepts ethereum + base-sepolia', () => {
      expect(() => validateChainNetwork('ethereum', 'base-sepolia')).not.toThrow();
    });

    it('accepts ethereum + hyperevm-mainnet', () => {
      expect(() => validateChainNetwork('ethereum', 'hyperevm-mainnet')).not.toThrow();
    });

    it('rejects ethereum + solana-devnet', () => {
      expect(() => validateChainNetwork('ethereum', 'solana-devnet')).toThrow('Invalid network');
    });
  });

  // =========================================================================
  // NETWORK_DISPLAY_NAMES
  // =========================================================================

  describe('NETWORK_DISPLAY_NAMES', () => {
    it('has a label for every network type', () => {
      for (const net of NETWORK_TYPES) {
        expect(NETWORK_DISPLAY_NAMES[net]).toBeDefined();
        expect(typeof NETWORK_DISPLAY_NAMES[net]).toBe('string');
        expect(NETWORK_DISPLAY_NAMES[net].length).toBeGreaterThan(0);
      }
    });
  });

  // =========================================================================
  // NETWORK_NATIVE_SYMBOL
  // =========================================================================

  describe('NETWORK_NATIVE_SYMBOL', () => {
    it('has a symbol for every network type', () => {
      for (const net of NETWORK_TYPES) {
        expect(NETWORK_NATIVE_SYMBOL[net]).toBeDefined();
        expect(typeof NETWORK_NATIVE_SYMBOL[net]).toBe('string');
      }
    });

    it('solana networks have SOL symbol', () => {
      expect(NETWORK_NATIVE_SYMBOL['solana-mainnet']).toBe('SOL');
      expect(NETWORK_NATIVE_SYMBOL['solana-devnet']).toBe('SOL');
    });

    it('ethereum mainnet has ETH symbol', () => {
      expect(NETWORK_NATIVE_SYMBOL['ethereum-mainnet']).toBe('ETH');
    });
  });

  // =========================================================================
  // EVM_NETWORK_OPTIONS
  // =========================================================================

  describe('EVM_NETWORK_OPTIONS', () => {
    it('has same length as EVM_NETWORK_TYPES', () => {
      expect(EVM_NETWORK_OPTIONS).toHaveLength(EVM_NETWORK_TYPES.length);
    });

    it('each option has label and value', () => {
      for (const opt of EVM_NETWORK_OPTIONS) {
        expect(opt.label).toBeDefined();
        expect(opt.value).toBeDefined();
        expect(typeof opt.label).toBe('string');
        expect(EVM_NETWORK_TYPES).toContain(opt.value);
      }
    });
  });

  // =========================================================================
  // EVM_RPC_SETTING_KEYS
  // =========================================================================

  describe('EVM_RPC_SETTING_KEYS', () => {
    it('has same length as EVM_NETWORK_TYPES', () => {
      expect(EVM_RPC_SETTING_KEYS).toHaveLength(EVM_NETWORK_TYPES.length);
    });

    it('all start with evm_', () => {
      for (const key of EVM_RPC_SETTING_KEYS) {
        expect(key).toMatch(/^evm_/);
      }
    });

    it('uses underscores instead of dashes', () => {
      for (const key of EVM_RPC_SETTING_KEYS) {
        expect(key).not.toContain('-');
      }
    });
  });

  // =========================================================================
  // SOLANA_RPC_SETTING_KEYS
  // =========================================================================

  describe('SOLANA_RPC_SETTING_KEYS', () => {
    it('has same length as SOLANA_NETWORK_TYPES', () => {
      expect(SOLANA_RPC_SETTING_KEYS).toHaveLength(SOLANA_NETWORK_TYPES.length);
    });

    it('uses underscores instead of dashes', () => {
      for (const key of SOLANA_RPC_SETTING_KEYS) {
        expect(key).not.toContain('-');
      }
    });
  });

  // =========================================================================
  // RPC_KEY_LABELS
  // =========================================================================

  describe('RPC_KEY_LABELS', () => {
    it('has labels for all EVM RPC keys', () => {
      for (const key of EVM_RPC_SETTING_KEYS) {
        expect(RPC_KEY_LABELS[key]).toBeDefined();
        expect(typeof RPC_KEY_LABELS[key]).toBe('string');
      }
    });

    it('has labels for all Solana RPC keys', () => {
      for (const key of SOLANA_RPC_SETTING_KEYS) {
        expect(RPC_KEY_LABELS[key]).toBeDefined();
        expect(typeof RPC_KEY_LABELS[key]).toBe('string');
      }
    });

    it('total count matches EVM + Solana keys', () => {
      expect(Object.keys(RPC_KEY_LABELS)).toHaveLength(
        EVM_RPC_SETTING_KEYS.length + SOLANA_RPC_SETTING_KEYS.length,
      );
    });
  });
});
