import type { INotificationChannel, NotificationPayload } from '@waiaas/core';

export class SlackChannel implements INotificationChannel {
  readonly name = 'slack';
  private webhookUrl = '';

  async initialize(config: Record<string, unknown>): Promise<void> {
    this.webhookUrl = String(config.slack_webhook_url ?? '');
    if (!this.webhookUrl) {
      throw new Error('SlackChannel: slack_webhook_url required');
    }
  }

  async send(payload: NotificationPayload): Promise<void> {
    // Slack Incoming Webhook with attachments format
    const color = this.getColor(payload.eventType);

    const fields: Array<{ title: string; value: string; short: boolean }> = [];
    if (payload.walletId) {
      fields.push({ title: 'Wallet', value: payload.walletId, short: true });
    }
    fields.push({ title: 'Event', value: payload.eventType, short: true });

    // Add details fields if present
    if (payload.details) {
      for (const [key, value] of Object.entries(payload.details)) {
        fields.push({ title: key, value: String(value), short: true });
      }
    }

    const attachment = {
      fallback: payload.message,
      color,
      title: `[WAIaaS] ${payload.title}`,
      text: payload.body,
      fields,
      ...(payload.walletId ? { ts: payload.timestamp } : {}),
    };

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attachments: [attachment] }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`SlackChannel: ${response.status} ${body}`);
    }
  }

  /** Map event severity to Slack attachment color (hex string). */
  private getColor(eventType: string): string {
    if (eventType.includes('KILL_SWITCH') || eventType.includes('AUTO_STOP') || eventType.includes('SUSPENDED')) {
      return '#ff0000'; // Red for critical/security events
    }
    if (eventType.includes('FAILED') || eventType.includes('VIOLATION') || eventType.includes('EXPIRED')) {
      return '#ff8c00'; // Orange for failures/warnings
    }
    if (eventType.includes('CONFIRMED') || eventType.includes('RECOVERED') || eventType.includes('VERIFIED')) {
      return '#00ff00'; // Green for success
    }
    return '#0099ff'; // Blue for informational
  }
}
