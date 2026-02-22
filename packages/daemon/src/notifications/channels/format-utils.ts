/**
 * Abbreviation utilities for notification channel display.
 *
 * walletId:  first 6 + "…" + last 4  (e.g. "019c6f…864d")
 * walletAddress: first 4 + "…" + last 4 (e.g. "3HfE…v4nB")
 */

/** Abbreviate a wallet ID (UUID): first 6 + … + last 4. */
export function abbreviateId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

/** Abbreviate an on-chain address: first 4 + … + last 4. */
export function abbreviateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
