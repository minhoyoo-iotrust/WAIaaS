/**
 * Webhook CRUD REST API integration tests.
 *
 * Tests POST /v1/webhooks, GET /v1/webhooks, DELETE /v1/webhooks/:id
 * with in-memory SQLite, masterAuth verification, secret security model,
 * and CASCADE delete behavior.
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

const TEST_PASSWORD = 'test-master-password-webhook';
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Webhook CRUD API', () => {
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
  // POST /v1/webhooks
  // -----------------------------------------------------------------------

  it('POST /v1/webhooks returns 201 with id, url, events, description, enabled=true, 64-char hex secret', async () => {
    const res = await app.request('/v1/webhooks', {
      method: 'POST',
      headers: { ...masterHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com/webhook',
        events: ['TX_CONFIRMED', 'TX_FAILED'],
        description: 'Test webhook',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.url).toBe('https://example.com/webhook');
    expect(body.events).toEqual(['TX_CONFIRMED', 'TX_FAILED']);
    expect(body.description).toBe('Test webhook');
    expect(body.enabled).toBe(true);
    expect(body.secret).toMatch(/^[a-f0-9]{64}$/);
    expect(body.createdAt).toBeTypeOf('number');
    expect(body.updatedAt).toBeTypeOf('number');
  });

  it('POST /v1/webhooks stores secretHash (SHA-256) and secretEncrypted (AES-GCM), not raw secret', async () => {
    const res = await app.request('/v1/webhooks', {
      method: 'POST',
      headers: { ...masterHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/hook' }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();

    const row = db.prepare('SELECT * FROM webhooks WHERE id = ?').get(body.id) as Record<string, unknown>;
    expect(row.secret_hash).toBeDefined();
    expect(row.secret_hash).not.toBe(body.secret); // hash, not raw
    expect(row.secret_encrypted).toBeDefined();
    expect(row.secret_encrypted).not.toBe(body.secret); // encrypted, not raw
    expect((row.secret_hash as string).length).toBe(64); // SHA-256 hex digest
  });

  it('POST /v1/webhooks with events=[] stores empty array (wildcard)', async () => {
    const res = await app.request('/v1/webhooks', {
      method: 'POST',
      headers: { ...masterHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/hook', events: [] }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.events).toEqual([]);

    // Verify stored in DB
    const row = db.prepare('SELECT events FROM webhooks WHERE id = ?').get(body.id) as { events: string };
    expect(row.events).toBe('[]');
  });

  it('POST /v1/webhooks with invalid URL returns 400', async () => {
    const res = await app.request('/v1/webhooks', {
      method: 'POST',
      headers: { ...masterHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'not-a-valid-url' }),
    });

    expect(res.status).toBe(400);
  });

  it('POST /v1/webhooks without masterAuth returns 401', async () => {
    const res = await app.request('/v1/webhooks', {
      method: 'POST',
      headers: { Host: HOST, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/hook' }),
    });

    expect(res.status).toBe(401);
  });

  // -----------------------------------------------------------------------
  // GET /v1/webhooks
  // -----------------------------------------------------------------------

  it('GET /v1/webhooks returns list sorted by created_at DESC, no secret fields', async () => {
    // Create 2 webhooks
    await app.request('/v1/webhooks', {
      method: 'POST',
      headers: { ...masterHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/hook1', description: 'First' }),
    });
    await app.request('/v1/webhooks', {
      method: 'POST',
      headers: { ...masterHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/hook2', description: 'Second' }),
    });

    const res = await app.request('/v1/webhooks', {
      method: 'GET',
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);

    for (const webhook of body.data) {
      expect(webhook).not.toHaveProperty('secret');
      expect(webhook).not.toHaveProperty('secretHash');
      expect(webhook).not.toHaveProperty('secretEncrypted');
      expect(webhook).not.toHaveProperty('secret_hash');
      expect(webhook).not.toHaveProperty('secret_encrypted');
      expect(webhook.id).toBeDefined();
      expect(webhook.url).toBeDefined();
      expect(webhook.enabled).toBe(true);
    }

    expect(body.data[0].createdAt).toBeGreaterThanOrEqual(body.data[1].createdAt);
  });

  it('GET /v1/webhooks without masterAuth returns 401', async () => {
    const res = await app.request('/v1/webhooks', {
      method: 'GET',
      headers: { Host: HOST },
    });

    expect(res.status).toBe(401);
  });

  // -----------------------------------------------------------------------
  // DELETE /v1/webhooks/:id
  // -----------------------------------------------------------------------

  it('DELETE /v1/webhooks/:id returns 204', async () => {
    const createRes = await app.request('/v1/webhooks', {
      method: 'POST',
      headers: { ...masterHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/hook' }),
    });
    const { id } = await createRes.json();

    const deleteRes = await app.request(`/v1/webhooks/${id}`, {
      method: 'DELETE',
      headers: masterHeaders(),
    });

    expect(deleteRes.status).toBe(204);

    const row = db.prepare('SELECT id FROM webhooks WHERE id = ?').get(id);
    expect(row).toBeUndefined();
  });

  it('DELETE /v1/webhooks/:id CASCADE deletes associated webhook_logs', async () => {
    const createRes = await app.request('/v1/webhooks', {
      method: 'POST',
      headers: { ...masterHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/hook' }),
    });
    const { id } = await createRes.json();

    // Insert a webhook_log manually
    const logId = generateId();
    db.prepare(
      'INSERT INTO webhook_logs (id, webhook_id, event_type, status, attempt, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(logId, id, 'TX_CONFIRMED', 'success', 1, Math.floor(Date.now() / 1000));

    const logBefore = db.prepare('SELECT id FROM webhook_logs WHERE id = ?').get(logId);
    expect(logBefore).toBeDefined();

    const deleteRes = await app.request(`/v1/webhooks/${id}`, {
      method: 'DELETE',
      headers: masterHeaders(),
    });
    expect(deleteRes.status).toBe(204);

    const logAfter = db.prepare('SELECT id FROM webhook_logs WHERE id = ?').get(logId);
    expect(logAfter).toBeUndefined();
  });

  it('DELETE /v1/webhooks/:id with non-existent id returns 404', async () => {
    const fakeId = generateId();
    const res = await app.request(`/v1/webhooks/${fakeId}`, {
      method: 'DELETE',
      headers: masterHeaders(),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('WEBHOOK_NOT_FOUND');
  });

  it('DELETE /v1/webhooks/:id without masterAuth returns 401', async () => {
    const fakeId = generateId();
    const res = await app.request(`/v1/webhooks/${fakeId}`, {
      method: 'DELETE',
      headers: { Host: HOST },
    });

    expect(res.status).toBe(401);
  });
});
