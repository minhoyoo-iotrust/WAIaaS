/**
 * SSoT invariant tests.
 *
 * Verifies that shared constants and utilities are not duplicated
 * in production daemon source code. Guards against regression.
 *
 * @see Phase 431 (SSOT-01, SSOT-02)
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { NATIVE_DECIMALS, NATIVE_SYMBOLS } from '@waiaas/core';

describe('SSoT invariant checks', () => {
  it('NATIVE_DECIMALS is exported from @waiaas/core', () => {
    expect(NATIVE_DECIMALS).toBeDefined();
    expect(NATIVE_DECIMALS['solana']).toBe(9);
    expect(NATIVE_DECIMALS['ethereum']).toBe(18);
  });

  it('NATIVE_SYMBOLS is exported from @waiaas/core', () => {
    expect(NATIVE_SYMBOLS).toBeDefined();
    expect(NATIVE_SYMBOLS['solana']).toBe('SOL');
    expect(NATIVE_SYMBOLS['ethereum']).toBe('ETH');
  });

  it('no local NATIVE_DECIMALS definition in daemon production source', () => {
    const result = execSync(
      'grep -rn "const NATIVE_DECIMALS" packages/daemon/src/ --include="*.ts" | grep -v __tests__ | grep -v node_modules || true',
      { encoding: 'utf-8', cwd: process.cwd() },
    ).trim();
    expect(result, 'Found local NATIVE_DECIMALS definition in daemon').toBe('');
  });

  it('no local NATIVE_SYMBOLS definition in daemon production source', () => {
    const result = execSync(
      'grep -rn "const NATIVE_SYMBOLS" packages/daemon/src/ --include="*.ts" | grep -v __tests__ | grep -v node_modules || true',
      { encoding: 'utf-8', cwd: process.cwd() },
    ).trim();
    expect(result, 'Found local NATIVE_SYMBOLS definition in daemon').toBe('');
  });

  it('no local sleep() definition in daemon production source (SSoT-02)', () => {
    // sleep must be imported from @waiaas/core or the local re-export bridge
    const result = execSync(
      'grep -rn "^export.*function sleep\\|^function sleep\\|^const sleep = " packages/daemon/src/ --include="*.ts" | grep -v __tests__ | grep -v node_modules | grep -v "pipeline/sleep.ts" || true',
      { encoding: 'utf-8', cwd: process.cwd() },
    ).trim();
    expect(result, 'Found local sleep() definition in daemon').toBe('');
  });
});
