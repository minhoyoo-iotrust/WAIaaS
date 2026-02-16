/**
 * EventBus: typed EventEmitter wrapper for WAIaaS event system.
 *
 * Provides type-safe on/emit/removeAllListeners over Node.js EventEmitter.
 * Listener errors are isolated via try/catch in emit() to prevent one
 * failing listener from blocking other listeners or the pipeline.
 *
 * @see packages/core/src/events/event-types.ts for event definitions
 */

import { EventEmitter } from 'node:events';
import type { WaiaasEventMap } from './event-types.js';

export class EventBus {
  private emitter: EventEmitter;

  constructor() {
    this.emitter = new EventEmitter();
    // Prevent unhandled 'error' event crashes
    this.emitter.on('error', (err: unknown) => {
      console.error('[EventBus] listener error:', err);
    });
  }

  /**
   * Register a typed event listener.
   */
  on<K extends keyof WaiaasEventMap>(
    event: K,
    listener: (data: WaiaasEventMap[K]) => void,
  ): this {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  /**
   * Emit a typed event with error isolation.
   *
   * Each listener is wrapped in try/catch so that one throwing listener
   * does not prevent other listeners from being called, and does not
   * crash the pipeline.
   */
  emit<K extends keyof WaiaasEventMap>(event: K, data: WaiaasEventMap[K]): boolean {
    const listeners = this.emitter.rawListeners(event) as Array<(...args: unknown[]) => void>;
    if (listeners.length === 0) return false;

    for (const listener of listeners) {
      try {
        listener(data);
      } catch (err) {
        // Emit 'error' event for logging, but don't let it propagate
        try {
          console.error(`[EventBus] listener error on '${String(event)}':`, err);
        } catch {
          // Swallow logging errors
        }
      }
    }
    return true;
  }

  /**
   * Remove all listeners (or all listeners for a specific event).
   * Used for cleanup in tests and daemon shutdown.
   */
  removeAllListeners(event?: keyof WaiaasEventMap): this {
    if (event) {
      this.emitter.removeAllListeners(event);
    } else {
      this.emitter.removeAllListeners();
    }
    return this;
  }

  /**
   * Get listener count for a specific event.
   */
  listenerCount(event: keyof WaiaasEventMap): number {
    return this.emitter.listenerCount(event);
  }
}
