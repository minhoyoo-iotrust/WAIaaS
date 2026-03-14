/**
 * API Contract Tests
 *
 * Verifies structural consistency between openapi.json schemas
 * and the type aliases used by Admin UI pages.
 *
 * If a backend schema is removed or renamed, these tests fail,
 * ensuring Admin UI always references valid API contracts.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load the OpenAPI spec directly (JSON)
const specPath = resolve(__dirname, '..', '..', 'openapi.json');
const spec = JSON.parse(readFileSync(specPath, 'utf-8'));
const schemas: Record<string, unknown> = spec.components?.schemas ?? {};

// Load types.aliases.ts source to extract schema references
const aliasesPath = resolve(__dirname, '..', 'api', 'types.aliases.ts');
const aliasesContent = readFileSync(aliasesPath, 'utf-8');

/**
 * Extract schema names referenced via components['schemas']['XXX'] pattern.
 */
function extractReferencedSchemas(content: string): string[] {
  const pattern = /components\['schemas'\]\['(\w+)'\]/g;
  const names: string[] = [];
  let match;
  while ((match = pattern.exec(content)) !== null) {
    names.push(match[1]);
  }
  return [...new Set(names)];
}

/**
 * Resolve $ref to get property keys from a schema.
 */
function getPropertyKeys(schema: Record<string, unknown>): string[] {
  if (schema.$ref && typeof schema.$ref === 'string') {
    const refPath = (schema.$ref as string).replace('#/', '').split('/');
    let resolved: unknown = spec;
    for (const part of refPath) {
      if (resolved && typeof resolved === 'object') {
        resolved = (resolved as Record<string, unknown>)[part];
      }
    }
    return resolved ? getPropertyKeys(resolved as Record<string, unknown>) : [];
  }

  const keys: string[] = [];
  if (schema.properties && typeof schema.properties === 'object') {
    keys.push(...Object.keys(schema.properties as Record<string, unknown>));
  }
  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) {
      if (typeof sub === 'object' && sub !== null) {
        keys.push(...getPropertyKeys(sub as Record<string, unknown>));
      }
    }
  }
  return keys;
}

describe('API Contract: OpenAPI spec vs Admin UI', () => {
  const referencedSchemas = extractReferencedSchemas(aliasesContent);

  it('types.aliases.ts references at least one schema', () => {
    expect(referencedSchemas.length).toBeGreaterThan(0);
  });

  it('all referenced schemas exist in openapi.json', () => {
    const missing = referencedSchemas.filter(name => !schemas[name]);
    expect(missing).toEqual([]);
  });

  it('referenced schemas have properties (not empty objects)', () => {
    const empty: string[] = [];
    for (const name of referencedSchemas) {
      const schema = schemas[name];
      if (schema) {
        const keys = getPropertyKeys(schema as Record<string, unknown>);
        if (keys.length === 0) {
          empty.push(name);
        }
      }
    }
    expect(empty).toEqual([]);
  });

  it('openapi.json has components.schemas section', () => {
    expect(spec.components).toBeDefined();
    expect(spec.components.schemas).toBeDefined();
    expect(Object.keys(spec.components.schemas).length).toBeGreaterThan(0);
  });

  it('each referenced schema has expected property structure', () => {
    for (const name of referencedSchemas) {
      const schema = schemas[name] as Record<string, unknown>;
      expect(schema, `Schema ${name} should exist`).toBeDefined();
      const keys = getPropertyKeys(schema);
      expect(keys.length, `Schema ${name} should have properties`).toBeGreaterThan(0);
    }
  });

  // Negative test: simulated missing schema detection
  it('detects when a schema is missing from spec (negative test)', () => {
    const fakeReferences = [...referencedSchemas, 'NonExistentSchemaFooBar'];
    const missing = fakeReferences.filter(name => !schemas[name]);
    expect(missing).toContain('NonExistentSchemaFooBar');
    expect(missing).toHaveLength(1);
  });

  // Negative test: simulated empty schema detection
  it('detects when a schema has no properties (negative test)', () => {
    const emptySchema = { type: 'object' }; // no properties
    const keys = getPropertyKeys(emptySchema);
    expect(keys).toHaveLength(0);
  });
});
