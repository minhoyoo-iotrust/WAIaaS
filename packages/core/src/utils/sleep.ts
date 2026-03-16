/**
 * Sleep utility -- single source of truth.
 * All packages import from @waiaas/core instead of defining locally.
 *
 * @since v32.4 (Phase 427, SSOT-02)
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
