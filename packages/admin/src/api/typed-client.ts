import createClient from 'openapi-fetch';
import type { paths } from './types.generated';
import type { Middleware } from 'openapi-fetch';
import { masterPassword, logout, resetInactivityTimer } from '../auth/store';

// Re-export ApiError from existing client (no duplication)
export { ApiError } from './client';
import { ApiError } from './client';

// In browser, resolve relative to current origin; in tests, globalThis.location may be set by jsdom
const baseUrl = typeof globalThis.location !== 'undefined' ? globalThis.location.origin : '';

// Exported for testing: allows injecting a custom fetch
export function createTypedClient(customFetch?: typeof globalThis.fetch) {
  const client = createClient<paths>({
    baseUrl,
    ...(customFetch ? { fetch: customFetch as (input: Request) => Promise<Response> } : {}),
  });

  // Request middleware: inject auth header and content type
  client.use({
    onRequest({ request }) {
      if (masterPassword.value !== null) {
        request.headers.set('X-Master-Password', masterPassword.value);
      }
      if (!request.headers.has('Content-Type')) {
        request.headers.set('Content-Type', 'application/json');
      }
      return request;
    },
  });

  // Response middleware: handle 401 logout, error throwing, inactivity reset
  const responseMiddleware: Middleware = {
    async onResponse({ request, response }) {
      if (response.status === 401) {
        const url = new URL(request.url);
        if (url.pathname.startsWith('/v1/admin/')) {
          logout();
        }
        throw new ApiError(401, 'UNAUTHORIZED', 'Authentication failed');
      }

      if (!response.ok) {
        let body: { code?: string; message?: string } = {};
        try {
          body = await response.clone().json();
        } catch {
          // Response body not JSON -- use defaults
        }
        throw new ApiError(
          response.status,
          body.code ?? 'UNKNOWN',
          body.message ?? 'Unknown error',
        );
      }

      resetInactivityTimer();
      return undefined;
    },
    onError({ error }) {
      const err = error as Error;
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        return new ApiError(0, 'TIMEOUT', 'Request timed out');
      }
      return new ApiError(0, 'NETWORK_ERROR', 'Cannot connect to daemon');
    },
  };
  client.use(responseMiddleware);

  return client;
}

// Default singleton for application use
const api = createTypedClient();

export { api };
