/**
 * ApiClient: wraps all daemon HTTP calls, gets token from SessionManager.
 *
 * Returns ApiResult discriminated union for every call:
 * - { ok: true, data } for successful responses
 * - { ok: false, error } for API errors
 * - { ok: false, expired: true } for session expiry
 * - { ok: false, networkError: true } for network failures
 *
 * CRITICAL: All logging via console.error (SMGI-D04).
 */

import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import type { SessionManager } from './session-manager.js';

const USER_AGENT = '@waiaas/mcp/0.0.0';
const LOG_PREFIX = '[waiaas-mcp:api]';

// --- ApiResult discriminated union ---

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; retryable: boolean; hint?: string } }
  | { ok: false; expired: true; message: string }
  | { ok: false; networkError: true; message: string };

// --- Tool/Resource result helpers (SMGI-04, H-04) ---

/**
 * Convert ApiResult to MCP tool result format (CallToolResult).
 *
 * H-04: isError is ONLY set for actual API errors.
 * session_expired and networkError do NOT set isError
 * to prevent Claude Desktop from disconnecting.
 */
export function toToolResult<T>(result: ApiResult<T>): CallToolResult {
  if ('ok' in result && result.ok) {
    return {
      content: [{ type: 'text', text: JSON.stringify(result.data) }],
    };
  }

  if ('expired' in result && result.expired) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          session_expired: true,
          message: result.message,
          action: 'Run waiaas mcp setup to get a new token',
        }),
      }],
      // NO isError (H-04: prevents Claude Desktop from disconnecting)
    };
  }

  if ('networkError' in result && result.networkError) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          network_error: true,
          message: result.message,
        }),
      }],
      // NO isError
    };
  }

  // Actual API error -- isError: true
  if ('error' in result) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: true,
          ...result.error,
        }),
      }],
      isError: true,
    };
  }

  // Should never happen -- fallback
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: true, message: 'Unknown error' }) }],
    isError: true,
  };
}

/**
 * Convert ApiResult to MCP resource result format (ReadResourceResult).
 */
export function toResourceResult<T>(uri: string, result: ApiResult<T>): ReadResourceResult {
  if ('ok' in result && result.ok) {
    return {
      contents: [{
        uri,
        text: JSON.stringify(result.data),
        mimeType: 'application/json',
      }],
    };
  }

  if ('expired' in result && result.expired) {
    return {
      contents: [{
        uri,
        text: JSON.stringify({
          session_expired: true,
          message: result.message,
          action: 'Run waiaas mcp setup to get a new token',
        }),
        mimeType: 'application/json',
      }],
    };
  }

  if ('networkError' in result && result.networkError) {
    return {
      contents: [{
        uri,
        text: JSON.stringify({
          network_error: true,
          message: result.message,
        }),
        mimeType: 'application/json',
      }],
    };
  }

  if ('error' in result) {
    return {
      contents: [{
        uri,
        text: JSON.stringify({
          error: true,
          ...result.error,
        }),
        mimeType: 'application/json',
      }],
    };
  }

  return {
    contents: [{
      uri,
      text: JSON.stringify({ error: true, message: 'Unknown error' }),
      mimeType: 'application/json',
    }],
  };
}

// --- ApiClient ---

export class ApiClient {
  private readonly sessionManager: SessionManager;
  private readonly baseUrl: string;

  constructor(sessionManager: SessionManager, baseUrl: string) {
    this.sessionManager = sessionManager;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async get<T>(path: string): Promise<ApiResult<T>> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body: unknown): Promise<ApiResult<T>> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body: unknown): Promise<ApiResult<T>> {
    return this.request<T>('PUT', path, body);
  }

  /**
   * 7-step request flow (SMGI-01):
   * 1. Get token from sessionManager
   * 2. If null, return expired
   * 3. Call fetch with Bearer token + User-Agent
   * 4. If 401, handle401 (50ms wait, re-check token)
   * 5. If 503 + kill_switch, return kill switch result
   * 6. If !ok, parse error body
   * 7. If ok, return { ok: true, data }
   * 8. On network error, return networkError
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<ApiResult<T>> {
    // Step 1-2: Get token
    const token = this.sessionManager.getToken();
    if (!token) {
      return { ok: false, expired: true, message: 'Session token not available' };
    }

    try {
      const url = `${this.baseUrl}${path}`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'User-Agent': USER_AGENT,
      };

      // Step 3: Call fetch
      const res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });

      // Step 4: Handle 401
      if (res.status === 401) {
        return this.handle401<T>();
      }

      // Step 5: Handle 503 kill switch
      if (res.status === 503) {
        const errBody = await res.json().catch(() => null) as Record<string, unknown> | null;
        if (errBody?.['code'] === 'KILL_SWITCH_ACTIVE') {
          return {
            ok: false,
            error: {
              code: 'KILL_SWITCH_ACTIVE',
              message: typeof errBody['message'] === 'string'
                ? errBody['message']
                : 'Kill switch is active',
              retryable: false,
              hint: typeof errBody['hint'] === 'string' ? errBody['hint'] : undefined,
            },
          };
        }
        return {
          ok: false,
          error: {
            code: typeof errBody?.['code'] === 'string' ? errBody['code'] : `HTTP_503`,
            message: typeof errBody?.['message'] === 'string'
              ? errBody['message']
              : 'Service unavailable',
            retryable: true,
          },
        };
      }

      // Step 6: Handle other errors
      if (!res.ok) {
        const errBody = await res.json().catch(() => null) as Record<string, unknown> | null;
        return {
          ok: false,
          error: {
            code: typeof errBody?.['code'] === 'string' ? errBody['code'] : `HTTP_${res.status}`,
            message: typeof errBody?.['message'] === 'string'
              ? errBody['message']
              : `Request failed with status ${res.status}`,
            retryable: res.status >= 500,
            hint: typeof errBody?.['hint'] === 'string' ? errBody['hint'] : undefined,
          },
        };
      }

      // Step 7: Success
      const data = await res.json() as T;
      return { ok: true, data };
    } catch (err) {
      // Step 8: Network error
      if (err instanceof TypeError) {
        console.error(`${LOG_PREFIX} Network error: ${err.message}`);
        return {
          ok: false,
          networkError: true,
          message: err.message,
        };
      }

      console.error(`${LOG_PREFIX} Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
      return {
        ok: false,
        networkError: true,
        message: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /**
   * 401 handler: wait 50ms (allow renewal to complete), re-check token.
   */
  private async handle401<T>(): Promise<ApiResult<T>> {
    await new Promise((resolve) => setTimeout(resolve, 50));
    const newToken = this.sessionManager.getToken();
    if (!newToken) {
      return { ok: false, expired: true, message: 'Session expired (401)' };
    }
    // Token was renewed during wait -- caller should retry
    // But since we don't retry in MCP context, return expired
    return { ok: false, expired: true, message: 'Session expired (401)' };
  }
}
