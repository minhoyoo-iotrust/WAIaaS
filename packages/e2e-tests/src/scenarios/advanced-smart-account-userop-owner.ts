/**
 * E2E Scenario registration: Smart Account, UserOp Build/Sign, Owner Auth.
 *
 * Registers 3 offchain scenarios in the global ScenarioRegistry:
 * - smart-account-crud: Smart Account create/retrieve + Lite/Full mode check
 * - userop-build-sign: UserOp Build for smart account + EOA rejection
 * - owner-auth-challenge: Owner Auth nonce/register/verify flow
 *
 * @see ADV-01, ADV-02, ADV-03
 */

import { registry } from '../types.js';

registry.register({
  id: 'smart-account-crud',
  name: 'Smart Account CRUD',
  track: 'offchain',
  category: 'advanced',
  description: 'Smart Account creation (accountType=smart) -> retrieve -> confirm accountType -> Lite/Full mode via connect-info',
});

registry.register({
  id: 'userop-build-sign',
  name: 'UserOp Build/Sign',
  track: 'offchain',
  category: 'advanced',
  description: 'UserOp Build for smart account (RPC error expected) + EOA wallet rejection',
});

registry.register({
  id: 'owner-auth-challenge',
  name: 'Owner Auth Challenge',
  track: 'offchain',
  category: 'advanced',
  description: 'SIWE nonce retrieval + owner address registration + invalid signature rejection',
});
