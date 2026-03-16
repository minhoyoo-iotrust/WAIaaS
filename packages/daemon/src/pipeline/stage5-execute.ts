/**
 * Stage 5: On-chain execution (build -> simulate -> sign -> submit).
 *
 * Contains:
 * - buildByType: route to correct adapter method based on request.type
 * - ERC721/ERC1155 UserOp ABI constants
 * - buildUserOpCalls: convert request to viem calls[] for UserOperation
 * - stage5ExecuteSmartAccount: smart account UserOperation pipeline
 * - stage5Execute: main EOA execution with CONC-01 retry logic
 *
 * @see docs/32-pipeline-design.md
 */

import { eq } from 'drizzle-orm';
import {
  WAIaaSError,
  ChainError,
  type IChainAdapter,
  type UnsignedTransaction,
  type SendTransactionRequest,
  type TransactionRequest,
  type BatchRequest,
  type TokenTransferRequest,
  type ContractCallRequest,
  type ApproveRequest,
  type NftTransferRequest,
  type ContractDeployRequest,
} from '@waiaas/core';
import { wallets, transactions } from '../infrastructure/database/schema.js';
import { insertAuditLog } from '../infrastructure/database/audit-helper.js';
import { GAS_SAFETY_NUMERATOR, GAS_SAFETY_DENOMINATOR } from '../constants.js';
import { sleep } from './sleep.js';
// v30.6: ERC-4337 smart account imports
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, encodeFunctionData, toHex, type Hex } from 'viem';
import { SmartAccountService, SOLADY_FACTORY_ADDRESS } from '../infrastructure/smart-account/smart-account-service.js';
import { createSmartAccountBundlerClient } from '../infrastructure/smart-account/smart-account-clients.js';
import type { WalletProviderData } from '../infrastructure/smart-account/smart-account-clients.js';
import { decryptProviderApiKey } from '../infrastructure/smart-account/aa-provider-crypto.js';
import type { PipelineContext } from './pipeline-helpers.js';
import {
  getRequestAmount,
  getRequestTo,
  getRequestMemo,
  resolveNotificationTo,
  formatNotificationAmount,
  resolveDisplayAmount,
} from './pipeline-helpers.js';

// ---------------------------------------------------------------------------
// Helper: buildByType -- route to correct adapter method based on request.type
// ---------------------------------------------------------------------------

/**
 * Build unsigned transaction by dispatching to the correct IChainAdapter method
 * based on request.type (TRANSFER/TOKEN_TRANSFER/CONTRACT_CALL/APPROVE/BATCH).
 */
export async function buildByType(
  adapter: IChainAdapter,
  request: SendTransactionRequest | TransactionRequest,
  walletPublicKey: string,
): Promise<UnsignedTransaction> {
  const type = ('type' in request && request.type) || 'TRANSFER';

  switch (type) {
    case 'TRANSFER': {
      return adapter.buildTransaction({
        from: walletPublicKey,
        to: getRequestTo(request),
        amount: BigInt(getRequestAmount(request)),
        memo: getRequestMemo(request),
      });
    }

    case 'TOKEN_TRANSFER': {
      const req = request as TokenTransferRequest;
      return adapter.buildTokenTransfer({
        from: walletPublicKey,
        to: req.to,
        amount: BigInt(req.amount!),
        token: req.token as { address: string; decimals: number; symbol: string },
        memo: req.memo,
      });
    }

    case 'CONTRACT_CALL': {
      const req = request as ContractCallRequest;
      return adapter.buildContractCall({
        from: walletPublicKey,
        to: req.to,
        calldata: req.calldata,
        abi: req.abi as Record<string, unknown>[] | undefined,
        value: req.value ? BigInt(req.value) : undefined,
        programId: req.programId,
        instructionData: req.instructionData
          ? Buffer.from(req.instructionData, 'base64')
          : undefined,
        accounts: req.accounts,
        // Pass through preInstructions for Solana (e.g., ATA creation for Jito staking)
        preInstructions: req.preInstructions?.map((pre) => ({
          programId: pre.programId,
          data: Buffer.from(pre.data, 'base64'),
          accounts: pre.accounts,
        })),
      });
    }

    case 'APPROVE': {
      const req = request as ApproveRequest;
      // v31.0: NFT approval routing
      if (req.nft) {
        const approvalType = req.amount === '0' ? 'single' : 'all' as const;
        return adapter.approveNft({
          from: walletPublicKey,
          spender: req.spender,
          token: {
            address: req.token.address!,
            tokenId: req.nft.tokenId,
            standard: req.nft.standard,
          },
          approvalType,
        });
      }
      return adapter.buildApprove({
        from: walletPublicKey,
        spender: req.spender,
        token: req.token as { address: string; decimals: number; symbol: string },
        amount: BigInt(req.amount!),
      });
    }

    case 'NFT_TRANSFER': {
      const req = request as NftTransferRequest;
      return adapter.buildNftTransferTx({
        from: walletPublicKey,
        to: req.to,
        token: {
          address: req.token.address,
          tokenId: req.token.tokenId,
          standard: req.token.standard,
        },
        amount: BigInt(req.amount ?? '1'),
      });
    }

    case 'CONTRACT_DEPLOY': {
      const req = request as ContractDeployRequest;
      // Contract deployment: to=undefined, data=bytecode(+constructorArgs)
      const deployData = req.constructorArgs
        ? req.bytecode + req.constructorArgs.replace(/^0x/, '')
        : req.bytecode;
      return adapter.buildContractCall({
        from: walletPublicKey,
        to: '', // adapter handles to='' as to=undefined for deploy
        calldata: deployData,
        value: req.value ? BigInt(req.value) : undefined,
      });
    }

    case 'BATCH': {
      const req = request as BatchRequest;
      return adapter.buildBatch({
        from: walletPublicKey,
        instructions: req.instructions.map((instr) => {
          // Classify by field presence (same logic as classifyInstruction in Phase 80)
          if ('spender' in instr) {
            const a = instr as { spender: string; token: { address: string; decimals: number; symbol: string }; amount: string };
            return {
              from: walletPublicKey,
              spender: a.spender,
              token: a.token,
              amount: BigInt(a.amount),
            };
          }
          if ('token' in instr) {
            const t = instr as { to: string; amount: string; token: { address: string; decimals: number; symbol: string }; memo?: string };
            return {
              from: walletPublicKey,
              to: t.to,
              amount: BigInt(t.amount),
              token: t.token,
              memo: t.memo,
            };
          }
          if ('programId' in instr || 'calldata' in instr) {
            const c = instr as {
              to: string;
              calldata?: string;
              programId?: string;
              instructionData?: string;
              accounts?: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
              value?: string;
            };
            return {
              from: walletPublicKey,
              to: c.to,
              calldata: c.calldata,
              programId: c.programId,
              instructionData: c.instructionData
                ? Buffer.from(c.instructionData, 'base64')
                : undefined,
              accounts: c.accounts,
              value: c.value ? BigInt(c.value) : undefined,
            };
          }
          // Default: TRANSFER instruction
          const tr = instr as { to: string; amount: string; memo?: string };
          return {
            from: walletPublicKey,
            to: tr.to,
            amount: BigInt(tr.amount),
            memo: tr.memo,
          };
        }),
      });
    }

    default:
      throw new WAIaaSError('CHAIN_ERROR', {
        message: `Unknown transaction type: ${type}`,
      });
  }
}

