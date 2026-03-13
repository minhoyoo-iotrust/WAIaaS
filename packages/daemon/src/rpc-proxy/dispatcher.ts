/**
 * RpcDispatcher -- Orchestrates JSON-RPC method classification and handler routing.
 *
 * Entry point for the RPC proxy: classifies each method as intercept, passthrough,
 * or unsupported, then delegates to the appropriate handler.
 *
 * Supports both single and batch JSON-RPC 2.0 requests.
 *
 * @see .planning/research/m31-14-rpc-proxy-ARCHITECTURE.md
 */

import {
  jsonRpcError,
  isNotification,
  JSON_RPC_ERRORS,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from './json-rpc.js';
import { classifyMethod } from './method-handlers.js';
import type { RpcMethodHandlers, HandlerContext } from './method-handlers.js';
import type { RpcPassthrough } from './passthrough.js';
import type { NonceTracker } from './nonce-tracker.js';

// -- Types -------------------------------------------------------------------

export interface RpcDispatcherDeps {
  methodHandlers: RpcMethodHandlers;
  passthrough: RpcPassthrough;
  nonceTracker: NonceTracker;
}

// -- RpcDispatcher -----------------------------------------------------------

export class RpcDispatcher {
  private readonly methodHandlers: RpcMethodHandlers;
  private readonly passthrough: RpcPassthrough;

  constructor(deps: RpcDispatcherDeps) {
    this.methodHandlers = deps.methodHandlers;
    this.passthrough = deps.passthrough;
  }

  /**
   * Dispatch a single JSON-RPC request to the appropriate handler.
   */
  async dispatch(
    request: JsonRpcRequest,
    ctx: HandlerContext,
    pipelineDeps: any,
  ): Promise<JsonRpcResponse> {
    const id = request.id ?? null;
    const classification = classifyMethod(request.method, this.passthrough);

    switch (classification) {
      case 'intercept':
        return this.methodHandlers.handle(
          request.method,
          request.params as unknown[] | undefined,
          id,
          ctx,
          pipelineDeps,
        );

      case 'passthrough':
        return this.passthrough.forward(request, ctx.network);

      case 'unsupported':
        return jsonRpcError(
          id,
          JSON_RPC_ERRORS.METHOD_NOT_FOUND,
          'Method not found: ' + request.method,
        );
    }
  }

  /**
   * Dispatch a batch of JSON-RPC requests.
   *
   * All requests are dispatched concurrently via Promise.all.
   * Notifications (requests without `id`) are dispatched for side effects
   * but their responses are filtered from the result per JSON-RPC 2.0 spec.
   */
  async dispatchBatch(
    requests: JsonRpcRequest[],
    ctx: HandlerContext,
    pipelineDeps: any,
  ): Promise<JsonRpcResponse[]> {
    const results = await Promise.all(
      requests.map(async (request) => ({
        response: await this.dispatch(request, ctx, pipelineDeps),
        isNotification: isNotification(request),
      })),
    );

    // Filter out notification responses per JSON-RPC 2.0 spec
    return results
      .filter((r) => !r.isNotification)
      .map((r) => r.response);
  }
}
