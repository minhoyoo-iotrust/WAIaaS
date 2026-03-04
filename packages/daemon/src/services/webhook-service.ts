/**
 * WebhookService: dispatches events to registered webhooks.
 *
 * Queries enabled webhooks from DB, filters by subscribed events array,
 * and enqueues delivery jobs to WebhookDeliveryQueue. Operates independently
 * from NotificationService (different concerns: N URLs + HMAC vs single channel).
 *
 * EventBus listeners map internal events to webhook event types:
 * - transaction:completed -> TX_CONFIRMED
 * - transaction:failed -> TX_FAILED
 * - wallet:activity -> TX_SUBMITTED / SESSION_CREATED / OWNER_REGISTERED
 * - kill-switch:state-changed -> KILL_SWITCH_ACTIVATED / KILL_SWITCH_RECOVERED
 * - transaction:incoming -> TX_SUBMITTED (incoming notification)
 *
 * Direct dispatch() calls handle: WALLET_CREATED, WALLET_SUSPENDED,
 * SESSION_REVOKED, POLICY_DENIED, MASTER_AUTH_FAILED, AUTO_STOP_TRIGGERED,
 * NOTIFICATION_TOTAL_FAILURE from their respective handlers.
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

/** Maps wallet:activity event names to webhook event types. */
const ACTIVITY_EVENT_MAP: Record<string, string> = {
  TX_SUBMITTED: 'TX_SUBMITTED',
  SESSION_CREATED: 'SESSION_CREATED',
  OWNER_SET: 'OWNER_REGISTERED',
};

// ---------------------------------------------------------------------------
// WebhookService
// ---------------------------------------------------------------------------

export class WebhookService {
  private readonly queue: WebhookDeliveryQueue;
  private disposed = false;
  readonly eventBus: EventBus;

  constructor(
    private readonly sqlite: SQLiteDatabase,
    eventBus: EventBus,
    getMasterPassword: () => string,
  ) {
    this.eventBus = eventBus;
    this.queue = new WebhookDeliveryQueue(sqlite, getMasterPassword);
    this.registerEventBusListeners();
  }

  /**
   * Register EventBus listeners that map internal events to webhook event types.
   */
  private registerEventBusListeners(): void {
    // transaction:completed -> TX_CONFIRMED
    this.eventBus.on('transaction:completed', (e) => {
      this.dispatch('TX_CONFIRMED', {
        txId: e.txId,
        txHash: e.txHash,
        walletId: e.walletId,
        network: e.network,
        type: e.type,
        amount: e.amount,
      });
    });

    // transaction:failed -> TX_FAILED
    this.eventBus.on('transaction:failed', (e) => {
      this.dispatch('TX_FAILED', {
        txId: e.txId,
        error: e.error,
        walletId: e.walletId,
        network: e.network,
        type: e.type,
      });
    });

    // wallet:activity -> TX_SUBMITTED / SESSION_CREATED / OWNER_REGISTERED
    this.eventBus.on('wallet:activity', (e) => {
      const webhookEvent = ACTIVITY_EVENT_MAP[e.activity];
      if (webhookEvent) {
        this.dispatch(webhookEvent, {
          walletId: e.walletId,
          ...(e.details ?? {}),
        });
      }
    });

    // kill-switch:state-changed -> KILL_SWITCH_ACTIVATED / KILL_SWITCH_RECOVERED
    this.eventBus.on('kill-switch:state-changed', (e) => {
      if (e.state === 'SUSPENDED') {
        this.dispatch('KILL_SWITCH_ACTIVATED', {
          activatedBy: e.activatedBy,
          previousState: e.previousState,
        });
      } else if (e.state === 'ACTIVE' && e.previousState !== 'ACTIVE') {
        this.dispatch('KILL_SWITCH_RECOVERED', {
          activatedBy: e.activatedBy,
        });
      }
    });

    // transaction:incoming -> TX_SUBMITTED (incoming notification)
    this.eventBus.on('transaction:incoming', (e) => {
      this.dispatch('TX_SUBMITTED', {
        txHash: e.txHash,
        fromAddress: e.fromAddress,
        amount: e.amount,
        walletId: e.walletId,
        network: e.network,
        status: e.status,
      });
    });
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
