/**
 * Webhook delivery logs API tests.
 *
 * Tests GET /v1/webhooks/:id/logs endpoint with filtering (status, event_type, limit),
 * camelCase field mapping, 404 handling, and masterAuth requirement.
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import argon2 from 'argon2';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { createApp } from '../api/server.js';
import { generateId } from '../infrastructure/database/id.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-password-webhook-logs';
const HOST = '127.0.0.1:3100';
let passwordHash: string;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function masterHeaders(): Record<string, string> {
  return {
    Host: HOST,
    'X-Master-Password': TEST_PASSWORD,
  };
}

/** Creates a webhook directly in DB and returns its id. */
function createWebhookInDB(db: DatabaseType): string {
  const id = generateId();
  const now = Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO webhooks (id, url, secret_hash, secret_encrypted, events, description, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(id, 'https://example.com/hook', 'a'.repeat(64), 'encrypted', '[]', 'test webhook', now, now);
  return id;
}

/** Inserts a webhook_log entry directly in DB. */
function insertLog(
  db: DatabaseType,
  webhookId: string,
  overrides: {
    eventType?: string;
    status?: string;
    httpStatus?: number | null;
    attempt?: number;
    error?: string | null;
    requestDuration?: number | null;
    createdAt?: number;
  } = {},
): string {
  const logId = generateId();
  const now = overrides.createdAt ?? Math.floor(Date.now() / 1000);
  db.prepare(
    `INSERT INTO webhook_logs (id, webhook_id, event_type, status, http_status, attempt, error, request_duration, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    logId,
    webhookId,
    overrides.eventType ?? 'TX_CONFIRMED',
    overrides.status ?? 'success',
    'httpStatus' in overrides ? overrides.httpStatus : 200,
    overrides.attempt ?? 1,
    'error' in overrides ? overrides.error : null,
    'requestDuration' in overrides ? overrides.requestDuration : 150,
    now,
  );
  return logId;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Webhook Logs API', () => {
  let db: DatabaseType;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    passwordHash = await argon2.hash(TEST_PASSWORD);
  });

  beforeEach(() => {
    const conn = createDatabase(':memory:');
    db = conn.sqlite;
    pushSchema(db);
    db.exec('PRAGMA foreign_keys = ON');

    app = createApp({
      sqlite: db,
      masterPassword: TEST_PASSWORD,
      masterPasswordHash: passwordHash,
    });
  });

  afterEach(() => {
    db.close();
  });

  // -----------------------------------------------------------------------
  // GET /v1/webhooks/:id/logs -- basic
  // -----------------------------------------------------------------------

  it('GET /v1/webhooks/:id/logs returns { data: [...] } sorted by created_at DESC', async () => {
    const webhookId = createWebhookInDB(db);

    // Insert logs with different timestamps
    insertLog(db, webhookId, { eventType: 'TX_CONFIRMED', createdAt: 1000 });
    insertLog(db, webhookId, { eventType: 'TX_FAILED', createdAt: 2000 });
    insertLog(db, webhookId, { eventType: 'TX_SUBMITTED', createdAt: 3000 });

    const res = await app.request(`/v1/webhooks/${webhookId}/logs`, {
      method: 'GET',
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(3);

    // Verify sorted by created_at DESC (newest first)
    expect(body.data[0].createdAt).toBe(3000);
    expect(body.data[1].createdAt).toBe(2000);
    expect(body.data[2].createdAt).toBe(1000);
  });

  // -----------------------------------------------------------------------
  // Response item fields (camelCase mapping)
  // -----------------------------------------------------------------------

  it('response items have correct camelCase fields', async () => {
    const webhookId = createWebhookInDB(db);
    insertLog(db, webhookId, {
      eventType: 'TX_CONFIRMED',
      status: 'success',
      httpStatus: 200,
      attempt: 1,
      error: null,
      requestDuration: 150,
      createdAt: 1772525000,
    });

    const res = await app.request(`/v1/webhooks/${webhookId}/logs`, {
      method: 'GET',
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);

    const log = body.data[0];
    expect(log.id).toBeDefined();
    expect(log.webhookId).toBe(webhookId);
    expect(log.eventType).toBe('TX_CONFIRMED');
    expect(log.status).toBe('success');
    expect(log.httpStatus).toBe(200);
    expect(log.attempt).toBe(1);
    expect(log.error).toBeNull();
    expect(log.requestDuration).toBe(150);
    expect(log.createdAt).toBe(1772525000);

    // Ensure no snake_case leaks
    expect(log).not.toHaveProperty('webhook_id');
    expect(log).not.toHaveProperty('event_type');
    expect(log).not.toHaveProperty('http_status');
    expect(log).not.toHaveProperty('request_duration');
    expect(log).not.toHaveProperty('created_at');
  });

  // -----------------------------------------------------------------------
  // Filter: status
  // -----------------------------------------------------------------------

  it('GET /v1/webhooks/:id/logs?status=success filters by status', async () => {
    const webhookId = createWebhookInDB(db);
    insertLog(db, webhookId, { status: 'success', createdAt: 1000 });
    insertLog(db, webhookId, { status: 'failed', createdAt: 2000 });
    insertLog(db, webhookId, { status: 'success', createdAt: 3000 });

    const res = await app.request(`/v1/webhooks/${webhookId}/logs?status=success`, {
      method: 'GET',
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    for (const log of body.data) {
      expect(log.status).toBe('success');
    }
  });

  // -----------------------------------------------------------------------
  // Filter: event_type
  // -----------------------------------------------------------------------

  it('GET /v1/webhooks/:id/logs?event_type=TX_CONFIRMED filters by event_type', async () => {
    const webhookId = createWebhookInDB(db);
    insertLog(db, webhookId, { eventType: 'TX_CONFIRMED', createdAt: 1000 });
    insertLog(db, webhookId, { eventType: 'TX_FAILED', createdAt: 2000 });
    insertLog(db, webhookId, { eventType: 'TX_CONFIRMED', createdAt: 3000 });

    const res = await app.request(`/v1/webhooks/${webhookId}/logs?event_type=TX_CONFIRMED`, {
      method: 'GET',
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    for (const log of body.data) {
      expect(log.eventType).toBe('TX_CONFIRMED');
    }
  });

  // -----------------------------------------------------------------------
  // Filter: limit
  // -----------------------------------------------------------------------

  it('GET /v1/webhooks/:id/logs?limit=2 limits results', async () => {
    const webhookId = createWebhookInDB(db);
    insertLog(db, webhookId, { createdAt: 1000 });
    insertLog(db, webhookId, { createdAt: 2000 });
    insertLog(db, webhookId, { createdAt: 3000 });
    insertLog(db, webhookId, { createdAt: 4000 });

    const res = await app.request(`/v1/webhooks/${webhookId}/logs?limit=2`, {
      method: 'GET',
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    // Should get the 2 newest
    expect(body.data[0].createdAt).toBe(4000);
    expect(body.data[1].createdAt).toBe(3000);
  });

  // -----------------------------------------------------------------------
  // Default limit = 20
  // -----------------------------------------------------------------------

  it('default limit is 20 when not specified', async () => {
    const webhookId = createWebhookInDB(db);
    // Insert 25 logs
    for (let i = 0; i < 25; i++) {
      insertLog(db, webhookId, { createdAt: 1000 + i });
    }

    const res = await app.request(`/v1/webhooks/${webhookId}/logs`, {
      method: 'GET',
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(20);
  });

  // -----------------------------------------------------------------------
  // 404 for non-existent webhook
  // -----------------------------------------------------------------------

  it('GET /v1/webhooks/:id/logs with non-existent webhook returns 404', async () => {
    const fakeId = generateId();
    const res = await app.request(`/v1/webhooks/${fakeId}/logs`, {
      method: 'GET',
      headers: masterHeaders(),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('WEBHOOK_NOT_FOUND');
  });

  // -----------------------------------------------------------------------
  // 401 without masterAuth
  // -----------------------------------------------------------------------

  it('GET /v1/webhooks/:id/logs without masterAuth returns 401', async () => {
    const fakeId = generateId();
    const res = await app.request(`/v1/webhooks/${fakeId}/logs`, {
      method: 'GET',
      headers: { Host: HOST },
    });

    expect(res.status).toBe(401);
  });

  // -----------------------------------------------------------------------
  // Combined filters
  // -----------------------------------------------------------------------

  it('combines status + event_type filters', async () => {
    const webhookId = createWebhookInDB(db);
    insertLog(db, webhookId, { eventType: 'TX_CONFIRMED', status: 'success', createdAt: 1000 });
    insertLog(db, webhookId, { eventType: 'TX_CONFIRMED', status: 'failed', createdAt: 2000 });
    insertLog(db, webhookId, { eventType: 'TX_FAILED', status: 'success', createdAt: 3000 });
    insertLog(db, webhookId, { eventType: 'TX_FAILED', status: 'failed', createdAt: 4000 });

    const res = await app.request(
      `/v1/webhooks/${webhookId}/logs?status=failed&event_type=TX_CONFIRMED`,
      { method: 'GET', headers: masterHeaders() },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].eventType).toBe('TX_CONFIRMED');
    expect(body.data[0].status).toBe('failed');
  });

  // -----------------------------------------------------------------------
  // Nullable fields
  // -----------------------------------------------------------------------

  it('returns nullable fields (httpStatus, error, requestDuration) correctly', async () => {
    const webhookId = createWebhookInDB(db);
    insertLog(db, webhookId, {
      status: 'failed',
      httpStatus: null,
      error: 'fetch failed',
      requestDuration: null,
    });

    const res = await app.request(`/v1/webhooks/${webhookId}/logs`, {
      method: 'GET',
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].httpStatus).toBeNull();
    expect(body.data[0].error).toBe('fetch failed');
    expect(body.data[0].requestDuration).toBeNull();
  });
});
