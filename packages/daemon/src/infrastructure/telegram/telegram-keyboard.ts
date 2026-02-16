/**
 * Inline keyboard builder utilities for Telegram Bot.
 *
 * Provides reusable keyboard construction for:
 *   - Kill Switch confirm/cancel (Yes/No)
 *   - Wallet selection (dynamic wallet list)
 *   - Transaction approval/rejection (Approve/Reject per tx)
 *
 * Callback data prefixes:
 *   - killswitch:confirm / killswitch:cancel
 *   - newsession:{walletId}
 *   - approve:{txId} / reject:{txId}
 *
 * @see packages/daemon/src/infrastructure/telegram/telegram-bot-service.ts
 */

import type { TelegramInlineKeyboardMarkup } from './telegram-types.js';
import type { Messages } from '@waiaas/core';

/** Kill Switch confirmation keyboard (Yes/No buttons). */
export function buildConfirmKeyboard(
  msgs: Messages['telegram'],
): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: msgs.keyboard_yes, callback_data: 'killswitch:confirm' },
        { text: msgs.keyboard_no, callback_data: 'killswitch:cancel' },
      ],
    ],
  };
}

/** Wallet selection keyboard (one button per wallet). */
export function buildWalletSelectKeyboard(
  wallets: Array<{ id: string; name: string }>,
): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: wallets.map((w) => [
      { text: w.name, callback_data: `newsession:${w.id}` },
    ]),
  };
}

/** Transaction approval/rejection keyboard (Approve + Reject buttons). */
export function buildApprovalKeyboard(
  txId: string,
  msgs: Messages['telegram'],
): TelegramInlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        {
          text: `${msgs.keyboard_approve} ${txId.slice(0, 8)}`,
          callback_data: `approve:${txId}`,
        },
        {
          text: `${msgs.keyboard_reject} ${txId.slice(0, 8)}`,
          callback_data: `reject:${txId}`,
        },
      ],
    ],
  };
}
