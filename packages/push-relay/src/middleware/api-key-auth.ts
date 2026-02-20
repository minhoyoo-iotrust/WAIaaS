import type { Context, Next } from 'hono';

export function apiKeyAuth(apiKey: string) {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const provided = c.req.header('X-API-Key');
    if (!provided || provided !== apiKey) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    await next();
  };
}
