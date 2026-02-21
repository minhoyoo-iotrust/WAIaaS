import type { INotificationChannel, NotificationPayload } from '@waiaas/core';

export class TelegramChannel implements INotificationChannel {
  readonly name = 'telegram';
  private botToken = '';
  private chatId = '';

  async initialize(config: Record<string, unknown>): Promise<void> {
    this.botToken = String(config.telegram_bot_token ?? '');
    this.chatId = String(config.telegram_chat_id ?? '');
    if (!this.botToken || !this.chatId) {
      throw new Error('TelegramChannel: telegram_bot_token and telegram_chat_id required');
    }
  }

  async send(payload: NotificationPayload): Promise<void> {
    // Format as MarkdownV2 (escape special chars)
    const text = this.formatMarkdownV2(payload);
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: this.chatId,
        text,
        parse_mode: 'MarkdownV2',
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`TelegramChannel: ${response.status} ${body}`);
    }
  }

  private formatMarkdownV2(payload: NotificationPayload): string {
    // MarkdownV2 requires escaping: _ * [ ] ( ) ~ ` > # + - = | { } . !
    const escape = (s: string) =>
      s.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');

    const title = `*${escape(payload.title)}*`;
    const body = escape(payload.body);
    const parts = [title, '', body];

    // Only show wallet/time for wallet-specific events
    if (payload.walletId) {
      parts.push('', escape(`Wallet: ${payload.walletId}`));
      parts.push(escape(new Date(payload.timestamp * 1000).toISOString()));
    }

    return parts.join('\n');
  }
}
