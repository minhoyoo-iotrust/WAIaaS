/**
 * Re-export bridge: verifySIWE canonical location is infrastructure/auth/siwe-verify.ts
 *
 * This file exists for backward compatibility with existing api/ layer imports.
 * New code should import directly from infrastructure/auth/siwe-verify.js.
 *
 * @see packages/daemon/src/infrastructure/auth/siwe-verify.ts
 */
export { verifySIWE } from '../../infrastructure/auth/siwe-verify.js';
export type { VerifySIWEParams, VerifySIWEResult } from '../../infrastructure/auth/siwe-verify.js';
