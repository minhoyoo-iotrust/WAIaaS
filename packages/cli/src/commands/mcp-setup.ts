/**
 * `waiaas mcp setup` -- Set up MCP integration for Claude Desktop.
 *
 * 7-step flow (CLI-02):
 *   1. Check daemon is running
 *   2. Resolve agent ID (auto-detect if single agent)
 *   3. Build session constraints
 *   4. Create session via POST /v1/sessions (masterAuth)
 *   5. Write token to mcp-token file (atomic)
 *   6. Output result
 *   7. Print Claude Desktop config.json snippet (CLI-05)
 */

import { writeFile, rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { resolvePassword } from '../utils/password.js';

export interface McpSetupOptions {
  dataDir: string;
  baseUrl?: string;
  agent?: string;
  expiresIn?: number;
  masterPassword?: string;
}

export async function mcpSetupCommand(opts: McpSetupOptions): Promise<void> {
  const baseUrl = (opts.baseUrl ?? 'http://127.0.0.1:3100').replace(/\/+$/, '');
  const expiresIn = opts.expiresIn ?? 86400;

  // Step 1: Check daemon is running
  try {
    const healthRes = await fetch(`${baseUrl}/v1/admin/status`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!healthRes.ok) {
      // Daemon is responding but unhealthy -- continue anyway
      console.error(`Warning: daemon returned ${healthRes.status} on health check`);
    }
  } catch {
    console.error('Error: Cannot reach WAIaaS daemon.');
    console.error(`  Tried: ${baseUrl}/v1/admin/status`);
    console.error('  Make sure the daemon is running: waiaas start');
    process.exit(1);
  }

  // Step 2: Resolve agent ID
  let agentId = opts.agent;

  if (!agentId) {
    try {
      const agentsRes = await fetch(`${baseUrl}/v1/agents`, {
        headers: { 'Accept': 'application/json' },
      });

      if (!agentsRes.ok) {
        console.error(`Error: Failed to list agents (${agentsRes.status})`);
        process.exit(1);
      }

      const agentsData = await agentsRes.json() as { agents: Array<{ id: string; name?: string }> };
      const agents = agentsData.agents ?? [];

      if (agents.length === 0) {
        console.error('Error: No agents found. Run waiaas init first.');
        process.exit(1);
      }

      if (agents.length > 1) {
        console.error('Error: Multiple agents found. Specify --agent <id>');
        console.error('  Available agents:');
        for (const a of agents) {
          console.error(`    ${a.id}${a.name ? ` (${a.name})` : ''}`);
        }
        process.exit(1);
      }

      agentId = agents[0]!.id;
      console.error(`Auto-detected agent: ${agentId}`);
    } catch (err) {
      if (err instanceof Error && 'code' in err) {
        // Already handled exit cases above
        throw err;
      }
      console.error('Error: Failed to list agents');
      process.exit(1);
    }
  }

  // Step 3: Resolve master password
  const password = opts.masterPassword ?? await resolvePassword();

  // Step 4: Create session via POST /v1/sessions
  let sessionData: { id: string; token: string; expiresAt: number };
  try {
    const sessionRes = await fetch(`${baseUrl}/v1/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Master-Password': password,
      },
      body: JSON.stringify({
        agentId,
        expiresIn,
      }),
    });

    if (!sessionRes.ok) {
      const body = await sessionRes.json().catch(() => null) as Record<string, unknown> | null;
      const msg = body?.['message'] ?? sessionRes.statusText;
      console.error(`Error: Failed to create session (${sessionRes.status}): ${msg}`);
      process.exit(1);
    }

    sessionData = await sessionRes.json() as { id: string; token: string; expiresAt: number };
  } catch (err) {
    if (err instanceof Error && 'code' in err) {
      throw err;
    }
    console.error('Error: Failed to create session');
    process.exit(1);
  }

  // Step 5: Write token to mcp-token file (atomic)
  const tokenPath = join(opts.dataDir, 'mcp-token');
  const tmpPath = `${tokenPath}.tmp`;

  await mkdir(dirname(tokenPath), { recursive: true });
  await writeFile(tmpPath, sessionData.token, 'utf-8');
  await rename(tmpPath, tokenPath);

  // Step 6: Output result
  console.log('MCP session created successfully!');
  console.log(`  Token file: ${tokenPath}`);
  console.log(`  Expires at: ${new Date(sessionData.expiresAt * 1000).toISOString()}`);
  console.log(`  Agent: ${agentId}`);

  // Step 7: Print Claude Desktop config.json snippet (CLI-05)
  const configSnippet = {
    mcpServers: {
      'waiaas-wallet': {
        command: 'npx',
        args: ['@waiaas/mcp'],
        env: {
          WAIAAS_DATA_DIR: opts.dataDir,
          WAIAAS_BASE_URL: baseUrl,
        },
      },
    },
  };

  console.log('\nAdd to your Claude Desktop config.json:');
  console.log(JSON.stringify(configSnippet, null, 2));

  // Print config.json path per platform (CLI-05)
  const platform = process.platform;
  if (platform === 'darwin') {
    console.log('\nConfig location: ~/Library/Application Support/Claude/claude_desktop_config.json');
  } else if (platform === 'win32') {
    console.log('\nConfig location: %APPDATA%\\Claude\\claude_desktop_config.json');
  } else {
    console.log('\nConfig location: ~/.config/Claude/claude_desktop_config.json');
  }
}
