#!/usr/bin/env tsx
/**
 * API Contract Check
 *
 * Verifies that OpenAPI spec response schemas are consistent with Admin UI usage.
 * Compares:
 *   1. Schema names referenced in types.aliases.ts exist in openapi.json
 *   2. Response schema property keys exist for schemas used by Admin UI
 *
 * Usage: pnpm run check:api-contract
 * Exit code 1 if contract violations found (CI gate).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname ?? '.', '..');
const SPEC_FILE = resolve(ROOT, 'packages', 'admin', 'openapi.json');
const ALIASES_FILE = resolve(ROOT, 'packages', 'admin', 'src', 'api', 'types.aliases.ts');
const PAGES_DIR = resolve(ROOT, 'packages', 'admin', 'src', 'pages');

interface OpenApiSchema {
  type?: string;
  properties?: Record<string, unknown>;
  allOf?: OpenApiSchema[];
  oneOf?: OpenApiSchema[];
  anyOf?: OpenApiSchema[];
  items?: OpenApiSchema;
  $ref?: string;
}

interface OpenApiSpec {
  paths: Record<string, Record<string, {
    responses?: Record<string, {
      content?: Record<string, { schema?: OpenApiSchema }>;
    }>;
  }>>;
  components?: {
    schemas?: Record<string, OpenApiSchema>;
  };
}

function loadSpec(): OpenApiSpec {
  try {
    return JSON.parse(readFileSync(SPEC_FILE, 'utf-8'));
  } catch {
    console.error('ERROR: openapi.json not found. Run "pnpm run generate:api-types" first.');
    process.exit(1);
  }
}

/**
 * Resolve a $ref string to the actual schema object.
 */
