/**
 * WAIaaSPluginClient: fetch-based HTTP client for WAIaaS daemon.
 *
 * Uses Node.js 22 built-in fetch. Sends Bearer token on every request.
 * Returns structured result: { ok: true, data } | { ok: false, error }
 */

const USER_AGENT = '@waiaas/openclaw-plugin/1.0.0';

export type PluginResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

export class WAIaaSPluginClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
  }

  async get<T>(path: string): Promise<PluginResult<T>> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body: unknown): Promise<PluginResult<T>> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<PluginResult<T>> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
          'User-Agent': USER_AGENT,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null) as Record<string, unknown> | null;
        const message = typeof errBody?.['message'] === 'string'
          ? errBody['message']
          : `HTTP ${res.status}`;
        return { ok: false, error: message, status: res.status };
      }
      const data = await res.json() as T;
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
  }
}

export function createClient(daemonUrl: string, sessionToken: string): WAIaaSPluginClient {
  return new WAIaaSPluginClient(daemonUrl, sessionToken);
}

/**
 * Convert PluginResult to a plain object for tool handler return.
 */
export function toResult<T>(result: PluginResult<T>): unknown {
  if (result.ok) return result.data;
  return { error: result.error, status: result.status };
}
