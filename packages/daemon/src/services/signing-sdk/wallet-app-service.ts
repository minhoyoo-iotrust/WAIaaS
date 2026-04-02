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
  walletType: string;
  signingEnabled: boolean;
  alertsEnabled: boolean;
  signTopic: string | null;
  notifyTopic: string | null;
  subscriptionToken: string | null;
  pushRelayUrl: string | null;
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
   * Auto-generates signTopic/notifyTopic when not specified.
   */
  register(name: string, displayName: string, opts?: { signTopic?: string; notifyTopic?: string; walletType?: string; subscriptionToken?: string; pushRelayUrl?: string }): WalletApp {
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
    const walletType = opts?.walletType || name;
    const token = opts?.subscriptionToken ?? null;
    const signTopic = opts?.signTopic ?? (token ? `waiaas-sign-${walletType}-${token}` : `waiaas-sign-${name}`);
    const notifyTopic = opts?.notifyTopic ?? (token ? `waiaas-notify-${walletType}-${token}` : `waiaas-notify-${name}`);
    const pushRelayUrl = opts?.pushRelayUrl ?? null;

    // SVC-02: Check if same wallet_type already has a signing primary.
    // If so, register new app with signing_enabled=0 to avoid partial unique index violation.
    const hasPrimary = this.sqlite.prepare(
      'SELECT id FROM wallet_apps WHERE wallet_type = ? AND signing_enabled = 1',
    ).get(walletType);
    const signingEnabled = hasPrimary ? 0 : 1;

    this.sqlite.prepare(
      'INSERT INTO wallet_apps (id, name, display_name, wallet_type, signing_enabled, alerts_enabled, sign_topic, notify_topic, subscription_token, push_relay_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)',
    ).run(id, name, displayName, walletType, signingEnabled, signTopic, notifyTopic, token, pushRelayUrl, now, now);

    return {
      id,
      name,
      displayName,
      walletType,
      signingEnabled: signingEnabled === 1,
      alertsEnabled: true,
      signTopic,
      notifyTopic,
      subscriptionToken: token,
      pushRelayUrl,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Idempotent register -- returns existing if name already exists.
   */
  ensureRegistered(name: string, displayName: string, opts?: { signTopic?: string; notifyTopic?: string; walletType?: string; subscriptionToken?: string; pushRelayUrl?: string }): WalletApp {
    const existing = this.getByName(name);
    if (existing) return existing;
    return this.register(name, displayName, opts);
  }

  /**
   * Get a wallet app by its unique name.
   */
  getByName(name: string): WalletApp | undefined {
    const row = this.sqlite.prepare(
      'SELECT id, name, display_name, wallet_type, signing_enabled, alerts_enabled, sign_topic, notify_topic, subscription_token, push_relay_url, created_at, updated_at FROM wallet_apps WHERE name = ?',
    ).get(name) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  /**
   * Get a wallet app by ID.
   */
  getById(id: string): WalletApp | undefined {
    const row = this.sqlite.prepare(
      'SELECT id, name, display_name, wallet_type, signing_enabled, alerts_enabled, sign_topic, notify_topic, subscription_token, push_relay_url, created_at, updated_at FROM wallet_apps WHERE id = ?',
    ).get(id) as Record<string, unknown> | undefined;
    return row ? this.mapRow(row) : undefined;
  }

  /**
   * List all wallet apps ordered by created_at ASC.
   */
  list(): WalletApp[] {
    const rows = this.sqlite.prepare(
      'SELECT id, name, display_name, wallet_type, signing_enabled, alerts_enabled, sign_topic, notify_topic, subscription_token, push_relay_url, created_at, updated_at FROM wallet_apps ORDER BY created_at ASC',
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
      usedBy: this.getUsedBy(app.walletType),
    }));
  }

  /**
   * Update wallet app toggles, topic fields, and subscription token.
   * Throws 404 if not found.
   * When subscriptionToken is set, sign_topic and notify_topic are auto-regenerated
   * using the token unless explicit topic values are also provided.
   */
  update(id: string, fields: { signingEnabled?: boolean; alertsEnabled?: boolean; signTopic?: string; notifyTopic?: string; subscriptionToken?: string; pushRelayUrl?: string }): WalletApp {
    const existingApp = this.sqlite.prepare(
      'SELECT id, wallet_type, name FROM wallet_apps WHERE id = ?',
    ).get(id) as { id: string; wallet_type: string; name: string } | undefined;
    if (!existingApp) {
      throw new WAIaaSError('WALLET_APP_NOT_FOUND', {
        message: `Wallet app not found: ${id}`,
      });
    }

    const now = Math.floor(Date.now() / 1000);

    // SVC-01: Wrap in transaction for exclusive signing toggle atomicity.
    const doUpdate = this.sqlite.transaction(() => {
      // When enabling signing, disable all other apps of same wallet_type first
      if (fields.signingEnabled === true) {
        this.sqlite.prepare(
          'UPDATE wallet_apps SET signing_enabled = 0, updated_at = ? WHERE wallet_type = ? AND signing_enabled = 1 AND id != ?',
        ).run(now, existingApp.wallet_type, id);
      }

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

      // When subscription token is updated, auto-regenerate topics unless explicitly provided
      if (fields.subscriptionToken !== undefined) {
        setClauses.push('subscription_token = ?');
        params.push(fields.subscriptionToken || null);

        if (fields.subscriptionToken && fields.signTopic === undefined) {
          setClauses.push('sign_topic = ?');
          params.push(`waiaas-sign-${existingApp.wallet_type}-${fields.subscriptionToken}`);
        }
        if (fields.subscriptionToken && fields.notifyTopic === undefined) {
          setClauses.push('notify_topic = ?');
          params.push(`waiaas-notify-${existingApp.wallet_type}-${fields.subscriptionToken}`);
        }
      }

      if (fields.pushRelayUrl !== undefined) {
        setClauses.push('push_relay_url = ?');
        params.push(fields.pushRelayUrl || null);
      }

      if (fields.signTopic !== undefined) {
        setClauses.push('sign_topic = ?');
        params.push(fields.signTopic);
      }
      if (fields.notifyTopic !== undefined) {
        setClauses.push('notify_topic = ?');
        params.push(fields.notifyTopic);
      }

      params.push(id);
      this.sqlite.prepare(
        `UPDATE wallet_apps SET ${setClauses.join(', ')} WHERE id = ?`,
      ).run(...params);
    });

    doUpdate();

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
      'SELECT id, name, display_name, wallet_type, signing_enabled, alerts_enabled, sign_topic, notify_topic, subscription_token, push_relay_url, created_at, updated_at FROM wallet_apps WHERE alerts_enabled = 1',
    ).all() as Record<string, unknown>[];
    return rows.map((r) => this.mapRow(r));
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /** Get wallets using this app (by wallet_type match). */
  private getUsedBy(walletType: string): Array<{ id: string; label: string }> {
    const rows = this.sqlite.prepare(
      'SELECT id, name FROM wallets WHERE wallet_type = ?',
    ).all(walletType) as Array<{ id: string; name: string }>;
    return rows.map((r) => ({ id: r.id, label: r.name }));
  }

  private mapRow(row: Record<string, unknown>): WalletApp {
    return {
      id: row.id as string,
      name: row.name as string,
      displayName: row.display_name as string,
      walletType: (row.wallet_type as string) || '',
      signingEnabled: (row.signing_enabled as number) === 1,
      alertsEnabled: (row.alerts_enabled as number) === 1,
      signTopic: (row.sign_topic as string) || null,
      notifyTopic: (row.notify_topic as string) || null,
      subscriptionToken: (row.subscription_token as string) || null,
      pushRelayUrl: (row.push_relay_url as string) || null,
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
    };
  }
}
