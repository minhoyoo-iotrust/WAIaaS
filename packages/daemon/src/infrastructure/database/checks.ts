/**
 * Utility to generate SQLite CHECK constraint SQL from SSoT enum arrays.
 *
 * Produces plain SQL strings (not Drizzle sql.raw()) for test comparison
 * against sqlite_master CREATE TABLE output.
 *
 * @see docs/49-enum-config-consistency-verification.md
 */

/**
 * Generate SQLite CHECK constraint SQL from SSoT enum array.
 * Returns plain SQL string for test comparison against sqlite_master.
 *
 * @param column - Column name to constrain.
 * @param values - SSoT enum values (as const array).
 * @returns CHECK constraint SQL, e.g. `CHECK (status IN ('ACTIVE', 'SUSPENDED'))`.
 * @throws Error if any value contains a single quote (SQL injection prevention).
 */
export function generateCheckConstraint(column: string, values: readonly string[]): string {
  for (const v of values) {
    if (v.includes("'")) {
      throw new Error(`Enum value contains single quote: '${v}'`);
    }
  }
  const quoted = values.map(v => `'${v}'`).join(', ');
  return `CHECK (${column} IN (${quoted}))`;
}
