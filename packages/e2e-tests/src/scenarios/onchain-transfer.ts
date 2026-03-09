/**
 * E2E Scenario registration: Onchain Transfer scenarios.
 *
 * Registers 4 onchain transfer scenarios:
 * - eth-transfer: Native ETH transfer on Sepolia
 * - sol-transfer: Native SOL transfer on Devnet
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
