/**
 * Telegram Bot API fetch wrapper (Node.js 22 built-in fetch, no external libraries).
 *
 * Provides getUpdates (Long Polling), sendMessage (MarkdownV2), and answerCallbackQuery.
 * AbortSignal.timeout used for request timeout control.
 */

import type {
  TelegramUpdate,
  TelegramInlineKeyboardMarkup,
} from './telegram-types.js';

export class TelegramApi {
  private baseUrl: string;

  constructor(botToken: string) {
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  /**
   * Long-poll for updates from Telegram Bot API.
   *
   * @param offset - Update offset (last update_id + 1)
   * @param timeout - Long-poll timeout in seconds (server-side wait)
   * @returns Array of updates (empty if no new updates)
   */
  async getUpdates(offset: number, timeout: number): Promise<TelegramUpdate[]> {
    const url = `${this.baseUrl}/getUpdates`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        offset,
        timeout,
        allowed_updates: ['message', 'callback_query'],
      }),
      signal: AbortSignal.timeout((timeout + 5) * 1000),
    });
    if (!res.ok) throw new Error(`Telegram API error: ${res.status}`);
    const data = (await res.json()) as { ok: boolean; result: TelegramUpdate[] };
    if (!data.ok) throw new Error('Telegram API returned ok=false');
    return data.result;
  }

  /**
   * Send a text message to a chat.
   *
   * @param chatId - Target chat ID
   * @param text - Message text (MarkdownV2 formatted)
   * @param replyMarkup - Optional inline keyboard markup
   */
  async sendMessage(
    chatId: number,
    text: string,
    replyMarkup?: TelegramInlineKeyboardMarkup,
  ): Promise<void> {
    const url = `${this.baseUrl}/sendMessage`;
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2',
    };
    if (replyMarkup) body.reply_markup = replyMarkup;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const b = await res.text();
      throw new Error(`sendMessage failed: ${res.status} ${b}`);
    }
  }

  /**
   * Answer a callback query (acknowledge button press).
   *
   * @param callbackQueryId - Callback query ID from the update
   * @param text - Optional notification text shown to user
   */
  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    const url = `${this.baseUrl}/answerCallbackQuery`;
    const body: Record<string, unknown> = { callback_query_id: callbackQueryId };
    if (text) body.text = text;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
}
