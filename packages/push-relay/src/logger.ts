const PREFIX = '[push-relay]';

let debugEnabled = false;

export function setDebug(enabled: boolean): void {
  debugEnabled = enabled;
}

export function isDebug(): boolean {
  return debugEnabled;
}

export function info(...args: unknown[]): void {
  console.log(PREFIX, ...args);
}

export function error(...args: unknown[]): void {
  console.error(PREFIX, ...args);
}

export function debug(...args: unknown[]): void {
  if (debugEnabled) {
    console.log(`${PREFIX} [DEBUG]`, ...args);
  }
}
