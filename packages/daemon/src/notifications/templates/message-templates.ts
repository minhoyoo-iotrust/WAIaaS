import type { NotificationEventType } from '@waiaas/core';
import { getMessages, type SupportedLocale } from '@waiaas/core';

export interface NotificationMessage {
  title: string;
  body: string;
}

/** Human-friendly transaction type labels per locale (#205). */
const TX_TYPE_LABELS: Record<string, Record<string, string>> = {
  ko: {
    TRANSFER: '전송',
    TOKEN_TRANSFER: '토큰 전송',
    CONTRACT_CALL: '컨트랙트 호출',
    APPROVE: '토큰 승인',
    BATCH: '배치 전송',
    SIGN: '서명',
    X402_PAYMENT: 'x402 결제',
  },
  en: {
    TRANSFER: 'transfer',
    TOKEN_TRANSFER: 'token transfer',
    CONTRACT_CALL: 'contract call',
    APPROVE: 'approval',
    BATCH: 'batch',
    SIGN: 'signing',
    X402_PAYMENT: 'x402 payment',
  },
};

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

  // Convert raw tx type to human-friendly label (#205)
  const resolvedVars = vars ? { ...vars } : undefined;
  if (resolvedVars?.type) {
    const labels = TX_TYPE_LABELS[locale] ?? TX_TYPE_LABELS.en!;
    resolvedVars.type = labels[resolvedVars.type] ?? resolvedVars.type;
  }

  // Interpolate {variable} placeholders
  if (resolvedVars) {
    for (const [key, value] of Object.entries(resolvedVars)) {
      title = title.replaceAll(`{${key}}`, value);
      body = body.replaceAll(`{${key}}`, value);
    }
  }

  // Remove un-substituted optional placeholders (fallback safety net)
  for (const placeholder of ['{display_amount}', '{type}', '{amount}', '{to}', '{amountUsd}', '{delaySeconds}']) {
    title = title.replaceAll(placeholder, '');
    body = body.replaceAll(placeholder, '');
  }

  return { title: title.trim(), body: body.trim() };
}
