/**
 * E2E Tests: DeFi Admin Settings CRUD + Push Relay Device Lifecycle.
 *
 * Tests DeFi protocol-specific admin settings (swap, staking, bridge, lending)
 * and Push Relay device registration/unregistration.
 *
 * @see ADV-07 defi-admin-settings
 * @see ADV-08 push-relay-device-lifecycle
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DaemonManager, type DaemonInstance } from '../helpers/daemon-lifecycle.js';
import { PushRelayManager, type PushRelayInstance } from '../helpers/push-relay-lifecycle.js';

// Import scenario registrations (side-effect: registers in global registry)
import '../scenarios/advanced-defi-settings-push-relay.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Push Relay API key (hardcoded in PushRelayManager config generation). */
const PUSH_RELAY_API_KEY = 'e2e-test-api-key';

// ---------------------------------------------------------------------------
// Scenario 1: defi-admin-settings (ADV-07)
// ---------------------------------------------------------------------------

describe('defi-admin-settings', () => {
  const daemonManager = new DaemonManager();
  let daemon: DaemonInstance;

  function adminHeaders(): { headers: Record<string, string> } {
    return { headers: { 'X-Master-Password': daemon.masterPassword } };
  }

  beforeAll(async () => {
    daemon = await daemonManager.start();
  }, 30_000);

  afterAll(async () => {
    await daemonManager.stop();
  }, 10_000);

  it('sets DeFi-related admin settings', async () => {
    const { E2EHttpClient } = await import('../helpers/http-client.js');
    const client = new E2EHttpClient(daemon.baseUrl);

    const { status } = await client.put(
      '/v1/admin/settings',
      {
        settings: [
          { key: 'actions.jupiter_swap_default_slippage_bps', value: '100' },
          { key: 'actions.zerox_swap_default_slippage_bps', value: '150' },
          { key: 'actions.aave_v3_max_ltv_pct', value: '0.75' },
        ],
      },
      adminHeaders(),
    );
    expect(status).toBe(200);
  });

  it('reads back DeFi settings and verifies values', async () => {
    const { E2EHttpClient } = await import('../helpers/http-client.js');
    const client = new E2EHttpClient(daemon.baseUrl);

    const { status, body } = await client.get<
      Record<string, Record<string, string | boolean>>
    >(
      '/v1/admin/settings',
      adminHeaders(),
    );
    expect(status).toBe(200);

    // Settings are grouped by category -- actions category has field names without prefix
    // e.g., key 'actions.jupiter_swap_default_slippage_bps' -> field 'jupiter_swap_default_slippage_bps' in actions
    const actionsSettings = body['actions'] ?? {};
    expect(actionsSettings['jupiter_swap_default_slippage_bps']).toBe('100');
    expect(actionsSettings['zerox_swap_default_slippage_bps']).toBe('150');
  });

  it('updates a DeFi setting', async () => {
    const { E2EHttpClient } = await import('../helpers/http-client.js');
    const client = new E2EHttpClient(daemon.baseUrl);

    const { status } = await client.put(
      '/v1/admin/settings',
      {
        settings: [
          { key: 'actions.jupiter_swap_default_slippage_bps', value: '200' },
        ],
      },
      adminHeaders(),
    );
    expect(status).toBe(200);
  });

  it('verifies updated value', async () => {
    const { E2EHttpClient } = await import('../helpers/http-client.js');
    const client = new E2EHttpClient(daemon.baseUrl);

    const { status, body } = await client.get<
      Record<string, Record<string, string | boolean>>
    >(
      '/v1/admin/settings',
      adminHeaders(),
    );
    expect(status).toBe(200);

    const actionsSettings = body['actions'] ?? {};
    expect(actionsSettings['jupiter_swap_default_slippage_bps']).toBe('200');
  });

  it('sets protocol-specific settings (swap, staking, bridge, lending)', async () => {
    const { E2EHttpClient } = await import('../helpers/http-client.js');
    const client = new E2EHttpClient(daemon.baseUrl);

    const { status: setStatus } = await client.put(
      '/v1/admin/settings',
      {
        settings: [
          { key: 'actions.jupiter_swap_max_slippage_bps', value: '600' },
          { key: 'actions.lido_staking_enabled', value: 'false' },
          { key: 'actions.lifi_default_slippage_pct', value: '0.05' },
          { key: 'actions.aave_v3_health_factor_warning_threshold', value: '1.5' },
        ],
      },
      adminHeaders(),
    );
    expect(setStatus).toBe(200);

    // Verify all keys present
    const { status: getStatus, body } = await client.get<
      Record<string, Record<string, string | boolean>>
    >(
      '/v1/admin/settings',
      adminHeaders(),
    );
    expect(getStatus).toBe(200);

    const actionsSettings = body['actions'] ?? {};
    // Field names are without the category prefix
    expect(actionsSettings['jupiter_swap_max_slippage_bps']).toBe('600');
    expect(actionsSettings['lido_staking_enabled']).toBe('false');
    expect(actionsSettings['lifi_default_slippage_pct']).toBe('0.05');
    expect(actionsSettings['aave_v3_health_factor_warning_threshold']).toBe('1.5');
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: push-relay-device-lifecycle (ADV-08)
// ---------------------------------------------------------------------------

describe('push-relay-device-lifecycle', () => {
  const pushRelayManager = new PushRelayManager();
  let pushRelay: PushRelayInstance;

  beforeAll(async () => {
    pushRelay = await pushRelayManager.start();
  }, 30_000);

  afterAll(async () => {
    await pushRelayManager.stop();
  }, 10_000);

  it('registers a device', async () => {
    const res = await fetch(`${pushRelay.baseUrl}/devices`, {
      method: 'POST',
      headers: {
        'X-API-Key': PUSH_RELAY_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        walletName: 'e2e-test-wallet',
        pushToken: 'fake-push-token-12345',
        platform: 'ios',
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { status: string; subscription_token: string };
    expect(body.status).toBe('registered');
    expect(body.subscription_token).toBeTruthy();
  });

  it('retrieves subscription token for device', async () => {
    const res = await fetch(
      `${pushRelay.baseUrl}/devices/fake-push-token-12345/subscription-token`,
      {
        headers: { 'X-API-Key': PUSH_RELAY_API_KEY },
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { subscription_token: string };
    expect(body.subscription_token).toBeTruthy();
  });

  it('health check shows registered device', async () => {
    const res = await fetch(`${pushRelay.baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { devices: number };
    expect(body.devices).toBeGreaterThanOrEqual(1);
  });

  it('unregisters the device', async () => {
    const res = await fetch(
      `${pushRelay.baseUrl}/devices/fake-push-token-12345`,
      {
        method: 'DELETE',
        headers: { 'X-API-Key': PUSH_RELAY_API_KEY },
      },
    );
    expect(res.status).toBe(204);
  });

  it('confirms device is removed', async () => {
    const res = await fetch(
      `${pushRelay.baseUrl}/devices/fake-push-token-12345/subscription-token`,
      {
        headers: { 'X-API-Key': PUSH_RELAY_API_KEY },
      },
    );
    expect(res.status).toBe(404);
  });
});
