/**
 * Re-export bridge: address validation canonical location is infrastructure/auth/address-validation.ts
 *
 * This file exists for backward compatibility with existing api/ layer imports.
 * New code should import directly from infrastructure/auth/address-validation.js.
 *
 * @see packages/daemon/src/infrastructure/auth/address-validation.ts
 */
export { decodeBase58, validateOwnerAddress } from '../../infrastructure/auth/address-validation.js';
export type { AddressValidationResult } from '../../infrastructure/auth/address-validation.js';
