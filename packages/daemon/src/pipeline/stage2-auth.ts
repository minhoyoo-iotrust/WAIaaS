/**
 * Stage 2: Auth (v1.1 passthrough).
 *
 * sessionId is set on PipelineContext by the route handler from Hono c.get('sessionId').
 * In v1.2 this stage validates session is still active.
 * For now, the sessionAuth middleware already validated the JWT and set sessionId.
 *
 * @see docs/32-pipeline-design.md
 */

import type { PipelineContext } from './pipeline-helpers.js';

// ---------------------------------------------------------------------------
// Stage 2: Auth (v1.1 passthrough)
// ---------------------------------------------------------------------------

export async function stage2Auth(_ctx: PipelineContext): Promise<void> {
  // sessionId is set on PipelineContext by the route handler from Hono c.get('sessionId').
  // In v1.2 this stage validates session is still active.
  // For now, the sessionAuth middleware already validated the JWT and set sessionId.
}
