/**
 * UUID v7 ID generation for database records.
 *
 * Uses the `uuidv7` package per TD-09 decision: npm package for correctness
 * over manual implementation. UUID v7 embeds ms-precision timestamp for
 * time-ordered sorting by string comparison.
 */

import { uuidv7 } from 'uuidv7';

/**
 * Generate a new UUID v7 string with ms-precision time ordering.
 *
 * IDs generated later will sort lexicographically after earlier IDs,
 * making `ORDER BY id` equivalent to chronological ordering.
 *
 * @returns A new UUID v7 string (e.g., "01927f6e-3c4a-7f1b-8d2e-5f9a0b1c2d3e").
 */
export function generateId(): string {
  return uuidv7();
}
