/**
 * E2E Scenario registration: Polymarket Prediction Market.
 *
 * Registers 4 scenarios for Polymarket CLOB order flow and market data.
 * Requires WAIAAS_E2E_POLYMARKET_ENABLED=true to run (Polygon wallet + USDC setup).
 *
 * @see ONCH-09
 */

import { registry } from '../types.js';

registry.register({
  id: 'polymarket-market-browse',
  name: 'Polymarket Market Browse',
  track: 'offchain',
  category: 'polymarket',
  description:
    'Browse markets via Gamma API, verify market list and detail',
});

registry.register({
  id: 'polymarket-order-place',
  name: 'Polymarket Order Place',
  track: 'onchain',
  category: 'polymarket',
  networks: ['polygon-mainnet'],
  protocols: ['prediction'],
  description:
    'Place a limit buy order on Polymarket CLOB, verify ApiDirectResult',
});

registry.register({
  id: 'polymarket-position-pnl',
  name: 'Polymarket Position PnL',
  track: 'offchain',
  category: 'polymarket',
  description:
    'Query positions and PnL for a wallet with Polymarket orders',
});

registry.register({
  id: 'polymarket-settings-crud',
  name: 'Polymarket Settings CRUD',
  track: 'offchain',
  category: 'polymarket',
  description:
    'Set/read/update Polymarket Admin Settings (enabled, fee_bps, auto_approve_ctf)',
});
