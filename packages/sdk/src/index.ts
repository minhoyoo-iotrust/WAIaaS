/**
 * @waiaas/sdk - TypeScript SDK for WAIaaS daemon REST API.
 *
 * Zero runtime dependencies. Uses Node.js 22 built-in fetch.
 *
 * @example
 * ```typescript
 * import { WAIaaSClient } from '@waiaas/sdk';
 *
 * const client = new WAIaaSClient({
 *   baseUrl: 'http://localhost:3000',
 *   sessionToken: 'wai_sess_...',
 * });
 *
 * const balance = await client.getBalance();
 * console.log(balance.balance, balance.symbol);
 * ```
 */

export { WAIaaSClient } from './client.js';
export { WAIaaSOwnerClient } from './owner-client.js';
export { WAIaaSError } from './error.js';
export { withRetry } from './retry.js';
export { validateSendToken } from './validation.js';
export type {
  WAIaaSClientOptions,
  WAIaaSOwnerClientOptions,
  RetryOptions,
  BalanceOptions,
  AssetsOptions,
  BalanceResponse,
  AddressResponse,
  AssetsResponse,
  AssetInfo,
  SendTokenParams,
  SendTokenResponse,
  TransactionResponse,
  TransactionListResponse,
  ListTransactionsParams,
  PendingTransactionsResponse,
  RenewSessionResponse,
  ApproveResponse,
  RejectResponse,
  KillSwitchActivateResponse,
  KillSwitchStatusResponse,
  RecoverResponse,
  NonceResponse,
  EncodeCalldataParams,
  EncodeCalldataResponse,
  SignTransactionParams,
  SignTransactionOperation,
  SignTransactionResponse,
  WalletNetworkInfo,
  WalletInfoResponse,
  SetDefaultNetworkResponse,
  X402FetchParams,
  X402PaymentInfo,
  X402FetchResponse,
  WcPairingResponse,
  WcSessionResponse,
  WcDisconnectResponse,
} from './types.js';
