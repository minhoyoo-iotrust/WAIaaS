/**
 * HyperliquidSubAccountProvider: IActionProvider wrapper for sub-account management.
 *
 * Thin wrapper around HyperliquidSubAccountService that integrates with the
 * 6-stage pipeline for policy evaluation (spending limits on transfers).
 *
 * Actions:
 * - hl_create_sub_account: Create a new sub-account (medium, DELAY, $0 spending)
 * - hl_sub_transfer: Transfer USDC between master and sub-account (medium, DELAY)
 *
 * @see HDESIGN-04: Sub-account mapping model
 * @see HDESIGN-07: Policy evaluation table
 */
import type {
  IActionProvider,
  ActionProviderMetadata,
  ActionDefinition,
  ActionContext,
  ApiDirectResult,
} from '@waiaas/core';
import type { Hex } from 'viem';
import { parseTokenAmount } from '../../common/amount-parser.js';
import type { HyperliquidSubAccountService } from './sub-account-service.js';
import {
  HlCreateSubAccountInputSchema,
  HlSubTransferInputSchema,
} from './schemas.js';

// ---------------------------------------------------------------------------
// HyperliquidSubAccountProvider
// ---------------------------------------------------------------------------

export class HyperliquidSubAccountProvider implements IActionProvider {
  readonly metadata: ActionProviderMetadata;
  readonly actions: readonly ActionDefinition[];

  constructor(
    private readonly service: HyperliquidSubAccountService,
  ) {
    this.metadata = {
      name: 'hyperliquid_sub',
      description: 'Hyperliquid sub-account management: create sub-accounts and transfer USDC',
      version: '1.0.0',
      chains: ['ethereum'],
      mcpExpose: true,
      requiresApiKey: false,
      requiredApis: [],
      requiresSigningKey: true,
    };

    this.actions = [
      {
        name: 'hl_create_sub_account',
        description: 'Create a new Hyperliquid sub-account',
        chain: 'ethereum',
        inputSchema: HlCreateSubAccountInputSchema,
        riskLevel: 'medium',
        defaultTier: 'DELAY',
      },
      {
        name: 'hl_sub_transfer',
        description: 'Transfer USDC between master account and sub-account',
        chain: 'ethereum',
        inputSchema: HlSubTransferInputSchema,
        riskLevel: 'medium',
        defaultTier: 'DELAY',
      },
    ];
  }

  getSpendingAmount(
    actionName: string,
    params: Record<string, unknown>,
  ): { amount: bigint; asset: string } {
    switch (actionName) {
      case 'hl_create_sub_account':
        return { amount: 0n, asset: 'USDC' };
      case 'hl_sub_transfer': {
        const raw = String(params.amount ?? '0');
        return {
          amount: raw === '0' || !params.amount ? 0n : parseTokenAmount(raw, 6),
          asset: 'USDC',
        };
      }
      default:
        return { amount: 0n, asset: 'USDC' };
    }
  }

  async resolve(
    actionName: string,
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ApiDirectResult> {
    const privateKey = context.privateKey as Hex;

    switch (actionName) {
      case 'hl_create_sub_account': {
        const name = params.name as string;
        const result = await this.service.createSubAccount(name, privateKey);
        return {
          __apiDirect: true,
          externalId: result.subAccountAddress || 'pending',
          status: 'success',
          provider: 'hyperliquid_sub',
          action: 'hl_create_sub_account',
          data: { subAccountAddress: result.subAccountAddress },
          metadata: { name },
        };
      }

      case 'hl_sub_transfer': {
        const subAccount = params.subAccount as string;
        const amount = params.amount as string;
        const isDeposit = params.isDeposit as boolean;
        const response = await this.service.transfer({
          subAccountAddress: subAccount,
          amount,
          isDeposit,
          privateKey,
        });
        return {
          __apiDirect: true,
          externalId: `sub-transfer-${Date.now()}`,
          status: response.status === 'ok' ? 'success' : 'partial',
          provider: 'hyperliquid_sub',
          action: 'hl_sub_transfer',
          data: { response },
          metadata: {
            subAccount,
            amount,
            direction: isDeposit ? 'master_to_sub' : 'sub_to_master',
          },
        };
      }

      default:
        throw new Error(`Unknown action: ${actionName}`);
    }
  }
}
