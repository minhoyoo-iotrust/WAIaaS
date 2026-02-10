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
export { agentRoutes, type AgentRouteDeps } from './routes/agents.js';
export { walletRoutes, type WalletRouteDeps } from './routes/wallet.js';
