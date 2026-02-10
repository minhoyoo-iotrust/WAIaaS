/**
 * Policy CRUD routes: POST, GET, PUT, DELETE /policies.
 *
 * All routes are protected by masterAuth middleware at the server level.
 *
 * POST /policies         -> create a new policy (201)
 * GET /policies          -> list policies with optional agentId filter (200)
 * PUT /policies/:id      -> update a policy (200)
 * DELETE /policies/:id   -> delete a policy (200)
 *
 * @see docs/33-time-lock-approval-mechanism.md
 * @see docs/37-rest-api-complete-spec.md
 */

import { Hono } from 'hono';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, or, isNull, desc } from 'drizzle-orm';
import {
  CreatePolicyRequestSchema,
  UpdatePolicyRequestSchema,
  WAIaaSError,
} from '@waiaas/core';
import { generateId } from '../../infrastructure/database/id.js';
import { agents, policies } from '../../infrastructure/database/schema.js';
import type * as schema from '../../infrastructure/database/schema.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PolicyRouteDeps {
  db: BetterSQLite3Database<typeof schema>;
}

// ---------------------------------------------------------------------------
// Rule validators (type-specific JSON structure checks)
// ---------------------------------------------------------------------------

const DIGIT_STRING_REGEX = /^\d+$/;

/**
 * Validate SPENDING_LIMIT rules structure.
 * Required fields: instant_max, notify_max, delay_max (digit strings).
 * Optional: delay_seconds (number), approval_timeout (number).
 */
function validateSpendingLimitRules(rules: Record<string, unknown>): void {
  const required = ['instant_max', 'notify_max', 'delay_max'] as const;
  for (const field of required) {
    const value = rules[field];
    if (typeof value !== 'string' || !DIGIT_STRING_REGEX.test(value)) {
      throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: `SPENDING_LIMIT rules.${field} must be a digit string`,
      });
    }
  }
  if (rules.delay_seconds !== undefined && typeof rules.delay_seconds !== 'number') {
    throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
      message: 'SPENDING_LIMIT rules.delay_seconds must be a number',
    });
  }
  if (rules.approval_timeout !== undefined && typeof rules.approval_timeout !== 'number') {
    throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
      message: 'SPENDING_LIMIT rules.approval_timeout must be a number',
    });
  }
}

/**
 * Validate WHITELIST rules structure.
 * Required field: allowed_addresses (string array).
 */
function validateWhitelistRules(rules: Record<string, unknown>): void {
  const addrs = rules.allowed_addresses;
  if (!Array.isArray(addrs)) {
    throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
      message: 'WHITELIST rules.allowed_addresses must be an array',
    });
  }
  for (const addr of addrs) {
    if (typeof addr !== 'string') {
      throw new WAIaaSError('ACTION_VALIDATION_FAILED', {
        message: 'WHITELIST rules.allowed_addresses must contain only strings',
      });
    }
  }
}

/**
 * Validate rules based on policy type.
 * SPENDING_LIMIT and WHITELIST have specific validation.
 * Other types accept any object (future v1.4+ validation).
 */
