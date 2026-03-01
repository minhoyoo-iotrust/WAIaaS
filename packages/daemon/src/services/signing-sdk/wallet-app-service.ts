/**
 * WalletAppService -- CRUD for wallet_apps table (Human Wallet Apps registry).
 *
 * Manages wallet app entities: register, list, update toggles, remove.
 * Apps are identified by a unique `name` (same namespace as wallets.wallet_type).
 *
 * @see internal/objectives/m29-07-dcent-owner-signing.md
 */

import type { Database } from 'better-sqlite3';
import { WAIaaSError } from '@waiaas/core';
import { generateId } from '../../infrastructure/database/id.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WalletApp {
  id: string;
  name: string;
  displayName: string;
  signingEnabled: boolean;
  alertsEnabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface WalletAppWithUsedBy extends WalletApp {
  usedBy: Array<{ id: string; label: string }>;
}

// ---------------------------------------------------------------------------
// WalletAppService
// ---------------------------------------------------------------------------

export class WalletAppService {
  constructor(private readonly sqlite: Database) {}

  /**
   * Register a new wallet app. Throws 409 if name already exists.
   */
  register(name: string, displayName: string): WalletApp {
    const existing = this.sqlite.prepare(
      'SELECT id FROM wallet_apps WHERE name = ?',
    ).get(name);
    if (existing) {
      throw new WAIaaSError('WALLET_APP_DUPLICATE', {
        message: `Wallet app already registered: ${name}`,
      });
    }

    const id = generateId();
    const now = Math.floor(Date.now() / 1000);
    this.sqlite.prepare(
      'INSERT INTO wallet_apps (id, name, display_name, signing_enabled, alerts_enabled, created_at, updated_at) VALUES (?, ?, ?, 1, 1, ?, ?)',
    ).run(id, name, displayName, now, now);

    return {
      id,
      name,
      displayName,
      signingEnabled: true,
      alertsEnabled: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Idempotent register -- returns existing if name already exists.
   */
  ensureRegistered(name: string, displayName: string): WalletApp {
    const existing = this.getByName(name);
    if (existing) return existing;
    return this.register(name, displayName);
  }

  /**
   * Get a wallet app by its unique name.
   */
  getByName(name: string): WalletApp | undefined {
    const row = this.sqlite.prepare(
      'SELECT id, name, display_name, signing_enabled, alerts_enabled, created_at, updated_at FROM wallet_apps WHERE name = ?',
    ).get(name) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  /**
   * Get a wallet app by ID.
   */
  getById(id: string): WalletApp | undefined {
    const row = this.sqlite.prepare(
      'SELECT id, name, display_name, signing_enabled, alerts_enabled, created_at, updated_at FROM wallet_apps WHERE id = ?',
    ).get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  /**
   * List all wallet apps ordered by created_at ASC.
   */
  list(): WalletApp[] {
    const rows = this.sqlite.prepare(
      'SELECT id, name, display_name, signing_enabled, alerts_enabled, created_at, updated_at FROM wallet_apps ORDER BY created_at ASC',
    ).all() as Record<string, unknown>[];
    return rows.map((r) => this.mapRow(r));
  }

  /**
   * List all wallet apps with used_by wallet references.
   */
  listWithUsedBy(): WalletAppWithUsedBy[] {
    const apps = this.list();
    return apps.map((app) => ({
      ...app,
      usedBy: this.getUsedBy(app.name),
    }));
  }

  /**
   * Update wallet app toggles (signing_enabled, alerts_enabled).
   * Throws 404 if not found.
   */
  update(id: string, fields: { signingEnabled?: boolean; alertsEnabled?: boolean }): WalletApp {
    const existing = this.sqlite.prepare('SELECT id FROM wallet_apps WHERE id = ?').get(id);
    if (!existing) {
      throw new WAIaaSError('WALLET_APP_NOT_FOUND', {
        message: `Wallet app not found: ${id}`,
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const setClauses: string[] = ['updated_at = ?'];
    const params: unknown[] = [now];

    if (fields.signingEnabled !== undefined) {
      setClauses.push('signing_enabled = ?');
      params.push(fields.signingEnabled ? 1 : 0);
    }
    if (fields.alertsEnabled !== undefined) {
      setClauses.push('alerts_enabled = ?');
      params.push(fields.alertsEnabled ? 1 : 0);
    }

    params.push(id);
    this.sqlite.prepare(
      `UPDATE wallet_apps SET ${setClauses.join(', ')} WHERE id = ?`,
    ).run(...params);

    return this.getById(id)!;
  }

  /**
   * Remove a wallet app by ID. Throws 404 if not found.
   */
  remove(id: string): void {
    const result = this.sqlite.prepare('DELETE FROM wallet_apps WHERE id = ?').run(id);
    if (result.changes === 0) {
      throw new WAIaaSError('WALLET_APP_NOT_FOUND', {
        message: `Wallet app not found: ${id}`,
      });
    }
  }

  /**
   * Get apps with alerts_enabled=1 for notification routing.
   */
  getAlertEnabledApps(): WalletApp[] {
    const rows = this.sqlite.prepare(
      'SELECT id, name, display_name, signing_enabled, alerts_enabled, created_at, updated_at FROM wallet_apps WHERE alerts_enabled = 1',
    ).all() as Record<string, unknown>[];
    return rows.map((r) => this.mapRow(r));
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Get wallets using this app (by wallet_type = app name). */
  private getUsedBy(name: string): Array<{ id: string; label: string }> {
    const rows = this.sqlite.prepare(
      'SELECT id, name FROM wallets WHERE wallet_type = ?',
    ).all(name) as Array<{ id: string; name: string }>;
    return rows.map((r) => ({ id: r.id, label: r.name }));
  }

  private mapRow(row: Record<string, unknown>): WalletApp {
    return {
      id: row.id as string,
      name: row.name as string,
      displayName: row.display_name as string,
      signingEnabled: (row.signing_enabled as number) === 1,
      alertsEnabled: (row.alerts_enabled as number) === 1,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }
}
