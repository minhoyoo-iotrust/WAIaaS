/**
 * TDD tests for SignerCapabilityRegistry and bootstrapSignerCapabilities.
 *
 * Tests cover:
 * 1. register/get/resolve/listSchemes operations
 * 2. resolve() with SignedDataAction and SignedHttpAction fixtures
 * 3. resolve() with unregistered scheme throws WAIaaSError
 * 4. bootstrapSignerCapabilities() registers all 7
 *
 * @since v31.12
 */
import { describe, it, expect } from 'vitest';
import { WAIaaSError } from '@waiaas/core';
import type { SignedDataAction, SignedHttpAction } from '@waiaas/core';
import { SignerCapabilityRegistry } from '../signing/registry.js';
import type { ISignerCapabilityRegistry } from '../signing/registry.js';
import { bootstrapSignerCapabilities } from '../signing/bootstrap.js';
import {
  Eip712SignerCapability,
  PersonalSignCapability,
  Erc8128SignerCapability,
  HmacSignerCapability,
  RsaPssSignerCapability,
  EcdsaSignBytesCapability,
  Ed25519SignBytesCapability,
} from '../signing/capabilities/index.js';

// -----------------------------------------------------------------------
// SignerCapabilityRegistry tests
// -----------------------------------------------------------------------

describe('SignerCapabilityRegistry', () => {
  it('should implement ISignerCapabilityRegistry', () => {
    const registry: ISignerCapabilityRegistry = new SignerCapabilityRegistry();
    expect(registry).toBeDefined();
    expect(typeof registry.register).toBe('function');
    expect(typeof registry.get).toBe('function');
    expect(typeof registry.resolve).toBe('function');
    expect(typeof registry.listSchemes).toBe('function');
  });

  describe('register/get', () => {
    it('should register and retrieve a capability by scheme', () => {
      const registry = new SignerCapabilityRegistry();
      const cap = new HmacSignerCapability();
      registry.register(cap);
      expect(registry.get('hmac-sha256')).toBe(cap);
    });

    it('should return undefined for unregistered scheme', () => {
      const registry = new SignerCapabilityRegistry();
      expect(registry.get('eip712')).toBeUndefined();
    });

    it('should override previous registration for same scheme', () => {
      const registry = new SignerCapabilityRegistry();
      const cap1 = new HmacSignerCapability();
      const cap2 = new HmacSignerCapability();
      registry.register(cap1);
      registry.register(cap2);
      expect(registry.get('hmac-sha256')).toBe(cap2);
    });
  });

  describe('resolve', () => {
    it('should resolve SignedDataAction to correct capability', () => {
      const registry = new SignerCapabilityRegistry();
      registry.register(new HmacSignerCapability());

      const action: SignedDataAction = {
        kind: 'signedData',
        signingScheme: 'hmac-sha256',
        payload: { data: 'test' },
        venue: 'test-venue',
        operation: 'test-op',
      };
      const cap = registry.resolve(action);
      expect(cap.scheme).toBe('hmac-sha256');
    });

    it('should resolve SignedHttpAction with erc8128 scheme', () => {
      const registry = new SignerCapabilityRegistry();
      registry.register(new Erc8128SignerCapability());

      const action: SignedHttpAction = {
        kind: 'signedHttp',
        signingScheme: 'erc8128',
        method: 'POST',
        url: 'https://example.com/api',
        headers: {},
        venue: 'test-venue',
        operation: 'test-op',
      };
      const cap = registry.resolve(action);
      expect(cap.scheme).toBe('erc8128');
    });

    it('should resolve SignedHttpAction with hmac-sha256 scheme', () => {
      const registry = new SignerCapabilityRegistry();
      registry.register(new HmacSignerCapability());

      const action: SignedHttpAction = {
        kind: 'signedHttp',
        signingScheme: 'hmac-sha256',
        method: 'GET',
        url: 'https://example.com/api',
        headers: {},
        venue: 'test-venue',
        operation: 'test-op',
      };
      const cap = registry.resolve(action);
      expect(cap.scheme).toBe('hmac-sha256');
    });

    it('should throw WAIaaSError CAPABILITY_NOT_FOUND for unregistered scheme', () => {
      const registry = new SignerCapabilityRegistry();

      const action: SignedDataAction = {
        kind: 'signedData',
        signingScheme: 'rsa-pss',
        payload: {},
        venue: 'test-venue',
        operation: 'test-op',
      };

      expect(() => registry.resolve(action)).toThrow(WAIaaSError);
      try {
        registry.resolve(action);
      } catch (e) {
        expect((e as WAIaaSError).code).toBe('CAPABILITY_NOT_FOUND');
      }
    });
  });

  describe('listSchemes', () => {
    it('should return empty array when no capabilities registered', () => {
      const registry = new SignerCapabilityRegistry();
      expect(registry.listSchemes()).toEqual([]);
    });

    it('should return all registered scheme names', () => {
      const registry = new SignerCapabilityRegistry();
      registry.register(new Eip712SignerCapability());
      registry.register(new HmacSignerCapability());
      const schemes = registry.listSchemes();
      expect(schemes).toContain('eip712');
      expect(schemes).toContain('hmac-sha256');
      expect(schemes.length).toBe(2);
    });
  });
});

// -----------------------------------------------------------------------
// bootstrapSignerCapabilities tests
// -----------------------------------------------------------------------

describe('bootstrapSignerCapabilities', () => {
  it('should register all 7 capabilities', () => {
    const registry = new SignerCapabilityRegistry();
    bootstrapSignerCapabilities(registry);
    expect(registry.listSchemes().length).toBe(7);
  });

  it('should register each of the 7 schemes', () => {
    const registry = new SignerCapabilityRegistry();
    bootstrapSignerCapabilities(registry);

    const expectedSchemes = [
      'eip712', 'personal', 'erc8128', 'hmac-sha256',
      'rsa-pss', 'ecdsa-secp256k1', 'ed25519',
    ];

    for (const scheme of expectedSchemes) {
      const cap = registry.get(scheme as any);
      expect(cap).toBeDefined();
      expect(cap!.scheme).toBe(scheme);
    }
  });

  it('each registered capability should have canSign and sign methods', () => {
    const registry = new SignerCapabilityRegistry();
    bootstrapSignerCapabilities(registry);

    for (const scheme of registry.listSchemes()) {
      const cap = registry.get(scheme);
      expect(typeof cap!.canSign).toBe('function');
      expect(typeof cap!.sign).toBe('function');
    }
  });
});
