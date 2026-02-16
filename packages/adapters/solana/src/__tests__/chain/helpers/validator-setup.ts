/**
 * Solana local validator (solana-test-validator) helpers for Level 2 E2E tests.
 *
 * - isValidatorRunning(): Health check with polling (max 5s)
 * - airdropSol(): Request SOL airdrop + wait for confirmation
 *
 * These helpers are used by the Level 2 E2E test suite to set up
 * test accounts on a local validator.
 */

const LOCAL_RPC_URL = 'http://127.0.0.1:8899';

/**
 * Check if solana-test-validator is running by calling getHealth via JSON-RPC.
 *
 * @param rpcUrl - RPC URL to check (default: localhost:8899)
 * @param maxWaitMs - Maximum time to wait for validator (default: 5000ms)
 * @returns true if validator is healthy, false otherwise
 */
export async function isValidatorRunning(
  rpcUrl = LOCAL_RPC_URL,
  maxWaitMs = 5000,
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  const pollInterval = 500;

  while (Date.now() < deadline) {
    try {
      const resp = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getHealth',
        }),
        signal: AbortSignal.timeout(2000),
      });

      if (resp.ok) {
        const json = (await resp.json()) as { result?: string };
        if (json.result === 'ok') {
          return true;
        }
      }
    } catch {
      // Connection refused or timeout — validator not ready
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  return false;
}

/**
 * Airdrop SOL to a given address on the local validator.
 * Waits briefly for the airdrop to be confirmed.
 *
 * @param addr - Solana address (base58)
 * @param lamports - Amount in lamports
 * @param rpcUrl - RPC URL (default: localhost:8899)
 */
export async function airdropSol(
  addr: string,
  lamports: bigint,
  rpcUrl = LOCAL_RPC_URL,
): Promise<void> {
  // Request airdrop
  const airdropResp = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'requestAirdrop',
      params: [addr, Number(lamports)],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  const airdropJson = (await airdropResp.json()) as {
    result?: string;
    error?: { message: string };
  };

  if (airdropJson.error) {
    throw new Error(`Airdrop failed: ${airdropJson.error.message}`);
  }

  const signature = airdropJson.result;
  if (!signature) {
    throw new Error('Airdrop returned no signature');
  }

  // Poll for confirmation (max 15s)
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const statusResp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignatureStatuses',
        params: [[signature]],
      }),
      signal: AbortSignal.timeout(5_000),
    });

    const statusJson = (await statusResp.json()) as {
      result?: { value: Array<{ confirmationStatus?: string } | null> };
    };

    const status = statusJson.result?.value?.[0];
    if (
      status?.confirmationStatus === 'confirmed' ||
      status?.confirmationStatus === 'finalized'
    ) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Airdrop sent but not confirmed within timeout — proceed anyway
  // (local validator airdrops are usually instant)
}
