/**
 * Admin REST API -- telegram_users management endpoint tests.
 *
 * 10 tests covering:
 *   - GET /v1/admin/telegram-users: empty list, 2 users returned
 *   - PUT /v1/admin/telegram-users/:chatId: PENDING->ADMIN, PENDING->READONLY, not found 404, invalid role 400
 *   - DELETE /v1/admin/telegram-users/:chatId: delete success, not found 404
 *   - masterAuth: GET without auth -> 401
 *   - Route registration (OpenAPI /doc check)
 *
 * Uses createApp() + app.request() integration pattern.
 *
 * @see packages/daemon/src/api/routes/admin.ts
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import type { Database as DatabaseType } from 'better-sqlite3';
import argon2 from 'argon2';
import { createDatabase, pushSchema } from '../infrastructure/database/index.js';
import { createApp } from '../api/server.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEST_PASSWORD = 'test-master-password-telegram';
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

function masterJsonHeaders(): Record<string, string> {
  return {
    ...masterHeaders(),
    'Content-Type': 'application/json',
  };
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function registerUser(sqlite: DatabaseType, chatId: number, role: string, username?: string): void {
  const now = Math.floor(Date.now() / 1000);
  sqlite.prepare(
    'INSERT INTO telegram_users (chat_id, username, role, registered_at) VALUES (?, ?, ?, ?)',
  ).run(chatId, username ?? null, role, now);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let sqlite: DatabaseType;
let db: ReturnType<typeof createDatabase>['db'];

beforeAll(async () => {
  passwordHash = await argon2.hash(TEST_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 4096,
    timeCost: 2,
    parallelism: 1,
  });
});

beforeEach(() => {
  const conn = createDatabase(':memory:');
  sqlite = conn.sqlite;
  db = conn.db;
  pushSchema(sqlite);
});

afterEach(() => {
  try { sqlite.close(); } catch { /* already closed */ }
});

// ---------------------------------------------------------------------------
// GET /admin/telegram-users
// ---------------------------------------------------------------------------

describe('GET /v1/admin/telegram-users', () => {
  it('returns empty list when no users registered', async () => {
    const app = createApp({
      db,
      sqlite,
      masterPasswordHash: passwordHash,
    });

    const res = await app.request('/v1/admin/telegram-users', {
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.users).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('returns registered users with correct fields', async () => {
    registerUser(sqlite, 12345, 'PENDING', 'testuser1');
    registerUser(sqlite, 67890, 'ADMIN', 'testuser2');

    const app = createApp({
      db,
      sqlite,
      masterPasswordHash: passwordHash,
    });

    const res = await app.request('/v1/admin/telegram-users', {
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const users = body.users as Array<Record<string, unknown>>;
    expect(users).toHaveLength(2);
    expect(body.total).toBe(2);

    // Verify fields are present
    const user = users.find(u => u.chat_id === 12345);
    expect(user).toBeDefined();
    expect(user!.username).toBe('testuser1');
    expect(user!.role).toBe('PENDING');
    expect(user!.registered_at).toBeGreaterThan(0);
  });

  it('returns 401 without masterAuth header', async () => {
    const app = createApp({
      db,
      sqlite,
      masterPasswordHash: passwordHash,
    });

    const res = await app.request('/v1/admin/telegram-users', {
      headers: { Host: HOST },
    });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PUT /admin/telegram-users/:chatId
// ---------------------------------------------------------------------------

describe('PUT /v1/admin/telegram-users/:chatId', () => {
  it('updates PENDING user to ADMIN with approved_at', async () => {
    registerUser(sqlite, 12345, 'PENDING', 'testuser');

    const app = createApp({
      db,
      sqlite,
      masterPasswordHash: passwordHash,
    });

    const res = await app.request('/v1/admin/telegram-users/12345', {
      method: 'PUT',
      headers: masterJsonHeaders(),
      body: JSON.stringify({ role: 'ADMIN' }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.chat_id).toBe(12345);
    expect(body.role).toBe('ADMIN');

    // Verify DB
    const row = sqlite.prepare('SELECT role, approved_at FROM telegram_users WHERE chat_id = ?').get(12345) as any;
    expect(row.role).toBe('ADMIN');
    expect(row.approved_at).toBeGreaterThan(0);
  });

  it('updates PENDING user to READONLY', async () => {
    registerUser(sqlite, 12345, 'PENDING', 'testuser');

    const app = createApp({
      db,
      sqlite,
      masterPasswordHash: passwordHash,
    });

    const res = await app.request('/v1/admin/telegram-users/12345', {
      method: 'PUT',
      headers: masterJsonHeaders(),
      body: JSON.stringify({ role: 'READONLY' }),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.role).toBe('READONLY');
  });

  it('returns 404 for non-existent chatId', async () => {
    const app = createApp({
      db,
      sqlite,
      masterPasswordHash: passwordHash,
    });

    const res = await app.request('/v1/admin/telegram-users/99999', {
      method: 'PUT',
      headers: masterJsonHeaders(),
      body: JSON.stringify({ role: 'ADMIN' }),
    });

    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid role', async () => {
    registerUser(sqlite, 12345, 'PENDING');

    const app = createApp({
      db,
      sqlite,
      masterPasswordHash: passwordHash,
    });

    const res = await app.request('/v1/admin/telegram-users/12345', {
      method: 'PUT',
      headers: masterJsonHeaders(),
      body: JSON.stringify({ role: 'INVALID' }),
    });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// DELETE /admin/telegram-users/:chatId
// ---------------------------------------------------------------------------

describe('DELETE /v1/admin/telegram-users/:chatId', () => {
  it('deletes existing user', async () => {
    registerUser(sqlite, 12345, 'PENDING', 'testuser');

    const app = createApp({
      db,
      sqlite,
      masterPasswordHash: passwordHash,
    });

    const res = await app.request('/v1/admin/telegram-users/12345', {
      method: 'DELETE',
      headers: masterHeaders(),
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.success).toBe(true);

    // Verify user is deleted from DB
    const row = sqlite.prepare('SELECT * FROM telegram_users WHERE chat_id = ?').get(12345);
    expect(row).toBeUndefined();
  });

  it('returns 404 for non-existent chatId', async () => {
    const app = createApp({
      db,
      sqlite,
      masterPasswordHash: passwordHash,
    });

    const res = await app.request('/v1/admin/telegram-users/99999', {
      method: 'DELETE',
      headers: masterHeaders(),
    });

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

describe('Route registration', () => {
  it('telegram-users routes appear in OpenAPI doc', async () => {
    const app = createApp({
      db,
      sqlite,
      masterPasswordHash: passwordHash,
    });

    const res = await app.request('/doc', {
      headers: { Host: HOST },
    });

    expect(res.status).toBe(200);
    const body = await json(res);
    const paths = body.paths as Record<string, unknown>;
    // Routes are mounted under /v1 prefix
    const pathKeys = Object.keys(paths);
    const hasTelegramUsersListPath = pathKeys.some(p => p.includes('telegram-users') && !p.includes('{'));
    const hasTelegramUsersChatIdPath = pathKeys.some(p => p.includes('telegram-users') && p.includes('{chatId}'));
    expect(hasTelegramUsersListPath).toBe(true);
    expect(hasTelegramUsersChatIdPath).toBe(true);
  });
});
