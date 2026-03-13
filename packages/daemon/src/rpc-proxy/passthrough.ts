/**
 * RpcPassthrough -- Read method proxying to upstream RPC via RpcPool.
 *
 * All read-only EVM JSON-RPC methods are forwarded directly to the
 * upstream RPC endpoint. Signing and state-changing methods are NOT
 * included -- those are handled by RpcMethodHandlers.
 *
 * PASS-01: Read methods pass through to upstream RPC
 * PASS-02: Unsupported methods return -32601 (handled by caller)
 *
 * @see .planning/research/m31-14-rpc-proxy-ARCHITECTURE.md
 */

import type { RpcPool } from '@waiaas/core';
import {
  jsonRpcError,
  JSON_RPC_ERRORS,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from './json-rpc.js';

// ── Passthrough Methods ───────────────────────────────────────────

/**
 * Set of all read-only EVM JSON-RPC methods that should be proxied
 * directly to the upstream RPC endpoint.
 */
export const PASSTHROUGH_METHODS = new Set<string>([
  'eth_call',
  'eth_getBalance',
  'eth_blockNumber',
  'eth_getBlockByNumber',
  'eth_getBlockByHash',
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_feeHistory',
  'eth_maxPriorityFeePerGas',
  'eth_getCode',
  'eth_getStorageAt',
  'eth_getLogs',
  'eth_getTransactionCount',
  'net_version',
  'web3_clientVersion',
  'eth_getBlockTransactionCountByNumber',
  'eth_getBlockTransactionCountByHash',
]);

// ── RpcPassthrough ────────────────────────────────────────────────

export class RpcPassthrough {
  constructor(private rpcPool: RpcPool) {}

  /**
   * Check if a method should be passthrough-proxied.
   */
  isPassthrough(method: string): boolean {
    return PASSTHROUGH_METHODS.has(method);
  }

  /**
   * Forward a JSON-RPC request to the upstream RPC endpoint.
   * Preserves the original request id in the response.
   *
   * @param request - The JSON-RPC request to forward
   * @param network - Network slug for RpcPool URL resolution
   * @returns JSON-RPC response (success or error)
   */
  async forward(request: JsonRpcRequest, network: string): Promise<JsonRpcResponse> {
    const requestId = request.id ?? null;
    const url = this.rpcPool.getUrl(network);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: request.method,
          params: request.params ?? [],
          id: request.id ?? 1,
        }),
      });

      if (!resp.ok) {
        return jsonRpcError(
          requestId,
          JSON_RPC_ERRORS.SERVER_ERROR,
          `Upstream RPC error: ${resp.status}`,
        );
      }

      const upstream = (await resp.json()) as Record<string, unknown>;
      // Preserve original request id (upstream may use different id)
      return { ...upstream, jsonrpc: '2.0', id: requestId } as JsonRpcResponse;
    } catch (err) {
      return jsonRpcError(
        requestId,
        JSON_RPC_ERRORS.SERVER_ERROR,
        `RPC proxy upstream error: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
  }
}
