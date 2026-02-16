/**
 * Telegram Bot 2-Tier Authorization module.
 *
 * Enforces role-based access control for Telegram Bot commands:
 *   - PUBLIC: /start, /help (anyone, even unregistered)
 *   - READONLY: /status, /wallets (READONLY + ADMIN roles)
 *   - ADMIN: /pending, /approve, /reject, /killswitch, /newsession (ADMIN only)
 *
 * Roles: PENDING (awaiting admin approval), READONLY, ADMIN.
 *
 * Uses better-sqlite3 directly (same pattern as KillSwitchService).
 *
 * @see packages/daemon/src/services/kill-switch-service.ts (SQLite direct pattern)
 */

import type { Database } from 'better-sqlite3';
import type { TelegramUserRole } from './telegram-types.js';

// ---------------------------------------------------------------------------
// Command permission tiers
// ---------------------------------------------------------------------------

export const PUBLIC_COMMANDS = ['/start', '/help'] as const;
export const READONLY_COMMANDS = ['/status', '/wallets'] as const;
export const ADMIN_COMMANDS = ['/pending', '/approve', '/reject', '/killswitch', '/newsession'] as const;

// ---------------------------------------------------------------------------
// TelegramAuth
// ---------------------------------------------------------------------------

export class TelegramAuth {
  constructor(private sqlite: Database) {}

  /**
   * Look up the role for a given chat_id.
   * Returns null if the user is not registered.
   */
  getRole(chatId: number): TelegramUserRole | null {
    const row = this.sqlite
      .prepare('SELECT role FROM telegram_users WHERE chat_id = ?')
      .get(chatId) as { role: string } | undefined;
    return (row?.role as TelegramUserRole) ?? null;
  }

  /**
   * Check whether a chat_id is allowed to execute the given command.
   *
   * @returns `{ allowed: true }` or `{ allowed: false, reason }`.
   *   Possible reasons: 'not_registered', 'pending_approval', 'admin_only'.
   */
  checkPermission(chatId: number, command: string): { allowed: boolean; reason?: string } {
    // PUBLIC commands: anyone (even unregistered) can execute
    if ((PUBLIC_COMMANDS as readonly string[]).includes(command)) {
      return { allowed: true };
    }

    const role = this.getRole(chatId);
    if (!role) return { allowed: false, reason: 'not_registered' };
    if (role === 'PENDING') return { allowed: false, reason: 'pending_approval' };

    // READONLY: /status, /wallets only
    if (role === 'READONLY') {
      if ((READONLY_COMMANDS as readonly string[]).includes(command)) {
        return { allowed: true };
      }
      return { allowed: false, reason: 'admin_only' };
    }

    // ADMIN: all commands allowed
    return { allowed: true };
  }

  /**
   * Update a user's role (called from Admin API).
   * Sets approved_at timestamp when changing from PENDING.
   *
   * @returns true if a row was updated, false if chatId not found.
   */
  updateRole(chatId: number, newRole: 'ADMIN' | 'READONLY'): boolean {
    const now = Math.floor(Date.now() / 1000);
    const result = this.sqlite
      .prepare('UPDATE telegram_users SET role = ?, approved_at = ? WHERE chat_id = ?')
      .run(newRole, now, chatId);
    return result.changes > 0;
  }

  /**
   * List all registered Telegram users (for Admin API).
   * Ordered by registration time descending (newest first).
   */
  listUsers(): Array<{
    chat_id: number;
    username: string | null;
    role: string;
    registered_at: number;
    approved_at: number | null;
  }> {
    return this.sqlite
      .prepare(
        'SELECT chat_id, username, role, registered_at, approved_at FROM telegram_users ORDER BY registered_at DESC',
      )
      .all() as Array<{
      chat_id: number;
      username: string | null;
      role: string;
      registered_at: number;
      approved_at: number | null;
    }>;
  }
}
