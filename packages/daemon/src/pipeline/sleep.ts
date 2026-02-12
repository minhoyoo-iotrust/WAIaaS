/**
 * Sleep utility for exponential backoff in pipeline retry logic.
 * Extracted as a separate module for testability (vi.mock).
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
