/**
 * RPC Method Handlers -- Signing method intercept for the RPC proxy.
 *
 * Routes intercepted JSON-RPC methods to the appropriate WAIaaS pipeline:
 * - eth_sendTransaction → 6-stage pipeline via SyncPipelineExecutor
 * - eth_signTransaction → sign-only pipeline
 * - personal_sign, eth_sign → sign-message pipeline (personal)
 * - eth_signTypedData_v4 → sign-message pipeline (typedData)
 * - eth_accounts → session wallet address
 * - eth_chainId → URL-derived hex chain ID
 * - eth_sendRawTransaction → explicit rejection (SIGN-07)
 *
 * @see .planning/research/m31-14-rpc-proxy-ARCHITECTURE.md
 */

import {
  jsonRpcSuccess,
  jsonRpcError,
  JSON_RPC_ERRORS,
  type JsonRpcResponse,
} from './json-rpc.js';
import { toHexChainId, type EthTransactionParams } from './tx-adapter.js';
import type { RpcTransactionAdapter } from './tx-adapter.js';
import type { SyncPipelineExecutor } from './sync-pipeline.js';
import type { NonceTracker } from './nonce-tracker.js';
import type { RpcPassthrough } from './passthrough.js';
import { executeSignOnly } from '../pipeline/sign-only.js';
import { executeSignMessage } from '../pipeline/sign-message.js';

// ── Intercept Methods ─────────────────────────────────────────────

export const INTERCEPT_METHODS = new Set<string>([
  'eth_sendTransaction',
  'eth_signTransaction',
  'eth_accounts',
  'eth_requestAccounts',
  'eth_chainId',
  'net_version',
  'personal_sign',
  'eth_sign',
  'eth_signTypedData_v4',
  'eth_sendRawTransaction',
]);

// ── Method Classification ─────────────────────────────────────────

/**
 * Classify a JSON-RPC method into intercept, passthrough, or unsupported.
 */
export function classifyMethod(
  method: string,
  passthrough: RpcPassthrough,
): 'intercept' | 'passthrough' | 'unsupported' {
  if (INTERCEPT_METHODS.has(method)) return 'intercept';
  if (passthrough.isPassthrough(method)) return 'passthrough';
  return 'unsupported';
}

// ── Handler Context ───────────────────────────────────────────────

export interface HandlerContext {
  walletId: string;
  walletAddress: string;  // checksummed EVM address
  chainId: number;
  network: string;        // resolved NetworkType slug
  chain: string;          // 'ethereum'
  sessionId?: string;
}

// ── RpcMethodHandlers ─────────────────────────────────────────────

export class RpcMethodHandlers {
  constructor(
    private syncPipeline: SyncPipelineExecutor,
    private txAdapter: RpcTransactionAdapter,
    private nonceTracker: NonceTracker,
  ) {}

  /**
   * Handle an intercepted JSON-RPC method.
   *
   * @param method - JSON-RPC method name
   * @param params - Method parameters
   * @param id - Request id (preserved in response)
   * @param ctx - Handler context (wallet, chain, session)
   * @param deps - Pipeline dependencies
   * @returns JSON-RPC response
   */
  async handle(
    method: string,
    params: unknown[] | undefined,
    id: string | number | null,
    ctx: HandlerContext,
    deps: any,
  ): Promise<JsonRpcResponse> {
    switch (method) {
      // ── Account Discovery ─────────────────────────
      case 'eth_accounts':
      case 'eth_requestAccounts':
        return jsonRpcSuccess(id, [ctx.walletAddress]);

      // ── Chain Identity ────────────────────────────
      case 'eth_chainId':
        return jsonRpcSuccess(id, toHexChainId(ctx.chainId));

      case 'net_version':
        return jsonRpcSuccess(id, ctx.chainId.toString());

      // ── Transaction Signing + Submission ──────────
      case 'eth_sendTransaction':
        return this.handleEthSendTransaction(params, id, ctx, deps);

      // ── Transaction Signing (no broadcast) ────────
      case 'eth_signTransaction':
        return this.handleEthSignTransaction(params, id, ctx, deps);

      // ── Message Signing ───────────────────────────
      case 'personal_sign':
        return this.handlePersonalSign(params, id, ctx, deps);

      case 'eth_sign':
        return this.handleEthSign(params, id, ctx, deps);

      case 'eth_signTypedData_v4':
        return this.handleEthSignTypedDataV4(params, id, ctx, deps);

      // ── Explicit Rejection ────────────────────────
      case 'eth_sendRawTransaction':
        return jsonRpcError(
          id,
          JSON_RPC_ERRORS.INVALID_PARAMS,
          'eth_sendRawTransaction is not supported. Use eth_sendTransaction instead — WAIaaS signs transactions internally.',
        );

      // ── Unsupported ───────────────────────────────
      default:
        return jsonRpcError(id, JSON_RPC_ERRORS.METHOD_NOT_FOUND, `Method ${method} not supported`);
    }
  }

