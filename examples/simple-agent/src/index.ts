/**
 * WAIaaS Simple Agent Example
 *
 * Demonstrates the core SDK workflow:
 *   1. Check wallet balance
 *   2. Conditionally send native tokens
 *   3. Poll for transaction confirmation
 *
 * Usage:
 *   node --env-file=.env dist/index.js
 *   npx tsx --env-file=.env src/index.ts
 */

import { WAIaaSClient, WAIaaSError } from '@waiaas/sdk';

// ---------------------------------------------------------------------------
// Configuration from environment variables
// ---------------------------------------------------------------------------

const BASE_URL = process.env['WAIAAS_BASE_URL'] ?? 'http://localhost:3100';
const SESSION_TOKEN = process.env['WAIAAS_SESSION_TOKEN'];
const MIN_BALANCE_THRESHOLD = BigInt(
  process.env['MIN_BALANCE_THRESHOLD'] ?? '1000000',
);
const RECIPIENT_ADDRESS = process.env['RECIPIENT_ADDRESS'] ?? '';
const SEND_AMOUNT = process.env['SEND_AMOUNT'] ?? '0.001';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Helper: wait for a given number of milliseconds
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert a human-readable balance string (e.g., "1.5") to base units
 * (e.g., lamports or wei) given the token's decimal places.
 */
function toBaseUnits(amount: string, decimals: number): bigint {
  const [whole = '0', fraction = ''] = amount.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole + paddedFraction);
}

// ---------------------------------------------------------------------------
// Main agent logic
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // --- Validate configuration ---
  if (!SESSION_TOKEN) {
    console.error(
      '[Agent] ERROR: WAIAAS_SESSION_TOKEN is not set. ' +
        'Create a session via POST /v1/sessions first.',
    );
    process.exit(1);
  }

  if (!RECIPIENT_ADDRESS) {
    console.error(
      '[Agent] ERROR: RECIPIENT_ADDRESS is not set. ' +
        'Provide a destination wallet address in .env.',
    );
    process.exit(1);
  }

  // --- Step 1: Initialize SDK client ---
  console.log(`[Agent] Connecting to WAIaaS daemon at ${BASE_URL}...`);
  const client = new WAIaaSClient({
    baseUrl: BASE_URL,
    sessionToken: SESSION_TOKEN,
  });

  // --- Step 2: Check wallet balance ---
  console.log('[Agent] Checking wallet balance...');
  const balance = await client.getBalance();
  console.log(
    `[Agent] Balance: ${balance.balance} ${balance.symbol} ` +
      `(${balance.chain}/${balance.network})`,
  );

  // --- Step 3: Conditional check ---
  const balanceBaseUnits = toBaseUnits(balance.balance, balance.decimals);

  if (balanceBaseUnits < MIN_BALANCE_THRESHOLD) {
    console.log(
      `[Agent] Balance (${balanceBaseUnits} base units) is below threshold ` +
        `(${MIN_BALANCE_THRESHOLD}). Skipping transfer.`,
    );
    process.exit(0);
  }

  console.log(
    `[Agent] Balance meets threshold. Proceeding with transfer...`,
  );

  // --- Step 4: Send tokens ---
  console.log(
    `[Agent] Sending ${SEND_AMOUNT} ${balance.symbol} to ${RECIPIENT_ADDRESS}...`,
  );
  const sendResult = await client.sendToken({
    type: 'TRANSFER',
    to: RECIPIENT_ADDRESS,
    amount: SEND_AMOUNT,
  });

  const transactionId = sendResult.id;
  console.log(
    `[Agent] Transaction submitted: ${transactionId} (status: ${sendResult.status})`,
  );

  // --- Step 5: Poll for transaction confirmation ---
  console.log('[Agent] Waiting for confirmation...');
  const startTime = Date.now();

  while (Date.now() - startTime < POLL_TIMEOUT_MS) {
    const tx = await client.getTransaction(transactionId);

    if (tx.status === 'COMPLETED') {
      console.log(`[Agent] Transaction COMPLETED!`);
      console.log(`[Agent]   Hash: ${tx.txHash ?? 'N/A'}`);
      console.log(`[Agent]   Amount: ${tx.amount ?? SEND_AMOUNT}`);
      console.log(`[Agent]   To: ${tx.toAddress ?? RECIPIENT_ADDRESS}`);
      process.exit(0);
    }

    if (tx.status === 'FAILED') {
      console.error(`[Agent] Transaction FAILED: ${tx.error ?? 'unknown error'}`);
      process.exit(1);
    }

    // Still pending -- wait and retry
    process.stdout.write('.');
    await sleep(POLL_INTERVAL_MS);
  }

  // Timeout reached
  console.error(
    `\n[Agent] Transaction ${transactionId} did not complete within ` +
      `${POLL_TIMEOUT_MS / 1000}s. Check status manually.`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Entry point with error handling
// ---------------------------------------------------------------------------

main().catch((error: unknown) => {
  if (error instanceof WAIaaSError) {
    console.error(`[Agent] API Error: [${error.code}] ${error.message}`);
    if (error.hint) {
      console.error(`[Agent] Hint: ${error.hint}`);
    }
    if (error.details) {
      console.error('[Agent] Details:', JSON.stringify(error.details, null, 2));
    }
  } else if (error instanceof Error) {
    console.error(`[Agent] Unexpected error: ${error.message}`);
    console.error(error.stack);
  } else {
    console.error('[Agent] Unknown error:', error);
  }
  process.exit(1);
});
