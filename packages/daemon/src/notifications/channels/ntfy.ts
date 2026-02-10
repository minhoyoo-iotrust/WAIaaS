import type { INotificationChannel, NotificationPayload } from '@waiaas/core';

export class NtfyChannel implements INotificationChannel {
  readonly name = 'ntfy';
  private server = 'https://ntfy.sh';
  private topic = '';

  async initialize(config: Record<string, unknown>): Promise<void> {
    this.server = String(config.ntfy_server ?? 'https://ntfy.sh');
    this.topic = String(config.ntfy_topic ?? '');
    if (!this.topic) {
      throw new Error('NtfyChannel: ntfy_topic required');
    }
  }

  async send(payload: NotificationPayload): Promise<void> {
    // ntfy.sh: POST plain text with headers for title, priority, tags
    const priority = this.mapPriority(payload.eventType);
    const tags = this.mapTags(payload.eventType);
    const url = `${this.server}/${this.topic}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Title': `[WAIaaS] ${payload.eventType.replace(/_/g, ' ')}`,
        'Priority': String(priority),
        'Tags': tags,
      },
      body: `${payload.message}\n\nAgent: ${payload.agentId}\nTime: ${new Date(payload.timestamp * 1000).toISOString()}`,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`NtfyChannel: ${response.status} ${body}`);
    }
  }

  /** Map event type to ntfy priority (1-5, where 5=max). */
  private mapPriority(eventType: string): number {
    if (eventType.includes('KILL_SWITCH') || eventType.includes('AUTO_STOP')) return 5; // urgent
    if (eventType.includes('SUSPENDED') || eventType.includes('FAILED') || eventType.includes('VIOLATION')) return 4; // high
    if (eventType.includes('APPROVAL') || eventType.includes('EXPIR')) return 3; // default
    return 2; // low for informational
  }

  /** Map event type to ntfy tags (emoji shortcodes). */
  private mapTags(eventType: string): string {
    if (eventType.includes('KILL_SWITCH') || eventType.includes('AUTO_STOP')) return 'rotating_light,warning';
    if (eventType.includes('FAILED') || eventType.includes('VIOLATION')) return 'x,warning';
    if (eventType.includes('CONFIRMED') || eventType.includes('RECOVERED')) return 'white_check_mark';
    if (eventType.includes('APPROVAL')) return 'bell';
    if (eventType.includes('SESSION')) return 'key';
    if (eventType.includes('OWNER')) return 'bust_in_silhouette';
    return 'speech_balloon';
  }
}
