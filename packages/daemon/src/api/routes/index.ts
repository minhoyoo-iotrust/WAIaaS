/**
 * Route barrel export: health, agents, wallet, transactions, policies.
 */

export { health } from './health.js';
export { agentRoutes, type AgentRouteDeps } from './agents.js';
export { walletRoutes, type WalletRouteDeps } from './wallet.js';
export { transactionRoutes, type TransactionRouteDeps } from './transactions.js';
export { policyRoutes, type PolicyRouteDeps } from './policies.js';
