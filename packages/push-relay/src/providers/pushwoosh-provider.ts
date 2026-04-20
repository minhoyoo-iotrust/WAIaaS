import type { PushPayload, IPushProvider, PushResult } from './push-provider.js';
import { withRetry, isRetryableHttpError } from './push-provider.js';
import type { PushwooshConfig } from '../config.js';
import { debug } from '../logger.js';

export class PushwooshProvider implements IPushProvider {
  readonly name = 'pushwoosh';
  private readonly apiToken: string;
  private readonly applicationCode: string;
  private readonly apiUrl: string;
  private readonly extraFields: Record<string, unknown>;

  constructor(config: Omit<PushwooshConfig, 'extra_fields'> & { extra_fields?: Record<string, unknown> }) {
    this.apiToken = config.api_token;
    this.applicationCode = config.application_code;
    this.apiUrl = config.api_url;
    this.extraFields = config.extra_fields ?? {};
  }

  async send(tokens: string[], payload: PushPayload): Promise<PushResult> {
    if (tokens.length === 0) {
      return { sent: 0, failed: 0, invalidTokens: [] };
    }

    debug(`Pushwoosh: sending to ${tokens.length} device(s), title="${payload.title}", category=${payload.category}`);

    const body = {
      request: {
        application: this.applicationCode,
        auth: this.apiToken,
        notifications: [
          {
            send_date: 'now',
            content: payload.body,
            data: payload.data,
            ...this.extraFields,
            devices: tokens,
            ios_root_params: {
              aps: {
                alert: { title: payload.title, body: payload.body },
                sound: 'default',
                'content-available': 1,
              },
            },
            android_root_params: {
              title: payload.title,
              priority: payload.priority === 'high' ? 'high' : 'normal',
            },
          },
        ],
      },
    };

    const result = await withRetry(
      async () => {
        const res = await fetch(this.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            throw new PushwooshAuthError(`Pushwoosh auth failed: HTTP ${res.status}`);
          }
          if (isRetryableHttpError(res.status)) {
            throw new PushwooshRetryableError(`Pushwoosh server error: HTTP ${res.status}`);
          }
          throw new Error(`Pushwoosh error: HTTP ${res.status}`);
        }

        const json = (await res.json()) as {
          status_code: number;
          status_message: string;
        };

        if (json.status_code !== 200) {
          throw new Error(`Pushwoosh API error: ${json.status_message}`);
        }

        return json;
      },
      (err) => err instanceof PushwooshRetryableError,
    );

    // Pushwoosh doesn't return per-token results in the simple API
    void result;
    debug(`Pushwoosh: sent=${tokens.length}, status=ok`);
    return { sent: tokens.length, failed: 0, invalidTokens: [] };
  }

  async validateConfig(): Promise<boolean> {
    return this.apiToken.length > 0 && this.applicationCode.length > 0;
  }
}

class PushwooshAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PushwooshAuthError';
  }
}

class PushwooshRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PushwooshRetryableError';
  }
}
