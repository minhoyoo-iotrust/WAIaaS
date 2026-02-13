/**
 * API module barrel export: server factory, middleware, routes.
 */

// Server factory
export { createApp, type CreateAppDeps } from './server.js';

// Middleware
export {
  requestId,
  hostGuard,
  createKillSwitchGuard,
  requestLogger,
  errorHandler,
  type GetKillSwitchState,
} from './middleware/index.js';

// Routes
export { health } from './routes/health.js';
export { walletCrudRoutes, type WalletCrudRouteDeps } from './routes/wallets.js';
export { walletRoutes, type WalletRouteDeps } from './routes/wallet.js';
export { transactionRoutes, type TransactionRouteDeps } from './routes/transactions.js';
