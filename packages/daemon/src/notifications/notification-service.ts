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
import { eq } from 'drizzle-orm';
import { getNotificationMessage } from './templates/message-templates.js';
import * as schema from '../infrastructure/database/schema.js';
import { generateId } from '../infrastructure/database/id.js';
import type { WalletNotificationChannel } from '../services/signing-sdk/channels/wallet-notification-channel.js';

// Broadcast event types -- sent to ALL channels simultaneously
const BROADCAST_EVENTS: Set<string> = new Set([
  'KILL_SWITCH_ACTIVATED',
  'KILL_SWITCH_RECOVERED',
  'AUTO_STOP_TRIGGERED',
  'TX_INCOMING_SUSPICIOUS',
]);

export interface NotificationServiceConfig {
  locale: SupportedLocale;
  rateLimitRpm: number; // per-channel rate limit (requests per minute)
}

export class NotificationService {
  private channels: INotificationChannel[] = [];
  private db: BetterSQLite3Database<typeof schema> | null = null;
  private config: NotificationServiceConfig = { locale: 'en', rateLimitRpm: 20 };

  // Wallet notification side channel (v2.7 -- independent of traditional channels)
  private walletNotificationChannel: WalletNotificationChannel | null = null;

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
   * Replace all notification channels with new instances.
   * Used by hot-reload when notification credentials change.
   * Old channels are discarded (no cleanup needed -- they're stateless HTTP clients).
   */
  replaceChannels(newChannels: INotificationChannel[]): void {
    this.channels = [...newChannels];
    // Reset rate limiter for all channels (fresh start with new credentials)
    this.rateLimitMap.clear();
  }

  /**
   * Update config (locale, rateLimitRpm) without replacing channels.
   */
  updateConfig(config: Partial<NotificationServiceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /** Set the wallet notification side channel (injected by daemon lifecycle). */
  setWalletNotificationChannel(channel: WalletNotificationChannel | null): void {
    this.walletNotificationChannel = channel;
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
    // Look up wallet info for display (walletName, address, network)
    const walletInfo = this.lookupWallet(walletId);
    const mergedVars = walletInfo.walletName
      ? { walletName: walletInfo.walletName, ...vars }
      : { walletName: walletId, ...vars };

    // Side channel: wallet app notification (independent of traditional channels, never blocks)
    // Placed BEFORE the channels.length guard so it fires even with zero configured channels.
    if (this.walletNotificationChannel) {
      const { title: sideTitle, body: sideBody } = getNotificationMessage(eventType, this.config.locale, mergedVars);
      // Fire-and-forget with try/catch isolation (DAEMON-06)
      this.walletNotificationChannel.notify(eventType, walletId, sideTitle, sideBody, details).catch(() => {});
    }

    if (this.channels.length === 0) return; // No traditional channels configured

    const { title, body } = getNotificationMessage(eventType, this.config.locale, mergedVars);
    const payload: NotificationPayload = {
      eventType,
      walletId,
      walletName: walletInfo.walletName,
      walletAddress: walletInfo.walletAddress,
      network: walletInfo.network,
      title,
      body,
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
   * Look up wallet name, address, and network from DB.
   * Returns empty strings when DB unavailable, walletId is empty/system, or wallet not found.
   */
  private lookupWallet(walletId: string): { walletName: string; walletAddress: string; network: string } {
    const empty = { walletName: '', walletAddress: '', network: '' };
    if (!this.db || !walletId || walletId === 'system') return empty;

    try {
      const row = this.db
        .select({
          name: schema.wallets.name,
          publicKey: schema.wallets.publicKey,
          defaultNetwork: schema.wallets.defaultNetwork,
          chain: schema.wallets.chain,
        })
        .from(schema.wallets)
        .where(eq(schema.wallets.id, walletId))
        .get();
      if (!row) return empty;
      return {
        walletName: row.name,
        walletAddress: row.publicKey,
        network: row.defaultNetwork ?? row.chain,
      };
    } catch {
      return empty;
    }
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
          message: payload.message ?? null,
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
