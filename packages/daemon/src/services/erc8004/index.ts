/**
 * ERC-8004 services barrel export.
 *
 * @see Phase 320-01, Phase 321-01
 */
export { ReputationCacheService, type ReputationScore } from './reputation-cache-service.js';
export {
  buildAgentWalletSetTypedData,
  ERC8004_EIP712_DOMAIN,
  AGENT_WALLET_SET_TYPES,
  type AgentWalletSetTypedData,
  type BuildAgentWalletSetParams,
} from './eip712-typed-data.js';
