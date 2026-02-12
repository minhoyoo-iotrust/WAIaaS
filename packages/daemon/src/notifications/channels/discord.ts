import type { INotificationChannel, NotificationPayload } from '@waiaas/core';

export class DiscordChannel implements INotificationChannel {
  readonly name = 'discord';
  private webhookUrl = '';

  async initialize(config: Record<string, unknown>): Promise<void> {
    this.webhookUrl = String(config.discord_webhook_url ?? '');
    if (!this.webhookUrl) {
      throw new Error('DiscordChannel: discord_webhook_url required');
    }
  }

  async send(payload: NotificationPayload): Promise<void> {
    // Discord Webhook with Embed format
    const color = this.getColor(payload.eventType);

    const embed: Record<string, unknown> = {
      title: payload.eventType.replace(/_/g, ' '),
      description: payload.message,
      color,
      fields: [
        { name: 'Wallet', value: payload.walletId, inline: true },
        { name: 'Event', value: payload.eventType, inline: true },
      ],
      timestamp: new Date(payload.timestamp * 1000).toISOString(),
    };

    // Add details fields if present
    if (payload.details) {
      const fields = embed.fields as Array<{ name: string; value: string; inline: boolean }>;
      for (const [key, value] of Object.entries(payload.details)) {
        fields.push({ name: key, value: String(value), inline: true });
      }
    }

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`DiscordChannel: ${response.status} ${body}`);
    }
  }

  /** Map event severity to Discord embed color (hex integer). */
  private getColor(eventType: string): number {
    if (eventType.includes('KILL_SWITCH') || eventType.includes('AUTO_STOP') || eventType.includes('SUSPENDED')) {
      return 0xff0000; // Red for critical/security events
    }
    if (eventType.includes('FAILED') || eventType.includes('VIOLATION') || eventType.includes('EXPIRED')) {
      return 0xff8c00; // Orange for failures/warnings
    }
    if (eventType.includes('CONFIRMED') || eventType.includes('RECOVERED') || eventType.includes('VERIFIED')) {
      return 0x00ff00; // Green for success
    }
    return 0x0099ff; // Blue for informational
  }
}
