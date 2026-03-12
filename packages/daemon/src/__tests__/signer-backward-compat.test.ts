/**
 * Backward compatibility verification for existing signing pipelines.
 *
 * Confirms that sign-message.ts, sign-only.ts, and erc8128.ts routes
 * do NOT import ISignerCapability or SignerCapabilityRegistry,
 * ensuring the two code paths remain independent per doc-81 design.
 *
 * @since v31.12
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = resolve(import.meta.dirname, '..');

function readSourceFile(relativePath: string): string {
  return readFileSync(resolve(BASE, relativePath), 'utf-8');
}

describe('Backward compatibility: existing pipelines independent from signer registry', () => {
  const filesToCheck = [
    { name: 'sign-message.ts', path: 'pipeline/sign-message.ts' },
    { name: 'sign-only.ts', path: 'pipeline/sign-only.ts' },
    { name: 'erc8128.ts routes', path: 'api/routes/erc8128.ts' },
  ];

  for (const { name, path } of filesToCheck) {
    it(`${name} does not import ISignerCapability`, () => {
      const content = readSourceFile(path);
      expect(content).not.toContain('ISignerCapability');
    });

    it(`${name} does not import SignerCapabilityRegistry`, () => {
      const content = readSourceFile(path);
      expect(content).not.toContain('SignerCapabilityRegistry');
    });

    it(`${name} does not import from signing/registry`, () => {
      const content = readSourceFile(path);
      expect(content).not.toMatch(/from\s+['"].*signing\/registry/);
    });
  }
});
