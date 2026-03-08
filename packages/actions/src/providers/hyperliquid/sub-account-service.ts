/**
 * HyperliquidSubAccountService: Sub-account lifecycle management.
 *
 * Handles sub-account creation, listing, USDC transfers, and position queries.
 * Uses User-Signed Actions (EIP-712) for create and transfer operations.
 *
 * This is a standalone service (not IActionProvider). Sub-account write actions
 * are wrapped by HyperliquidSubAccountProvider for pipeline policy enforcement.
 *
 * @see HDESIGN-04: Sub-account mapping model
 * @see HDESIGN-07: Policy engine (sub-account transfer = medium risk)
 */
import { ChainError } from '@waiaas/core';
import type { Hex } from 'viem';
import type { HyperliquidExchangeClient } from './exchange-client.js';
import type { HyperliquidMarketData } from './market-data.js';
import { HyperliquidSigner } from './signer.js';
import { HL_ERRORS } from './config.js';
import type {
  ExchangeResponse,
  Position,
  SubAccountInfo,
} from './schemas.js';

// ---------------------------------------------------------------------------
// HyperliquidSubAccountService
// ---------------------------------------------------------------------------

export class HyperliquidSubAccountService {
  constructor(
    private readonly client: HyperliquidExchangeClient,
    private readonly marketData: HyperliquidMarketData,
    private readonly isMainnet: boolean,
  ) {}

  /**
   * Create a new Hyperliquid sub-account.
   *
   * Signs a CreateSubAccount user-signed action and submits to the exchange.
   * Returns the sub-account address from the API response.
   */
  async createSubAccount(
    name: string,
    privateKey: Hex,
  ): Promise<{ subAccountAddress: string }> {
    const timestamp = Date.now();
    const hyperliquidChain = this.isMainnet ? 'Mainnet' : 'Testnet';

    const action = { hyperliquidChain, name, time: timestamp };
    const signature = await HyperliquidSigner.signUserSignedAction(
      'CreateSubAccount',
      action,
      this.isMainnet,
      privateKey,
    );

    try {
      const response = await this.client.exchange({
        action: { type: 'createSubAccount', name },
        nonce: timestamp,
        signature,
      });

      // Extract sub-account address from response
      const data = response.response?.data as
        | { subAccountUser?: string }
        | undefined;
      const subAccountAddress = data?.subAccountUser ?? '';

      return { subAccountAddress };
    } catch (err) {
      if (err instanceof ChainError) throw err;
      throw new ChainError(HL_ERRORS.API_ERROR, 'HYPERLIQUID', {
        message: `Failed to create sub-account: ${(err as Error).message}`,
      });
    }
  }

  /**
   * Transfer USDC between master and sub-account.
   *
   * @param params.subAccountAddress - Sub-account hex address
   * @param params.amount - Decimal string amount (e.g., "1000.50")
   * @param params.isDeposit - true = master -> sub, false = sub -> master
   * @param params.privateKey - Master wallet private key
   */
  async transfer(params: {
    subAccountAddress: string;
    amount: string;
    isDeposit: boolean;
    privateKey: Hex;
  }): Promise<ExchangeResponse> {
    const { subAccountAddress, amount, isDeposit, privateKey } = params;
    const timestamp = Date.now();
    const hyperliquidChain = this.isMainnet ? 'Mainnet' : 'Testnet';

    // Hyperliquid SubAccountTransfer usd field is in raw units (1 USDC = 1e6)
    const usd = Math.round(parseFloat(amount) * 1e6);

    const action = {
      hyperliquidChain,
      subAccountUser: subAccountAddress,
      isDeposit,
      usd,
      time: timestamp,
    };

    const signature = await HyperliquidSigner.signUserSignedAction(
      'SubAccountTransfer',
      action,
      this.isMainnet,
      privateKey,
    );

    try {
      return await this.client.exchange({
        action: {
          type: 'subAccountTransfer',
          subAccountUser: subAccountAddress,
          isDeposit,
          amount: usd,
        },
        nonce: timestamp,
        signature,
      });
    } catch (err) {
      if (err instanceof ChainError) throw err;
      throw new ChainError(HL_ERRORS.API_ERROR, 'HYPERLIQUID', {
        message: `Failed to transfer to sub-account: ${(err as Error).message}`,
      });
    }
  }

  /**
   * List all sub-accounts for a wallet.
   */
  async listSubAccounts(walletAddress: Hex): Promise<SubAccountInfo[]> {
    return this.marketData.getSubAccounts(walletAddress);
  }

  /**
   * Get positions for a specific sub-account.
   */
  async getSubAccountPositions(
    walletAddress: Hex,
    subAccountAddress: Hex,
  ): Promise<Position[]> {
    return this.marketData.getSubAccountPositions(walletAddress, subAccountAddress);
  }
}
