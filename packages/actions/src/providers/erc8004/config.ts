/**
 * ERC-8004 Action Provider configuration.
 *
 * Follows the ZeroExSwapConfig pattern: interface + defaults constant.
 * Settings are backed by Admin Settings (actions.erc8004_* keys).
 */
import { ERC8004_MAINNET_ADDRESSES } from './constants.js';

/** Configuration for the ERC-8004 Action Provider. */
export interface Erc8004Config {
  /** Whether the ERC-8004 provider is enabled. */
  enabled: boolean;
  /** Identity Registry contract address. */
  identityRegistryAddress: string;
  /** Reputation Registry contract address. */
  reputationRegistryAddress: string;
  /** Validation Registry contract address (empty = feature-gated off). */
  validationRegistryAddress: string;
  /** Base URL for hosting registration files (e.g., https://agent.example.com). */
  registrationFileBaseUrl: string;
  /** Whether to auto-generate and serve registration files. */
  autoPublishRegistration: boolean;
  /** Reputation score cache TTL in seconds. */
  reputationCacheTtlSec: number;
}

/** Default configuration using mainnet registry addresses. */
export const ERC8004_DEFAULTS: Erc8004Config = {
  enabled: false,
  identityRegistryAddress: ERC8004_MAINNET_ADDRESSES.identity,
  reputationRegistryAddress: ERC8004_MAINNET_ADDRESSES.reputation,
  validationRegistryAddress: ERC8004_MAINNET_ADDRESSES.validation,
  registrationFileBaseUrl: '',
  autoPublishRegistration: true,
  reputationCacheTtlSec: 300,
};
