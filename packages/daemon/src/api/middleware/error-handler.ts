/**
 * Error handler: Hono onError handler converting errors to WAIaaSError-shaped JSON.
 *
 * - WAIaaSError: responds with error.httpStatus and error.toJSON()
 * - ZodError: responds with 400 and formatted validation error
 * - Generic Error: responds with 500 and SYSTEM_LOCKED error
 *
 * Always includes requestId from context in the error response.
 *
 * @see docs/37-rest-api-complete-spec.md section 10.12
 */

import type { ErrorHandler } from 'hono';
import { WAIaaSError } from '@waiaas/core';
import { ZodError } from 'zod';

export const errorHandler: ErrorHandler = (err, c) => {
  const requestId = c.get('requestId') as string | undefined;

  if (err instanceof WAIaaSError) {
    const body = err.toJSON();
    return c.json({ ...body, requestId: requestId ?? body.requestId }, err.httpStatus as 400);
  }

  if (err instanceof ZodError) {
    return c.json(
      {
        code: 'ACTION_VALIDATION_FAILED',
        message: 'Validation error',
        details: {
          issues: err.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
        requestId,
        retryable: false,
      },
      400,
    );
  }

  // Generic error -> 500
  return c.json(
    {
      code: 'SYSTEM_LOCKED',
      message: err instanceof Error ? err.message : 'Internal server error',
      requestId,
      retryable: false,
    },
    500,
  );
};
