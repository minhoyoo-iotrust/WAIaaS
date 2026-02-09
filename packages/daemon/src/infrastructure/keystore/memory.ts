/**
 * Sodium-native guarded memory management.
 *
 * Design reference: 26-keystore-spec.md section 4.
 * - sodium_malloc: allocate guarded buffer with guard pages
 * - sodium_mprotect_readonly: protect after writing
 * - sodium_memzero: zero-fill before release
 * - sodium_mprotect_noaccess: prevent any further access
 *
 * Falls back to regular Buffer if sodium-native is not available (with warning).
 */

import { createRequire } from 'node:module';

type SodiumNative = typeof import('sodium-native');

const require = createRequire(import.meta.url);

let sodium: SodiumNative | null = null;
let sodiumChecked = false;

/**
 * Check if sodium-native is available.
 * Caches the result after first check.
 */
export function isAvailable(): boolean {
  if (!sodiumChecked) {
    try {
      sodium = require('sodium-native') as SodiumNative;
      sodiumChecked = true;
    } catch {
      console.warn(
        '[WAIaaS] sodium-native not available. Using regular Buffer for key storage. ' +
          'Install sodium-native for guarded memory protection.',
      );
      sodium = null;
      sodiumChecked = true;
    }
  }
  return sodium !== null;
}

/**
 * Get the sodium-native module, loading it if necessary.
 * Returns null if not available.
 */
function getSodium(): SodiumNative | null {
  if (!sodiumChecked) {
    isAvailable();
  }
  return sodium;
}

/**
 * Allocate a guarded memory buffer of the given size.
 *
 * Uses sodium_malloc which places guard pages around the allocation,
 * preventing buffer overflows from accessing adjacent memory.
 *
 * @param size - Number of bytes to allocate
 * @returns Guarded buffer (default: no access until writeToGuarded)
 */
export function allocateGuarded(size: number): Buffer {
  const s = getSodium();
  if (s) {
    return s.sodium_malloc(size);
  }
  // Fallback: regular buffer
  return Buffer.alloc(size);
}

/**
 * Write source data into a guarded buffer and set it to readonly.
 *
 * @param target - Guarded buffer (from allocateGuarded)
 * @param source - Data to copy into the guarded buffer
 */
export function writeToGuarded(target: Buffer, source: Buffer): void {
  const s = getSodium();
  if (s) {
    s.sodium_mprotect_readwrite(target);
    source.copy(target);
    s.sodium_mprotect_readonly(target);
  } else {
    source.copy(target);
  }
}

/**
 * Zero-fill and release a guarded buffer.
 *
 * After this call, the buffer contents are zeroed and the buffer
 * is set to no-access mode. The buffer should not be used after this.
 *
 * Note: sodium_free is not exposed in sodium-native; rely on GC after zero+noaccess.
 *
 * @param buf - Guarded buffer to zero and release
 */
export function zeroAndRelease(buf: Buffer): void {
  const s = getSodium();
  if (s) {
    try {
      s.sodium_mprotect_readwrite(buf);
    } catch {
      // Buffer may already be in a writable state
    }
    s.sodium_memzero(buf);
    s.sodium_mprotect_noaccess(buf);
  } else {
    buf.fill(0);
  }
}
