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

  it('logs debug messages', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    logger = new ConsoleLogger();
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
});
