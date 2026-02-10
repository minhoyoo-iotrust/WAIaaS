/**
 * Resolve the master password for the WAIaaS daemon.
 *
 * Priority:
 *   1. WAIAAS_MASTER_PASSWORD environment variable
 *   2. WAIAAS_MASTER_PASSWORD_FILE (read file content, trim)
 *   3. Interactive prompt (stdin)
 */

import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

export async function resolvePassword(): Promise<string> {
  // 1. Env var
  const envPassword = process.env['WAIAAS_MASTER_PASSWORD'];
  if (envPassword) return envPassword;

  // 2. Password file
  const passwordFile = process.env['WAIAAS_MASTER_PASSWORD_FILE'];
  if (passwordFile) {
    const content = readFileSync(passwordFile, 'utf-8').trim();
    if (content.length === 0) {
      throw new Error('WAIAAS_MASTER_PASSWORD_FILE is empty');
    }
    return content;
  }

  // 3. Interactive prompt
  return promptPassword('Master password: ');
}

/**
 * Prompt for a password with hidden input.
 */
function promptPassword(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Hide input using ANSI escape
    process.stdout.write(prompt);
    process.stdout.write('\x1B[8m'); // hide text

    rl.once('line', (line: string) => {
      process.stdout.write('\x1B[28m'); // show text again
      process.stdout.write('\n');
      rl.close();
      const password = line.trim();
      if (password.length === 0) {
        reject(new Error('Password cannot be empty'));
        return;
      }
      resolve(password);
    });

    rl.once('error', (err: Error) => {
      process.stdout.write('\x1B[28m');
      rl.close();
      reject(err);
    });
  });
}
