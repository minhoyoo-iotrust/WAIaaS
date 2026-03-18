import { describe, it, expect } from 'vitest';
import { ConfigurablePayloadTransformer } from '../transformer/payload-transformer.js';
import type { PushPayload } from '../providers/push-provider.js';

function makePayload(overrides: Partial<PushPayload> = {}): PushPayload {
  return {
    title: 'Test Title',
    body: 'Test Body',
    data: { requestId: 'req-001', type: 'TRANSFER' },
    category: 'sign_request',
    priority: 'high',
    ...overrides,
  };
}

describe('ConfigurablePayloadTransformer', () => {
  it('injects static_fields into payload data', () => {
    const transformer = new ConfigurablePayloadTransformer({
      static_fields: { app_id: 'com.dcent' },
      category_map: {},
    });

    const result = transformer.transform(makePayload());
    expect(result.data.app_id).toBe('com.dcent');
    expect(result.data.requestId).toBe('req-001');
  });

  it('applies category_map for matching category', () => {
    const transformer = new ConfigurablePayloadTransformer({
      static_fields: {},
      category_map: {
        sign_request: { sound: 'alert.caf', badge: '1' },
      },
    });

    const result = transformer.transform(makePayload({ category: 'sign_request' }));
    expect(result.data.sound).toBe('alert.caf');
    expect(result.data.badge).toBe('1');
  });

  it('ignores category_map for non-matching category', () => {
    const transformer = new ConfigurablePayloadTransformer({
      static_fields: {},
      category_map: {
        sign_request: { sound: 'alert.caf' },
      },
    });

    const result = transformer.transform(makePayload({ category: 'notification' }));
    expect(result.data.sound).toBeUndefined();
  });

  it('merges static_fields and category_map', () => {
    const transformer = new ConfigurablePayloadTransformer({
      static_fields: { app_id: 'com.dcent' },
      category_map: {
        sign_request: { sound: 'alert.caf' },
      },
    });

    const result = transformer.transform(makePayload());
    expect(result.data.app_id).toBe('com.dcent');
    expect(result.data.sound).toBe('alert.caf');
    expect(result.data.requestId).toBe('req-001');
  });

  it('static_fields do not overwrite existing data keys', () => {
    const transformer = new ConfigurablePayloadTransformer({
      static_fields: { requestId: 'overwritten' },
      category_map: {},
    });

    const result = transformer.transform(makePayload());
    // Original data key takes precedence over static_fields
    expect(result.data.requestId).toBe('req-001');
  });

  it('category_map fields overwrite static_fields for same key', () => {
    const transformer = new ConfigurablePayloadTransformer({
      static_fields: { sound: 'default' },
      category_map: {
        sign_request: { sound: 'alert.caf' },
      },
    });

    const result = transformer.transform(makePayload());
    // category_map has higher precedence than static_fields
    expect(result.data.sound).toBe('alert.caf');
  });

  it('returns unchanged payload when no config matches', () => {
    const transformer = new ConfigurablePayloadTransformer({
      static_fields: {},
      category_map: {},
    });

    const original = makePayload();
    const result = transformer.transform(original);
    expect(result.data).toEqual(original.data);
  });

  it('preserves title, body, category, priority fields unchanged', () => {
    const transformer = new ConfigurablePayloadTransformer({
      static_fields: { app_id: 'com.dcent' },
      category_map: {
        sign_request: { sound: 'alert.caf' },
      },
    });

    const result = transformer.transform(makePayload());
    expect(result.title).toBe('Test Title');
    expect(result.body).toBe('Test Body');
    expect(result.category).toBe('sign_request');
    expect(result.priority).toBe('high');
  });
});
