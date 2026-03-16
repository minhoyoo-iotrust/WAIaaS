/**
 * Zod schemas for Jupiter Swap API v1 responses.
 * Runtime validation to detect API drift early.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Instruction schema (shared by swap, computeBudget, setup, cleanup)
// ---------------------------------------------------------------------------

export const InstructionSchema = z.object({
  programId: z.string(),
  accounts: z.array(
    z.object({
      pubkey: z.string(),
      isSigner: z.boolean(),
      isWritable: z.boolean(),
    }),
  ),
  data: z.string(), // base64-encoded
});

export type Instruction = z.infer<typeof InstructionSchema>;

// ---------------------------------------------------------------------------
// Quote Response (/swap/v1/quote)
// ---------------------------------------------------------------------------

export const QuoteResponseSchema = z.object({
  inputMint: z.string(),
  inAmount: z.string(),
  outputMint: z.string(),
  outAmount: z.string(),
  otherAmountThreshold: z.string(),
  swapMode: z.string(),
  slippageBps: z.number(),
  priceImpactPct: z.string(),
  routePlan: z.array(z.object({
    swapInfo: z.object({
      ammKey: z.string(),
      label: z.string().optional(),
      inputMint: z.string(),
      outputMint: z.string(),
      inAmount: z.string(),
      outAmount: z.string(),
      feeAmount: z.string().optional(),
      feeMint: z.string().optional(),
    }),
    percent: z.number(),
  })),
  contextSlot: z.number().optional(),
  timeTaken: z.number().optional(),
}).passthrough(); // Allow extra fields from API updates

export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;

// ---------------------------------------------------------------------------
// Swap Instructions Response (/swap/v1/swap-instructions)
// ---------------------------------------------------------------------------

export const SwapInstructionsResponseSchema = z.object({
  tokenLedgerInstruction: InstructionSchema.nullable(),
  computeBudgetInstructions: z.array(InstructionSchema),
  setupInstructions: z.array(InstructionSchema),
  swapInstruction: InstructionSchema,
  cleanupInstruction: InstructionSchema.nullable(),
  addressLookupTableAddresses: z.array(z.string()),
}).passthrough();

export type SwapInstructionsResponse = z.infer<typeof SwapInstructionsResponseSchema>;
