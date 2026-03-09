/**
 * E2E Scenario registration: Hyperliquid Spot/Perp.
 *
 * Registers 2 onchain scenarios for Hyperliquid testnet orders.
 * Requires WAIAAS_E2E_HYPERLIQUID_ENABLED=true to run (separate account/balance setup).
 *
 * @see ONCH-08
 */

import { registry } from '../types.js';

registry.register({
  id: 'hyperliquid-spot-order',
  name: 'Hyperliquid Spot Order',
  track: 'onchain',
  category: 'hyperliquid',
  networks: ['ethereum-sepolia'],
  protocols: ['swap'],
  description:
    'Place a limit buy order on Hyperliquid testnet Spot (PURR/USDC), verify ApiDirectResult',
});

registry.register({
  id: 'hyperliquid-perp-order',
  name: 'Hyperliquid Perp Order',
  track: 'onchain',
  category: 'hyperliquid',
  networks: ['ethereum-sepolia'],
  protocols: ['perp'],
  description:
    'Place a limit buy order on Hyperliquid testnet Perp (ETH), verify ApiDirectResult',
});
