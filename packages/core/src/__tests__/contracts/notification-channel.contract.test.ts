/**
 * CT-4: INotificationChannel Contract Test execution.
 *
 * Validates MockNotificationChannel (inline) against the shared contract suite.
 * TelegramChannel (with msw mocking) is tested in packages/daemon.
 */
import { describe } from 'vitest';
import type { INotificationChannel, NotificationPayload } from '../../interfaces/INotificationChannel.js';
import { notificationChannelContractTests } from './notification-channel.contract.js';

// ---------------------------------------------------------------------------
// MockNotificationChannel (inline, per design doc 42)
// ---------------------------------------------------------------------------

class MockNotificationChannel implements INotificationChannel {
  readonly name = 'mock-channel';
  readonly sentPayloads: NotificationPayload[] = [];

  async initialize(_config: Record<string, unknown>): Promise<void> {
    /* no-op */
  }

  async send(payload: NotificationPayload): Promise<void> {
    this.sentPayloads.push(payload);
  }

  reset(): void {
    this.sentPayloads.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Run contract tests
// ---------------------------------------------------------------------------

describe('CT-4: INotificationChannel Contract Tests', () => {
  describe('MockNotificationChannel', () => {
    notificationChannelContractTests(() => new MockNotificationChannel());
  });
});
