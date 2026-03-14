/**
 * User-friendly error messages for server error codes.
 * All constants imported from @waiaas/shared (single source of truth).
 */
import { ERROR_MESSAGE_MAP, SERVER_MESSAGE_PREFERRED_CODES } from '@waiaas/shared';

/**
 * Error codes where the server message provides more useful detail than the
 * generic mapping (e.g. validation errors with field-specific reasons).
 */
const SERVER_MESSAGE_PREFERRED: ReadonlySet<string> = new Set(SERVER_MESSAGE_PREFERRED_CODES);

/**
 * Get user-friendly error message for an error code.
 * For codes in SERVER_MESSAGE_PREFERRED, the server-provided message is
 * returned when available; otherwise falls back to the generic mapping.
 */
export function getErrorMessage(code: string, serverMessage?: string): string {
  if (serverMessage && SERVER_MESSAGE_PREFERRED.has(code)) {
    return serverMessage;
  }
  return ERROR_MESSAGE_MAP[code] ?? `An error occurred (${code}).`;
}