function resolveRef(spec: OpenApiSpec, ref: string): OpenApiSchema | undefined {
  // e.g. "#/components/schemas/WalletCrudResponse"
  const parts = ref.replace('#/', '').split('/');
  let current: unknown = spec;
  for (const part of parts) {
    if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current as OpenApiSchema | undefined;
}

/**
 * Extract top-level property keys from a schema, resolving $ref and allOf.
 */
function extractPropertyKeys(spec: OpenApiSpec, schema: OpenApiSchema, visited = new Set<string>()): string[] {
  if (schema.$ref) {
    if (visited.has(schema.$ref)) return [];
    visited.add(schema.$ref);
    const resolved = resolveRef(spec, schema.$ref);
    return resolved ? extractPropertyKeys(spec, resolved, visited) : [];
  }

  const keys: string[] = [];

  if (schema.properties) {
    keys.push(...Object.keys(schema.properties));
  }

  if (schema.allOf) {
    for (const sub of schema.allOf) {
      keys.push(...extractPropertyKeys(spec, sub, visited));
    }
  }

  return keys;
}

/**
 * Extract schema names referenced in types.aliases.ts via components['schemas']['XXX'] pattern.
 */
function extractAliasedSchemas(aliasesContent: string): string[] {
  const pattern = /components\['schemas'\]\['(\w+)'\]/g;
  const names: string[] = [];
  let match;
  while ((match = pattern.exec(aliasesContent)) !== null) {
    names.push(match[1]);
  }
  return [...new Set(names)];
}

/**
 * Extract field access patterns from page files: data.{field} after api.GET/POST/etc.
 */
function extractFieldAccesses(pagesDir: string): Map<string, Set<string>> {
  const fieldsByFile = new Map<string, Set<string>>();
  let files: string[];
  try {
    files = readdirSync(pagesDir).filter(f => f.endsWith('.tsx') || f.endsWith('.ts'));
  } catch {
    return fieldsByFile;
  }

  for (const file of files) {
    const content = readFileSync(resolve(pagesDir, file), 'utf-8');
    const fields = new Set<string>();

    // Match patterns like: data.fieldName, data?.fieldName
    const dataFieldPattern = /\bdata\??\.\s*(\w+)/g;
    let match;
    while ((match = dataFieldPattern.exec(content)) !== null) {
      // Skip common non-API fields
      const field = match[1];
      if (!['length', 'map', 'filter', 'find', 'forEach', 'reduce', 'some', 'every',
            'sort', 'slice', 'includes', 'indexOf', 'join', 'flat', 'flatMap',
            'keys', 'values', 'entries', 'toString', 'valueOf'].includes(field)) {
        fields.add(field);
      }
    }

    if (fields.size > 0) {
      fieldsByFile.set(file, fields);
    }
  }

  return fieldsByFile;
}

function main(): void {
  console.log('Checking API contract consistency...\n');

  const spec = loadSpec();
  const schemas = spec.components?.schemas ?? {};
  const schemaNames = Object.keys(schemas);

  // 1. Check that all schemas referenced in types.aliases.ts exist in openapi.json
  console.log('--- Schema Reference Check ---');
  let aliasesContent: string;
  try {
    aliasesContent = readFileSync(ALIASES_FILE, 'utf-8');
  } catch {
    console.error('ERROR: types.aliases.ts not found.');
    process.exit(1);
  }

  const referencedSchemas = extractAliasedSchemas(aliasesContent);
  console.log(`  Referenced schemas in aliases: ${referencedSchemas.length}`);
  console.log(`  Available schemas in spec: ${schemaNames.length}`);

  const missingSchemas: string[] = [];
  for (const name of referencedSchemas) {
    if (!schemas[name]) {
      missingSchemas.push(name);
    }
  }

  if (missingSchemas.length > 0) {
    console.error(`\n  FAIL: ${missingSchemas.length} schema(s) referenced but not in spec:`);
    for (const name of missingSchemas) {
      console.error(`    - ${name}`);
    }
  } else {
    console.log('  PASS: All referenced schemas exist in spec.');
  }

  // 2. Check that referenced schemas have properties (not empty objects)
  console.log('\n--- Schema Property Check ---');
  const emptySchemas: string[] = [];
  for (const name of referencedSchemas) {
    const schema = schemas[name];
    if (schema) {
      const keys = extractPropertyKeys(spec, schema);
      if (keys.length === 0) {
        emptySchemas.push(name);
      }
    }
  }

  if (emptySchemas.length > 0) {
    console.error(`\n  WARN: ${emptySchemas.length} referenced schema(s) have no properties:`);
    for (const name of emptySchemas) {
      console.error(`    - ${name}`);
    }
  } else {
    console.log('  PASS: All referenced schemas have properties.');
  }

  // 3. Check field accesses in pages match response schemas
  console.log('\n--- Field Access Check ---');
  const fieldsByFile = extractFieldAccesses(PAGES_DIR);
  console.log(`  Pages with field accesses: ${fieldsByFile.size}`);

  // Build a set of all response schema property keys
  const allResponseKeys = new Set<string>();
  for (const [, pathMethods] of Object.entries(spec.paths)) {
    for (const [, method] of Object.entries(pathMethods)) {
      if (typeof method !== 'object' || !method || !('responses' in method)) continue;
      const methodObj = method as { responses?: Record<string, { content?: Record<string, { schema?: OpenApiSchema }> }> };
      const resp200 = methodObj.responses?.['200'];
      const schema200 = resp200?.content?.['application/json']?.schema;
      if (schema200) {
        const keys = extractPropertyKeys(spec, schema200);
        for (const k of keys) allResponseKeys.add(k);
      }
    }
  }

  console.log(`  Total unique response keys in spec: ${allResponseKeys.size}`);

  // We don't fail on field access mismatches since `data.` can refer to
  // intermediate destructured vars. This is informational.
  let unknownFieldCount = 0;
  for (const [file, fields] of fieldsByFile) {
    for (const field of fields) {
      if (!allResponseKeys.has(field)) {
        unknownFieldCount++;
      }
    }
  }
  if (unknownFieldCount > 0) {
    console.log(`  INFO: ${unknownFieldCount} field access(es) not directly in spec response keys (may be nested or destructured).`);
  } else {
    console.log('  PASS: All page field accesses found in spec response keys.');
  }

  // Final result
  const errors = missingSchemas.length;
  console.log(`\n========================================`);
  if (errors > 0) {
    console.error(`FAIL: ${errors} contract violation(s) found.`);
    console.error('Fix the schema references or update the OpenAPI spec.');
    process.exit(1);
  }

  console.log('PASS: API contract check passed. All schema references are valid.');
  process.exit(0);
}

main();
