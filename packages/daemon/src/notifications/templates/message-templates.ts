import type { NotificationEventType } from '@waiaas/core';
import { getMessages, type SupportedLocale } from '@waiaas/core';

export interface NotificationMessage {
  title: string;
  body: string;
}

/**
 * Get a notification message for a given event type and locale,
 * with template variables interpolated.
 */
export function getNotificationMessage(
  eventType: NotificationEventType,
  locale: SupportedLocale,
  vars?: Record<string, string>,
): NotificationMessage {
  const messages = getMessages(locale);
  const template = messages.notifications[eventType];
  let { title, body } = template;

  // Interpolate {variable} placeholders
  if (vars) {
    for (const [key, value] of Object.entries(vars)) {
      title = title.replaceAll(`{${key}}`, value);
      body = body.replaceAll(`{${key}}`, value);
    }
  }

  // Remove un-substituted {display_amount} placeholder (optional variable)
  title = title.replaceAll('{display_amount}', '');
  body = body.replaceAll('{display_amount}', '');

  return { title: title.trim(), body: body.trim() };
}