// ---------------------------------------------------------------------------
// Stage 5: Smart account ERC-4337 UserOperation helpers
// ---------------------------------------------------------------------------

/**
 * Minimal ERC-20 ABI for transfer/approve encoding in UserOperation calls.
 * Inline to avoid cross-package import from @waiaas/adapters-evm.
 */
const ERC20_USEROP_ABI = [
  { type: 'function', name: 'transfer', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const;

/** ERC-721 ABI for NFT UserOp calls (safeTransferFrom, approve, setApprovalForAll). */
export const ERC721_USEROP_ABI = [
  { type: 'function', name: 'safeTransferFrom', inputs: [
    { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' },
  ], outputs: [] },
  { type: 'function', name: 'approve', inputs: [
    { name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' },
  ], outputs: [] },
  { type: 'function', name: 'setApprovalForAll', inputs: [
    { name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' },
  ], outputs: [] },
] as const;

/** ERC-1155 ABI for NFT UserOp calls (safeTransferFrom, setApprovalForAll). */
export const ERC1155_USEROP_ABI = [
  { type: 'function', name: 'safeTransferFrom', inputs: [
    { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
    { name: 'id', type: 'uint256' }, { name: 'amount', type: 'uint256' }, { name: 'data', type: 'bytes' },
  ], outputs: [] },
  { type: 'function', name: 'setApprovalForAll', inputs: [
    { name: 'operator', type: 'address' }, { name: 'approved', type: 'bool' },
  ], outputs: [] },
] as const;

/**
 * Convert a TransactionRequest to viem's calls[] format for UserOperation submission.
 * Each call is { to, value, data } for the smart account to execute.
 *
 * @param walletAddress - Smart account address (required for NFT_TRANSFER safeTransferFrom 'from' param)
 */
export function buildUserOpCalls(
  request: SendTransactionRequest | TransactionRequest,
  walletAddress?: string,
): Array<{ to: Hex; value: bigint; data: Hex }> {
  const type = ('type' in request && request.type) || 'TRANSFER';

  switch (type) {
    case 'TRANSFER': {
      return [{
        to: getRequestTo(request) as Hex,
        value: BigInt(getRequestAmount(request)),
        data: '0x' as Hex,
      }];
    }

    case 'TOKEN_TRANSFER': {
      const req = request as TokenTransferRequest;
      return [{
        to: req.token.address as Hex,
        value: 0n,
        data: encodeFunctionData({
          abi: ERC20_USEROP_ABI,
          functionName: 'transfer',
          args: [req.to as Hex, BigInt(req.amount!)],
        }),
      }];
    }

    case 'CONTRACT_CALL': {
      const req = request as ContractCallRequest;
      return [{
        to: req.to as Hex,
        value: BigInt(req.value ?? '0'),
        data: (req.calldata || '0x') as Hex,
      }];
    }

    case 'APPROVE': {
      const req = request as ApproveRequest;
      // v31.0: NFT approval routing for Smart Account
      if (req.nft) {
        const approvalType = req.amount === '0' ? 'single' : 'all';
        if (req.nft.standard === 'METAPLEX') {
          throw new WAIaaSError('CHAIN_ERROR', {
            message: 'Smart Account (ERC-4337) does not support Solana METAPLEX NFT approvals',
          });
        }
        if (approvalType === 'single' && req.nft.standard === 'ERC-721') {
          return [{
            to: req.token.address as Hex,
            value: 0n,
            data: encodeFunctionData({
              abi: ERC721_USEROP_ABI,
              functionName: 'approve',
              args: [req.spender as Hex, BigInt(req.nft.tokenId)],
            }),
          }];
        }
        // setApprovalForAll (ERC-721 all / ERC-1155 all)
        const nftAbi = req.nft.standard === 'ERC-721' ? ERC721_USEROP_ABI : ERC1155_USEROP_ABI;
        return [{
          to: req.token.address as Hex,
          value: 0n,
          data: encodeFunctionData({
            abi: nftAbi,
            functionName: 'setApprovalForAll',
            args: [req.spender as Hex, true],
          }),
        }];
      }
      return [{
        to: req.token.address as Hex,
        value: 0n,
        data: encodeFunctionData({
          abi: ERC20_USEROP_ABI,
          functionName: 'approve',
          args: [req.spender as Hex, BigInt(req.amount!)],
        }),
      }];
    }

    case 'BATCH': {
      const req = request as BatchRequest;
      return req.instructions.map((instr) => {
        if ('spender' in instr) {
          // APPROVE instruction
          const a = instr as { spender: string; token: { address: string; decimals: number }; amount: string };
          return {
            to: a.token.address as Hex,
            value: 0n,
            data: encodeFunctionData({
              abi: ERC20_USEROP_ABI,
              functionName: 'approve',
              args: [a.spender as Hex, BigInt(a.amount)],
            }),
          };
        }
        if ('token' in instr) {
          // TOKEN_TRANSFER instruction
          const t = instr as { to: string; amount: string; token: { address: string } };
          return {
            to: t.token.address as Hex,
            value: 0n,
            data: encodeFunctionData({
              abi: ERC20_USEROP_ABI,
              functionName: 'transfer',
              args: [t.to as Hex, BigInt(t.amount)],
            }),
          };
        }
        if ('calldata' in instr) {
          // CONTRACT_CALL instruction (also used by ActionProvider resolve() output)
          const c = instr as { to: string; calldata: string; value?: string };
          return {
            to: c.to as Hex,
            value: BigInt(c.value ?? '0'),
            data: (c.calldata || '0x') as Hex,
          };
        }
        // TRANSFER instruction (native transfer)
        const t = instr as { to: string; amount: string };
        return {
          to: t.to as Hex,
          value: BigInt(t.amount),
          data: '0x' as Hex,
        };
      });
    }

    case 'NFT_TRANSFER': {
      const req = request as NftTransferRequest;
      if (req.token.standard === 'METAPLEX') {
        throw new WAIaaSError('CHAIN_ERROR', {
          message: 'Smart Account (ERC-4337) does not support Solana METAPLEX NFT transfers',
        });
      }
      const from = (walletAddress ?? '0x0000000000000000000000000000000000000000') as Hex;
      if (req.token.standard === 'ERC-721') {
        return [{
          to: req.token.address as Hex,
          value: 0n,
          data: encodeFunctionData({
            abi: ERC721_USEROP_ABI,
            functionName: 'safeTransferFrom',
            args: [from, req.to as Hex, BigInt(req.token.tokenId)],
          }),
        }];
      }
      // ERC-1155
      return [{
        to: req.token.address as Hex,
        value: 0n,
        data: encodeFunctionData({
          abi: ERC1155_USEROP_ABI,
          functionName: 'safeTransferFrom',
          args: [from, req.to as Hex, BigInt(req.token.tokenId), BigInt(req.amount ?? '1'), '0x' as Hex],
        }),
      }];
    }

    case 'CONTRACT_DEPLOY': {
      const req = request as ContractDeployRequest;
      const deployData = req.constructorArgs
        ? req.bytecode + req.constructorArgs.replace(/^0x/, '')
        : req.bytecode;
      // Smart account contract deployment via CREATE2-like pattern
      // to is empty (factory handles deployment), data is full bytecode+args
      return [{
        to: '0x' as Hex, // will be interpreted as factory/self call
        value: BigInt(req.value ?? '0'),
        data: deployData as Hex,
      }];
    }

    default:
      throw new WAIaaSError('CHAIN_ERROR', {
        message: `Unknown transaction type for UserOp: ${type}`,
      });
  }
}

/**
 * Stage 5 smart account path: execute via UserOperation through BundlerClient.
 *
 * Flow:
 * 1. Decrypt signer key -> create LocalAccount via viem's privateKeyToAccount
 * 2. Create SmartAccount instance via SmartAccountService
 * 3. Create BundlerClient via createSmartAccountBundlerClient
 * 4. Build calls[] from request via buildUserOpCalls
 * 5. prepareUserOperation -> apply 120% gas safety margin
 * 6. sendUserOperation -> waitForUserOperationReceipt
 * 7. Update DB: SUBMITTED -> CONFIRMED, update deployed status if needed
 *
 * Error mapping:
 * - Paymaster rejection (message contains 'paymaster'/'PM_') -> PAYMASTER_REJECTED
 * - UserOperationReverted -> TRANSACTION_REVERTED
 * - Receipt timeout -> TRANSACTION_TIMEOUT
 * - Other -> CHAIN_ERROR
 */
async function stage5ExecuteSmartAccount(ctx: PipelineContext): Promise<void> {
  // Check for deprecated Solady factory before proceeding
  if (ctx.wallet.factoryAddress?.toLowerCase() === SOLADY_FACTORY_ADDRESS.toLowerCase()) {
    throw new WAIaaSError('DEPRECATED_SMART_ACCOUNT');
  }

  const reqAmount = formatNotificationAmount(ctx.request, ctx.wallet.chain);

  const displayAmount = await resolveDisplayAmount(
    ctx.amountUsd ?? null, ctx.settingsService, ctx.forexRateService,
  );

  // Build calls[] from request (pass wallet address for NFT safeTransferFrom 'from' param)
  const calls = buildUserOpCalls(ctx.request, ctx.wallet.publicKey);

  // CRITICAL: key MUST be released in finally block
  let privateKey: Uint8Array | null = null;
  try {
    // Step 1: Decrypt signer key
    privateKey = await ctx.keyStore.decryptPrivateKey(ctx.walletId, ctx.masterPassword);
    const hexKey = toHex(privateKey);
    const localAccount = privateKeyToAccount(hexKey as Hex);

    // Step 2: Create SmartAccount via SmartAccountService
    const smartAccountService = new SmartAccountService();
    // #251: Resolve viem Chain from EVM_CHAIN_MAP using network ID
    const { EVM_CHAIN_MAP } = await import('@waiaas/adapter-evm');
    const chainEntry = EVM_CHAIN_MAP[ctx.resolvedNetwork as import('@waiaas/core').EvmNetworkType];
    const publicClient = createPublicClient({
      chain: chainEntry?.viemChain,
      transport: http(ctx.resolvedRpcUrl),
    }) as unknown as import('viem').PublicClient;
    const smartAccountInfo = await smartAccountService.createSmartAccount({
      owner: localAccount,
      client: publicClient,
    });

    // Step 3: Create BundlerClient from wallet's provider data (v30.9)
    const decryptedApiKey = ctx.wallet.aaProviderApiKeyEncrypted
      ? decryptProviderApiKey(ctx.wallet.aaProviderApiKeyEncrypted, ctx.masterPassword)
      : null;
    const walletProvider: WalletProviderData = {
      aaProvider: (ctx.wallet.aaProvider as WalletProviderData['aaProvider']) ?? null,
      aaProviderApiKey: decryptedApiKey,
      aaBundlerUrl: ctx.wallet.aaBundlerUrl ?? null,
      aaPaymasterUrl: ctx.wallet.aaPaymasterUrl ?? null,
      aaPaymasterPolicyId: ctx.wallet.aaPaymasterPolicyId ?? null,
    };
    // BundlerClient type from viem uses strict generic inference that requires
    // explicit account in each call. We cast to a focused interface since account
    // is already set in the client factory.
    type BundlerOps = {
      prepareUserOperation(args: { calls: { to: import('viem').Hex; value: bigint; data: import('viem').Hex }[] }): Promise<{ callGasLimit: bigint; verificationGasLimit: bigint; preVerificationGas: bigint }>;
      sendUserOperation(args: { calls: { to: import('viem').Hex; value: bigint; data: import('viem').Hex }[]; userOperation?: { callGasLimit: bigint; verificationGasLimit: bigint; preVerificationGas: bigint } }): Promise<string>;
      waitForUserOperationReceipt(args: { hash: string; timeout?: number }): Promise<{ receipt?: { transactionHash?: string } }>;
    };
    const bundlerClient = createSmartAccountBundlerClient({
      client: publicClient,
      account: smartAccountInfo.account,
      networkId: ctx.resolvedNetwork,
      walletProvider,
      settingsService: ctx.settingsService,
    }) as unknown as BundlerOps;

    // Step 4: Prepare UserOperation to get gas estimates
    const prepared = await bundlerClient.prepareUserOperation({ calls });

    // Step 5: Apply 120% gas safety margin per CLAUDE.md rule
    const safeCallGasLimit = (BigInt(prepared.callGasLimit) * GAS_SAFETY_NUMERATOR) / GAS_SAFETY_DENOMINATOR;
    const safeVerificationGasLimit = (BigInt(prepared.verificationGasLimit) * GAS_SAFETY_NUMERATOR) / GAS_SAFETY_DENOMINATOR;
    const safePreVerificationGas = (BigInt(prepared.preVerificationGas) * GAS_SAFETY_NUMERATOR) / GAS_SAFETY_DENOMINATOR;

    // Step 6: Submit UserOperation with overridden gas limits
    ctx.metricsCounter?.increment('rpc.calls', { network: ctx.resolvedNetwork });
    const userOpHash = await bundlerClient.sendUserOperation({
      calls,
      userOperation: {
        callGasLimit: safeCallGasLimit,
        verificationGasLimit: safeVerificationGasLimit,
        preVerificationGas: safePreVerificationGas,
      },
    });

    ctx.metricsCounter?.increment('tx.submitted', { network: ctx.resolvedNetwork });

    // Update DB: SUBMITTED with userOpHash
    await ctx.db
      .update(transactions)
      .set({ status: 'SUBMITTED', txHash: userOpHash })
      .where(eq(transactions.id, ctx.txId));

    // Audit log: TX_SUBMITTED
    if (ctx.sqlite) {
      insertAuditLog(ctx.sqlite, {
        eventType: 'TX_SUBMITTED',
        actor: ctx.sessionId ?? 'system',
        walletId: ctx.walletId,
        txId: ctx.txId,
        details: {
          txHash: userOpHash,
          chain: ctx.wallet.chain,
          network: ctx.resolvedNetwork,
          type: ('type' in ctx.request && ctx.request.type) ? ctx.request.type : 'TRANSFER',
          accountType: 'smart',
        },
        severity: 'info',
      });
    }

    // Notify TX_SUBMITTED
    void ctx.notificationService?.notify('TX_SUBMITTED', ctx.walletId, {
      txId: ctx.txId,
      txHash: userOpHash,
      amount: reqAmount,
      to: resolveNotificationTo(ctx.request, ctx.resolvedNetwork, ctx.contractNameRegistry),
      display_amount: displayAmount,
      network: ctx.resolvedNetwork,
    }, { txId: ctx.txId });

    // Emit wallet:activity
    ctx.eventBus?.emit('wallet:activity', {
      walletId: ctx.walletId,
      activity: 'TX_SUBMITTED',
      details: { txId: ctx.txId, txHash: userOpHash },
      timestamp: Math.floor(Date.now() / 1000),
    });

    // Step 7: Wait for UserOperation receipt (120s timeout)
    const receipt = await bundlerClient.waitForUserOperationReceipt({
      hash: userOpHash,
      timeout: 120_000,
    });

    const txHash = receipt?.receipt?.transactionHash ?? userOpHash;

    // Update DB: CONFIRMED with actual txHash
    await ctx.db
      .update(transactions)
      .set({ status: 'CONFIRMED', txHash })
      .where(eq(transactions.id, ctx.txId));

    // Update deployed status if this was first UserOp (lazy deployment)
    const walletRow = ctx.db.select().from(wallets).where(eq(wallets.id, ctx.walletId)).get();
    if (walletRow && !walletRow.deployed) {
      ctx.db.update(wallets).set({ deployed: true }).where(eq(wallets.id, ctx.walletId)).run();
    }

    ctx.metricsCounter?.increment('tx.confirmed', { network: ctx.resolvedNetwork });

    // Store submitResult for Stage 6
    ctx.submitResult = { txHash, status: 'confirmed' as const };

    // Audit log: TX_CONFIRMED
    if (ctx.sqlite) {
      insertAuditLog(ctx.sqlite, {
        eventType: 'TX_CONFIRMED',
        actor: ctx.sessionId ?? 'system',
        walletId: ctx.walletId,
        txId: ctx.txId,
        details: {
          txHash,
          chain: ctx.wallet.chain,
          network: ctx.resolvedNetwork,
          accountType: 'smart',
        },
        severity: 'info',
      });
    }

    // Notify TX_CONFIRMED
    void ctx.notificationService?.notify('TX_CONFIRMED', ctx.walletId, {
      txId: ctx.txId,
      txHash,
      amount: reqAmount,
      to: resolveNotificationTo(ctx.request, ctx.resolvedNetwork, ctx.contractNameRegistry),
      display_amount: displayAmount,
      network: ctx.resolvedNetwork,
    }, { txId: ctx.txId });

    // Emit transaction:completed event
    ctx.eventBus?.emit('transaction:completed', {
      walletId: ctx.walletId,
      txId: ctx.txId,
      txHash,
      network: ctx.resolvedNetwork,
      type: ('type' in ctx.request && ctx.request.type) ? ctx.request.type : 'TRANSFER',
      timestamp: Math.floor(Date.now() / 1000),
    });

  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errName = err instanceof Error ? err.name : '';

    // Already a WAIaaSError? (e.g., CHAIN_ERROR from bundler URL not configured)
    if (err instanceof WAIaaSError) {
      // Update DB to FAILED
      await ctx.db
        .update(transactions)
        .set({ status: 'FAILED', error: errMsg })
        .where(eq(transactions.id, ctx.txId));

      ctx.metricsCounter?.increment('tx.failed', { network: ctx.resolvedNetwork });

      void ctx.notificationService?.notify('TX_FAILED', ctx.walletId, {
        txId: ctx.txId,
        error: errMsg,
        amount: reqAmount,
        display_amount: displayAmount,
        network: ctx.resolvedNetwork,
      }, { txId: ctx.txId });

      ctx.eventBus?.emit('transaction:failed', {
        walletId: ctx.walletId,
        txId: ctx.txId,
        error: errMsg,
        network: ctx.resolvedNetwork,
        type: ('type' in ctx.request && ctx.request.type) ? ctx.request.type : 'TRANSFER',
        timestamp: Math.floor(Date.now() / 1000),
      });

      throw err;
    }

    // Paymaster rejection detection
    if (
      errMsg.toLowerCase().includes('paymaster') ||
      errMsg.includes('PM_') ||
      errName.includes('Paymaster')
    ) {
      await ctx.db
        .update(transactions)
        .set({ status: 'FAILED', error: `Paymaster rejected: ${errMsg}` })
        .where(eq(transactions.id, ctx.txId));

      ctx.metricsCounter?.increment('tx.failed', { network: ctx.resolvedNetwork });

      if (ctx.sqlite) {
        insertAuditLog(ctx.sqlite, {
          eventType: 'TX_FAILED',
          actor: ctx.sessionId ?? 'system',
          walletId: ctx.walletId,
          txId: ctx.txId,
          details: { error: errMsg, stage: 5, reason: 'paymaster_rejected' },
          severity: 'warning',
        });
      }

      void ctx.notificationService?.notify('TX_FAILED', ctx.walletId, {
        txId: ctx.txId,
        error: `Paymaster rejected: ${errMsg}`,
        amount: reqAmount,
        display_amount: displayAmount,
        network: ctx.resolvedNetwork,
      }, { txId: ctx.txId });

      ctx.eventBus?.emit('transaction:failed', {
        walletId: ctx.walletId,
        txId: ctx.txId,
        error: `Paymaster rejected: ${errMsg}`,
        network: ctx.resolvedNetwork,
        type: ('type' in ctx.request && ctx.request.type) ? ctx.request.type : 'TRANSFER',
        timestamp: Math.floor(Date.now() / 1000),
      });

      throw new WAIaaSError('PAYMASTER_REJECTED', {
        message: `Paymaster rejected the UserOperation: ${errMsg}`,
      });
    }

    // UserOperationReverted
    if (errName === 'UserOperationReverted' || errMsg.includes('UserOperation reverted')) {
      await ctx.db
        .update(transactions)
        .set({ status: 'FAILED', error: errMsg })
        .where(eq(transactions.id, ctx.txId));

      ctx.metricsCounter?.increment('tx.failed', { network: ctx.resolvedNetwork });

      if (ctx.sqlite) {
        insertAuditLog(ctx.sqlite, {
          eventType: 'TX_FAILED',
          actor: ctx.sessionId ?? 'system',
          walletId: ctx.walletId,
          txId: ctx.txId,
          details: { error: errMsg, stage: 5, reason: 'user_op_reverted' },
          severity: 'warning',
        });
      }

      void ctx.notificationService?.notify('TX_FAILED', ctx.walletId, {
        txId: ctx.txId,
        error: errMsg,
        amount: reqAmount,
        display_amount: displayAmount,
        network: ctx.resolvedNetwork,
      }, { txId: ctx.txId });

      ctx.eventBus?.emit('transaction:failed', {
        walletId: ctx.walletId,
        txId: ctx.txId,
        error: errMsg,
        network: ctx.resolvedNetwork,
        type: ('type' in ctx.request && ctx.request.type) ? ctx.request.type : 'TRANSFER',
        timestamp: Math.floor(Date.now() / 1000),
      });

      throw new WAIaaSError('TRANSACTION_REVERTED', {
        message: errMsg,
      });
    }

    // Receipt timeout
    if (errName === 'WaitForUserOperationReceiptTimeoutError' || errMsg.includes('timed out')) {
      await ctx.db
        .update(transactions)
        .set({ status: 'FAILED', error: `UserOp receipt timeout: ${errMsg}` })
        .where(eq(transactions.id, ctx.txId));

      ctx.metricsCounter?.increment('tx.failed', { network: ctx.resolvedNetwork });

      if (ctx.sqlite) {
        insertAuditLog(ctx.sqlite, {
          eventType: 'TX_FAILED',
          actor: ctx.sessionId ?? 'system',
          walletId: ctx.walletId,
          txId: ctx.txId,
          details: { error: errMsg, stage: 5, reason: 'user_op_timeout' },
          severity: 'warning',
        });
      }

      void ctx.notificationService?.notify('TX_FAILED', ctx.walletId, {
        txId: ctx.txId,
        error: `Receipt timeout: ${errMsg}`,
        amount: reqAmount,
        display_amount: displayAmount,
        network: ctx.resolvedNetwork,
      }, { txId: ctx.txId });

      ctx.eventBus?.emit('transaction:failed', {
        walletId: ctx.walletId,
        txId: ctx.txId,
        error: `Receipt timeout: ${errMsg}`,
        network: ctx.resolvedNetwork,
        type: ('type' in ctx.request && ctx.request.type) ? ctx.request.type : 'TRANSFER',
        timestamp: Math.floor(Date.now() / 1000),
      });

      throw new WAIaaSError('TRANSACTION_TIMEOUT', {
        message: `UserOperation receipt timed out: ${errMsg}`,
      });
    }

    // Generic fallback
    await ctx.db
      .update(transactions)
      .set({ status: 'FAILED', error: errMsg })
      .where(eq(transactions.id, ctx.txId));

    ctx.metricsCounter?.increment('tx.failed', { network: ctx.resolvedNetwork });

    void ctx.notificationService?.notify('TX_FAILED', ctx.walletId, {
      txId: ctx.txId,
      error: errMsg,
      amount: reqAmount,
      display_amount: displayAmount,
      network: ctx.resolvedNetwork,
    }, { txId: ctx.txId });

    ctx.eventBus?.emit('transaction:failed', {
      walletId: ctx.walletId,
      txId: ctx.txId,
      error: errMsg,
      network: ctx.resolvedNetwork,
      type: ('type' in ctx.request && ctx.request.type) ? ctx.request.type : 'TRANSFER',
      timestamp: Math.floor(Date.now() / 1000),
    });

    throw new WAIaaSError('CHAIN_ERROR', { message: errMsg });

  } finally {
    if (privateKey) {
      ctx.keyStore.releaseKey(privateKey);
    }
  }
}

// ---------------------------------------------------------------------------
// Stage 5: On-chain execution (CONC-01 retry loop)
// ---------------------------------------------------------------------------

/**
 * Stage 5: Build -> Simulate -> Sign -> Submit with CONC-01 retry logic.
 *
 * For smart accounts (accountType === 'smart'), delegates to stage5ExecuteSmartAccount
 * which uses the UserOperation pipeline (BundlerClient + PaymasterClient).
 *
 * For EOA accounts, uses the existing buildByType -> simulate -> sign -> submit path.
 *
 * ChainError category-based retry:
 * - PERMANENT: immediate FAILED, no retry
 * - TRANSIENT: exponential backoff (1s, 2s, 4s), max 3 retries (retryCount >= 3 guard)
 * - STALE: rebuild from Stage 5a, max 1 (retryCount >= 1 guard)
 *
 * retryCount is shared between TRANSIENT and STALE to limit total retry count.
 * Total attempts: initial 1 + up to 3 retries = 4 max.
 */
export async function stage5Execute(ctx: PipelineContext): Promise<void> {
  // Smart account UserOperation path
  if (ctx.wallet.accountType === 'smart') {
    await stage5ExecuteSmartAccount(ctx);
    return;
  }

  // v31.4: ApiDirectResult path -- skip on-chain execution entirely (HDESIGN-01)
  if (ctx.actionResult) {
    const result = ctx.actionResult;
    // Update transaction status to CONFIRMED with API direct result metadata
    await ctx.db
      .update(transactions)
      .set({
        status: 'CONFIRMED',
        metadata: JSON.stringify({
          apiDirect: true,
          provider: result.provider,
          action: result.action,
          externalId: result.externalId,
          resultStatus: result.status,
          data: result.data,
          ...(result.metadata ?? {}),
        }),
      })
      .where(eq(transactions.id, ctx.txId));

    // Audit log: TX_CONFIRMED (API direct)
    if (ctx.sqlite) {
      insertAuditLog(ctx.sqlite, {
        eventType: 'TX_CONFIRMED',
        actor: ctx.sessionId ?? 'system',
        walletId: ctx.walletId,
        txId: ctx.txId,
        details: {
          provider: result.provider,
          action: result.action,
          externalId: result.externalId,
          apiDirect: true,
          chain: ctx.wallet.chain,
          network: ctx.resolvedNetwork,
        },
        severity: 'info',
      });
    }

    // Fire-and-forget: notify TX_CONFIRMED
    const apiDirectAmount = formatNotificationAmount(ctx.request, ctx.wallet.chain);
    const apiDirectDisplayAmount = await resolveDisplayAmount(
      ctx.amountUsd ?? null, ctx.settingsService, ctx.forexRateService,
    );
    void ctx.notificationService?.notify('TX_CONFIRMED', ctx.walletId, {
      txId: ctx.txId,
      provider: result.provider,
      action: result.action,
      externalId: result.externalId,
      network: ctx.resolvedNetwork,
      amount: apiDirectAmount,
      to: resolveNotificationTo(ctx.request, ctx.resolvedNetwork, ctx.contractNameRegistry),
      display_amount: apiDirectDisplayAmount,
    }, { txId: ctx.txId });

    // Emit transaction:completed event (txHash = externalId for API direct)
    ctx.eventBus?.emit('transaction:completed', {
      walletId: ctx.walletId,
      txId: ctx.txId,
      txHash: result.externalId,
      network: ctx.resolvedNetwork,
      type: 'CONTRACT_CALL',
      timestamp: Math.floor(Date.now() / 1000),
    });

    // Increment metrics
    ctx.metricsCounter?.increment('tx.completed', { network: ctx.resolvedNetwork });

    return; // Skip on-chain execution
  }

  // --- EOA execution path (unchanged) ---
  const reqAmount = formatNotificationAmount(ctx.request, ctx.wallet.chain);

  // [Phase 139] Resolve display amount once for all Stage 5 notifications
  const displayAmount = await resolveDisplayAmount(
    ctx.amountUsd ?? null, ctx.settingsService, ctx.forexRateService,
  );

  let retryCount = 0;

  // Outer buildLoop: STALE errors return here to rebuild from Stage 5a

  buildLoop: while (true) {
    try {
      // Stage 5a: Build unsigned transaction (type-routed)
      ctx.unsignedTx = await buildByType(ctx.adapter, ctx.request, ctx.wallet.publicKey);

      // Stage 5b: Simulate (with RPC metrics)
      const simStart = Date.now();
      ctx.metricsCounter?.increment('rpc.calls', { network: ctx.resolvedNetwork });
      const simResult = await ctx.adapter.simulateTransaction(ctx.unsignedTx);
      ctx.metricsCounter?.recordLatency('rpc.latency', Date.now() - simStart, { network: ctx.resolvedNetwork });
      if (!simResult.success) {
        ctx.metricsCounter?.increment('rpc.errors', { network: ctx.resolvedNetwork });
        ctx.metricsCounter?.increment('tx.failed', { network: ctx.resolvedNetwork });
        await ctx.db
          .update(transactions)
          .set({ status: 'FAILED', error: simResult.error ?? 'Simulation failed' })
          .where(eq(transactions.id, ctx.txId));

        // Audit log: TX_FAILED (simulation failure)
        if (ctx.sqlite) {
          insertAuditLog(ctx.sqlite, {
            eventType: 'TX_FAILED',
            actor: ctx.sessionId ?? 'system',
            walletId: ctx.walletId,
            txId: ctx.txId,
            details: { error: simResult.error ?? 'Simulation failed', stage: 5, chain: ctx.wallet.chain, network: ctx.resolvedNetwork },
            severity: 'warning',
          });
        }

        // Fire-and-forget: notify TX_FAILED on simulation failure
        void ctx.notificationService?.notify('TX_FAILED', ctx.walletId, {
          txId: ctx.txId,
          error: simResult.error ?? 'Simulation failed',
          amount: reqAmount,
          display_amount: displayAmount,
          network: ctx.resolvedNetwork,
        }, { txId: ctx.txId });

        // v1.6: emit transaction:failed event (simulation failure)
        ctx.eventBus?.emit('transaction:failed', {
          walletId: ctx.walletId,
          txId: ctx.txId,
          error: simResult.error ?? 'Simulation failed',
          network: ctx.resolvedNetwork,
          type: ('type' in ctx.request && ctx.request.type) ? ctx.request.type : 'TRANSFER',
          timestamp: Math.floor(Date.now() / 1000),
        });

        throw new WAIaaSError('SIMULATION_FAILED', {
          message: simResult.error ?? 'Transaction simulation failed',
        });
      }

      // Stage 5c: Decrypt private key, sign
      // CRITICAL: key MUST be released in finally block
      let privateKey: Uint8Array | null = null;
      try {
        privateKey = await ctx.keyStore.decryptPrivateKey(ctx.walletId, ctx.masterPassword);
        ctx.signedTx = await ctx.adapter.signTransaction(ctx.unsignedTx, privateKey);
      } finally {
        if (privateKey) {
          ctx.keyStore.releaseKey(privateKey);
        }
      }

      // Stage 5d: Submit (with RPC metrics)
      const submitStart = Date.now();
      ctx.metricsCounter?.increment('rpc.calls', { network: ctx.resolvedNetwork });
      ctx.submitResult = await ctx.adapter.submitTransaction(ctx.signedTx);
      ctx.metricsCounter?.recordLatency('rpc.latency', Date.now() - submitStart, { network: ctx.resolvedNetwork });

      // Success: increment tx.submitted counter
      ctx.metricsCounter?.increment('tx.submitted', { network: ctx.resolvedNetwork });

      // Success: Update DB SUBMITTED + txHash
      await ctx.db
        .update(transactions)
        .set({ status: 'SUBMITTED', txHash: ctx.submitResult.txHash })
        .where(eq(transactions.id, ctx.txId));

      // Audit log: TX_SUBMITTED
      if (ctx.sqlite) {
        const txType = ('type' in ctx.request && ctx.request.type) ? ctx.request.type : 'TRANSFER';
        const auditDetails: Record<string, unknown> = {
          txHash: ctx.submitResult.txHash,
          chain: ctx.wallet.chain,
          network: ctx.resolvedNetwork,
          type: txType,
        };
        // v31.14 DEPL-06: log keccak256(bytecode) for CONTRACT_DEPLOY audit trail
        if (txType === 'CONTRACT_DEPLOY' && 'bytecode' in ctx.request) {
          const { keccak256, toBytes } = await import('viem');
          auditDetails.bytecodeHash = keccak256(toBytes((ctx.request as ContractDeployRequest).bytecode as `0x${string}`));
        }
        insertAuditLog(ctx.sqlite, {
          eventType: 'TX_SUBMITTED',
          actor: ctx.sessionId ?? 'system',
          walletId: ctx.walletId,
          txId: ctx.txId,
          details: auditDetails,
          severity: 'info',
        });
      }

      // Fire-and-forget: notify TX_SUBMITTED
      void ctx.notificationService?.notify('TX_SUBMITTED', ctx.walletId, {
        txId: ctx.txId,
        txHash: ctx.submitResult.txHash,
        amount: reqAmount,
        to: resolveNotificationTo(ctx.request, ctx.resolvedNetwork, ctx.contractNameRegistry),
        display_amount: displayAmount,
        network: ctx.resolvedNetwork,
      }, { txId: ctx.txId });

      // v1.6: emit wallet:activity TX_SUBMITTED event
      ctx.eventBus?.emit('wallet:activity', {
        walletId: ctx.walletId,
        activity: 'TX_SUBMITTED',
        details: { txId: ctx.txId, txHash: ctx.submitResult.txHash },
        timestamp: Math.floor(Date.now() / 1000),
      });

      return; // Success -- exit the loop

    } catch (err) {
      // Non-ChainError: rethrow as-is (WAIaaSError, validation errors, etc.)
      if (!(err instanceof ChainError)) {
        throw err;
      }

      // ChainError: category-based retry logic
      switch (err.category) {
        case 'PERMANENT': {
          // Immediate failure, no retry
          ctx.metricsCounter?.increment('rpc.errors', { network: ctx.resolvedNetwork });
          ctx.metricsCounter?.increment('tx.failed', { network: ctx.resolvedNetwork });
          await ctx.db
            .update(transactions)
            .set({ status: 'FAILED', error: err.message })
            .where(eq(transactions.id, ctx.txId));

          // Audit log: TX_FAILED (permanent chain error)
          if (ctx.sqlite) {
            insertAuditLog(ctx.sqlite, {
              eventType: 'TX_FAILED',
              actor: ctx.sessionId ?? 'system',
              walletId: ctx.walletId,
              txId: ctx.txId,
              details: { error: err.message, stage: 5, chain: ctx.wallet.chain, network: ctx.resolvedNetwork },
              severity: 'warning',
            });
          }

          // Fire-and-forget: notify TX_FAILED
          void ctx.notificationService?.notify('TX_FAILED', ctx.walletId, {
            txId: ctx.txId,
            error: err.message,
            amount: reqAmount,
            display_amount: displayAmount,
            network: ctx.resolvedNetwork,
          }, { txId: ctx.txId });

          // v1.6: emit transaction:failed event (permanent chain error)
          ctx.eventBus?.emit('transaction:failed', {
            walletId: ctx.walletId,
            txId: ctx.txId,
            error: err.message,
            network: ctx.resolvedNetwork,
            type: ('type' in ctx.request && ctx.request.type) ? ctx.request.type : 'TRANSFER',
            timestamp: Math.floor(Date.now() / 1000),
          });

          throw new WAIaaSError('CHAIN_ERROR', {
            message: err.message,
            cause: err,
          });
        }

        case 'TRANSIENT': {
          ctx.metricsCounter?.increment('rpc.errors', { network: ctx.resolvedNetwork });
          if (retryCount >= 3) {
            // Max retries exhausted
            ctx.metricsCounter?.increment('tx.failed', { network: ctx.resolvedNetwork });
            await ctx.db
              .update(transactions)
              .set({ status: 'FAILED', error: `${err.code} (max retries exceeded)` })
              .where(eq(transactions.id, ctx.txId));

            // Fire-and-forget: notify TX_FAILED
            void ctx.notificationService?.notify('TX_FAILED', ctx.walletId, {
              txId: ctx.txId,
              error: `${err.code} (max retries exceeded)`,
              amount: reqAmount,
              display_amount: displayAmount,
              network: ctx.resolvedNetwork,
            }, { txId: ctx.txId });

            // v1.6: emit transaction:failed event (transient max retries)
            ctx.eventBus?.emit('transaction:failed', {
              walletId: ctx.walletId,
              txId: ctx.txId,
              error: `${err.code} (max retries exceeded)`,
              network: ctx.resolvedNetwork,
              type: ('type' in ctx.request && ctx.request.type) ? ctx.request.type : 'TRANSFER',
              timestamp: Math.floor(Date.now() / 1000),
            });

            throw new WAIaaSError('CHAIN_ERROR', {
              message: `${err.message} (max retries exceeded)`,
              cause: err,
            });
          }

          // Exponential backoff: 1s, 2s, 4s
          await sleep(1000 * Math.pow(2, retryCount));
          retryCount++;
          continue buildLoop; // Retry from Stage 5a (rebuild)
        }

        case 'STALE': {
          ctx.metricsCounter?.increment('rpc.errors', { network: ctx.resolvedNetwork });
          if (retryCount >= 1) {
            // Stale retry exhausted (shared retryCount)
            ctx.metricsCounter?.increment('tx.failed', { network: ctx.resolvedNetwork });
            await ctx.db
              .update(transactions)
              .set({ status: 'FAILED', error: `${err.code} (stale retry exhausted)` })
              .where(eq(transactions.id, ctx.txId));

            // Fire-and-forget: notify TX_FAILED
            void ctx.notificationService?.notify('TX_FAILED', ctx.walletId, {
              txId: ctx.txId,
              error: `${err.code} (stale retry exhausted)`,
              amount: reqAmount,
              display_amount: displayAmount,
              network: ctx.resolvedNetwork,
            }, { txId: ctx.txId });

            // v1.6: emit transaction:failed event (stale retry exhausted)
            ctx.eventBus?.emit('transaction:failed', {
              walletId: ctx.walletId,
              txId: ctx.txId,
              error: `${err.code} (stale retry exhausted)`,
              network: ctx.resolvedNetwork,
              type: ('type' in ctx.request && ctx.request.type) ? ctx.request.type : 'TRANSFER',
              timestamp: Math.floor(Date.now() / 1000),
            });

            throw new WAIaaSError('CHAIN_ERROR', {
              message: `${err.message} (stale retry exhausted)`,
              cause: err,
            });
          }

          // Rebuild from Stage 5a with new blockhash/nonce
          retryCount++;
          continue buildLoop;
        }

        default: {
          // Unknown category: treat as permanent
          await ctx.db
            .update(transactions)
            .set({ status: 'FAILED', error: err.message })
            .where(eq(transactions.id, ctx.txId));

          throw new WAIaaSError('CHAIN_ERROR', {
            message: err.message,
            cause: err,
          });
        }
      }
    }
  }
}
