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
export { WAIaaSError } from './error.js';
export type {
  WAIaaSClientOptions,
  RetryOptions,
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
} from './types.js';
// WAIaaSOwnerClient will be added in 61-02
