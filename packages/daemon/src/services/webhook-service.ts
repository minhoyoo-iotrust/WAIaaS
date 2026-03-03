/**
 * WebhookService: dispatches events to registered webhooks.
 *
 * Queries enabled webhooks from DB, filters by subscribed events array,
 * and enqueues delivery jobs to WebhookDeliveryQueue. Operates independently
 * from NotificationService (different concerns: N URLs + HMAC vs single channel).
 *
 * EventBus listener registration is done in Plan 03; this service exposes
 * dispatch() as public for both EventBus listeners and direct callers.
 *
 * @see .planning/milestones/v30.0-phases/307/DESIGN-SPEC.md (OPS-04 section 7)
 */

import type { Database as SQLiteDatabase } from 'better-sqlite3';
import type { EventBus } from '@waiaas/core';
import { WebhookDeliveryQueue } from './webhook-delivery-queue.js';
import { generateId } from '../infrastructure/database/id.js';
import type { WebhookPayload } from './webhook-delivery-queue.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WebhookRow {
  id: string;
  url: string;
  secret_encrypted: string;
  events: string; // JSON array
}

// ---------------------------------------------------------------------------
// WebhookService
// ---------------------------------------------------------------------------

export class WebhookService {
  private readonly queue: WebhookDeliveryQueue;
  private disposed = false;

  // eventBus stored for Plan 03 EventBus listener registration
  readonly eventBus: EventBus;

  constructor(
    private readonly sqlite: SQLiteDatabase,
    eventBus: EventBus,
    getMasterPassword: () => string,
  ) {
    this.eventBus = eventBus;
    this.queue = new WebhookDeliveryQueue(sqlite, getMasterPassword);
  }

  /**
   * Dispatch an event to all matching enabled webhooks.
   *
   * @param eventType - The webhook event type (e.g., 'TX_CONFIRMED')
   * @param data - Event-specific payload data
   */
  dispatch(eventType: string, data: Record<string, unknown>): void {
    if (this.disposed) return;

    try {
      // Query all enabled webhooks
      const rows = this.sqlite
        .prepare('SELECT id, url, secret_encrypted, events FROM webhooks WHERE enabled = 1')
        .all() as WebhookRow[];

      for (const row of rows) {
        try {
          // Parse events filter
          const subscribedEvents = JSON.parse(row.events) as string[];

          // Empty array = wildcard (match all events)
          if (subscribedEvents.length > 0 && !subscribedEvents.includes(eventType)) {
            continue; // Skip -- event not subscribed
          }

          const deliveryId = generateId();
          const payload: WebhookPayload = {
            id: deliveryId,
            event: eventType,
            timestamp: Math.floor(Date.now() / 1000),
            data,
          };

          this.queue.enqueue({
            webhookId: row.id,
            url: row.url,
            secretEncrypted: row.secret_encrypted,
            eventType,
            payload,
            deliveryId,
          });
        } catch (err) {
          // One webhook error shouldn't block others
          console.error(`[WebhookService] dispatch error for webhook ${row.id}:`, err);
        }
      }
    } catch (err) {
      console.error('[WebhookService] dispatch query error:', err);
    }
  }

  /**
   * Mark service as disposed. Prevents further dispatching.
   * EventBus listeners are cleaned up when daemon calls eventBus.removeAllListeners().
   */
  destroy(): void {
    this.disposed = true;
  }
}
