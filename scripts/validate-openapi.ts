#!/usr/bin/env tsx
/**
 * OpenAPI Spec Validation Script
 *
 * Extracts the OpenAPI 3.0 spec from GET /doc endpoint via createApp(),
 * then validates it using @apidevtools/swagger-parser.
 *
 * Usage: pnpm run validate:openapi (or: tsx scripts/validate-openapi.ts)
 * Exit code 1 on any validation error. CI runs this in PR checks.
 *
 * @see docs-internal/29-api-framework-design.md
 */

import { createApp } from '../packages/daemon/src/api/server.js';

async function main(): Promise<void> {
  console.log('OpenAPI spec validation: extracting spec from GET /doc...\n');

  // Create minimal app (no deps = public routes only: /health, /doc, etc.)
  const app = createApp();

  // Extract OpenAPI spec via GET /doc
  const res = await app.request('/doc', {
    headers: { Host: '127.0.0.1:3100' },
  });

  if (res.status !== 200) {
    console.error(`FAILED: GET /doc returned status ${res.status}`);
    process.exit(1);
  }

  const spec = await res.json();

  // Validate with swagger-parser (dynamic import for ESM compatibility)
  const SwaggerParser = (await import('@apidevtools/swagger-parser')).default;
  try {
    await SwaggerParser.validate(spec as any);
    console.log(`OpenAPI spec valid (0 errors)`);
    console.log(`  Version: ${(spec as any).openapi}`);
    console.log(`  Title: ${(spec as any).info?.title}`);
    console.log(`  API Version: ${(spec as any).info?.version}`);
    const pathCount = Object.keys((spec as any).paths ?? {}).length;
    console.log(`  Paths: ${pathCount}`);
  } catch (err: unknown) {
    console.error(`\nFAILED: OpenAPI spec validation errors:\n`);
    if (err instanceof Error) {
      console.error(`  ${err.message}`);
    } else {
      console.error(`  ${String(err)}`);
    }
    process.exit(1);
  }
}

main();
