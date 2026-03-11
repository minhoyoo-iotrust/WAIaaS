/**
 * Signing module - ISignerCapability types, error, and 7 capability implementations.
 *
 * @since v31.12
 */
export type {
  ISignerCapability,
  SigningParams,
  SigningResult,
  Eip712SigningParams,
  PersonalSigningParams,
  HmacSigningParams,
  RsaPssSigningParams,
  EcdsaSecp256k1SigningParams,
  Ed25519SigningParams,
  Erc8128SigningParams,
} from './types.js';

export { SigningError } from './signing-error.js';
export type { SigningErrorCode } from './signing-error.js';

export {
  Eip712SignerCapability,
  PersonalSignCapability,
  Erc8128SignerCapability,
  HmacSignerCapability,
  RsaPssSignerCapability,
  EcdsaSignBytesCapability,
  Ed25519SignBytesCapability,
} from './capabilities/index.js';

export { SignerCapabilityRegistry } from './registry.js';
export type { ISignerCapabilityRegistry } from './registry.js';

export { bootstrapSignerCapabilities } from './bootstrap.js';
