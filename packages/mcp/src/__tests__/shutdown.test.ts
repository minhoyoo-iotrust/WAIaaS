/**
 * Tests for MCP graceful shutdown (BUG-020).
 *
 * Verifies:
 * - MCPS-01: stdin end/close triggers shutdown
 * - MCPS-02: Force exit after 3s timeout
 * - MCPS-03: Idempotent shutdown (multiple calls safe)
 * - Source integration: index.ts uses createShutdownHandler + registerShutdownListeners
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import will fail in RED phase (functions don't exist yet)
import { createShutdownHandler, registerShutdownListeners } from '../index.js';

describe('createShutdownHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shutdown() 호출 시 sessionManager.dispose()와 server.close()가 호출된다', () => {
    const deps = {
      sessionManager: { dispose: vi.fn() },
      server: { close: vi.fn().mockResolvedValue(undefined) },
      exit: vi.fn(),
    };

    const shutdown = createShutdownHandler(deps);
    shutdown();

    expect(deps.sessionManager.dispose).toHaveBeenCalledTimes(1);
    expect(deps.server.close).toHaveBeenCalledTimes(1);
  });

  it('shutdown() 호출 후 forceTimeoutMs 경과 시 exit(0) 호출 (MCPS-02)', () => {
    const deps = {
      sessionManager: { dispose: vi.fn() },
      server: { close: vi.fn().mockResolvedValue(undefined) },
      exit: vi.fn(),
    };

    const shutdown = createShutdownHandler(deps, { forceTimeoutMs: 3_000 });
    shutdown();

    // Before timeout: exit not called
    expect(deps.exit).not.toHaveBeenCalled();

    // Advance by 3s
    vi.advanceTimersByTime(3_000);
    expect(deps.exit).toHaveBeenCalledWith(0);
  });

  it('기본 forceTimeoutMs는 3000ms이다', () => {
    const deps = {
      sessionManager: { dispose: vi.fn() },
      server: { close: vi.fn().mockResolvedValue(undefined) },
      exit: vi.fn(),
    };

    const shutdown = createShutdownHandler(deps);
    shutdown();

    // At 2999ms: exit not called
    vi.advanceTimersByTime(2_999);
    expect(deps.exit).not.toHaveBeenCalled();

    // At 3000ms: exit called
    vi.advanceTimersByTime(1);
    expect(deps.exit).toHaveBeenCalledWith(0);
  });

  it('shutdown() 두 번 호출 시 dispose()가 한 번만 호출된다 (MCPS-03)', () => {
    const deps = {
      sessionManager: { dispose: vi.fn() },
      server: { close: vi.fn().mockResolvedValue(undefined) },
      exit: vi.fn(),
    };

    const shutdown = createShutdownHandler(deps);
    shutdown();
    shutdown(); // second call

    expect(deps.sessionManager.dispose).toHaveBeenCalledTimes(1);
    expect(deps.server.close).toHaveBeenCalledTimes(1);
  });
});

describe('registerShutdownListeners', () => {
  it('stdin end 이벤트 발생 시 shutdown 콜백이 호출된다 (MCPS-01)', () => {
    const shutdown = vi.fn();
    registerShutdownListeners(shutdown);

    process.stdin.emit('end');

    expect(shutdown).toHaveBeenCalledTimes(1);
  });

  it('stdin close 이벤트 발생 시 shutdown 콜백이 호출된다', () => {
    const shutdown = vi.fn();
    registerShutdownListeners(shutdown);

    process.stdin.emit('close');

    expect(shutdown).toHaveBeenCalledTimes(1);
  });
});

describe('소스 통합 검증', () => {
  it('index.ts 소스에 registerShutdownListeners가 포함되어 있다', async () => {
    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const src = await readFile(resolve(__dirname, '..', 'index.ts'), 'utf-8');

    expect(src).toContain('registerShutdownListeners');
  });

  it('index.ts 소스에 createShutdownHandler가 포함되어 있다', async () => {
    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const src = await readFile(resolve(__dirname, '..', 'index.ts'), 'utf-8');

    expect(src).toContain('createShutdownHandler');
  });

  it('index.ts 소스에 기존 inline process.on(SIGTERM) 핸들러가 없다', async () => {
    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const src = await readFile(resolve(__dirname, '..', 'index.ts'), 'utf-8');

    // Should NOT have inline process.on('SIGTERM') handler in main()
    // createShutdownHandler/registerShutdownListeners handles it instead
    const mainBody = src.slice(src.indexOf('async function main'));
    expect(mainBody).not.toMatch(/process\.on\(\s*['"]SIGTERM['"]/);
  });

  it('index.ts에서 shutdown 핸들러가 server.connect 이전에 등록된다', async () => {
    const { readFile } = await import('node:fs/promises');
    const { resolve } = await import('node:path');
    const src = await readFile(resolve(__dirname, '..', 'index.ts'), 'utf-8');

    const shutdownIdx = src.indexOf('registerShutdownListeners');
    const connectIdx = src.indexOf('await server.connect(transport)');

    expect(shutdownIdx).toBeGreaterThan(-1);
    expect(connectIdx).toBeGreaterThan(-1);
    // Shutdown listeners must be registered BEFORE server.connect
    expect(shutdownIdx).toBeLessThan(connectIdx);
  });
});
