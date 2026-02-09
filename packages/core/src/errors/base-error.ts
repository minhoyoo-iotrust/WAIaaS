import { ERROR_CODES, type ErrorCode } from './error-codes.js';

export class WAIaaSError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;
  readonly requestId?: string;

  constructor(
    code: ErrorCode,
    options?: {
      message?: string;
      details?: Record<string, unknown>;
      requestId?: string;
      cause?: Error;
    },
  ) {
    const entry = ERROR_CODES[code];
    super(options?.message ?? entry.message);
    this.name = 'WAIaaSError';
    this.code = code;
    this.httpStatus = entry.httpStatus;
    this.retryable = entry.retryable;
    this.details = options?.details;
    this.requestId = options?.requestId;
    if (options?.cause) this.cause = options.cause;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      requestId: this.requestId,
      retryable: this.retryable,
    };
  }
}
