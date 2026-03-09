/**
 * E2E Scenario registration: Audit Log Existence, Backup/Restore Integrity.
 *
 * Registers 2 offchain scenarios in the global ScenarioRegistry:
 * - audit-log-existence: Query audit logs after operations, verify entries exist
 * - backup-restore-integrity: Create backup, verify in list, validate data persistence
 *
 * @see IFACE-07, IFACE-08
 */

import { registry } from '../types.js';

registry.register({
  id: 'audit-log-existence',
  name: 'Audit Log Existence',
  track: 'offchain',
  category: 'interface',
  description: 'Perform operations -> query audit logs -> verify entries exist',
});

registry.register({
  id: 'backup-restore-integrity',
  name: 'Backup Restore Integrity',
  track: 'offchain',
  category: 'interface',
  description: 'Create backup -> verify in list -> start second daemon from backup -> verify data',
});
