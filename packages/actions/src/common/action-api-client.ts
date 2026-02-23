/**
 * Base HTTP client for DeFi Action Providers.
 * Uses native fetch + AbortController with Zod runtime validation.
 */
import type { z } from 'zod';
import { ChainError } from '@waiaas/core';

export class ActionApiClient {
  private readonly _baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly timeoutMs: number = 10_000,
    private readonly headers: Record<string, string> = {},
  ) {
    // Ensure trailing slash so relative path resolution works correctly
    this._baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  }

  async get<T>(path: string, schema: z.ZodType<T>, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, this._baseUrl);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: this.headers,
      });
      if (!res.ok) {
        const body = await res.text();
        if (res.status === 429) {
          throw new ChainError('ACTION_RATE_LIMITED', 'api', { message: `Rate limited: ${body}` });
        }
        throw new ChainError('ACTION_API_ERROR', 'api', { message: `API error ${res.status}: ${body}` });
      }
      const data = await res.json();
      return schema.parse(data);
    } catch (err) {
      if (err instanceof ChainError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ChainError('ACTION_API_TIMEOUT', 'api', { message: `API timeout after ${this.timeoutMs}ms` });
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(new URL(path, this._baseUrl).toString(), {
        method: 'POST',
        signal: controller.signal,
        headers: { ...this.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        if (res.status === 429) {
          throw new ChainError('ACTION_RATE_LIMITED', 'api', { message: `Rate limited: ${text}` });
        }
        throw new ChainError('ACTION_API_ERROR', 'api', { message: `API error ${res.status}: ${text}` });
      }
      const data = await res.json();
      return schema.parse(data);
    } catch (err) {
      if (err instanceof ChainError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ChainError('ACTION_API_TIMEOUT', 'api', { message: `API timeout after ${this.timeoutMs}ms` });
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
