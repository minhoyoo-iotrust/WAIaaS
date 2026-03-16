/**
 * Safe JSON parse utility with Zod schema validation.
 *
 * Single source of truth for parsing JSON strings with type-safe validation.
 * Used by policy engine, notification service, and daemon to safely parse
 * JSON data from database or external sources.
 *
 * @since v32.4 (Phase 427, ZOD-01)
 */

import type { z, ZodIssue } from 'zod';

/**
 * Error detail from safeJsonParse.
 *
 * - `json_parse`: Input is not valid JSON (or null/undefined)
 * - `validation`: JSON parsed but failed Zod schema validation
 */
export interface SafeJsonParseError {
  type: 'json_parse' | 'validation';
  message: string;
  issues?: ZodIssue[];
}

/**
 * Discriminated union result type for safeJsonParse.
 */
export type SafeJsonParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: SafeJsonParseError };

/**
 * Parse a JSON string and validate against a Zod schema.
 *
 * Never throws -- all errors are captured in the result.
 *
 * @param json - JSON string to parse (gracefully handles null/undefined)
 * @param schema - Zod schema to validate the parsed data against
 * @returns Discriminated union with parsed data or structured error
 *
 * @example
 * ```ts
 * const result = safeJsonParse(rawJson, SpendingLimitRulesSchema);
 * if (result.success) {
 *   // result.data is typed as SpendingLimitRules
 * } else {
 *   // result.error.type is 'json_parse' | 'validation'
 * }
 * ```
 */
export function safeJsonParse<T>(
  json: string,
  schema: z.ZodType<T>,
): SafeJsonParseResult<T> {
  // Handle null/undefined gracefully
  if (json == null) {
    return {
      success: false,
      error: {
        type: 'json_parse',
        message: `Cannot parse ${json === null ? 'null' : 'undefined'} as JSON`,
      },
    };
  }

  // Step 1: Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    return {
      success: false,
      error: {
        type: 'json_parse',
        message: err instanceof Error ? err.message : 'Invalid JSON',
      },
    };
  }

  // Step 2: Validate against schema
  const result = schema.safeParse(parsed);
  if (!result.success) {
    return {
      success: false,
      error: {
        type: 'validation',
        message: result.error.issues.map((i) => i.message).join('; '),
        issues: result.error.issues,
      },
    };
  }

  return { success: true, data: result.data };
}
