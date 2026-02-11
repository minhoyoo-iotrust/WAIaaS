import { masterPassword, logout, resetInactivityTimer } from '../auth/store';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly serverMessage: string,
  ) {
    super(`[${status}] ${code}: ${serverMessage}`);
    this.name = 'ApiError';
  }
}

export async function apiCall<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  if (masterPassword.value !== null) {
    headers['X-Master-Password'] = masterPassword.value;
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err: unknown) {
    const error = err as Error;
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      throw new ApiError(0, 'TIMEOUT', 'Request timed out');
    }
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot connect to daemon');
  }

  if (response.status === 401) {
    logout();
    throw new ApiError(401, 'INVALID_MASTER_PASSWORD', 'Authentication failed');
  }

  if (!response.ok) {
    let body: { code?: string; message?: string } = {};
    try {
      body = await response.json();
    } catch {
      // Response body not JSON — use defaults
    }
    throw new ApiError(
      response.status,
      body.code ?? 'UNKNOWN',
      body.message ?? 'Unknown error',
    );
  }

  resetInactivityTimer();
  return (await response.json()) as T;
}

export const apiGet = <T>(path: string) => apiCall<T>(path, { method: 'GET' });

export const apiPost = <T>(path: string, body?: unknown) =>
  apiCall<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });

export const apiPut = <T>(path: string, body?: unknown) =>
  apiCall<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined });

export const apiDelete = <T>(path: string) => apiCall<T>(path, { method: 'DELETE' });
