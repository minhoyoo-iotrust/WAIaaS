/**
 * Route barrel export: health, wallets, wallet, sessions, transactions, policies, nonce, admin, tokens, skills, audit-logs.
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
export { createWalletAppsRoutes, type WalletAppsRouteDeps } from './wallet-apps.js';
export { auditLogRoutes, type AuditLogRouteDeps } from './audit-logs.js';
export { erc8004Routes, type Erc8004RouteDeps } from './erc8004.js';
export { erc8128Routes, type Erc8128RouteDeps } from './erc8128.js';
export { nftRoutes, type NftRouteDeps } from './nfts.js';
