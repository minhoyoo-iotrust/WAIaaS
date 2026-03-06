/**
 * UserOperation v0.7 Zod schemas for ERC-4337 UserOp Build/Sign API.
 *
 * 5 schemas:
 * - UserOperationV07Schema: EntryPoint v0.7 full UserOperation
 * - UserOpBuildRequestSchema: TransactionRequest + network
 * - UserOpBuildResponseSchema: unsigned UserOp skeleton (no gas/paymaster)
 * - UserOpSignRequestSchema: buildId + completed UserOp (with gas/paymaster)
 * - UserOpSignResponseSchema: signed UserOp + txId
 *
 * @see REQUIREMENTS.md SCHM-01..SCHM-05
 */

import { z } from 'zod';
import { TransactionRequestSchema } from './transaction.schema.js';
import { NetworkTypeEnum } from '../enums/chain.js';

// ---------------------------------------------------------------------------
// Hex string validators
// ---------------------------------------------------------------------------

const HexAddress = z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'Must be a 40-char hex address');
const HexString = z.string().regex(/^0x[0-9a-fA-F]*$/, 'Must be a hex string starting with 0x');

// ---------------------------------------------------------------------------
// UserOperationV07Schema -- EntryPoint v0.7 full fields (SCHM-05)
// ---------------------------------------------------------------------------

/**
 * ERC-4337 EntryPoint v0.7 UserOperation schema.
 * All numeric fields are hex-encoded strings (0x prefix).
 * Gas/paymaster fields are required (platform must fill them before signing).
 */
export const UserOperationV07Schema = z.object({
  sender: HexAddress,
  nonce: HexString,
  callData: HexString,
  callGasLimit: HexString,
  verificationGasLimit: HexString,
  preVerificationGas: HexString,
  maxFeePerGas: HexString,
  maxPriorityFeePerGas: HexString,
  signature: HexString,
  // Optional init fields (for undeployed accounts)
  factory: HexAddress.optional(),
  factoryData: HexString.optional(),
  // Optional paymaster fields
  paymaster: HexAddress.optional(),
  paymasterData: HexString.optional(),
  paymasterVerificationGasLimit: HexString.optional(),
  paymasterPostOpGasLimit: HexString.optional(),
});
export type UserOperationV07 = z.infer<typeof UserOperationV07Schema>;

// ---------------------------------------------------------------------------
// UserOpBuildRequestSchema -- TransactionRequest + network (SCHM-01)
// ---------------------------------------------------------------------------

/**
 * Request body for POST /v1/wallets/:id/userop/build.
 * Wraps a standard TransactionRequest with a required network field.
 */
export const UserOpBuildRequestSchema = z.object({
  request: TransactionRequestSchema,
  network: NetworkTypeEnum,
});
export type UserOpBuildRequest = z.infer<typeof UserOpBuildRequestSchema>;

// ---------------------------------------------------------------------------
// UserOpBuildResponseSchema -- unsigned UserOp skeleton (SCHM-02)
// Gas/paymaster fields intentionally omitted (BUILD-11: platform fills them)
// ---------------------------------------------------------------------------

/**
 * Response from POST /v1/wallets/:id/userop/build.
 * Contains the unsigned UserOp skeleton that the platform must complete
 * with gas estimates and paymaster data before submitting for signing.
 */
export const UserOpBuildResponseSchema = z.object({
  sender: z.string(),
  nonce: z.string(),
  callData: z.string(),
  factory: z.string().nullable(),
  factoryData: z.string().nullable(),
  entryPoint: z.string(),
  buildId: z.string().uuid(),
});
export type UserOpBuildResponse = z.infer<typeof UserOpBuildResponseSchema>;

// ---------------------------------------------------------------------------
// UserOpSignRequestSchema -- buildId + completed UserOp (SCHM-03)
// ---------------------------------------------------------------------------

/**
 * Request body for POST /v1/wallets/:id/userop/sign.
 * The platform submits a buildId and the completed UserOperation
 * (with gas/paymaster fields filled in).
 */
export const UserOpSignRequestSchema = z.object({
  buildId: z.string().uuid(),
  userOperation: UserOperationV07Schema,
});
export type UserOpSignRequest = z.infer<typeof UserOpSignRequestSchema>;

// ---------------------------------------------------------------------------
// UserOpSignResponseSchema -- signed UserOp + txId (SCHM-04)
// ---------------------------------------------------------------------------

/**
 * Response from POST /v1/wallets/:id/userop/sign.
 * Returns the signed UserOperation (signature field populated)
 * and a txId for audit tracking.
 */
export const UserOpSignResponseSchema = z.object({
  signedUserOperation: UserOperationV07Schema,
  txId: z.string().uuid(),
});
export type UserOpSignResponse = z.infer<typeof UserOpSignResponseSchema>;
