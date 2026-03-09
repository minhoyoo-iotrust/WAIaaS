/**
 * E2E Scenario registration: Onchain Transfer scenarios.
 *
 * Registers 9 onchain transfer scenarios:
 * - eth-transfer: Native ETH transfer on Sepolia
 * - sol-transfer: Native SOL transfer on Devnet
 * - polygon-amoy-transfer: Native POL transfer on Polygon Amoy
 * - arbitrum-sepolia-transfer: Native ETH transfer on Arbitrum Sepolia
 * - optimism-sepolia-transfer: Native ETH transfer on Optimism Sepolia
 * - base-sepolia-transfer: Native ETH transfer on Base Sepolia
 * - hyperevm-testnet-transfer: Native HYPE transfer on HyperEVM Testnet
 * - erc20-transfer: ERC-20 token transfer on Sepolia
 * - spl-transfer: SPL token transfer on Devnet
 *
 * @see ONCH-04, ONCH-05
 */

import { registry } from '../types.js';

registry.register({
  id: 'eth-transfer',
  name: 'ETH Native Transfer',
  track: 'onchain',
  category: 'transfer',
  networks: ['ethereum-sepolia'],
  description: 'Self-transfer 1 wei ETH on Sepolia testnet, verify txHash and CONFIRMED status',
});

registry.register({
  id: 'sol-transfer',
  name: 'SOL Native Transfer',
  track: 'onchain',
  category: 'transfer',
  networks: ['solana-devnet'],
  description: 'Self-transfer 1 lamport SOL on Devnet, verify txHash and CONFIRMED status',
});

registry.register({
  id: 'polygon-amoy-transfer',
  name: 'POL Native Transfer (Polygon Amoy)',
  track: 'onchain',
  category: 'transfer',
  networks: ['polygon-amoy'],
  description: 'Self-transfer 1 wei POL on Polygon Amoy testnet, verify txHash and CONFIRMED status',
});

registry.register({
  id: 'arbitrum-sepolia-transfer',
  name: 'ETH Native Transfer (Arbitrum Sepolia)',
  track: 'onchain',
  category: 'transfer',
  networks: ['arbitrum-sepolia'],
  description: 'Self-transfer 1 wei ETH on Arbitrum Sepolia testnet, verify txHash and CONFIRMED status',
});

registry.register({
  id: 'optimism-sepolia-transfer',
  name: 'ETH Native Transfer (Optimism Sepolia)',
  track: 'onchain',
  category: 'transfer',
  networks: ['optimism-sepolia'],
  description: 'Self-transfer 1 wei ETH on Optimism Sepolia testnet, verify txHash and CONFIRMED status',
});

registry.register({
  id: 'base-sepolia-transfer',
  name: 'ETH Native Transfer (Base Sepolia)',
  track: 'onchain',
  category: 'transfer',
  networks: ['base-sepolia'],
  description: 'Self-transfer 1 wei ETH on Base Sepolia testnet, verify txHash and CONFIRMED status',
});

registry.register({
  id: 'hyperevm-testnet-transfer',
  name: 'HYPE Native Transfer (HyperEVM Testnet)',
  track: 'onchain',
  category: 'transfer',
  networks: ['hyperevm-testnet'],
  description: 'Self-transfer 1 wei HYPE on HyperEVM Testnet, verify txHash and CONFIRMED status',
});

registry.register({
  id: 'erc20-transfer',
  name: 'ERC-20 Token Transfer',
  track: 'onchain',
  category: 'transfer',
  networks: ['ethereum-sepolia'],
  protocols: ['transfer'],
  description: 'ERC-20 token self-transfer on Sepolia, graceful skip if no token balance',
});

registry.register({
  id: 'spl-transfer',
  name: 'SPL Token Transfer',
  track: 'onchain',
  category: 'transfer',
  networks: ['solana-devnet'],
  protocols: ['transfer'],
  description: 'SPL token self-transfer on Devnet, graceful skip if no token balance',
});
