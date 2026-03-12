/**
 * Bootstrap function to register all 7 signer capabilities.
 *
 * @since v31.12
 */
import type { ISignerCapabilityRegistry } from './registry.js';
import {
  Eip712SignerCapability,
  PersonalSignCapability,
  Erc8128SignerCapability,
  HmacSignerCapability,
  RsaPssSignerCapability,
  EcdsaSignBytesCapability,
  Ed25519SignBytesCapability,
} from './capabilities/index.js';

/**
 * Register all 7 signing capabilities into the registry.
 * Called during daemon startup (wired in Phase 390).
 */
export function bootstrapSignerCapabilities(
  registry: ISignerCapabilityRegistry,
): void {
  registry.register(new Eip712SignerCapability());
  registry.register(new PersonalSignCapability());
  registry.register(new Erc8128SignerCapability());
  registry.register(new HmacSignerCapability());
  registry.register(new RsaPssSignerCapability());
  registry.register(new EcdsaSignBytesCapability());
  registry.register(new Ed25519SignBytesCapability());
}
