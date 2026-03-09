/**
 * E2E Scenario registration: Lido Staking.
 *
 * Registers 2 onchain scenarios for Lido stake/unstake on Holesky testnet.
 *
 * @see ONCH-07
 */

import { registry } from '../types.js';

registry.register({
  id: 'lido-stake',
  name: 'Lido Stake',
  track: 'onchain',
  category: 'staking',
  networks: ['holesky'],
  protocols: ['staking'],
  description: 'Stake 0.001 ETH via Lido on Holesky testnet, verify txId and CONFIRMED status',
});

registry.register({
  id: 'lido-unstake',
  name: 'Lido Unstake',
  track: 'onchain',
  category: 'staking',
  networks: ['holesky'],
  protocols: ['staking'],
  description:
    'Unstake 0.001 ETH via Lido on Holesky testnet (withdrawal queue), verify submission',
});
