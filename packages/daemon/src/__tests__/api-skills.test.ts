/**
 * Tests for GET /skills/:name route.
 * Covers happy path (valid skill), invalid skill name (404), and missing file edge case.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { Hono } from 'hono';
import { skillsRoutes } from '../api/routes/skills.js';
import { errorHandler } from '../api/middleware/error-handler.js';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof fs>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

function createApp() {
  const app = new Hono();
  app.onError(errorHandler);
  app.route('/', skillsRoutes());
  return app;
}

describe('GET /skills/:name', () => {
  const app = createApp();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns skill content for valid skill name', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('# Quickstart\nSome content');

    const res = await app.request('/skills/quickstart');
    expect(res.status).toBe(200);

    const body = (await res.json()) as { name: string; content: string };
    expect(body.name).toBe('quickstart');
    expect(body.content).toContain('Quickstart');
  });

  it('returns 404 for invalid skill name', async () => {
    const res = await app.request('/skills/nonexistent');
    expect(res.status).toBe(404);

    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('SKILL_NOT_FOUND');
  });

  it('returns 404 when skill file does not exist on disk', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const res = await app.request('/skills/wallet');
    expect(res.status).toBe(404);

    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('SKILL_NOT_FOUND');
  });

  it('returns content for actions skill', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('# Actions\nAction providers');

    const res = await app.request('/skills/actions');
    expect(res.status).toBe(200);

    const body = (await res.json()) as { name: string; content: string };
    expect(body.name).toBe('actions');
  });
});
