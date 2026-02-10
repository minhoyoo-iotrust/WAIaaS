/**
 * HTTP client wrapping Node.js 22 built-in fetch.
 *
 * Intentionally simple -- retry logic will be added in Plan 61-02
 * as a wrapper/decorator. This layer handles:
 * - JSON serialization/deserialization
 * - Timeout via AbortController
 * - Error mapping to WAIaaSError via fromResponse()
 * - User-Agent header
 */

import { WAIaaSError } from '../error.js';
import { USER_AGENT } from './constants.js';

export class HttpClient {
  private baseUrl: string;
  private readonly timeout: number;

  constructor(baseUrl: string, timeout: number) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  async request<T>(
    method: string,
    path: string,
    opts?: {
      body?: unknown;
      headers?: Record<string, string>;
      signal?: AbortSignal;
    },
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        ...opts?.headers,
      };

      const res = await fetch(url, {
        method,
        headers,
        body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: opts?.signal ?? controller.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw WAIaaSError.fromResponse(body, res.status);
      }

      return (await res.json()) as T;
    } catch (error) {
      if (error instanceof WAIaaSError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new WAIaaSError({
          code: 'REQUEST_TIMEOUT',
          message: `Request timed out after ${this.timeout}ms`,
          status: 0,
          retryable: true,
        });
      }
      if (error instanceof TypeError) {
        // fetch throws TypeError for network errors
        throw new WAIaaSError({
          code: 'NETWORK_ERROR',
          message: error.message,
          status: 0,
          retryable: true,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async get<T>(path: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('GET', path, { headers });
  }

  async post<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('POST', path, { body, headers });
  }

  async put<T>(path: string, body: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('PUT', path, { body, headers });
  }

  async delete<T>(path: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('DELETE', path, { headers });
  }
}
