/**
 * `waiaas set-master` -- Change the master password.
 *
 * 1. Resolve current password (env/file/recovery.key/prompt)
 * 2. Health check daemon
 * 3. Prompt for new password (twice for confirmation)
 * 4. PUT /v1/admin/master-password
 * 5. Delete recovery.key if exists
 */

import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePassword, promptPassword } from '../utils/password.js';

interface SetMasterOpts {
  dataDir: string;
  baseUrl?: string;
  password?: string;
}

export async function setMasterCommand(opts: SetMasterOpts): Promise<void> {
  const baseUrl = opts.baseUrl ?? 'http://127.0.0.1:3100';

  // 1. Resolve current password
  const currentPassword = opts.password ?? await resolvePassword(opts.dataDir);

  // 2. Health check
  try {
    const res = await fetch(`${baseUrl}/health`);
    if (!res.ok) {
      console.error('Daemon is not running. Start the daemon first: waiaas start');
      process.exit(1);
    }
  } catch {
    console.error('Cannot connect to daemon. Start the daemon first: waiaas start');
    process.exit(1);
  }

  // 3. Prompt for new password
  const newPassword = await promptPassword('New master password (min 8 chars): ');
  if (newPassword.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }
  const confirmPassword = await promptPassword('Confirm new master password: ');
  if (newPassword !== confirmPassword) {
    console.error('Passwords do not match.');
    process.exit(1);
  }

  // 4. Call password change API
  try {
    const res = await fetch(`${baseUrl}/v1/admin/master-password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Password': currentPassword,
      },
      body: JSON.stringify({ newPassword }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'Unknown error' }));
      console.error(`Failed to change password: ${(err as { message: string }).message}`);
      process.exit(1);
    }

    const result = await res.json() as { walletsReEncrypted: number; settingsReEncrypted: number };
    console.log('Master password changed successfully.');
    console.log(`  Wallets re-encrypted: ${result.walletsReEncrypted}`);
    console.log(`  Settings re-encrypted: ${result.settingsReEncrypted}`);
  } catch (err) {
    console.error(`Failed to change password: ${(err as Error).message}`);
    process.exit(1);
  }

  // 5. Delete recovery.key if exists
  const recoveryPath = join(opts.dataDir, 'recovery.key');
  if (existsSync(recoveryPath)) {
    try {
      unlinkSync(recoveryPath);
      console.log('Recovery key deleted (auto-provision mode disabled).');
    } catch {
      console.warn('Warning: Could not delete recovery.key');
    }
  }

  console.log('');
  console.log('Update your environment:');
  console.log('  export WAIAAS_MASTER_PASSWORD="<new-password>"');
}