  // ── Private Handlers ──────────────────────────────────────────

  private async handleEthSendTransaction(
    params: unknown[] | undefined,
    id: string | number | null,
    ctx: HandlerContext,
    deps: any,
  ): Promise<JsonRpcResponse> {
    try {
      const txParams = (params?.[0] ?? {}) as EthTransactionParams;
      const request = this.txAdapter.convert(txParams, ctx.network);

      // Build pipeline context
      const pipelineCtx = {
        ...deps,
        walletId: ctx.walletId,
        resolvedNetwork: ctx.network,
        request,
        txId: '', // Will be generated by stage1Validate
        sessionId: ctx.sessionId,
      };

      const txHash = await this.syncPipeline.execute(pipelineCtx);
      return jsonRpcSuccess(id, txHash);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transaction execution failed';
      // ASYNC-04: Include txId in timeout error data for client recovery
      const txIdMatch = message.match(/Transaction ([a-f0-9-]+) timed out/);
      if (txIdMatch) {
        return jsonRpcError(id, JSON_RPC_ERRORS.SERVER_ERROR, message, { txId: txIdMatch[1] });
      }
      return jsonRpcError(id, JSON_RPC_ERRORS.SERVER_ERROR, message);
    }
  }

  private async handleEthSignTransaction(
    params: unknown[] | undefined,
    id: string | number | null,
    ctx: HandlerContext,
    deps: any,
  ): Promise<JsonRpcResponse> {
    try {
      const txParams = (params?.[0] ?? {}) as EthTransactionParams;

      // Build a serialized unsigned transaction string for sign-only pipeline
      // The sign-only pipeline expects a serialized transaction hex
      const txHex = JSON.stringify(txParams);

      const result = await executeSignOnly(
        deps,
        ctx.walletId,
        { transaction: txHex, chain: ctx.chain, network: ctx.network },
        ctx.sessionId,
      );

      return jsonRpcSuccess(id, result.signedTransaction);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transaction signing failed';
      return jsonRpcError(id, JSON_RPC_ERRORS.SERVER_ERROR, message);
    }
  }

  private async handlePersonalSign(
    params: unknown[] | undefined,
    id: string | number | null,
    ctx: HandlerContext,
    deps: any,
  ): Promise<JsonRpcResponse> {
    try {
      // personal_sign params: [message, address]
      const message = (params?.[0] as string) ?? '';

      const result = await executeSignMessage(
        deps,
        ctx.walletId,
        ctx.chain,
        { signType: 'personal', message },
        ctx.sessionId,
      );

      return jsonRpcSuccess(id, result.signature);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Message signing failed';
      return jsonRpcError(id, JSON_RPC_ERRORS.SERVER_ERROR, message);
    }
  }

  private async handleEthSign(
    params: unknown[] | undefined,
    id: string | number | null,
    ctx: HandlerContext,
    deps: any,
  ): Promise<JsonRpcResponse> {
    try {
      // eth_sign params: [address, message] -- reversed from personal_sign!
      const msgData = (params?.[1] as string) ?? '';

      const result = await executeSignMessage(
        deps,
        ctx.walletId,
        ctx.chain,
        { signType: 'personal', message: msgData },
        ctx.sessionId,
      );

      return jsonRpcSuccess(id, result.signature);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Message signing failed';
      return jsonRpcError(id, JSON_RPC_ERRORS.SERVER_ERROR, message);
    }
  }

  private async handleEthSignTypedDataV4(
    params: unknown[] | undefined,
    id: string | number | null,
    ctx: HandlerContext,
    deps: any,
  ): Promise<JsonRpcResponse> {
    try {
      // eth_signTypedData_v4 params: [address, typedDataJsonString]
      const typedDataJson = (params?.[1] as string) ?? '';

      const result = await executeSignMessage(
        deps,
        ctx.walletId,
        ctx.chain,
        { signType: 'typedData', message: typedDataJson },
        ctx.sessionId,
      );

      return jsonRpcSuccess(id, result.signature);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Typed data signing failed';
      return jsonRpcError(id, JSON_RPC_ERRORS.SERVER_ERROR, message);
    }
  }
}
