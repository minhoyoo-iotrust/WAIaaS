/**
 * Connection state machine for chain subscriber reconnection.
 *
 * 3-state model:
 * - WS_ACTIVE: WebSocket connection active, receiving real-time events
 * - POLLING_FALLBACK: WebSocket failed repeatedly, using polling as fallback
 * - RECONNECTING: Attempting to re-establish WebSocket connection
 *
 * Transitions:
 *   connect() succeeds → WS_ACTIVE
 *   disconnect detected → RECONNECTING
 *   N consecutive failures → POLLING_FALLBACK (continues reconnect attempts in background)
 *
 * See design doc 76 sections 5.1-5.2.
 */

export type ConnectionState = 'WS_ACTIVE' | 'POLLING_FALLBACK' | 'RECONNECTING';

/**
 * Configuration for exponential backoff reconnection.
 */
export interface ReconnectConfig {
  /** Initial delay in ms before first reconnect attempt. Default: 1000 */
  initialDelayMs: number;
  /** Maximum delay in ms (cap for exponential growth). Default: 60000 */
  maxDelayMs: number;
  /** Maximum reconnect attempts before giving up. Default: Infinity */
  maxAttempts: number;
  /** Jitter factor (0-1). Applied as +/- percentage. Default: 0.3 */
  jitterFactor: number;
  /** Number of consecutive failures before switching to POLLING_FALLBACK. Default: 3 */
  pollingFallbackThreshold: number;
}

/**
 * Sensible defaults for reconnection config.
 * Exponential backoff: 1s → 2s → 4s → 8s → 16s → 32s → 60s (cap).
 */
export const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  initialDelayMs: 1000,
  maxDelayMs: 60_000,
  maxAttempts: Infinity,
  jitterFactor: 0.3,
  pollingFallbackThreshold: 3,
};

/**
 * Calculate reconnection delay with exponential backoff and jitter.
 *
 * Formula: min(initialDelay * 2^attempt, maxDelay) +/- jitter
 * Floor: never returns less than 100ms.
 *
 * @param attempt - Zero-based attempt number (0 = first retry)
 * @param config - Reconnection configuration
 * @returns Delay in milliseconds
 */
export function calculateDelay(attempt: number, config: ReconnectConfig): number {
  const baseDelay = Math.min(
    config.initialDelayMs * Math.pow(2, attempt),
    config.maxDelayMs,
  );
  const jitter = baseDelay * config.jitterFactor * (2 * Math.random() - 1);
  return Math.max(100, Math.floor(baseDelay + jitter));
}

/** Internal sleep helper. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reconnection loop that manages the 3-state connection machine.
 *
 * Behavior:
 * 1. On entry, transitions to RECONNECTING before calling connect().
 * 2. On successful connect, transitions to WS_ACTIVE, then waits for disconnect.
 * 3. On disconnect (waitForDisconnect resolves), loops back to reconnect.
 * 4. On connect failure (throw), increments attempt counter.
 * 5. After pollingFallbackThreshold consecutive failures, transitions to POLLING_FALLBACK.
 * 6. Continues reconnection attempts in POLLING_FALLBACK state (background reconnection).
 * 7. Successful connect resets the attempt counter.
 * 8. After maxAttempts failures, gives up and returns.
 * 9. AbortSignal allows graceful shutdown.
 *
 * @param subscriber - Object with connect() and waitForDisconnect() methods (duck-typed)
 * @param config - Reconnection configuration
 * @param onStateChange - Callback fired on state transitions
 * @param signal - Optional AbortSignal for graceful shutdown
 */
export async function reconnectLoop(
  subscriber: { connect(): Promise<void>; waitForDisconnect(): Promise<void> },
  config: ReconnectConfig,
  onStateChange: (state: ConnectionState) => void,
  signal?: AbortSignal,
): Promise<void> {
  let attempt = 0;

  while (!signal?.aborted) {
    try {
      onStateChange('RECONNECTING');
      await subscriber.connect();
      attempt = 0; // Success resets counter
      onStateChange('WS_ACTIVE');
      await subscriber.waitForDisconnect();
      // Disconnected normally -- loop back to reconnect
    } catch {
      attempt++;
      if (attempt >= config.pollingFallbackThreshold) {
        onStateChange('POLLING_FALLBACK');
      }
      if (attempt >= config.maxAttempts) {
        return; // Give up
      }
      const delay = calculateDelay(attempt - 1, config);
      await sleep(delay);
    }
  }
}
