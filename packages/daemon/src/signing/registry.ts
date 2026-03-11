/**
 * SignerCapabilityRegistry - central registry for signing capabilities.
 *
 * Maps signingScheme strings to ISignerCapability implementations.
 * Used by the External Action pipeline to auto-select the correct signer.
 *
 * SSoT: doc-81 D2.5 (External Action Framework design).
 *
 * @since v31.12
 */
import type { SigningScheme, SignedDataAction, SignedHttpAction } from '@waiaas/core';
import { WAIaaSError } from '@waiaas/core';
import type { ISignerCapability } from './types.js';

/**
 * Interface for the signer capability registry (doc-81 D2.5).
 */
export interface ISignerCapabilityRegistry {
  /** Register a capability. Last registration for a scheme wins. */
  register(capability: ISignerCapability): void;
  /** Get capability by scheme, or undefined if not registered. */
  get(scheme: SigningScheme): ISignerCapability | undefined;
  /** Resolve the action's signingScheme to a registered capability. Throws if not found. */
  resolve(action: SignedDataAction | SignedHttpAction): ISignerCapability;
  /** List all registered scheme names. */
  listSchemes(): readonly SigningScheme[];
}

/**
 * Default implementation of ISignerCapabilityRegistry.
 */
export class SignerCapabilityRegistry implements ISignerCapabilityRegistry {
  private readonly capabilities = new Map<SigningScheme, ISignerCapability>();

  register(capability: ISignerCapability): void {
    this.capabilities.set(capability.scheme, capability);
  }

  get(scheme: SigningScheme): ISignerCapability | undefined {
    return this.capabilities.get(scheme);
  }

  resolve(action: SignedDataAction | SignedHttpAction): ISignerCapability {
    const cap = this.capabilities.get(action.signingScheme);
    if (!cap) {
      throw new WAIaaSError('CAPABILITY_NOT_FOUND', {
        message: `No signer capability registered for scheme: ${action.signingScheme}`,
        details: { signingScheme: action.signingScheme, kind: action.kind },
      });
    }
    return cap;
  }

  listSchemes(): readonly SigningScheme[] {
    return Array.from(this.capabilities.keys());
  }
}
