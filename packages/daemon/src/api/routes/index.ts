/**
 * Route barrel export: health, wallets, wallet, sessions, transactions, policies, nonce, admin, tokens, skills.
 */

export { health } from './health.js';
export { walletCrudRoutes, type WalletCrudRouteDeps } from './wallets.js';
export { walletRoutes, type WalletRouteDeps } from './wallet.js';
export { sessionRoutes, type SessionRouteDeps } from './sessions.js';
export { transactionRoutes, type TransactionRouteDeps } from './transactions.js';
export { policyRoutes, type PolicyRouteDeps } from './policies.js';
export { nonceRoutes } from './nonce.js';
export { utilsRoutes } from './utils.js';
export { skillsRoutes } from './skills.js';
export { adminRoutes, type AdminRouteDeps, type KillSwitchState } from './admin.js';
export { tokenRegistryRoutes, type TokenRegistryRouteDeps } from './tokens.js';
export { connectInfoRoutes, type ConnectInfoRouteDeps } from './connect-info.js';
