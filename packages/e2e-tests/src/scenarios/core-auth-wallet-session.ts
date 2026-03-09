/**
 * E2E Scenario registration: Core Auth, Wallet CRUD, Multi-wallet Session.
 *
 * Registers 3 offchain scenarios in the global ScenarioRegistry:
 * - auth-session-crud: Session create/rotate/delete lifecycle
 * - wallet-crud: EVM/Solana wallet create/list/delete
 * - multi-wallet-session: Multi-wallet session attach/detach
 *
 * @see CORE-01, CORE-02, CORE-03
 */

import { registry } from '../types.js';

registry.register({
  id: 'auth-session-crud',
  name: 'Auth Session CRUD',
  track: 'offchain',
  category: 'core',
  description: 'Master password -> session create -> token rotate -> session delete -> token invalidation',
});

registry.register({
  id: 'wallet-crud',
  name: 'Wallet CRUD',
  track: 'offchain',
  category: 'core',
  description: 'EVM/Solana wallet create -> list -> single get -> delete verification',
});

registry.register({
  id: 'multi-wallet-session',
  name: 'Multi-wallet Session',
  track: 'offchain',
  category: 'core',
  description: 'Create multiple wallets -> attach to session -> detach -> verify session_wallets state',
});
