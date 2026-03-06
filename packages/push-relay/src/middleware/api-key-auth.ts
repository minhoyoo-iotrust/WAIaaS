import type { Context, Next } from 'hono';
import { debug } from '../logger.js';

export function apiKeyAuth(apiKey: string) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const provided = c.req.header('X-API-Key');
    if (!provided || provided !== apiKey) {
      debug(`API key auth failed: header=${provided ? `${provided.slice(0, 4)}...` : 'missing'}, path=${c.req.path}`);
      return c.json({ error: 'Unauthorized' }, 401);
    }
    debug(`API key auth passed: path=${c.req.path}`);
    await next();
  };
}
