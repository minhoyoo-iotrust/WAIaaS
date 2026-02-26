/**
 * `waiaas notification setup` -- Set up Telegram notifications.
 *
 * Flow:
 *   1. Health check (GET /health)
 *   2. Resolve master password
 *   3. Collect bot-token (--bot-token or hidden prompt)
 *   4. Collect chat-id (--chat-id or visible prompt)
 *   5. Validate locale (en/ko)
 *   6. PUT /v1/admin/settings (6 keys)
 *   7. Test notification (--test or interactive prompt)
 *   8. Display results
 */

import { resolvePassword, promptPassword } from '../utils/password.js';
import { promptText } from '../utils/prompt.js';

export interface NotificationSetupOptions {
  baseUrl?: string;
  botToken?: string;
  chatId?: string;
  locale?: string;
  password?: string;
  test?: boolean;
}

const VALID_LOCALES = ['en', 'ko'] as const;

export async function notificationSetupCommand(opts: NotificationSetupOptions): Promise<void> {
  const baseUrl = (opts.baseUrl ?? 'http://127.0.0.1:3100').replace(/\/+$/, '');

  // Step 1: Health check
  try {
    const healthRes = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!healthRes.ok) {
      console.error(`Warning: daemon returned ${healthRes.status} on health check`);
    }
  } catch {
    console.error('Error: Cannot reach WAIaaS daemon.');
    console.error(`  Tried: ${baseUrl}/health`);
    console.error('  Make sure the daemon is running: waiaas start');
    process.exit(1);
  }

  // Step 2: Resolve master password
  const password = opts.password ?? await resolvePassword();

  // Step 3: Collect bot token
  let botToken = opts.botToken;
  if (!botToken) {
    botToken = await promptPassword('Telegram bot token: ');
  }

  // Step 4: Collect chat ID
  let chatId = opts.chatId;
  if (!chatId) {
    chatId = await promptText('Telegram chat ID: ');
  }
  if (!chatId) {
    console.error('Error: Chat ID cannot be empty.');
    process.exit(1);
  }

  // Step 5: Validate locale
  const locale = opts.locale ?? 'en';
  if (!VALID_LOCALES.includes(locale as typeof VALID_LOCALES[number])) {
    console.error(`Error: Invalid locale '${locale}'. Must be 'en' or 'ko'.`);
    process.exit(1);
  }

  // Step 6: PUT /v1/admin/settings
  const settings = [
    { key: 'notifications.enabled', value: 'true' },
    { key: 'notifications.telegram_bot_token', value: botToken },
    { key: 'notifications.telegram_chat_id', value: chatId },
    { key: 'notifications.locale', value: locale },
    { key: 'telegram.bot_token', value: botToken },
    { key: 'telegram.locale', value: locale },
  ];

  let putRes: Response;
  try {
    putRes = await fetch(`${baseUrl}/v1/admin/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Password': password,
      },
      body: JSON.stringify({ settings }),
    });
  } catch {
    console.error('Error: Failed to connect to daemon.');
    process.exit(1);
  }

  if (!putRes.ok) {
    const body = await putRes.json().catch(() => null) as Record<string, unknown> | null;
    const msg = body?.['message'] ?? putRes.statusText;
    console.error(`Error (${putRes.status}): ${msg}`);
    process.exit(1);
  }

  console.log('Telegram notification configured successfully!');
  console.log(`  Chat ID: ${chatId}`);
  console.log(`  Locale:  ${locale}`);

  // Step 7 & 8: Test notification
  const allOptionsProvided = opts.botToken && opts.chatId;
  let shouldTest = opts.test ?? false;

  if (!shouldTest && !allOptionsProvided) {
    const answer = await promptText('Send test notification? (y/N): ');
    shouldTest = answer.toLowerCase() === 'y';
  }

  if (shouldTest) {
    await sendTestNotification(baseUrl, password);
  }
}

async function sendTestNotification(baseUrl: string, password: string): Promise<void> {
  let testRes: Response;
  try {
    testRes = await fetch(`${baseUrl}/v1/admin/notifications/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Password': password,
      },
      body: JSON.stringify({ channel: 'telegram' }),
    });
  } catch {
    console.error('Error: Failed to send test notification.');
    return;
  }

  if (!testRes.ok) {
    const body = await testRes.json().catch(() => null) as Record<string, unknown> | null;
    const msg = body?.['message'] ?? testRes.statusText;
    console.error(`Error: Test notification failed (${testRes.status}): ${msg}`);
    return;
  }

  const data = await testRes.json() as { results: Array<{ channel: string; success: boolean; error?: string }> };
  for (const r of data.results) {
    if (r.success) {
      console.log(`Test notification sent to ${r.channel} successfully!`);
    } else {
      console.error(`Test notification to ${r.channel} failed: ${r.error ?? 'unknown error'}`);
    }
  }
}
