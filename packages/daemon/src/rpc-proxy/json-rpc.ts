/**
 * JSON-RPC 2.0 protocol utilities for the RPC proxy.
 *
 * Provides request parsing, response building, and standard error codes
 * following the JSON-RPC 2.0 specification (https://www.jsonrpc.org/specification).
 *
 * Key spec compliance (Pitfall 9):
 * - `id` type is preserved exactly (number, string, or null)
 * - Success response has `result` but NOT `error`
 * - Error response has `error` but NOT `result`
 * - Notification = request without `id` field (not same as id=null)
 *
 * @see .planning/research/m31-14-rpc-proxy-PITFALLS.md (Pitfall 9)
 */

// ── Types ─────────────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: unknown[];
  id?: string | number | null;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcSuccessResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result: unknown;
}

export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  error: JsonRpcError;
}

export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

// ── Error Codes ───────────────────────────────────────────────────

export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  SERVER_ERROR: -32000,
} as const;

// ── Response Builders ─────────────────────────────────────────────

/**
 * Build a JSON-RPC 2.0 success response.
 * Result and error are mutually exclusive per spec.
 */
export function jsonRpcSuccess(
  id: string | number | null,
  result: unknown,
): JsonRpcSuccessResponse {
  return { jsonrpc: '2.0', id, result };
}

/**
 * Build a JSON-RPC 2.0 error response.
 * Result and error are mutually exclusive per spec.
 */
export function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcErrorResponse {
  const error: JsonRpcError = { code, message };
  if (data !== undefined) {
    error.data = data;
  }
  return { jsonrpc: '2.0', id, error };
}

// ── Parse Result Types ────────────────────────────────────────────

export type ParseResult =
  | { type: 'single'; request: JsonRpcRequest }
  | { type: 'batch'; requests: JsonRpcRequest[] }
  | { type: 'error'; response: JsonRpcErrorResponse };

// ── Body Parsing ──────────────────────────────────────────────────

/**
 * Parse a JSON-RPC 2.0 request body (already JSON-parsed).
 *
 * Returns single request, batch of requests, or error response.
 * Validates `jsonrpc === '2.0'` and `method` is string.
 * Does NOT validate `params` (method handlers do that).
 */
export function parseJsonRpcBody(body: unknown): ParseResult {
  if (body === null || body === undefined || typeof body !== 'object') {
    return {
      type: 'error',
      response: jsonRpcError(null, JSON_RPC_ERRORS.INVALID_REQUEST, 'Invalid Request'),
    };
  }

  // Batch request (array)
  if (Array.isArray(body)) {
    if (body.length === 0) {
      return {
        type: 'error',
        response: jsonRpcError(null, JSON_RPC_ERRORS.INVALID_REQUEST, 'Empty batch array'),
      };
    }

    const requests: JsonRpcRequest[] = [];
    for (const item of body) {
      const validated = validateSingleRequest(item);
      if (!validated) {
        // Skip invalid items in batch (spec allows partial processing)
        // but for simplicity, return error for any invalid item
        return {
          type: 'error',
          response: jsonRpcError(
            null,
            JSON_RPC_ERRORS.INVALID_REQUEST,
            'Invalid Request in batch',
          ),
        };
      }
      requests.push(validated);
    }
    return { type: 'batch', requests };
  }

  // Single request
  const validated = validateSingleRequest(body);
  if (!validated) {
    return {
      type: 'error',
      response: jsonRpcError(null, JSON_RPC_ERRORS.INVALID_REQUEST, 'Invalid Request'),
    };
  }
  return { type: 'single', request: validated };
}

// ── Notification Detection ────────────────────────────────────────

/**
 * A notification is a request without an `id` field.
 * Note: `id: null` is valid and is NOT a notification.
 */
export function isNotification(req: JsonRpcRequest): boolean {
  return req.id === undefined;
}

// ── Helpers ───────────────────────────────────────────────────────

function validateSingleRequest(obj: unknown): JsonRpcRequest | null {
  if (obj === null || obj === undefined || typeof obj !== 'object' || Array.isArray(obj)) {
    return null;
  }

  const rec = obj as Record<string, unknown>;

  if (rec.jsonrpc !== '2.0') {
    return null;
  }

  if (typeof rec.method !== 'string') {
    return null;
  }

  const request: JsonRpcRequest = {
    jsonrpc: '2.0',
    method: rec.method,
  };

  if (rec.params !== undefined) {
    request.params = rec.params as unknown[];
  }

  if ('id' in rec) {
    request.id = rec.id as string | number | null;
  }

  return request;
}
