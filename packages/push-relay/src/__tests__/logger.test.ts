import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { info, error, debug, setDebug, isDebug } from '../logger.js';

describe('logger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setDebug(false);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('info() outputs with [push-relay] prefix', () => {
    info('test message');
    expect(logSpy).toHaveBeenCalledWith('[push-relay]', 'test message');
  });

  it('error() outputs with [push-relay] prefix to stderr', () => {
    error('test error');
    expect(errorSpy).toHaveBeenCalledWith('[push-relay]', 'test error');
  });

  it('debug() is silent when debug mode is off', () => {
    debug('hidden message');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('debug() outputs with [DEBUG] prefix when debug mode is on', () => {
    setDebug(true);
    debug('visible message');
    expect(logSpy).toHaveBeenCalledWith('[push-relay] [DEBUG]', 'visible message');
  });

  it('isDebug() returns current debug state', () => {
    expect(isDebug()).toBe(false);
    setDebug(true);
    expect(isDebug()).toBe(true);
    setDebug(false);
    expect(isDebug()).toBe(false);
  });

  it('info() supports multiple arguments', () => {
    info('key=', 'value', 42);
    expect(logSpy).toHaveBeenCalledWith('[push-relay]', 'key=', 'value', 42);
  });
});
