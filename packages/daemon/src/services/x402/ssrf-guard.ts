/**
 * Re-export from infrastructure/security/ssrf-guard.ts for backward compatibility.
 *
 * @deprecated Import from '../../infrastructure/security/ssrf-guard.js' instead.
 */
export {
  validateUrlSafety,
  safeFetchWithRedirects,
} from '../../infrastructure/security/ssrf-guard.js';
export type { ValidateUrlOptions } from '../../infrastructure/security/ssrf-guard.js';
