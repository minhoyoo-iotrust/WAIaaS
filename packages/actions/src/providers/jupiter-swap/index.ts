/**
 * Jupiter Swap Action Provider.
 *
 * Implements IActionProvider to resolve Jupiter DEX swap requests
 * into ContractCallRequest objects for the 6-stage pipeline.
 */
import { z } from 'zod';
import { ChainError } from '@waiaas/core';
import type {
  IActionProvider,
  ActionProviderMetadata,
  ActionDefinition,
  ActionContext,
  ContractCallRequest,
} from '@waiaas/core';
import { JupiterApiClient } from './jupiter-api-client.js';
import { type JupiterSwapConfig, JUPITER_SWAP_DEFAULTS, JUPITER_PROGRAM_ID } from './config.js';
import { clampSlippageBps, asBps } from '../../common/slippage.js';

// ---------------------------------------------------------------------------
// Input schema for the swap action
// ---------------------------------------------------------------------------

const SwapInputSchema = z.object({
  inputMint: z.string().min(1, 'inputMint is required'),
  outputMint: z.string().min(1, 'outputMint is required'),
  amount: z.string().min(1, 'amount is required (in smallest units)').describe('Amount in smallest units (lamports). Example: "1000000000" = 1 SOL'),
  slippageBps: z.number().int().optional(),
});

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class JupiterSwapActionProvider implements IActionProvider {
  readonly metadata: ActionProviderMetadata;
  readonly actions: readonly ActionDefinition[];

  private readonly config: JupiterSwapConfig;
  private readonly apiClient: JupiterApiClient;

  constructor(config?: Partial<JupiterSwapConfig>) {
    this.config = { ...JUPITER_SWAP_DEFAULTS, ...config };
    this.apiClient = new JupiterApiClient(this.config);

    this.metadata = {
      name: 'jupiter_swap',
      description: 'Jupiter DEX aggregator for Solana token swaps with MEV protection',
      version: '1.0.0',
      chains: ['solana'],
      mcpExpose: true,
      requiresApiKey: true,
      requiredApis: ['jupiter'],
      requiresSigningKey: false,
    };

    this.actions = [
      {
        name: 'swap',
        description: 'Swap tokens on Solana via Jupiter aggregator with slippage protection and Jito MEV tips',
        chain: 'solana',
        inputSchema: SwapInputSchema,
        riskLevel: 'medium',
        defaultTier: 'INSTANT',
      },
    ] as const;
  }

  async resolve(
    actionName: string,
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest> {
    if (actionName !== 'swap') {
      throw new ChainError('INVALID_INSTRUCTION', 'solana', { message: `Unknown action: ${actionName}` });
    }

    const input = SwapInputSchema.parse(params);

    // SAFE-05: Block same-token swap
    if (input.inputMint === input.outputMint) {
      throw new ChainError('INVALID_INSTRUCTION', 'solana', { message: 'Cannot swap a token for itself' });
    }

    // SAFE-01/02: Clamp slippage
    const slippageBps = clampSlippageBps(
      input.slippageBps ?? 0,
      asBps(this.config.defaultSlippageBps),
      asBps(this.config.maxSlippageBps),
    );

    // SWAP-01/06: Get quote with restrictIntermediateTokens=true
    const quote = await this.apiClient.getQuote({
      inputMint: input.inputMint,
      outputMint: input.outputMint,
      amount: input.amount,
      slippageBps,
      restrictIntermediateTokens: true,
    });

    // SAFE-03: Price impact check
    const priceImpact = parseFloat(quote.priceImpactPct);
    if (priceImpact > this.config.maxPriceImpactPct) {
      throw new ChainError(
        'PRICE_IMPACT_TOO_HIGH',
        'solana',
        { message: `Price impact ${priceImpact}% exceeds max ${this.config.maxPriceImpactPct}%` },
      );
    }

    // SWAP-02/SAFE-04: Get swap instructions with Jito MEV tip
    const instructions = await this.apiClient.getSwapInstructions({
      quoteResponse: quote,
      userPublicKey: context.walletAddress,
      jitoTipLamports: this.config.jitoTipLamports,
    });

    // SWAP-05: Verify program ID
    if (instructions.swapInstruction.programId !== JUPITER_PROGRAM_ID) {
      throw new ChainError(
        'INVALID_INSTRUCTION',
        'solana',
        { message: `Unexpected program ID: ${instructions.swapInstruction.programId} (expected ${JUPITER_PROGRAM_ID})` },
      );
    }

    // SWAP-03: Convert to ContractCallRequest
    const request: ContractCallRequest = {
      type: 'CONTRACT_CALL',
      to: JUPITER_PROGRAM_ID,
      programId: instructions.swapInstruction.programId,
      instructionData: instructions.swapInstruction.data,
      accounts: instructions.swapInstruction.accounts.map((a) => ({
        pubkey: a.pubkey,
        isSigner: a.isSigner,
        isWritable: a.isWritable,
      })),
      network: context.chain === 'solana' ? undefined : undefined,
    };

    return request;
  }
}
