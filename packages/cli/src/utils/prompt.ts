/**
 * Interactive text prompt utility for CLI commands.
 *
 * Unlike password prompts (hidden input), this shows typed text.
 * Used for non-sensitive input like Telegram chat IDs.
 */

import { createInterface } from 'node:readline';

/**
 * Prompt for visible text input on stdin.
 */
export function promptText(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(prompt, (answer: string) => {
      rl.close();
      resolve(answer.trim());
    });

    rl.once('error', (err: Error) => {
      rl.close();
      reject(err);
    });
  });
}
