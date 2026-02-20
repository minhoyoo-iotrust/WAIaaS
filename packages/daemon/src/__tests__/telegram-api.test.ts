/**
 * TelegramApi unit tests — fetch wrapper for Telegram Bot API.
 *
 * Tests cover:
 *   - getUpdates: success, HTTP error, ok=false
 *   - sendMessage: success, with reply markup, HTTP error
 *   - answerCallbackQuery: success, with text
 *
 * @see packages/daemon/src/infrastructure/telegram/telegram-api.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelegramApi } from '../infrastructure/telegram/telegram-api.js';

const BOT_TOKEN = 'test-token-123';

describe('TelegramApi', () => {
  let api: TelegramApi;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    api = new TelegramApi(BOT_TOKEN);
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── getUpdates ──────────────────────────────────────────────

  describe('getUpdates', () => {
    it('returns updates on success', async () => {
      const updates = [{ update_id: 1 }, { update_id: 2 }];
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: updates }), { status: 200 }),
      );

      const result = await api.getUpdates(0, 30);

      expect(result).toEqual(updates);
      expect(fetchSpy).toHaveBeenCalledWith(
        `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`,
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws on HTTP error', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('', { status: 502 }));
      await expect(api.getUpdates(0, 30)).rejects.toThrow('Telegram API error: 502');
    });

    it('throws on ok=false', async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false, result: [] }), { status: 200 }),
      );
      await expect(api.getUpdates(0, 30)).rejects.toThrow('Telegram API returned ok=false');
    });
  });

  // ── sendMessage ─────────────────────────────────────────────

  describe('sendMessage', () => {
    it('sends message without reply markup', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('', { status: 200 }));

      await api.sendMessage(12345, 'Hello');

      const call = fetchSpy.mock.calls[0]!;
      const body = JSON.parse(call[1]!.body as string);
      expect(body.chat_id).toBe(12345);
      expect(body.text).toBe('Hello');
      expect(body.parse_mode).toBe('MarkdownV2');
      expect(body.reply_markup).toBeUndefined();
    });

    it('sends message with reply markup', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('', { status: 200 }));
      const markup = { inline_keyboard: [[{ text: 'OK', callback_data: 'ok' }]] };

      await api.sendMessage(12345, 'Choose', markup);

      const call = fetchSpy.mock.calls[0]!;
      const body = JSON.parse(call[1]!.body as string);
      expect(body.reply_markup).toEqual(markup);
    });

    it('throws on HTTP error with body', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('Bad Request', { status: 400 }));
      await expect(api.sendMessage(12345, 'Hello')).rejects.toThrow(
        'sendMessage failed: 400 Bad Request',
      );
    });
  });

  // ── answerCallbackQuery ─────────────────────────────────────

  describe('answerCallbackQuery', () => {
    it('answers without text', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('', { status: 200 }));

      await api.answerCallbackQuery('cbq-123');

      const call = fetchSpy.mock.calls[0]!;
      const body = JSON.parse(call[1]!.body as string);
      expect(body.callback_query_id).toBe('cbq-123');
      expect(body.text).toBeUndefined();
    });

    it('answers with text', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('', { status: 200 }));

      await api.answerCallbackQuery('cbq-456', 'Done!');

      const call = fetchSpy.mock.calls[0]!;
      const body = JSON.parse(call[1]!.body as string);
      expect(body.callback_query_id).toBe('cbq-456');
      expect(body.text).toBe('Done!');
    });
  });
});
