/**
 * E2E Scenario registration: x402 Settings, ERC-8004 Registration, ERC-8128 Sign/Verify.
 *
 * Registers 3 offchain scenarios in the global ScenarioRegistry:
 * - x402-settings-crud: x402 enable + X402_ALLOWED_DOMAINS policy CRUD
 * - erc8004-registration: ERC-8004 registration-file retrieval
 * - erc8128-sign-verify: ERC-8128 feature gate + sign/verify roundtrip
 *
 * @see ADV-04, ADV-05, ADV-06
 */

import { registry } from '../types.js';

registry.register({
  id: 'x402-settings-crud',
  name: 'x402 Settings CRUD',
  track: 'offchain',
  category: 'advanced',
  description: 'x402 enable via admin settings + X402_ALLOWED_DOMAINS policy create/list/delete',
});

registry.register({
  id: 'erc8004-registration',
  name: 'ERC-8004 Registration File',
  track: 'offchain',
  category: 'advanced',
  description: 'ERC-8004 registration-file retrieval for wallet + 404 for non-existent wallet',
});

registry.register({
  id: 'erc8128-sign-verify',
  name: 'ERC-8128 Sign/Verify',
  track: 'offchain',
  category: 'advanced',
  description: 'ERC-8128 disabled rejection + enable + domain policy + sign -> verify roundtrip',
});
