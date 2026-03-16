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

/**
 * Default console-based logger implementation.
 * Formats context as JSON suffix when provided.
 */
export class ConsoleLogger implements ILogger {
  constructor(private readonly prefix?: string) {}

  debug(message: string, context?: Record<string, unknown>): void {
    console.debug(this.format(message, context));
  }
  info(message: string, context?: Record<string, unknown>): void {
    console.info(this.format(message, context));
  }
  warn(message: string, context?: Record<string, unknown>): void {
    console.warn(this.format(message, context));
  }
  error(message: string, context?: Record<string, unknown>): void {
    console.error(this.format(message, context));
  }

  private format(message: string, context?: Record<string, unknown>): string {
    const prefix = this.prefix ? `[${this.prefix}] ` : '';
    const suffix = context ? ` ${JSON.stringify(context)}` : '';
    return `${prefix}${message}${suffix}`;
  }
}
