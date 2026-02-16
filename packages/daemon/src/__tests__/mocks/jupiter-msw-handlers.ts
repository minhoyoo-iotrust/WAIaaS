/**
 * M6: Jupiter API msw handlers.
 *
 * Intercepts Jupiter v6 API endpoints (/v6/quote, /v6/swap-instructions)
 * with canned responses for deterministic testing. Supports both success
 * and error scenarios via factory functions.
 */
import { http, HttpResponse } from 'msw';

// ---------------------------------------------------------------------------
// Canned responses
// ---------------------------------------------------------------------------

/** Default Jupiter /v6/quote response (SOL -> USDC). */
const DEFAULT_QUOTE_RESPONSE = {
  inputMint: 'So11111111111111111111111111111111111111112',
  inAmount: '1000000000', // 1 SOL in lamports
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  outAmount: '184136023', // ~184.13 USDC
  otherAmountThreshold: '182294662',
  swapMode: 'ExactIn',
  slippageBps: 50,
  platformFee: null,
  priceImpactPct: '0.001',
  routePlan: [
    {
      swapInfo: {
        ammKey: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
        label: 'Whirlpool',
        inputMint: 'So11111111111111111111111111111111111111112',
        outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        inAmount: '1000000000',
        outAmount: '184136023',
        feeAmount: '200',
        feeMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      },
      percent: 100,
    },
  ],
  contextSlot: 290000000,
  timeTaken: 0.042,
};

/** Default Jupiter /v6/swap-instructions response. */
const DEFAULT_SWAP_RESPONSE = {
  tokenLedgerInstruction: null,
  computeBudgetInstructions: [
    {
      programId: 'ComputeBudget111111111111111111111111111111',
      accounts: [],
      data: 'AQAAAA==', // base64
    },
  ],
  setupInstructions: [],
  swapInstruction: {
    programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    accounts: [
      { pubkey: 'So11111111111111111111111111111111111111112', isSigner: false, isWritable: true },
      { pubkey: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', isSigner: false, isWritable: true },
    ],
    data: 'c3dhcGRhdGE=', // base64 placeholder
  },
  cleanupInstruction: null,
  addressLookupTableAddresses: [
    'GxS6FiQ9RbErBVmNB8mGSEn6MnacxPMPG6yMhMpB2sN2',
  ],
};

// ---------------------------------------------------------------------------
// Handler factories
// ---------------------------------------------------------------------------

/**
 * Create Jupiter v6 API msw handlers with optional response overrides.
 *
 * @param overrides - Partial overrides for quote and/or swap responses.
 * @returns msw http handlers array for setupServer().
 */
export function createJupiterHandlers(overrides?: {
  quote?: Record<string, unknown>;
  swap?: Record<string, unknown>;
}) {
  return [
    http.get('https://quote-api.jup.ag/v6/quote', ({ request }) => {
      const url = new URL(request.url);
      const inputMint = url.searchParams.get('inputMint');
      const outputMint = url.searchParams.get('outputMint');
      const amount = url.searchParams.get('amount');
      const slippageBps = url.searchParams.get('slippageBps');

      // Merge query params into response for test inspection
      const response = overrides?.quote ?? {
        ...DEFAULT_QUOTE_RESPONSE,
        ...(inputMint && { inputMint }),
        ...(outputMint && { outputMint }),
        ...(amount && { inAmount: amount }),
        ...(slippageBps && { slippageBps: Number(slippageBps) }),
      };

      return HttpResponse.json(response);
    }),

    http.post('https://quote-api.jup.ag/v6/swap-instructions', async () => {
      return HttpResponse.json(overrides?.swap ?? DEFAULT_SWAP_RESPONSE);
    }),
  ];
}

/**
 * Create Jupiter error scenario handlers.
 *
 * @param statusCode - HTTP status code for error responses (default: 400).
 * @returns msw http handlers array that return error responses.
 */
export function createJupiterErrorHandlers(statusCode = 400) {
  return [
    http.get('https://quote-api.jup.ag/v6/quote', () => {
      return HttpResponse.json(
        { error: 'Route not found', errorCode: 'ROUTE_NOT_FOUND' },
        { status: statusCode },
      );
    }),

    http.post('https://quote-api.jup.ag/v6/swap-instructions', () => {
      return HttpResponse.json(
        { error: 'Invalid quote', errorCode: 'INVALID_QUOTE' },
        { status: statusCode },
      );
    }),
  ];
}

/** Default Jupiter handlers (convenience export). */
export const jupiterHandlers = createJupiterHandlers();
