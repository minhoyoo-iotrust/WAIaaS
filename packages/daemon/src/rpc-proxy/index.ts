/**
 * RPC Proxy module barrel export.
 *
 * Core engine for the EVM JSON-RPC proxy that intercepts signing methods
 * and proxies read methods to upstream RPC endpoints.
 */

export {
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcSuccessResponse,
  type JsonRpcErrorResponse,
  type JsonRpcError,
  type ParseResult,
  jsonRpcSuccess,
  jsonRpcError,
  parseJsonRpcBody,
  isNotification,
  JSON_RPC_ERRORS,
} from './json-rpc.js';

export {
  RpcTransactionAdapter,
  toHexChainId,
  hexToDecimal,
  type EthTransactionParams,
  type RpcTransactionRequest,
} from './tx-adapter.js';

export { CompletionWaiter } from './completion-waiter.js';

export { SyncPipelineExecutor } from './sync-pipeline.js';

export { NonceTracker } from './nonce-tracker.js';

export { RpcPassthrough, PASSTHROUGH_METHODS } from './passthrough.js';

export {
  RpcMethodHandlers,
  classifyMethod,
  INTERCEPT_METHODS,
  type HandlerContext,
} from './method-handlers.js';
