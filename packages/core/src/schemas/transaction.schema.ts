import { z } from 'zod';
import { TransactionTypeEnum, TransactionStatusEnum } from '../enums/transaction.js';
import { PolicyTierEnum } from '../enums/policy.js';
import { ChainTypeEnum, NetworkTypeEnum, NetworkTypeEnumWithLegacy } from '../enums/chain.js';
import { Caip19Schema, parseCaip19 } from '../caip/index.js';

// ---------------------------------------------------------------------------
// GasCondition schema (v28.5): optional gas price condition for deferred execution
// ---------------------------------------------------------------------------

/** Gas condition for conditional execution. At least one of maxGasPrice or maxPriorityFee required. */
export const GasConditionSchema = z.object({
  /** EVM: baseFee + priorityFee upper bound in wei. */
  maxGasPrice: z.string().regex(/^\d+$/, 'maxGasPrice must be a numeric string (wei)').optional(),
  /** EVM: priorityFee upper bound in wei. Solana: computeUnitPrice upper bound in micro-lamports. */
  maxPriorityFee: z.string().regex(/^\d+$/, 'maxPriorityFee must be a numeric string').optional(),
  /** Maximum wait time in seconds (60-86400). Uses Admin Settings default if omitted. */
  timeout: z.number().int().min(60).max(86400).optional(),
}).refine(
  (data) => data.maxGasPrice !== undefined || data.maxPriorityFee !== undefined,
  { message: 'At least one of maxGasPrice or maxPriorityFee must be specified' },
);
export type GasCondition = z.infer<typeof GasConditionSchema>;

