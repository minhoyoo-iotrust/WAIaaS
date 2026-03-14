/**
 * E2E Scenario registration: Onchain humanAmount scenarios.
 *
 * Registers 3 onchain humanAmount scenarios:
 * - human-amount-eth-transfer: Native ETH transfer using humanAmount on Sepolia
 * - human-amount-sol-transfer: Native SOL transfer using humanAmount on Devnet
 * - human-amount-action-swap: Action provider swap using humanAmount+decimals
 *
 * @see TEST-08
 */

import { registry } from '../types.js';

registry.register({
  id: 'human-amount-eth-transfer',
  name: 'ETH Transfer via humanAmount',
  track: 'onchain',
  category: 'human-amount',
  networks: ['ethereum-sepolia'],
  description: 'Self-transfer 0.000000000000000001 ETH (= 1 wei) using humanAmount parameter',
});

registry.register({
  id: 'human-amount-sol-transfer',
  name: 'SOL Transfer via humanAmount',
  track: 'onchain',
  category: 'human-amount',
  networks: ['solana-devnet'],
  description: 'Self-transfer 0.000000001 SOL (= 1 lamport) using humanAmount parameter',
});

registry.register({
  id: 'human-amount-action-swap',
  name: 'Action Provider Swap via humanAmount',
  track: 'onchain',
  category: 'human-amount',
  networks: ['ethereum-sepolia'],
  protocols: ['swap'],
  description: 'Execute action provider swap using humanAmount+decimals params (graceful skip if no liquidity)',
});
