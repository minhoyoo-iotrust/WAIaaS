/**
 * Shared auth types used across infrastructure and api layers.
 *
 * Canonical location: infrastructure/auth/types.ts (v32.4)
 * Re-exported from api/middleware/master-auth.ts for backward compatibility.
 */

/** Mutable ref for in-memory master password + hash, enabling hot-swap on password change. */
export interface MasterPasswordRef {
  password: string;
  hash: string;
}
