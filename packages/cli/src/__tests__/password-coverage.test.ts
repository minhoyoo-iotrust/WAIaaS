/**
 * Unit tests for the interactive promptPassword path in `utils/password.ts`.
 *
 * The env var and file paths are already tested in cli-commands.test.ts.
 * This file covers the stdin interactive prompt (lines 29-64).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('promptPassword (interactive stdin)', () => {
  const originalEnv = { ...process.env };
  const originalStdin = process.stdin;
  let mockStdoutWrite: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Clear env vars so resolvePassword falls through to promptPassword
    delete process.env['WAIAAS_MASTER_PASSWORD'];
    delete process.env['WAIAAS_MASTER_PASSWORD_FILE'];

    mockStdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    // Restore original stdin
    Object.defineProperty(process, 'stdin', { value: originalStdin, writable: true });
    vi.restoreAllMocks();
  });

  it('resolves with trimmed password on valid input', async () => {
    // Create a PassThrough stream to act as mock stdin
    const mockStdin = new PassThrough();
    Object.defineProperty(process, 'stdin', { value: mockStdin, writable: true });

    const { resolvePassword } = await import('../utils/password.js');

    const promise = resolvePassword();

    // Push data into mock stdin after a brief delay to let createInterface set up
    setTimeout(() => {
      mockStdin.push('  my-secure-pw  \n');
    }, 20);

    const result = await promise;
    expect(result).toBe('my-secure-pw');

    // Should have written ANSI escape codes
    expect(mockStdoutWrite).toHaveBeenCalledWith('Master password: ');
    expect(mockStdoutWrite).toHaveBeenCalledWith('\x1B[8m');  // hide
    expect(mockStdoutWrite).toHaveBeenCalledWith('\x1B[28m'); // show
    expect(mockStdoutWrite).toHaveBeenCalledWith('\n');

    mockStdin.destroy();
  });

  it('rejects with "Password cannot be empty" on empty input', async () => {
    const mockStdin = new PassThrough();
    Object.defineProperty(process, 'stdin', { value: mockStdin, writable: true });

    const { resolvePassword } = await import('../utils/password.js');

    const promise = resolvePassword();

    setTimeout(() => {
      mockStdin.push('   \n'); // whitespace-only
    }, 20);

    await expect(promise).rejects.toThrow('Password cannot be empty');

    mockStdin.destroy();
  });

  it('rejects with error on readline error', async () => {
    const mockStdin = new PassThrough();
    Object.defineProperty(process, 'stdin', { value: mockStdin, writable: true });

    const { resolvePassword } = await import('../utils/password.js');

    const promise = resolvePassword();

    setTimeout(() => {
      mockStdin.destroy(new Error('stdin closed'));
    }, 20);

    await expect(promise).rejects.toThrow('stdin closed');

    // Should have written show-text escape code in error handler
    expect(mockStdoutWrite).toHaveBeenCalledWith('\x1B[28m');
  });
});
