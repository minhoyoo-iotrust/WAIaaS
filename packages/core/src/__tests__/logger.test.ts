import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConsoleLogger, type ILogger } from '../interfaces/logger.js';

describe('ConsoleLogger', () => {
  let logger: ConsoleLogger;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('implements ILogger interface', () => {
    const instance: ILogger = new ConsoleLogger();
    expect(instance.debug).toBeDefined();
    expect(instance.info).toBeDefined();
    expect(instance.warn).toBeDefined();
    expect(instance.error).toBeDefined();
  });

  it('logs debug messages when level is debug', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    logger = new ConsoleLogger(undefined, 'debug');
    logger.debug('test message');
    expect(spy).toHaveBeenCalledWith('test message');
  });

  it('logs info messages', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger = new ConsoleLogger();
    logger.info('test info');
    expect(spy).toHaveBeenCalledWith('test info');
  });

  it('logs warn messages', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger = new ConsoleLogger();
    logger.warn('test warn');
    expect(spy).toHaveBeenCalledWith('test warn');
  });

  it('logs error messages', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger = new ConsoleLogger();
    logger.error('test error');
    expect(spy).toHaveBeenCalledWith('test error');
  });

  it('formats with prefix when provided', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger = new ConsoleLogger('MyModule');
    logger.info('hello');
    expect(spy).toHaveBeenCalledWith('[MyModule] hello');
  });

  it('formats with context when provided', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger = new ConsoleLogger();
    logger.info('hello', { key: 'value' });
    expect(spy).toHaveBeenCalledWith('hello {"key":"value"}');
  });

  it('formats with prefix and context together', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger = new ConsoleLogger('Prefix');
    logger.warn('msg', { a: 1 });
    expect(spy).toHaveBeenCalledWith('[Prefix] msg {"a":1}');
  });

  it('suppresses debug when level is info (#416)', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    logger = new ConsoleLogger(undefined, 'info');
    logger.debug('should not appear');
    expect(spy).not.toHaveBeenCalled();
  });

  it('allows info when level is info', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger = new ConsoleLogger(undefined, 'info');
    logger.info('should appear');
    expect(spy).toHaveBeenCalled();
  });

  it('suppresses debug and info when level is warn', () => {
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger = new ConsoleLogger(undefined, 'warn');
    logger.debug('no');
    logger.info('no');
    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('setLevel changes level at runtime (#416 hot-reload)', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    logger = new ConsoleLogger(undefined, 'info');
    logger.debug('suppressed');
    expect(spy).not.toHaveBeenCalled();
    logger.setLevel('debug');
    logger.debug('visible');
    expect(spy).toHaveBeenCalledWith('visible');
  });

  it('level getter returns current level', () => {
    logger = new ConsoleLogger(undefined, 'warn');
    expect(logger.level).toBe('warn');
    logger.setLevel('error');
    expect(logger.level).toBe('error');
  });

  it('defaults to info level when not specified', () => {
    logger = new ConsoleLogger();
    expect(logger.level).toBe('info');
  });

  it('error level only allows error messages', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger = new ConsoleLogger(undefined, 'error');
    logger.warn('suppressed');
    logger.error('visible');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });
});
