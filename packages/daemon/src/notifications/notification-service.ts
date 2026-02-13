/**
 * NotificationService orchestrator: priority-based delivery with fallback,
 * broadcast mode for critical events, per-channel rate limiting, and
 * CRITICAL audit_log on total failure.
 *
 * @see docs/35-notification-architecture.md
 */

import type { INotificationChannel, NotificationPayload } from '@waiaas/core';
import type { NotificationEventType, SupportedLocale } from '@waiaas/core';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { getNotificationMessage } from './templates/message-templates.js';
import * as schema from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';

// Broadcast event types -- sent to ALL channels simultaneously
const BROADCAST_EVENTS: Set<string> = new Set([
  'KILL_SWITCH_ACTIVATED',
  'KILL_SWITCH_RECOVERED',
  'AUTO_STOP_TRIGGERED',
]);

export interface NotificationServiceConfig {
  locale: SupportedLocale;
  rateLimitRpm: number; // per-channel rate limit (requests per minute)
}

export class NotificationService {
  private channels: INotificationChannel[] = [];
  private db: BetterSQLite3Database<typeof schema> | null = null;
  private config: NotificationServiceConfig = { locale: 'en', rateLimitRpm: 20 };

  // Rate limiter: Map<channelName, timestamps[]>
  private rateLimitMap = new Map<string, number[]>();

  constructor(opts?: {
    db?: BetterSQLite3Database<typeof schema>;
    config?: Partial<NotificationServiceConfig>;
  }) {
    if (opts?.db) this.db = opts.db;
    if (opts?.config) this.config = { ...this.config, ...opts.config };
  }

  /** Add initialized channel to the service. */
  addChannel(channel: INotificationChannel): void {
    this.channels.push(channel);
  }

  /** Get list of configured channel names. */
  getChannelNames(): string[] {
    return this.channels.map((c) => c.name);
  }

  /** Get list of configured channels (for admin test send). */
  getChannels(): INotificationChannel[] {
    return [...this.channels];
  }

  /**
   * Send notification via priority-based delivery with fallback.
   * Tries channels in order; on failure, falls back to next channel.
   * For broadcast events, sends to ALL channels.
   */
  async notify(
    eventType: NotificationEventType,
    walletId: string,
    vars?: Record<string, string>,
    details?: Record<string, unknown>,
  ): Promise<void> {
    if (this.channels.length === 0) return; // No channels configured

    const { title, body } = getNotificationMessage(eventType, this.config.locale, vars);
    const payload: NotificationPayload = {
      eventType,
      walletId,
      message: `${title}\n${body}`,
      details,
      timestamp: Math.floor(Date.now() / 1000),
    };

    if (BROADCAST_EVENTS.has(eventType)) {
      await this.broadcast(payload);
    } else {
      await this.sendWithFallback(payload);
    }
  }

  /**
   * Send to ALL channels simultaneously (for critical events).
   * If ALL channels fail, logs CRITICAL to audit_log.
   */
  private async broadcast(payload: NotificationPayload): Promise<void> {
    const results = await Promise.allSettled(
      this.channels.map(async (ch) => {
        try {
          await this.sendToChannel(ch, payload);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          this.logDelivery(ch.name, payload, 'failed', errorMsg);
          throw err; // re-throw so allSettled records rejection
        }
      }),
    );

    const allFailed = results.every((r) => r.status === 'rejected');
    if (allFailed) {
      await this.logCriticalFailure(payload, results);
    }
  }

  /**
   * Priority-based fallback: try channels in order, stop on first success.
   * If all fail, log CRITICAL to audit_log.
   */
  private async sendWithFallback(payload: NotificationPayload): Promise<void> {
    for (const channel of this.channels) {
      try {
        await this.sendToChannel(channel, payload);
        return; // Success -- stop trying
      } catch (err) {
        // Log failed delivery attempt
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logDelivery(channel.name, payload, 'failed', errorMsg);
        continue;
      }
    }
    // All channels failed
    await this.logCriticalFailure(payload);
  }

  /**
   * Send to a single channel with rate limit check.
   */
  private async sendToChannel(
    channel: INotificationChannel,
    payload: NotificationPayload,
  ): Promise<void> {
    if (this.isRateLimited(channel.name)) {
      throw new Error(`Rate limited: ${channel.name}`);
    }
    await channel.send(payload);
    this.recordSend(channel.name);
    // Log successful delivery
    this.logDelivery(channel.name, payload, 'sent');
  }

  /** Check if channel is rate limited (sliding window). */
  private isRateLimited(channelName: string): boolean {
    const now = Date.now();
    const windowMs = 60_000; // 1 minute
    const timestamps = this.rateLimitMap.get(channelName) ?? [];
    // Remove entries older than window
    const recent = timestamps.filter((t) => now - t < windowMs);
    this.rateLimitMap.set(channelName, recent);
    return recent.length >= this.config.rateLimitRpm;
  }

  /** Record a successful send for rate limiting. */
  private recordSend(channelName: string): void {
    const timestamps = this.rateLimitMap.get(channelName) ?? [];
    timestamps.push(Date.now());
    this.rateLimitMap.set(channelName, timestamps);
  }

  /**
   * Record notification delivery result to notification_logs table.
   * Fire-and-forget: errors are swallowed to never block the pipeline.
   */
  private logDelivery(
    channelName: string,
    payload: NotificationPayload,
    status: 'sent' | 'failed',
    error?: string,
  ): void {
    if (!this.db) return;

    try {
      this.db
        .insert(schema.notificationLogs)
        .values({
          id: generateId(),
          eventType: payload.eventType,
          walletId: payload.walletId,
          channel: channelName,
          status,
          error: error ?? null,
          createdAt: new Date(payload.timestamp * 1000),
        })
        .run();
    } catch {
      // Fire-and-forget: swallow DB errors to never block notification flow
    }
  }

  /**
   * Log CRITICAL failure to audit_log when all channels fail.
   */
  private async logCriticalFailure(
    payload: NotificationPayload,
    results?: PromiseSettledResult<void>[],
  ): Promise<void> {
    if (!this.db) {
      console.error('CRITICAL: All notification channels failed, no DB for audit log', {
        eventType: payload.eventType,
        walletId: payload.walletId,
      });
      return;
    }

    try {
      const errorDetails = results
        ? results
            .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
            .map((r) => String(r.reason))
            .join('; ')
        : 'All channels failed';

      this.db
        .insert(schema.auditLog)
        .values({
          timestamp: new Date(payload.timestamp * 1000),
          eventType: 'NOTIFICATION_TOTAL_FAILURE',
          actor: 'system',
          walletId: payload.walletId,
          details: JSON.stringify({
            originalEvent: payload.eventType,
            message: payload.message,
            errors: errorDetails,
          }),
          severity: 'critical',
        })
        .run();
    } catch (err) {
      console.error('CRITICAL: Failed to write audit log for notification failure', err);
    }
  }
}
