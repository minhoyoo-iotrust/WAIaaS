/**
 * `waiaas mcp setup` -- Set up MCP integration for Claude Desktop.
 *
 * 7-step flow (CLI-02), extended for multi-agent (CLIP-01..07):
 *   1. Check daemon is running (GET /health)
 *   2. Resolve master password
 *   3. Resolve agent ID (auto-detect if single agent, masterAuth)
 *   4. Create session via POST /v1/sessions (masterAuth)
 *   5. Write token to mcp-tokens/<agentId> file (atomic)
 *   6. Output result
 *   7. Print Claude Desktop config.json snippet with WAIAAS_AGENT_ID/NAME
 *
 * --all flag: set up all agents at once with a combined config snippet.
 */

import { writeFile, rename, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { resolvePassword } from '../utils/password.js';
import { toSlug, resolveSlugCollisions } from '../utils/slug.js';

export interface McpSetupOptions {
  dataDir: string;
  baseUrl?: string;
  agent?: string;
  expiresIn?: number;
  masterPassword?: string;
  all?: boolean;
}

interface AgentInfo {
  id: string;
  name?: string;
}

/** Fetch agent list from daemon (masterAuth). */
async function fetchAgents(baseUrl: string, password: string): Promise<AgentInfo[]> {
  const agentsRes = await fetch(`${baseUrl}/v1/agents`, {
    headers: {
      'Accept': 'application/json',
      'X-Master-Password': password,
    },
  });

  if (!agentsRes.ok) {
    console.error(`Error: Failed to list agents (${agentsRes.status})`);
    process.exit(1);
  }

  const agentsData = await agentsRes.json() as { items: AgentInfo[] };
  return agentsData.items ?? [];
}

/** Create session for a single agent and write token file atomically. */
async function setupAgent(opts: {
  baseUrl: string;
  dataDir: string;
  password: string;
  agentId: string;
  expiresIn: number;
}): Promise<{ token: string; expiresAt: number }> {
  const sessionRes = await fetch(`${opts.baseUrl}/v1/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Password': opts.password,
    },
    body: JSON.stringify({
      agentId: opts.agentId,
      expiresIn: opts.expiresIn,
    }),
  });

  if (!sessionRes.ok) {
    const body = await sessionRes.json().catch(() => null) as Record<string, unknown> | null;
    const msg = body?.['message'] ?? sessionRes.statusText;
    console.error(`Error: Failed to create session (${sessionRes.status}): ${msg}`);
    process.exit(1);
  }

  const sessionData = await sessionRes.json() as { id: string; token: string; expiresAt: number };

  // Write token to mcp-tokens/<agentId> (atomic: write tmp then rename)
  const tokenPath = join(opts.dataDir, 'mcp-tokens', opts.agentId);
  const tmpPath = `${tokenPath}.tmp`;

  await mkdir(dirname(tokenPath), { recursive: true });
  await writeFile(tmpPath, sessionData.token, 'utf-8');
  await rename(tmpPath, tokenPath);

  return { token: sessionData.token, expiresAt: sessionData.expiresAt };
}

/** Build a single mcpServers config entry for an agent. */
function buildConfigEntry(opts: {
  dataDir: string;
  baseUrl: string;
  agentId: string;
  agentName?: string;
}): Record<string, unknown> {
  const env: Record<string, string> = {
    WAIAAS_DATA_DIR: opts.dataDir,
    WAIAAS_BASE_URL: opts.baseUrl,
    WAIAAS_AGENT_ID: opts.agentId,
  };
  if (opts.agentName) {
    env['WAIAAS_AGENT_NAME'] = opts.agentName;
  }
  return {
    command: 'npx',
    args: ['@waiaas/mcp'],
    env,
  };
}

/** Print platform-specific Claude Desktop config.json path. */
function printConfigPath(): void {
  const platform = process.platform;
  if (platform === 'darwin') {
    console.log('\nConfig location: ~/Library/Application Support/Claude/claude_desktop_config.json');
  } else if (platform === 'win32') {
    console.log('\nConfig location: %APPDATA%\\Claude\\claude_desktop_config.json');
  } else {
    console.log('\nConfig location: ~/.config/Claude/claude_desktop_config.json');
  }
}

export async function mcpSetupCommand(opts: McpSetupOptions): Promise<void> {
  const baseUrl = (opts.baseUrl ?? 'http://127.0.0.1:3100').replace(/\/+$/, '');
  const expiresIn = opts.expiresIn ?? 86400;

  // Validate: --all and --agent are mutually exclusive
  if (opts.all && opts.agent) {
    console.error('Error: Cannot use --all with --agent');
    process.exit(1);
  }

  // Step 1: Check daemon is running
  try {
    const healthRes = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!healthRes.ok) {
      // Daemon is responding but unhealthy -- continue anyway
      console.error(`Warning: daemon returned ${healthRes.status} on health check`);
    }
  } catch {
    console.error('Error: Cannot reach WAIaaS daemon.');
    console.error(`  Tried: ${baseUrl}/health`);
    console.error('  Make sure the daemon is running: waiaas start');
    process.exit(1);
  }

  // Step 2: Resolve master password (before agent list which requires masterAuth)
  const password = opts.masterPassword ?? await resolvePassword();

  // --all: set up all agents at once
  if (opts.all) {
    const agents = await fetchAgents(baseUrl, password);

    if (agents.length === 0) {
      console.error('Error: No agents found. Run waiaas init first.');
      process.exit(1);
    }

    // Resolve slug collisions
    const slugMap = resolveSlugCollisions(agents);

    // Set up each agent
    const mcpServers: Record<string, Record<string, unknown>> = {};
    for (const agent of agents) {
      const result = await setupAgent({
        baseUrl,
        dataDir: opts.dataDir,
        password,
        agentId: agent.id,
        expiresIn,
      });

      const slug = slugMap.get(agent.id)!;
      console.log(`MCP session created for ${agent.name ?? agent.id}!`);
      console.log(`  Token file: ${join(opts.dataDir, 'mcp-tokens', agent.id)}`);
      console.log(`  Expires at: ${new Date(result.expiresAt * 1000).toISOString()}`);

      mcpServers[`waiaas-${slug}`] = buildConfigEntry({
        dataDir: opts.dataDir,
        baseUrl,
        agentId: agent.id,
        agentName: agent.name,
      });
    }

    // Print combined config snippet
    const configSnippet = { mcpServers };
    console.log('\nAdd to your Claude Desktop config.json:');
    console.log(JSON.stringify(configSnippet, null, 2));
    printConfigPath();
    return;
  }

  // Step 3: Resolve agent ID (single agent flow)
  let agentId = opts.agent;
  let agentName: string | undefined;

  if (!agentId) {
    // Auto-detect: fetch agents list
    try {
      const agents = await fetchAgents(baseUrl, password);

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
      agentName = agents[0]?.name ?? undefined;
      console.error(`Auto-detected agent: ${agentId}`);
    } catch (err) {
      if (err instanceof Error && 'code' in err) {
        // Already handled exit cases above
        throw err;
      }
      console.error('Error: Failed to list agents');
      process.exit(1);
    }
  } else {
    // --agent specified: look up name from agents list
    try {
      const agents = await fetchAgents(baseUrl, password);
      const found = agents.find((a) => a.id === agentId);
      agentName = found?.name ?? undefined;
    } catch {
      // Name lookup failure is not fatal -- continue without name
    }
  }

  // Step 4 + 5: Create session and write token file
  let result: { token: string; expiresAt: number };
  try {
    result = await setupAgent({
      baseUrl,
      dataDir: opts.dataDir,
      password,
      agentId,
      expiresIn,
    });
  } catch (err) {
    if (err instanceof Error && 'code' in err) {
      throw err;
    }
    console.error('Error: Failed to create session');
    process.exit(1);
  }

  // Step 6: Output result
  const tokenPath = join(opts.dataDir, 'mcp-tokens', agentId);
  console.log('MCP session created successfully!');
  console.log(`  Token file: ${tokenPath}`);
  console.log(`  Expires at: ${new Date(result.expiresAt * 1000).toISOString()}`);
  console.log(`  Agent: ${agentId}`);

  // Step 7: Print Claude Desktop config.json snippet (CLI-05 + CLIP-02/03)
  const slug = toSlug(agentName ?? agentId);
  const configSnippet = {
    mcpServers: {
      [`waiaas-${slug}`]: buildConfigEntry({
        dataDir: opts.dataDir,
        baseUrl,
        agentId,
        agentName,
      }),
    },
  };

  console.log('\nAdd to your Claude Desktop config.json:');
  console.log(JSON.stringify(configSnippet, null, 2));
  printConfigPath();
}
