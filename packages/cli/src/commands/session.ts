/**
 * `waiaas session` subcommand group:
 *   session prompt  -- Generate agent connection prompt (magic word)
 *
 * Uses masterAuth (X-Master-Password header) for daemon communication.
 */

import { resolvePassword } from '../utils/password.js';

interface SessionPromptOptions {
  baseUrl: string;
  password?: string;
  walletId?: string;
  ttl?: number;
}

interface AgentPromptResponse {
  prompt: string;
  walletCount: number;
  sessionsCreated: number;
  sessionReused: boolean;
  expiresAt: number;
}

/**
 * `waiaas session prompt` -- Generate agent connection prompt.
 */
export async function sessionPromptCommand(opts: SessionPromptOptions): Promise<void> {
  const password = opts.password ?? await resolvePassword();

  const body: Record<string, unknown> = {};
  if (opts.walletId) body.walletIds = [opts.walletId];
  if (opts.ttl !== undefined) body.ttl = opts.ttl;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Master-Password': password,
  };

  let res: Response;
  try {
    res = await fetch(`${opts.baseUrl}/v1/admin/agent-prompt`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    console.error('Error: Daemon is not running. Start it with `waiaas start`.');
    process.exit(1);
  }

  if (!res.ok) {
    const errBody = await res.json().catch(() => null) as Record<string, unknown> | null;
    const msg = errBody?.['message'] ?? res.statusText;
    console.error(`Error (${res.status}): ${msg}`);
    process.exit(1);
  }

  const data = await res.json() as AgentPromptResponse;

  if (data.walletCount === 0) {
    console.error('No active wallets found. Create a wallet first with `waiaas quickset`.');
    process.exit(1);
  }

  console.log('');
  console.log(data.prompt);
  console.log('');
  if (data.sessionReused) {
    console.log('(Reused existing session)');
  } else {
    console.log(`(Created ${data.sessionsCreated} new session${data.sessionsCreated > 1 ? 's' : ''})`);
  }
  if (data.expiresAt === 0) {
    console.log('Expires: Never (unlimited)');
  } else {
    console.log(`Expires: ${new Date(data.expiresAt * 1000).toLocaleString()}`);
  }
  console.log('');
}
