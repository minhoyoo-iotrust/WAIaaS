import { describe, it, expect } from 'vitest';
import { ConfigurablePayloadTransformer } from '../transformer/payload-transformer.js';
import type { PushPayload } from '../providers/push-provider.js';

// ── Tests ─────────────────────────────────────────────────────────────

describe('Pipeline Integration', () => {
  it('transformer injects static_fields and category_map into payload', () => {
    const transformer = new ConfigurablePayloadTransformer({
      static_fields: { app_id: 'com.dcent.wallet', env: 'production' },
      category_map: {
        sign_request: { sound: 'alert.caf', badge: '1' },
      },
    });

    const rawPayload: PushPayload = {
      title: 'Sign Request',
      body: 'TRANSFER 1 SOL',
      data: { requestId: '550e8400-e29b-41d4-a716-446655440000', type: 'TRANSFER' },
      category: 'sign_request',
      priority: 'high',
    };

    const finalPayload = transformer.transform(rawPayload);

    // Static fields injected
    expect(finalPayload.data.app_id).toBe('com.dcent.wallet');
    expect(finalPayload.data.env).toBe('production');
    // Category map fields injected
    expect(finalPayload.data.sound).toBe('alert.caf');
    expect(finalPayload.data.badge).toBe('1');
    // Original data preserved
    expect(finalPayload.data.requestId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(finalPayload.category).toBe('sign_request');
    expect(finalPayload.priority).toBe('high');
  });

  it('payload without transformer is unchanged', () => {
    const rawPayload: PushPayload = {
      title: 'Notification',
      body: 'Transaction confirmed',
      data: { txHash: '0xabc' },
      category: 'notification',
      priority: 'normal',
    };

    // Without transformer, payload is unchanged
    expect(rawPayload.data).not.toHaveProperty('app_id');
    expect(rawPayload.data).not.toHaveProperty('sound');
    expect(rawPayload.category).toBe('notification');
  });

  it('original data keys take precedence over static_fields and category_map', () => {
    const transformer = new ConfigurablePayloadTransformer({
      // requestId exists in original data — should NOT be overwritten
      static_fields: { requestId: 'should-not-overwrite' },
      category_map: {
        sign_request: { requestId: 'also-should-not-overwrite' },
      },
    });

    const rawPayload: PushPayload = {
      title: 'Sign Request',
      body: 'Sign TX',
      data: { requestId: '550e8400-e29b-41d4-a716-446655440000' },
      category: 'sign_request',
      priority: 'high',
    };

    const finalPayload = transformer.transform(rawPayload);

    // Original data takes precedence
    expect(finalPayload.data.requestId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });
});
