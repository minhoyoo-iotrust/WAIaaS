import type { PushPayload } from '../subscriber/message-parser.js';
import type { IPushProvider, PushResult } from './push-provider.js';
import { withRetry, isRetryableHttpError } from './push-provider.js';
import type { PushwooshConfig } from '../config.js';

const PUSHWOOSH_API_URL = 'https://cp.pushwoosh.com/json/1.3/createMessage';

export class PushwooshProvider implements IPushProvider {
  readonly name = 'pushwoosh';
  private readonly apiToken: string;
  private readonly applicationCode: string;

  constructor(config: PushwooshConfig) {
    this.apiToken = config.api_token;
    this.applicationCode = config.application_code;
  }

  async send(tokens: string[], payload: PushPayload): Promise<PushResult> {
    if (tokens.length === 0) {
      return { sent: 0, failed: 0, invalidTokens: [] };
    }

    const body = {
      request: {
        application: this.applicationCode,
        auth: this.apiToken,
        notifications: [
          {
            send_date: 'now',
            content: payload.body,
            data: payload.data,
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
        const res = await fetch(PUSHWOOSH_API_URL, {
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
