/**
 * E2E Scenario registration: Incoming TX detection.
 *
 * Registers 1 onchain scenario for testing IncomingTxMonitor detection
 * after self-transfer on Sepolia.
 *
 * @see ONCH-06
 */

import { registry } from '../types.js';

registry.register({
  id: 'incoming-tx-detection',
  name: 'Incoming TX Detection',
  track: 'onchain',
  category: 'incoming',
  networks: ['ethereum-sepolia'],
  description:
    'Self-transfer ETH on Sepolia, wait for confirmation, then verify IncomingTxMonitor detects the incoming transaction',
});
