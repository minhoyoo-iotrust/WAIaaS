/**
 * CT-4: INotificationChannel Contract Test shared suite.
 *
 * Verifies that any INotificationChannel implementation has a valid
 * name, can initialize without error, and can send a NotificationPayload.
 *
 * Both MockNotificationChannel and TelegramChannel (with msw mocking)
 * must pass these tests to guarantee behavioral equivalence.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { INotificationChannel, NotificationPayload } from '../../interfaces/INotificationChannel.js';

// ---------------------------------------------------------------------------
// Standard test payload
// ---------------------------------------------------------------------------

const CONTRACT_TEST_PAYLOAD: NotificationPayload = {
  eventType: 'TX_SUBMITTED',
  walletId: 'wallet-contract-test',
  title: 'Transaction Submitted',
  body: 'Contract test notification',
  message: 'Transaction Submitted\nContract test notification',
  timestamp: Math.floor(Date.now() / 1000),
};

// ---------------------------------------------------------------------------
// Shared suite
// ---------------------------------------------------------------------------

/**
 * INotificationChannel contract test suite.
 *
 * @param factory - Function that returns a fresh, initialized INotificationChannel instance.
 * @param options - Optional configuration.
 * @param options.initConfig - Config to pass to initialize() for re-initialization test.
 *   Defaults to {}. Channels requiring specific config (e.g., TelegramChannel)
 *   should supply the appropriate config here.
 */
export function notificationChannelContractTests(
  factory: () => INotificationChannel | Promise<INotificationChannel>,
  options?: { initConfig?: Record<string, unknown> },
): void {
  let channel: INotificationChannel;

  describe('INotificationChannel contract', () => {
    beforeEach(async () => {
      channel = await factory();
    });

    it('name is a non-empty string', () => {
      expect(typeof channel.name).toBe('string');
      expect(channel.name.length).toBeGreaterThan(0);
    });

    it('initialize() returns a Promise<void> without error', async () => {
      // Re-initialize with provided config (idempotent behavior)
      const config = options?.initConfig ?? {};
      const result = channel.initialize(config);
      expect(result).toBeInstanceOf(Promise);
      // Should resolve without error
      await expect(result).resolves.toBeUndefined();
    });

    it('send() returns a Promise<void> without error', async () => {
      const result = channel.send(CONTRACT_TEST_PAYLOAD);
      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.toBeUndefined();
    });

    it('send() accepts a NotificationPayload with all fields', async () => {
      const payload: NotificationPayload = {
        eventType: 'TX_CONFIRMED',
        walletId: 'wallet-full-test',
        title: 'Transaction Confirmed',
        body: 'Full payload test with details',
        message: 'Transaction Confirmed\nFull payload test with details',
        details: { txHash: '0xabc123', amount: '1.0' },
        timestamp: Math.floor(Date.now() / 1000),
      };

      await expect(channel.send(payload)).resolves.toBeUndefined();
    });
  });
}
