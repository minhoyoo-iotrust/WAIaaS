/**
 * E2EHttpClient — Node fetch wrapper with auto-auth token attachment.
 *
 * Provides typed GET/POST/PUT/DELETE/PATCH methods with automatic
 * Authorization header injection and JSON parsing.
 */

export interface HttpResponse<T = unknown> {
  status: number;
  body: T;
  headers: Headers;
}

export class E2EHttpClient {
  private token?: string;

  constructor(
    private baseUrl: string,
    token?: string,
  ) {
    this.token = token;
  }

  /** Set the auth token (called after session creation). */
  setToken(token: string): void {
    this.token = token;
  }

  /** Remove the auth token. */
  clearToken(): void {
    this.token = undefined;
  }

  /** GET request. */
  async get<T = unknown>(
    path: string,
    opts?: { headers?: Record<string, string> },
  ): Promise<HttpResponse<T>> {
    return this.request<T>('GET', path, undefined, opts);
  }

  /** POST request with JSON body. */
  async post<T = unknown>(
    path: string,
    body?: unknown,
    opts?: { headers?: Record<string, string> },
  ): Promise<HttpResponse<T>> {
    return this.request<T>('POST', path, body, opts);
  }

  /** PUT request with JSON body. */
  async put<T = unknown>(
    path: string,
    body?: unknown,
    opts?: { headers?: Record<string, string> },
  ): Promise<HttpResponse<T>> {
    return this.request<T>('PUT', path, body, opts);
  }

  /** DELETE request. */
  async delete<T = unknown>(
    path: string,
    opts?: { headers?: Record<string, string> },
  ): Promise<HttpResponse<T>> {
    return this.request<T>('DELETE', path, undefined, opts);
  }

  /** PATCH request with JSON body. */
  async patch<T = unknown>(
    path: string,
    body?: unknown,
    opts?: { headers?: Record<string, string> },
  ): Promise<HttpResponse<T>> {
    return this.request<T>('PATCH', path, body, opts);
  }

  /** Internal fetch wrapper. */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    opts?: { headers?: Record<string, string> },
  ): Promise<HttpResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {};

    // Auto-attach auth token
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    // Content-Type for requests with body
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    // Merge custom headers
    if (opts?.headers) {
      Object.assign(headers, opts.headers);
    }

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    // Parse response body
    let responseBody: T;
    const contentType = res.headers.get('content-type') ?? '';

    if (res.status === 204 || res.headers.get('content-length') === '0') {
      responseBody = null as T;
    } else if (contentType.includes('application/json')) {
      responseBody = (await res.json()) as T;
    } else {
      responseBody = (await res.text()) as T;
    }

    return {
      status: res.status,
      body: responseBody,
      headers: res.headers,
    };
  }
}
