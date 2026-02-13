/**
 * Slug utilities for wallet name -> config-safe key conversion.
 *
 * Used by `mcp setup` to generate unique MCP server keys
 * like "waiaas-trading-bot" from wallet names.
 */

/**
 * Convert wallet name to URL/config-safe slug.
 * - lowercase
 * - non-alphanumeric/non-hyphen -> hyphen
 * - collapse consecutive hyphens
 * - trim leading/trailing hyphens
 * - fallback to 'wallet' if result is empty
 */
export function toSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'wallet';
}

/**
 * Resolve slug collisions for a list of wallets.
 * Returns Map<walletId, resolvedSlug>.
 *
 * If two or more wallets produce the same slug, append `-{walletId first 8 chars}`.
 * Example: "trading-bot" collides -> "trading-bot-01929abc"
 */
export function resolveSlugCollisions(
  wallets: Array<{ id: string; name?: string | null }>,
): Map<string, string> {
  // Step 1: compute raw slugs
  const entries = wallets.map((w) => ({
    id: w.id,
    slug: toSlug(w.name ?? w.id),
  }));

  // Step 2: detect collisions (count occurrences per slug)
  const slugCounts = new Map<string, number>();
  for (const e of entries) {
    slugCounts.set(e.slug, (slugCounts.get(e.slug) ?? 0) + 1);
  }

  // Step 3: resolve collisions
  const result = new Map<string, string>();
  for (const e of entries) {
    if (slugCounts.get(e.slug)! > 1) {
      result.set(e.id, `${e.slug}-${e.id.slice(0, 8)}`);
    } else {
      result.set(e.id, e.slug);
    }
  }

  return result;
}
