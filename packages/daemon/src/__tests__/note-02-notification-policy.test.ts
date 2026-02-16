/**
 * NOTE-02: Notification channel-policy integration tests (5 cases).
 *
 * Verifies behavior of NotificationService with different channel counts
 * and the policy engine's tier decisions (INSTANT/DELAY/APPROVAL) interaction
 * with notification delivery.
 *
 * Current architecture: PolicyEngine decides tier independently of channel count.
 * NotificationService silently returns if no channels configured.
 * These tests verify this documented behavior.
 *
 * @see docs/49-enum-config-consistency-verification.md NOTE-02
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { INotificationChannel, NotificationPayload } from '@waiaas/core';
import { NotificationService } from '../notifications/notification-service.js';
import { createDatabase, pushSchema, generateId } from '../infrastructure/database/index.js';
import type { DatabaseConnection } from '../infrastructure/database/index.js';
import { DatabasePolicyEngine } from '../pipeline/database-policy-engine.js';
import { wallets, policies } from '../infrastructure/database/schema.js';
import { SettingsService } from '../infrastructure/settings/settings-service.js';
import { DaemonConfigSchema } from '../infrastructure/config/loader.js';

// ---------------------------------------------------------------------------
// Mock channel factory
// ---------------------------------------------------------------------------

function createMockChannel(name: string, shouldFail = false): INotificationChannel {
  return {
    name,
    send: shouldFail
      ? vi.fn().mockRejectedValue(new Error(`${name} failed`))
      : vi.fn().mockResolvedValue(undefined),
    healthCheck: vi.fn().mockResolvedValue({ healthy: !shouldFail }),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let conn: DatabaseConnection;

beforeEach(() => {
  conn = createDatabase(':memory:');
  pushSchema(conn.sqlite);
});

async function insertWallet(): Promise<string> {
  const id = generateId();
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(wallets).values({
    id,
    name: 'test-wallet',
    chain: 'solana',
    environment: 'testnet',
    defaultNetwork: 'devnet',
    publicKey: `pk-${id}`,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

async function insertPolicy(walletId: string, type: string, rules: string): Promise<void> {
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  await conn.db.insert(policies).values({
    id: generateId(),
    walletId,
    type,
    rules,
    priority: 0,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  });
}

// ---------------------------------------------------------------------------
// NOTE-02: Notification channel-policy integration (5 cases)
// ---------------------------------------------------------------------------

describe('NOTE-02: notification channel-policy integration', () => {
  // N02-01: 0 active channels -> notify() silently returns (INSTANT only behavior)
  it('N02-01: 0 channels -> notify silently returns, no errors', async () => {
    const svc = new NotificationService({ db: conn.db });
    // No channels added

    // Should not throw with 0 channels
    await expect(
      svc.notify('TX_CONFIRMED', 'wallet-1'),
    ).resolves.not.toThrow();

    expect(svc.getChannelNames()).toEqual([]);
  });

  // N02-02: 1 active channel -> DELAY notification delivered
  it('N02-02: 1 channel -> notification delivered via single channel', async () => {
    const svc = new NotificationService({ db: conn.db });
    const ch1 = createMockChannel('telegram');
    svc.addChannel(ch1);

    await svc.notify('TX_QUEUED', 'wallet-1', { amount: '1.0 SOL' });

    expect(ch1.send).toHaveBeenCalledOnce();
    const payload = (ch1.send as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as NotificationPayload;
    expect(payload.eventType).toBe('TX_QUEUED');
    expect(payload.walletId).toBe('wallet-1');
  });

  // N02-03: 2+ channels -> fallback delivery works
  it('N02-03: 2+ channels -> first channel delivers, second not called', async () => {
    const svc = new NotificationService({ db: conn.db });
    const ch1 = createMockChannel('telegram');
    const ch2 = createMockChannel('discord');
    svc.addChannel(ch1);
    svc.addChannel(ch2);

    await svc.notify('TX_CONFIRMED', 'wallet-1');

    // Priority-based: first channel succeeds, second not called
    expect(ch1.send).toHaveBeenCalledOnce();
    expect(ch2.send).not.toHaveBeenCalled();
  });

  // N02-04: PolicyEngine APPROVAL tier works regardless of channel count
  it('N02-04: APPROVAL tier evaluated independently of channel count', async () => {
    const walletId = await insertWallet();

    // Create SPENDING_LIMIT policy with APPROVAL tier thresholds (in lamports)
    // instant_max: 10000 (0.00001 SOL), notify_max: 100000, delay_max: 1000000
    // Amount 10000000000 (10 SOL) >> delay_max -> APPROVAL
    await insertPolicy(walletId, 'SPENDING_LIMIT', JSON.stringify({
      instant_max: '10000',
      notify_max: '100000',
      delay_max: '1000000',
      delay_seconds: 60,
    }));

    const config = DaemonConfigSchema.parse({});
    const settingsService = new SettingsService(conn.db, config);
    const engine = new DatabasePolicyEngine(conn.db, settingsService);

    // Evaluate a large transaction (10 SOL in lamports) -> should get APPROVAL tier
    const result = await engine.evaluate(walletId, {
      type: 'TRANSFER',
      amount: '10000000000',
      toAddress: 'some-addr',
      chain: 'solana',
    });

    // APPROVAL tier regardless of notification channels
    expect(result.tier).toBe('APPROVAL');
    expect(result.allowed).toBe(true);
  });

  // N02-05: Channel replacement at runtime (hot-reload scenario)
  it('N02-05: runtime channel replacement triggers re-evaluation of delivery path', async () => {
    const svc = new NotificationService({ db: conn.db });
    const ch1 = createMockChannel('telegram');
    svc.addChannel(ch1);

    // Deliver via channel 1
    await svc.notify('TX_CONFIRMED', 'wallet-1');
    expect(ch1.send).toHaveBeenCalledOnce();

    // Hot-reload: replace channels
    const ch2 = createMockChannel('discord');
    const ch3 = createMockChannel('slack');
    svc.replaceChannels([ch2, ch3]);

    // New delivery goes to ch2 (first in priority), not ch1
    await svc.notify('TX_CONFIRMED', 'wallet-2');
    expect(ch1.send).toHaveBeenCalledOnce(); // still 1 (not called again)
    expect(ch2.send).toHaveBeenCalledOnce();
    expect(ch3.send).not.toHaveBeenCalled(); // fallback not needed

    // Verify channel list updated
    expect(svc.getChannelNames()).toEqual(['discord', 'slack']);
  });
});
