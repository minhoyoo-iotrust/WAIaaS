/**
 * E2E Scenario registration: Policy CRUD + Dry-run.
 *
 * Registers 1 offchain scenario in the global ScenarioRegistry:
 * - policy-crud-dryrun: Policy lifecycle (create/list/update/delete) + simulate evaluation
 *
 * @see CORE-04
 */

import { registry } from '../types.js';

registry.register({
  id: 'policy-crud-dryrun',
  name: 'Policy CRUD + Dry-run',
  track: 'offchain',
  category: 'core',
  description: 'SPENDING_LIMIT policy create/list/update/delete + transaction simulate evaluation',
});
