/**
 * Base HTTP client for DeFi Action Providers.
 * Uses native fetch + AbortController with Zod runtime validation.
 * Optional ILogger for request/response debug tracing (#412).
 */
import type { z } from 'zod';
import { ChainError } from '@waiaas/core';
import type { ILogger } from '@waiaas/core';

export class ActionApiClient {
  private readonly _baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly timeoutMs: number = 10_000,
    private readonly headers: Record<string, string> = {},
    private readonly logger?: ILogger,
  ) {
    // Ensure trailing slash so relative path resolution works correctly
    this._baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  }

  async get<T>(path: string, schema: z.ZodType<T>, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, this._baseUrl);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    this.logger?.debug(`GET ${path}`, params ? { params } : undefined);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: this.headers,
      });
      if (!res.ok) {
        const body = await res.text();
        this.logger?.debug(`GET ${path} → ${res.status}`, { body });
        if (res.status === 429) {
          throw new ChainError('ACTION_RATE_LIMITED', 'api', { message: `Rate limited: ${body}` });
        }
        throw new ChainError('ACTION_API_ERROR', 'api', { message: `API error ${res.status}: ${body}` });
      }
      const data = await res.json();
      this.logger?.debug(`GET ${path} → ${res.status}`, { response: data });
      try {
        return schema.parse(data);
      } catch (zodErr) {
        this.logger?.error(`GET ${path} schema validation failed`, {
          response: data,
          error: zodErr instanceof Error ? zodErr.message : String(zodErr),
        });
        throw zodErr;
      }
    } catch (err) {
      if (err instanceof ChainError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        this.logger?.debug(`GET ${path} → TIMEOUT (${this.timeoutMs}ms)`);
        throw new ChainError('ACTION_API_TIMEOUT', 'api', { message: `API timeout after ${this.timeoutMs}ms` });
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async post<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    this.logger?.debug(`POST ${path}`, { request: body });
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
        this.logger?.debug(`POST ${path} → ${res.status}`, { request: body, response: text });
        if (res.status === 429) {
          throw new ChainError('ACTION_RATE_LIMITED', 'api', { message: `Rate limited: ${text}` });
        }
        throw new ChainError('ACTION_API_ERROR', 'api', { message: `API error ${res.status}: ${text}` });
      }
      const data = await res.json();
      this.logger?.debug(`POST ${path} → ${res.status}`, { response: data });
      try {
        return schema.parse(data);
      } catch (zodErr) {
        this.logger?.error(`POST ${path} schema validation failed`, {
          request: body,
          response: data,
          error: zodErr instanceof Error ? zodErr.message : String(zodErr),
        });
        throw zodErr;
      }
    } catch (err) {
      if (err instanceof ChainError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        this.logger?.debug(`POST ${path} → TIMEOUT (${this.timeoutMs}ms)`, { request: body });
        throw new ChainError('ACTION_API_TIMEOUT', 'api', { message: `API timeout after ${this.timeoutMs}ms` });
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
