/**
 * Skills routes: serve API skill reference files (public, no auth required).
 *
 * GET /skills/:name - Return skill file content as JSON.
 * No DB, keystore, or adapter dependencies (stateless file serving).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { WAIaaSError } from '@waiaas/core';
import { openApiValidationHook, buildErrorResponses } from './openapi-schemas.js';

const SKILLS_DIR = resolve(process.cwd(), 'skills');
const VALID_SKILLS = ['quickstart', 'wallet', 'transactions', 'policies', 'admin'] as const;

const SkillResponseSchema = z
  .object({
    name: z.string(),
    content: z.string(),
  })
  .openapi('SkillResponse');

const getSkillRoute = createRoute({
  method: 'get',
  path: '/skills/{name}',
  tags: ['Skills'],
  summary: 'Get skill file content',
  request: {
    params: z.object({
      name: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Skill file content',
      content: { 'application/json': { schema: SkillResponseSchema } },
    },
    ...buildErrorResponses(['SKILL_NOT_FOUND']),
  },
});

export function skillsRoutes(): OpenAPIHono {
  const router = new OpenAPIHono({ defaultHook: openApiValidationHook });

  router.openapi(getSkillRoute, (c) => {
    const { name } = c.req.valid('param');

    if (!(VALID_SKILLS as readonly string[]).includes(name)) {
      throw new WAIaaSError('SKILL_NOT_FOUND', {
        message: `Skill '${name}' not found`,
      });
    }

    const filePath = resolve(SKILLS_DIR, `${name}.skill.md`);

    if (!existsSync(filePath)) {
      throw new WAIaaSError('SKILL_NOT_FOUND', {
        message: `Skill '${name}' not found`,
      });
    }

    const content = readFileSync(filePath, 'utf-8');
    return c.json({ name, content }, 200);
  });

  return router;
}
