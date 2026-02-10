/**
 * SDK-side WAIaaSError for API error handling.
 *
 * This is a SEPARATE class from @waiaas/core's WAIaaSError.
 * The SDK has zero dependency on @waiaas/core.
 * fromResponse() parses daemon JSON error responses into this class.
 */

export interface WAIaaSErrorOptions {
  code: string;
  message: string;
  status: number;
  retryable: boolean;
  details?: Record<string, unknown>;
  requestId?: string;
  hint?: string;
}

export class WAIaaSError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;
  readonly requestId?: string;
  readonly hint?: string;

  constructor(opts: WAIaaSErrorOptions) {
    super(opts.message);
    this.name = 'WAIaaSError';
    this.code = opts.code;
    this.status = opts.status;
    this.retryable = opts.retryable;
    this.details = opts.details;
    this.requestId = opts.requestId;
    this.hint = opts.hint;
  }

  get isRetryable(): boolean {
    return this.retryable;
  }

  /**
   * Parse an API error response body into a WAIaaSError.
   * Handles JSON bodies with {code, message, retryable, details, requestId, hint}
   * and falls back gracefully for non-JSON or partial responses.
   */
  static fromResponse(body: unknown, status: number): WAIaaSError {
    if (body && typeof body === 'object') {
      const b = body as Record<string, unknown>;
      return new WAIaaSError({
        code: typeof b['code'] === 'string' ? b['code'] : `HTTP_${status}`,
        message: typeof b['message'] === 'string' ? b['message'] : `Request failed with status ${status}`,
        status,
        retryable: typeof b['retryable'] === 'boolean' ? b['retryable'] : status >= 500,
        details: b['details'] && typeof b['details'] === 'object'
          ? b['details'] as Record<string, unknown>
          : undefined,
        requestId: typeof b['requestId'] === 'string' ? b['requestId'] : undefined,
        hint: typeof b['hint'] === 'string' ? b['hint'] : undefined,
      });
    }

    // Fallback for non-JSON responses
    return new WAIaaSError({
      code: `HTTP_${status}`,
      message: `Request failed with status ${status}`,
      status,
      retryable: status >= 500,
    });
  }

  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
      retryable: this.retryable,
      ...(this.details && { details: this.details }),
      ...(this.requestId && { requestId: this.requestId }),
      ...(this.hint && { hint: this.hint }),
    };
  }
}
