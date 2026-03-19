/**
 * Logging abstraction interface.
 * Console-based default implementation provided.
 * Future: swap with structured logger (pino/winston) without changing call sites.
 */
export interface ILogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/** Log level hierarchy: debug < info < warn < error. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Default console-based logger implementation.
 * Formats context as JSON suffix when provided.
 * Supports level filtering via `setLevel()` for hot-reload.
 */
export class ConsoleLogger implements ILogger {
  private _level: LogLevel;

  constructor(private readonly prefix?: string, level: LogLevel = 'info') {
    this._level = level;
  }

  get level(): LogLevel { return this._level; }
  setLevel(level: LogLevel): void { this._level = level; }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) console.debug(this.format(message, context));
  }
  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('info')) console.info(this.format(message, context));
  }
  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) console.warn(this.format(message, context));
  }
  error(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('error')) console.error(this.format(message, context));
  }

  private shouldLog(callLevel: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[callLevel] >= LOG_LEVEL_PRIORITY[this._level];
  }

  private format(message: string, context?: Record<string, unknown>): string {
    const prefix = this.prefix ? `[${this.prefix}] ` : '';
    const suffix = context ? ` ${JSON.stringify(context)}` : '';
    return `${prefix}${message}${suffix}`;
  }
}
