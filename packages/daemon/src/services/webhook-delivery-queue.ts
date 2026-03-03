/**
 * WebhookDeliveryQueue: fire-and-forget delivery with HMAC-SHA256 signing and retry.
 *
 * Delivers webhook payloads to subscriber URLs with:
 * - HMAC-SHA256 signature (X-WAIaaS-Signature header)
 * - Exponential backoff retry (max 4 attempts: 0s, 1s, 2s, 4s)
 * - 4xx immediate stop (client error, no retry)
 * - 10s timeout per request
 * - Per-attempt logging to webhook_logs table
 *
 * @see .planning/milestones/v30.0-phases/307/DESIGN-SPEC.md (OPS-04 section 5)
 */

import { createHmac } from 'node:crypto';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import { decryptSettingValue } from '../infrastructure/settings/settings-crypto.js';
import { generateId } from '../infrastructure/database/id.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebhookPayload {
  id: string;
  event: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface WebhookDeliveryJob {
  webhookId: string;
  url: string;
  secretEncrypted: string;
  eventType: string;
  payload: WebhookPayload;
  deliveryId: string;
}

// ---------------------------------------------------------------------------
// WebhookDeliveryQueue
// ---------------------------------------------------------------------------

export class WebhookDeliveryQueue {
  private readonly maxAttempts = 4;
  private readonly timeoutMs = 10_000;
  private readonly backoffMs = [0, 1000, 2000, 4000];

  constructor(
    private readonly sqlite: SQLiteDatabase,
    private readonly getMasterPassword: () => string,
  ) {}

  /**
   * Enqueue a delivery job (fire-and-forget).
   * The delivery runs asynchronously and errors are caught internally.
   */
  enqueue(job: WebhookDeliveryJob): void {
    this.deliver(job, 1).catch((err) => {
      console.error('[WebhookDeliveryQueue] unhandled delivery error:', err);
    });
  }

  /**
   * Deliver a webhook payload with retry logic.
   */
  private async deliver(job: WebhookDeliveryJob, attempt: number): Promise<void> {
    const startTime = Date.now();
    let httpStatus: number | null = null;
    let error: string | null = null;

    try {
      // Decrypt secret for HMAC signing
      const secret = decryptSettingValue(job.secretEncrypted, this.getMasterPassword());
      const body = JSON.stringify(job.payload);
      const signature = this.sign(secret, body);
      const timestamp = Math.floor(Date.now() / 1000);

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-WAIaaS-Signature': signature,
        'X-WAIaaS-Event': job.eventType,
        'X-WAIaaS-Delivery': job.deliveryId,
        'X-WAIaaS-Timestamp': String(timestamp),
        'User-Agent': 'WAIaaS-Webhook/1.0',
      };

      const response = await fetch(job.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      httpStatus = response.status;
      const duration = Date.now() - startTime;

      if (response.ok) {
        // 2xx success
        this.logAttempt(job.webhookId, job.eventType, 'success', httpStatus, attempt, null, duration);
        return;
      }

      if (httpStatus >= 400 && httpStatus < 500) {
        // 4xx client error -- no retry
        error = `HTTP ${httpStatus}: client error`;
        this.logAttempt(job.webhookId, job.eventType, 'failed', httpStatus, attempt, error, duration);
        return;
      }

      // 5xx server error -- retry
      error = `HTTP ${httpStatus}: server error`;
      this.logAttempt(job.webhookId, job.eventType, 'failed', httpStatus, attempt, error, duration);
    } catch (err) {
      // Network error or timeout
      const duration = Date.now() - startTime;
      error = err instanceof Error ? err.message : String(err);
      this.logAttempt(job.webhookId, job.eventType, 'failed', null, attempt, error, duration);
    }

    // Retry with backoff if attempts remain
    if (attempt < this.maxAttempts) {
      const delay = this.backoffMs[attempt] ?? 4000;
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), delay);
      });
      return this.deliver(job, attempt + 1);
    }
  }

  /**
   * Produce HMAC-SHA256 signature in "sha256={hex}" format.
   */
  sign(secret: string, body: string): string {
    return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
  }

  /**
   * Log a single delivery attempt to webhook_logs.
   */
  private logAttempt(
    webhookId: string,
    eventType: string,
    status: 'success' | 'failed',
    httpStatus: number | null,
    attempt: number,
    error: string | null,
    requestDuration: number | null,
  ): void {
    try {
      this.sqlite
        .prepare(
          `INSERT INTO webhook_logs (id, webhook_id, event_type, status, http_status, attempt, error, request_duration, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          generateId(),
          webhookId,
          eventType,
          status,
          httpStatus,
          attempt,
          error,
          requestDuration,
          Math.floor(Date.now() / 1000),
        );
    } catch (err) {
      console.error('[WebhookDeliveryQueue] failed to log attempt:', err);
    }
  }
}