function validateRules(type: string, rules: Record<string, unknown>): void {
  if (type === 'SPENDING_LIMIT') {
    validateSpendingLimitRules(rules);
  } else if (type === 'WHITELIST') {
    validateWhitelistRules(rules);
  }
  // Other types: accept any object
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create policy route sub-router.
 *
 * POST /policies         -> create policy (201)
 * GET /policies          -> list policies (200)
 * PUT /policies/:id      -> update policy (200)
 * DELETE /policies/:id   -> delete policy (200)
 */
export function policyRoutes(deps: PolicyRouteDeps): Hono {
  const router = new Hono();

  // -------------------------------------------------------------------------
  // POST /policies -- create a new policy
  // -------------------------------------------------------------------------
  router.post('/policies', async (c) => {
    const body = await c.req.json();
    const parsed = CreatePolicyRequestSchema.parse(body);

    // Validate rules based on type
    validateRules(parsed.type, parsed.rules as Record<string, unknown>);

    // If agentId provided, verify agent exists
    if (parsed.agentId) {
      const agent = deps.db
        .select()
        .from(agents)
        .where(eq(agents.id, parsed.agentId))
        .get();

      if (!agent) {
        throw new WAIaaSError('AGENT_NOT_FOUND');
      }
    }

    const id = generateId();
    const nowSec = Math.floor(Date.now() / 1000);
    const now = new Date(nowSec * 1000);

    deps.db.insert(policies).values({
      id,
      agentId: parsed.agentId ?? null,
      type: parsed.type,
      rules: JSON.stringify(parsed.rules),
      priority: parsed.priority,
      enabled: parsed.enabled,
      createdAt: now,
      updatedAt: now,
    }).run();

    return c.json(
      {
        id,
        agentId: parsed.agentId ?? null,
        type: parsed.type,
        rules: parsed.rules,
        priority: parsed.priority,
        enabled: parsed.enabled,
        createdAt: nowSec,
        updatedAt: nowSec,
      },
      201,
    );
  });

  // -------------------------------------------------------------------------
  // GET /policies -- list policies with optional agentId filter
  // -------------------------------------------------------------------------
  router.get('/policies', (c) => {
    const agentId = c.req.query('agentId');

    let rows;
    if (agentId) {
      // Return agent-specific + global policies
      rows = deps.db
        .select()
        .from(policies)
        .where(
          or(eq(policies.agentId, agentId), isNull(policies.agentId)),
        )
        .orderBy(desc(policies.priority))
        .all();
    } else {
      // Return all policies
      rows = deps.db
        .select()
        .from(policies)
        .orderBy(desc(policies.priority))
        .all();
    }

    const result = rows.map((row) => ({
      id: row.id,
      agentId: row.agentId,
      type: row.type,
      rules: JSON.parse(row.rules),
      priority: row.priority,
      enabled: row.enabled,
      createdAt: Math.floor(row.createdAt.getTime() / 1000),
      updatedAt: Math.floor(row.updatedAt.getTime() / 1000),
    }));

    return c.json(result, 200);
  });

  // -------------------------------------------------------------------------
  // PUT /policies/:id -- update a policy
  // -------------------------------------------------------------------------
  router.put('/policies/:id', async (c) => {
    const policyId = c.req.param('id');

    // Check policy exists
    const existing = deps.db
      .select()
      .from(policies)
      .where(eq(policies.id, policyId))
      .get();

    if (!existing) {
      throw new WAIaaSError('POLICY_NOT_FOUND');
    }

    const body = await c.req.json();
    const parsed = UpdatePolicyRequestSchema.parse(body);

    // Validate rules if provided (use existing type for validation context)
    if (parsed.rules) {
      validateRules(existing.type, parsed.rules as Record<string, unknown>);
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const now = new Date(nowSec * 1000);

    const updateData: Record<string, unknown> = { updatedAt: now };
    if (parsed.rules !== undefined) {
      updateData.rules = JSON.stringify(parsed.rules);
    }
    if (parsed.priority !== undefined) {
      updateData.priority = parsed.priority;
    }
    if (parsed.enabled !== undefined) {
      updateData.enabled = parsed.enabled;
    }

    deps.db
      .update(policies)
      .set(updateData)
      .where(eq(policies.id, policyId))
      .run();

    // Fetch updated row
    const updated = deps.db
      .select()
      .from(policies)
      .where(eq(policies.id, policyId))
      .get()!;

    return c.json(
      {
        id: updated.id,
        agentId: updated.agentId,
        type: updated.type,
        rules: JSON.parse(updated.rules),
        priority: updated.priority,
        enabled: updated.enabled,
        createdAt: Math.floor(updated.createdAt.getTime() / 1000),
        updatedAt: Math.floor(updated.updatedAt.getTime() / 1000),
      },
      200,
    );
  });

  // -------------------------------------------------------------------------
  // DELETE /policies/:id -- delete a policy
  // -------------------------------------------------------------------------
  router.delete('/policies/:id', (c) => {
    const policyId = c.req.param('id');

    // Check policy exists
    const existing = deps.db
      .select()
      .from(policies)
      .where(eq(policies.id, policyId))
      .get();

    if (!existing) {
      throw new WAIaaSError('POLICY_NOT_FOUND');
    }

    deps.db
      .delete(policies)
      .where(eq(policies.id, policyId))
      .run();

    return c.json({ id: policyId, deleted: true }, 200);
  });

  return router;
}
