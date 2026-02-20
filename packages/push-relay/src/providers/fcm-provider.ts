import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
import type { PushPayload } from '../subscriber/message-parser.js';
import type { IPushProvider, PushResult } from './push-provider.js';
import { withRetry, isRetryableHttpError } from './push-provider.js';
import type { FcmConfig } from '../config.js';

const TOKEN_EXPIRY_MS = 3_500_000; // ~58 minutes (tokens last 60 min)
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

export class FcmProvider implements IPushProvider {
  readonly name = 'fcm';
  private readonly projectId: string;
  private readonly serviceAccountKeyPath: string;
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(config: FcmConfig) {
    this.projectId = config.project_id;
    this.serviceAccountKeyPath = config.service_account_key_path;
  }

  async send(tokens: string[], payload: PushPayload): Promise<PushResult> {
    if (tokens.length === 0) {
      return { sent: 0, failed: 0, invalidTokens: [] };
    }

    const accessToken = await this.getAccessToken();
    let sent = 0;
    let failed = 0;
    const invalidTokens: string[] = [];

    // FCM v1 sends one message per token
    for (const token of tokens) {
      try {
        await this.sendSingle(accessToken, token, payload);
        sent++;
      } catch (err) {
        failed++;
        if (err instanceof FcmInvalidTokenError) {
          invalidTokens.push(token);
        }
      }
    }

    return { sent, failed, invalidTokens };
  }

  async validateConfig(): Promise<boolean> {
    try {
      const raw = readFileSync(this.serviceAccountKeyPath, 'utf-8');
      const key = JSON.parse(raw) as { client_email?: string; private_key?: string };
      return !!(key.client_email && key.private_key);
    } catch {
      return false;
    }
  }

  private async sendSingle(
    accessToken: string,
    token: string,
    payload: PushPayload,
  ): Promise<void> {
    const url = `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`;
    const body = {
      message: {
        token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data,
        android: {
          priority: payload.priority === 'high' ? 'HIGH' : 'NORMAL',
        },
        apns: {
          headers: {
            'apns-priority': payload.priority === 'high' ? '10' : '5',
          },
        },
      },
    };

    await withRetry(
      async () => {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const errorBody = (await res.json().catch(() => ({}))) as {
            error?: { status?: string };
          };

          if (res.status === 401 || res.status === 403) {
            throw new FcmAuthError(`FCM auth failed: HTTP ${res.status}`);
          }
          if (
            res.status === 404 ||
            errorBody.error?.status === 'NOT_FOUND' ||
            errorBody.error?.status === 'UNREGISTERED'
          ) {
            throw new FcmInvalidTokenError(`FCM invalid token: ${token}`);
          }
          if (isRetryableHttpError(res.status)) {
            throw new FcmRetryableError(`FCM server error: HTTP ${res.status}`);
          }
          throw new Error(`FCM error: HTTP ${res.status}`);
        }
      },
      (err) => err instanceof FcmRetryableError,
    );
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const raw = readFileSync(this.serviceAccountKeyPath, 'utf-8');
    const key = JSON.parse(raw) as {
      client_email: string;
      private_key: string;
      token_uri: string;
    };

    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: key.client_email,
        scope: FCM_SCOPE,
        aud: key.token_uri,
        iat: now,
        exp: now + 3600,
      }),
    ).toString('base64url');

    const unsigned = `${header}.${payload}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsigned);
    const signature = signer.sign(key.private_key, 'base64url');
    const jwt = `${unsigned}.${signature}`;

    const res = await fetch(key.token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    if (!res.ok) {
      throw new Error(`Failed to get FCM access token: HTTP ${res.status}`);
    }

    const tokenResponse = (await res.json()) as { access_token: string };
    this.accessToken = tokenResponse.access_token;
    this.tokenExpiresAt = Date.now() + TOKEN_EXPIRY_MS;
    return this.accessToken;
  }
}

class FcmAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FcmAuthError';
  }
}

class FcmRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FcmRetryableError';
  }
}

class FcmInvalidTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FcmInvalidTokenError';
  }
}