export const TransactionSchema = z.object({
  id: z.string().uuid(),
  walletId: z.string().uuid(),
  sessionId: z.string().uuid().nullable(),
  type: TransactionTypeEnum,
  status: TransactionStatusEnum,
  tier: PolicyTierEnum.nullable(),
  chain: ChainTypeEnum,
  network: NetworkTypeEnum.nullable(),
  fromAddress: z.string(),
  toAddress: z.string().nullable(),
  amount: z.string(), // bigint as string for JSON/SQLite
  txHash: z.string().nullable(),
  errorMessage: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Transaction = z.infer<typeof TransactionSchema>;

export const SendTransactionRequestSchema = z.object({
  to: z.string().min(1),
  amount: z.string().regex(/^\d+$/, 'amount must be a numeric string (lamports)'),
  memo: z.string().max(256).optional(),
});
export type SendTransactionRequest = z.infer<typeof SendTransactionRequestSchema>;

// ---------------------------------------------------------------------------
// discriminatedUnion 6-type transaction request schemas (v1.4 + v31.0 NFT)
//
// These schemas validate incoming API requests for all 6 transaction types.
// The existing SendTransactionRequestSchema is kept for backward compatibility.
// Stage 1 of the pipeline will switch to TransactionRequestSchema in Phase 81.
// ---------------------------------------------------------------------------

const numericStringPattern = /^\d+$/;

/** Optional gas condition (shared across all 6 request types). */
const gasConditionField = { gasCondition: GasConditionSchema.optional() } as const;

/** Type 1: TRANSFER -- native token transfer (SOL/ETH). */
export const TransferRequestSchema = z.object({
  type: z.literal('TRANSFER'),
  to: z.string().min(1),
  amount: z.string().regex(numericStringPattern, 'amount must be a numeric string (lamports/wei)').optional(),
  humanAmount: z.string().min(1).optional()
    .describe('Human-readable amount (e.g., "1.5" for 1.5 ETH). Mutually exclusive with amount.'),
  memo: z.string().max(256).optional(),
  network: NetworkTypeEnumWithLegacy.optional(),
  ...gasConditionField,
});
export type TransferRequestInput = z.infer<typeof TransferRequestSchema>;

/** Token metadata for TOKEN_TRANSFER and APPROVE requests.
 *  When assetId is provided, address/decimals/symbol become optional (resolved from registry).
 *  When assetId is absent, address/decimals/symbol are required (legacy mode).
 */
const TokenInfoBaseSchema = z.object({
  address: z.string().min(1).optional(), // mint address (SPL) or contract address (ERC-20)
  decimals: z.number().int().min(0).max(18).optional(),
  symbol: z.string().min(1).max(10).optional(),
  assetId: Caip19Schema.optional(),
});

/** TokenInfoSchema with cross-field validation:
 *  - No assetId: address, decimals, symbol all required (backward compat)
 *  - assetId only: all optional (resolved later from registry)
 *  - assetId + address: cross-validate address match (case-insensitive)
 */
const TokenInfoSchema = TokenInfoBaseSchema.superRefine((data, ctx) => {
  // Legacy mode (no assetId): require address, decimals, symbol
  if (!data.assetId) {
    if (!data.address) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'address is required when assetId is not provided',
        path: ['address'],
      });
    }
    if (data.decimals === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'decimals is required when assetId is not provided',
        path: ['decimals'],
      });
    }
    if (!data.symbol) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'symbol is required when assetId is not provided',
        path: ['symbol'],
      });
    }
    return;
  }

  // assetId provided + address also provided: cross-validate (TXSC-03)
  if (data.address) {
    try {
      const parsed = parseCaip19(data.assetId);
      const extractedAddress = parsed.assetReference;

      // Cross-validate: case-insensitive for EVM (Pitfall 1: checksummed vs lowercased)
      if (extractedAddress.toLowerCase() !== data.address.toLowerCase()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `assetId address '${extractedAddress}' does not match provided address '${data.address}'`,
          path: ['assetId'],
        });
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid CAIP-19 assetId: ${data.assetId}`,
        path: ['assetId'],
      });
    }
  }
});

/** Type 2: TOKEN_TRANSFER -- SPL/ERC-20 token transfer. */
export const TokenTransferRequestSchema = z.object({
  type: z.literal('TOKEN_TRANSFER'),
  to: z.string().min(1),
  amount: z.string().regex(numericStringPattern, 'amount must be a numeric string').optional(),
  humanAmount: z.string().min(1).optional()
    .describe('Human-readable amount (e.g., "100" for 100 USDC). Mutually exclusive with amount. Uses token.decimals for conversion.'),
  token: TokenInfoSchema,
  memo: z.string().max(256).optional(),
  network: NetworkTypeEnumWithLegacy.optional(),
  ...gasConditionField,
});
export type TokenTransferRequest = z.infer<typeof TokenTransferRequestSchema>;

/** Type 3: CONTRACT_CALL -- arbitrary contract invocation. */
export const ContractCallRequestSchema = z.object({
  type: z.literal('CONTRACT_CALL'),
  to: z.string().min(1), // contract address
  // EVM fields
  calldata: z.string().optional(), // hex-encoded calldata
  abi: z.array(z.record(z.unknown())).optional(), // ABI fragment
  value: z.string().regex(numericStringPattern).optional(), // native token value
  // Solana fields
  programId: z.string().optional(),
  instructionData: z.string().optional(), // base64-encoded
  accounts: z
    .array(
      z.object({
        pubkey: z.string(),
        isSigner: z.boolean(),
        isWritable: z.boolean(),
      }),
    )
    .optional(),
  /**
   * Solana-only: Additional instructions to prepend before the main instruction.
   * Used for setup operations like ATA creation (CreateAssociatedTokenAccountIdempotent).
   */
  preInstructions: z
    .array(
      z.object({
        programId: z.string(),
        data: z.string(), // base64-encoded
        accounts: z.array(
          z.object({
            pubkey: z.string(),
            isSigner: z.boolean(),
            isWritable: z.boolean(),
          }),
        ),
      }),
    )
    .optional(),
  /**
   * Solana-only: Additional instructions to append after the main instruction.
   * Used for cleanup operations (e.g., Jupiter cleanupInstruction).
   */
  postInstructions: z
    .array(
      z.object({
        programId: z.string(),
        data: z.string(), // base64-encoded
        accounts: z.array(
          z.object({
            pubkey: z.string(),
            isSigner: z.boolean(),
            isWritable: z.boolean(),
          }),
        ),
      }),
    )
    .optional(),
  /**
   * Solana-only: Address Lookup Table (ALT) addresses for v0 transactions.
   * Passed through from Jupiter API response to allow compact account encoding.
   */
  addressLookupTableAddresses: z.array(z.string()).optional(),
  network: NetworkTypeEnumWithLegacy.optional(),
  /** Provider name tag for provider-trust policy bypass. Set by ActionProviderRegistry. */
  actionProvider: z.string().optional(),
  /** Action name for lending policy evaluation. Set by ActionProviderRegistry. */
  actionName: z.string().optional(),
  ...gasConditionField,
});
export type ContractCallRequest = z.infer<typeof ContractCallRequestSchema>;

/** NFT standard enum: ERC-721, ERC-1155 (EVM), METAPLEX (Solana). */
export const NftStandardEnum = z.enum(['ERC-721', 'ERC-1155', 'METAPLEX']);
export type NftStandard = z.infer<typeof NftStandardEnum>;

/** NFT token info for NFT_TRANSFER requests. */
export const NftTokenInfoSchema = z.object({
  address: z.string().min(1), // contract address (EVM) or mint address (Solana)
  tokenId: z.string().min(1), // token ID within the collection
  standard: NftStandardEnum,
  assetId: Caip19Schema.optional(), // CAIP-19 NFT asset identifier
});
export type NftTokenInfo = z.infer<typeof NftTokenInfoSchema>;

/** Type 4: APPROVE -- token spending approval (ERC-20 approve / SPL delegate / NFT approval). */
export const ApproveRequestSchema = z.object({
  type: z.literal('APPROVE'),
  spender: z.string().min(1),
  token: TokenInfoSchema,
  amount: z.string().regex(numericStringPattern, 'amount must be a numeric string').optional(),
  humanAmount: z.string().min(1).optional()
    .describe('Human-readable amount (e.g., "1000" for 1000 USDC). Mutually exclusive with amount. Uses token.decimals for conversion.'),
  network: NetworkTypeEnumWithLegacy.optional(),
  /** Optional NFT approval info. When present, this is an NFT approval (not ERC-20). */
  nft: z.object({
    tokenId: z.string().min(1),
    standard: NftStandardEnum,
  }).optional(),
  ...gasConditionField,
});
export type ApproveRequest = z.infer<typeof ApproveRequestSchema>;

/** Type 5: BATCH -- multiple instructions in a single transaction. */
export const BatchRequestSchema = z.object({
  type: z.literal('BATCH'),
  instructions: z
    .array(
      z.union([
        TransferRequestSchema.omit({ type: true }),
        TokenTransferRequestSchema.omit({ type: true }),
        ContractCallRequestSchema.omit({ type: true }),
        ApproveRequestSchema.omit({ type: true }),
      ]),
    )
    .min(2, 'Batch requires at least 2 instructions')
    .max(20, 'Batch maximum 20 instructions'),
  network: NetworkTypeEnumWithLegacy.optional(),
  ...gasConditionField,
});
export type BatchRequest = z.infer<typeof BatchRequestSchema>;

/** Type 6: NFT_TRANSFER -- ERC-721/ERC-1155/Metaplex NFT transfer. */
export const NftTransferRequestSchema = z.object({
  type: z.literal('NFT_TRANSFER'),
  to: z.string().min(1),
  token: NftTokenInfoSchema,
  amount: z.string().regex(numericStringPattern, 'amount must be a numeric string').default('1'),
  network: NetworkTypeEnumWithLegacy.optional(),
  ...gasConditionField,
});
export type NftTransferRequest = z.infer<typeof NftTransferRequestSchema>;

/** Type 7: CONTRACT_DEPLOY -- EVM contract deployment (to=null). */
export const ContractDeployRequestSchema = z.object({
  type: z.literal('CONTRACT_DEPLOY'),
  bytecode: z.string().min(1), // hex-encoded contract creation bytecode (0x-prefixed)
  constructorArgs: z.string().optional(), // ABI-encoded constructor args (hex)
  value: z.string().regex(numericStringPattern).optional(), // payable constructor ETH value
  network: NetworkTypeEnumWithLegacy.optional(),
  ...gasConditionField,
});
export type ContractDeployRequest = z.infer<typeof ContractDeployRequestSchema>;

/**
 * discriminatedUnion 7-type transaction request schema.
 * Identifies the correct schema variant via the `type` field.
 */
export const TransactionRequestSchema = z.discriminatedUnion('type', [
  TransferRequestSchema,
  TokenTransferRequestSchema,
  ContractCallRequestSchema,
  ApproveRequestSchema,
  BatchRequestSchema,
  NftTransferRequestSchema,
  ContractDeployRequestSchema,
]);
export type TransactionRequest = z.infer<typeof TransactionRequestSchema>;

// ---------------------------------------------------------------------------
// Sign Message request schema (v30.9 -- EIP-712 signTypedData support)
//
// Supports two modes:
// - personal: raw message signing (personal_sign, existing behavior)
// - typedData: EIP-712 structured data signing (EVM only)
// ---------------------------------------------------------------------------

/** EIP-712 typed data structure (domain, types, primaryType, message). */
export const Eip712TypedDataSchema = z.object({
  /** EIP-712 domain separator. */
  domain: z.object({
    name: z.string().optional(),
    version: z.string().optional(),
    chainId: z.union([z.number(), z.bigint(), z.string()]).optional(),
    verifyingContract: z.string().optional(),
    salt: z.string().optional(),
  }),
  /** EIP-712 struct type definitions. Must NOT include EIP712Domain. */
  types: z.record(
    z.array(
      z.object({
        name: z.string(),
        type: z.string(),
      }),
    ),
  ),
  /** Primary type to sign. */
  primaryType: z.string().min(1),
  /** The structured message to sign. */
  message: z.record(z.unknown()),
});
export type Eip712TypedData = z.infer<typeof Eip712TypedDataSchema>;

/** Sign type discriminator: 'personal' (raw message) or 'typedData' (EIP-712). */
export const SignTypeEnum = z.enum(['personal', 'typedData']);
export type SignType = z.infer<typeof SignTypeEnum>;

/**
 * Sign message request schema.
 *
 * When signType is 'personal' (default), `message` is required (hex or UTF-8 string).
 * When signType is 'typedData', `typedData` is required (EIP-712 structure, EVM only).
 */
export const SignMessageRequestSchema = z.object({
  /** Message to sign (hex 0x-prefixed or UTF-8 string). Required for signType='personal'. */
  message: z.string().optional(),
  /** Sign type: 'personal' (default) or 'typedData' (EIP-712). */
  signType: SignTypeEnum.default('personal'),
  /** EIP-712 typed data. Required when signType='typedData'. */
  typedData: Eip712TypedDataSchema.optional(),
  /** Target network. Required for EVM wallets. */
  network: NetworkTypeEnumWithLegacy.optional(),
  /** Target wallet ID (multi-wallet sessions). */
  walletId: z.string().uuid().optional(),
}).superRefine((data, ctx) => {
  if (data.signType === 'personal' && !data.message) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'message is required when signType is "personal"',
      path: ['message'],
    });
  }
  if (data.signType === 'typedData' && !data.typedData) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'typedData is required when signType is "typedData"',
      path: ['typedData'],
    });
  }
});
export type SignMessageRequest = z.infer<typeof SignMessageRequestSchema>;
