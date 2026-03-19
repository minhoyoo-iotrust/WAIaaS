/**
 * Aave V3 Lending Action Provider.
 *
 * Implements ILendingProvider + IPositionProvider to resolve Aave V3
 * lending requests into ContractCallRequest arrays for the sequential pipeline.
 *
 * Actions:
 * - aave_supply: approve + supply (2-element array)
 * - aave_borrow: single element (no approve needed)
 * - aave_repay: approve + repay (2-element array, supports 'max')
 * - aave_withdraw: single element (supports 'max')
 *
 * Risk levels: borrow/withdraw = high (APPROVAL), supply/repay = medium (DELAY).
 */
import { ChainError } from '@waiaas/core';
import { migrateAmount } from '../../common/migrate-amount.js';
import { resolveProviderHumanAmount } from '../../common/resolve-human-amount.js';
import type {
  ILendingProvider,
  ActionProviderMetadata,
  ActionDefinition,
  ActionContext,
  ContractCallRequest,
  LendingPositionSummary,
  HealthFactor,
  MarketInfo,
  NetworkType,
} from '@waiaas/core';
import type { IPositionProvider, PositionUpdate, PositionCategory, PositionQueryContext } from '@waiaas/core';
import type { AaveV3Config } from './config.js';
import { getAaveAddresses, AAVE_V3_ADDRESSES } from './config.js';
import {
  encodeSupplyCalldata,
  encodeBorrowCalldata,
  encodeRepayCalldata,
  encodeWithdrawCalldata,
  encodeApproveCalldata,
  encodeGetUserAccountDataCalldata,
  encodeGetReservesListCalldata,
  encodeBalanceOfCalldata,
  encodeGetAssetsPricesCalldata,
  encodeGetReserveTokensAddressesCalldata,
  encodeGetReserveDataCalldata,
  MAX_UINT256,
} from './aave-contracts.js';
import {
  type IRpcCaller,
  decodeGetUserAccountData,
  decodeAddressArray,
  decodeUint256Array,
  decodeReserveTokensAddresses,
  decodeGetReserveData,
  simulateHealthFactor,
  hfToNumber,
  rayToApy,
  LIQUIDATION_THRESHOLD_HF,
} from './aave-rpc.js';
import { formatCaip19 } from '@waiaas/core';
import {
  AaveSupplyInputSchema,
  AaveBorrowInputSchema,
  AaveRepayInputSchema,
  AaveWithdrawInputSchema,
} from './schemas.js';

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export class AaveV3LendingProvider implements ILendingProvider, IPositionProvider {
  readonly metadata: ActionProviderMetadata;
  readonly actions: readonly ActionDefinition[];

  private readonly rpcCaller?: IRpcCaller;

  constructor(_config?: Partial<AaveV3Config>, rpcCaller?: IRpcCaller) {
    this.rpcCaller = rpcCaller;

    this.metadata = {
      name: 'aave_v3',
      displayName: 'Aave V3',
      description: 'Aave V3 DeFi lending protocol for EVM chains: supply, borrow, repay, withdraw',
      version: '1.0.0',
      chains: ['ethereum'],
      mcpExpose: true,
      requiresApiKey: false,
      requiredApis: [],
      requiresSigningKey: false,
    };

    this.actions = [
      {
        name: 'aave_supply',
        description: 'Supply (deposit) an ERC-20 token as collateral to Aave V3 lending pool',
        chain: 'ethereum',
        inputSchema: AaveSupplyInputSchema,
        riskLevel: 'medium',
        defaultTier: 'DELAY',
      },
      {
        name: 'aave_borrow',
        description: 'Borrow an asset from Aave V3 lending pool against deposited collateral (variable rate)',
        chain: 'ethereum',
        inputSchema: AaveBorrowInputSchema,
        riskLevel: 'high',
        defaultTier: 'APPROVAL',
      },
      {
        name: 'aave_repay',
        description: 'Repay borrowed debt on Aave V3 lending pool. Use amount="max" for full repayment.',
        chain: 'ethereum',
        inputSchema: AaveRepayInputSchema,
        riskLevel: 'medium',
        defaultTier: 'DELAY',
      },
      {
        name: 'aave_withdraw',
        description: 'Withdraw supplied collateral from Aave V3 lending pool. Use amount="max" for full withdrawal.',
        chain: 'ethereum',
        inputSchema: AaveWithdrawInputSchema,
        riskLevel: 'high',
        defaultTier: 'APPROVAL',
      },
    ] as const;
  }

  // -------------------------------------------------------------------------
  // IActionProvider.resolve()
  // -------------------------------------------------------------------------

  async resolve(
    actionName: string,
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest | ContractCallRequest[]> {
    switch (actionName) {
      case 'aave_supply':
        return this.resolveSupply(params, context);
      case 'aave_borrow':
        return this.resolveBorrow(params, context);
      case 'aave_repay':
        return this.resolveRepay(params, context);
      case 'aave_withdraw':
        return this.resolveWithdraw(params, context);
      default:
        throw new ChainError('INVALID_INSTRUCTION', 'ethereum', {
          message: `Unknown action: ${actionName}`,
        });
    }
  }

  // -------------------------------------------------------------------------
  // Supply: approve + Pool.supply()
  // -------------------------------------------------------------------------

  private resolveSupply(
    params: Record<string, unknown>,
    context: ActionContext,
  ): ContractCallRequest[] {
    const rp = { ...params };
    resolveProviderHumanAmount(rp, 'amount', 'humanAmount');
    const input = AaveSupplyInputSchema.parse(rp);
    if (!input.amount) throw new ChainError('INVALID_INSTRUCTION', 'ethereum', { message: 'Either amount or humanAmount (with decimals) is required' });
    const network = (input.network || 'ethereum-mainnet') as NetworkType;
    const addresses = getAaveAddresses(network);
    const amount = migrateAmount(input.amount, 18);
    if (amount === 0n) throw new ChainError('INVALID_INSTRUCTION', 'ethereum', { message: 'Amount must be greater than 0' });

    const approveReq: ContractCallRequest = {
      type: 'CONTRACT_CALL',
      to: input.asset,
      calldata: encodeApproveCalldata(addresses.pool, amount),
      value: '0',
      network,
    };

    const supplyReq: ContractCallRequest = {
      type: 'CONTRACT_CALL',
      to: addresses.pool,
      calldata: encodeSupplyCalldata(input.asset, amount, context.walletAddress),
      value: '0',
      network,
    };

    return [approveReq, supplyReq];
  }

  // -------------------------------------------------------------------------
  // Borrow: Pool.borrow() (no approve needed -- Pool releases tokens TO user)
  // -------------------------------------------------------------------------

  private async resolveBorrow(
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest> {
    const rp = { ...params };
    resolveProviderHumanAmount(rp, 'amount', 'humanAmount');
    const input = AaveBorrowInputSchema.parse(rp);
    if (!input.amount) throw new ChainError('INVALID_INSTRUCTION', 'ethereum', { message: 'Either amount or humanAmount (with decimals) is required' });
    const network = (input.network || 'ethereum-mainnet') as NetworkType;
    const addresses = getAaveAddresses(network);
    const amount = migrateAmount(input.amount, 18);
    if (amount === 0n) throw new ChainError('INVALID_INSTRUCTION', 'ethereum', { message: 'Amount must be greater than 0' });

    // AAVE-09: HF simulation check if rpcCaller available
    if (this.rpcCaller) {
      await this.checkBorrowSafety(context.walletAddress, amount, addresses.pool, addresses.chainId);
    }

    return {
      type: 'CONTRACT_CALL',
      to: addresses.pool,
      calldata: encodeBorrowCalldata(input.asset, amount, context.walletAddress),
      value: '0',
      network,
    };
  }

  // -------------------------------------------------------------------------
  // Repay: approve + Pool.repay() (supports 'max' for full repayment)
  // -------------------------------------------------------------------------

  private resolveRepay(
    params: Record<string, unknown>,
    context: ActionContext,
  ): ContractCallRequest[] {
    const rp = { ...params };
    resolveProviderHumanAmount(rp, 'amount', 'humanAmount');
    const input = AaveRepayInputSchema.parse(rp);
    if (!input.amount) throw new ChainError('INVALID_INSTRUCTION', 'ethereum', { message: 'Either amount or humanAmount (with decimals) is required' });
    const network = (input.network || 'ethereum-mainnet') as NetworkType;
    const addresses = getAaveAddresses(network);
    const amount = input.amount === 'max' ? MAX_UINT256 : migrateAmount(input.amount, 18);

    const approveReq: ContractCallRequest = {
      type: 'CONTRACT_CALL',
      to: input.asset,
      calldata: encodeApproveCalldata(addresses.pool, amount),
      value: '0',
      network,
    };

    const repayReq: ContractCallRequest = {
      type: 'CONTRACT_CALL',
      to: addresses.pool,
      calldata: encodeRepayCalldata(input.asset, amount, context.walletAddress),
      value: '0',
      network,
    };

    return [approveReq, repayReq];
  }

  // -------------------------------------------------------------------------
  // Withdraw: Pool.withdraw() (supports 'max', no approve needed)
  // -------------------------------------------------------------------------

  private async resolveWithdraw(
    params: Record<string, unknown>,
    context: ActionContext,
  ): Promise<ContractCallRequest> {
    const rp = { ...params };
    resolveProviderHumanAmount(rp, 'amount', 'humanAmount');
    const input = AaveWithdrawInputSchema.parse(rp);
    if (!input.amount) throw new ChainError('INVALID_INSTRUCTION', 'ethereum', { message: 'Either amount or humanAmount (with decimals) is required' });
    const network = (input.network || 'ethereum-mainnet') as NetworkType;
    const addresses = getAaveAddresses(network);
    const amount = input.amount === 'max' ? MAX_UINT256 : migrateAmount(input.amount, 18);

    // AAVE-09: HF simulation for non-max withdrawals
    if (this.rpcCaller && amount !== MAX_UINT256) {
      await this.checkWithdrawSafety(context.walletAddress, amount, addresses.pool, addresses.chainId);
    }

    return {
      type: 'CONTRACT_CALL',
      to: addresses.pool,
      calldata: encodeWithdrawCalldata(input.asset, amount, context.walletAddress),
      value: '0',
      network,
    };
  }

  // -------------------------------------------------------------------------
  // HF Safety checks (AAVE-09)
  // -------------------------------------------------------------------------

  private async checkBorrowSafety(
    walletAddress: string,
    borrowAmount: bigint,
    poolAddress: string,
    chainId: number,
  ): Promise<void> {
    const accountData = await this.fetchUserAccountData(walletAddress, poolAddress, chainId);
    if (!accountData) return;

    // Approximate: treat borrow amount as base currency units for simulation
    // This is a simplification -- proper conversion requires oracle price lookup
    const simulated = simulateHealthFactor(accountData, 'borrow', borrowAmount);
    if (simulated < LIQUIDATION_THRESHOLD_HF) {
      throw new ChainError('CONTRACT_EXECUTION_FAILED', 'ethereum', {
        message: `Borrow would cause health factor to drop below liquidation threshold (simulated HF: ${hfToNumber(simulated).toFixed(4)})`,
      });
    }
  }

  private async checkWithdrawSafety(
    walletAddress: string,
    withdrawAmount: bigint,
    poolAddress: string,
    chainId: number,
  ): Promise<void> {
    const accountData = await this.fetchUserAccountData(walletAddress, poolAddress, chainId);
    if (!accountData) return;

    const simulated = simulateHealthFactor(accountData, 'withdraw', withdrawAmount);
    if (simulated < LIQUIDATION_THRESHOLD_HF) {
      throw new ChainError('CONTRACT_EXECUTION_FAILED', 'ethereum', {
        message: `Withdrawal would cause health factor to drop below liquidation threshold (simulated HF: ${hfToNumber(simulated).toFixed(4)})`,
      });
    }
  }

  private async fetchUserAccountData(
    walletAddress: string,
    poolAddress: string,
    chainId: number,
  ): Promise<{ totalCollateralBase: bigint; totalDebtBase: bigint; currentLiquidationThreshold: bigint } | null> {
    if (!this.rpcCaller) return null;

    try {
      const calldata = encodeGetUserAccountDataCalldata(walletAddress);
      const response = await this.rpcCaller.call({ to: poolAddress, data: calldata, chainId });
      const data = decodeGetUserAccountData(response);
      return {
        totalCollateralBase: data.totalCollateralBase,
        totalDebtBase: data.totalDebtBase,
        currentLiquidationThreshold: data.currentLiquidationThreshold,
      };
    } catch {
      // If RPC fails, skip simulation and let daemon-level policy handle it
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // ILendingProvider query methods
  // -------------------------------------------------------------------------

  async getPosition(_walletId: string, context: ActionContext): Promise<LendingPositionSummary[]> {
    if (!this.rpcCaller) return [];

    try {
      const network = 'ethereum-mainnet'; // default
      const addresses = getAaveAddresses(network);
      const calldata = encodeGetUserAccountDataCalldata(context.walletAddress);
      const response = await this.rpcCaller.call({
        to: addresses.pool,
        data: calldata,
        chainId: addresses.chainId,
      });
      const data = decodeGetUserAccountData(response);

      const positions: LendingPositionSummary[] = [];

      if (data.totalCollateralBase > 0n) {
        positions.push({
          asset: 'COLLATERAL',
          positionType: 'SUPPLY',
          amount: data.totalCollateralBase.toString(),
          amountUsd: Number(data.totalCollateralBase) / 1e8,
          apy: null,
        });
      }

      if (data.totalDebtBase > 0n) {
        positions.push({
          asset: 'DEBT',
          positionType: 'BORROW',
          amount: data.totalDebtBase.toString(),
          amountUsd: Number(data.totalDebtBase) / 1e8,
          apy: null,
        });
      }

      return positions;
    } catch {
      return [];
    }
  }

  async getHealthFactor(_walletId: string, context: ActionContext): Promise<HealthFactor> {
    if (!this.rpcCaller) {
      return {
        factor: Infinity,
        totalCollateralUsd: 0,
        totalDebtUsd: 0,
        currentLtv: 0,
        status: 'safe',
      };
    }

    try {
      const network = 'ethereum-mainnet';
      const addresses = getAaveAddresses(network);
      const calldata = encodeGetUserAccountDataCalldata(context.walletAddress);
      const response = await this.rpcCaller.call({
        to: addresses.pool,
        data: calldata,
        chainId: addresses.chainId,
      });
      const data = decodeGetUserAccountData(response);

      const hf = hfToNumber(data.healthFactor);
      const totalCollateralUsd = Number(data.totalCollateralBase) / 1e8;
      const totalDebtUsd = Number(data.totalDebtBase) / 1e8;
      const currentLtv = totalCollateralUsd > 0 ? totalDebtUsd / totalCollateralUsd : 0;

      let status: 'safe' | 'warning' | 'danger' | 'critical';
      if (hf >= 2.0) status = 'safe';
      else if (hf >= 1.5) status = 'warning';
      else if (hf >= 1.2) status = 'danger';
      else status = 'critical';

      return { factor: hf, totalCollateralUsd, totalDebtUsd, currentLtv, status };
    } catch {
      return {
        factor: Infinity,
        totalCollateralUsd: 0,
        totalDebtUsd: 0,
        currentLtv: 0,
        status: 'safe',
      };
    }
  }

  async getMarkets(_chain: string, _network?: string): Promise<MarketInfo[]> {
    // Deferred to Phase 277: requires getReservesList + per-reserve queries
    return [];
  }

  // -------------------------------------------------------------------------
  // IPositionProvider methods
  // -------------------------------------------------------------------------

  async getPositions(ctx: PositionQueryContext): Promise<PositionUpdate[]> {
    if (ctx.chain !== 'ethereum') return [];
    const walletAddress = ctx.walletAddress;

    // Filter ctx.networks to only AAVE_V3_ADDRESSES-supported networks (MCHN-02)
    const supportedNetworks = ctx.networks.filter(n => AAVE_V3_ADDRESSES[n]);
    if (supportedNetworks.length === 0) return [];

    // Query each network in parallel via Promise.allSettled (MCHN-06)
    const results = await Promise.allSettled(
      supportedNetworks.map(network => {
        const rpcUrl = ctx.rpcUrls[network];
        if (!rpcUrl) return Promise.resolve([] as PositionUpdate[]);
        return this.queryNetworkAavePositions(ctx.walletId, walletAddress, network, rpcUrl);
      }),
    );

    // Collect only fulfilled results (MCHN-07)
    return results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  }

  /**
   * Query Aave V3 supply/borrow positions on a single network using raw fetch RPC.
   */
  private async queryNetworkAavePositions(
    walletId: string,
    walletAddress: string,
    network: string,
    rpcUrl: string,
  ): Promise<PositionUpdate[]> {
    const addresses = getAaveAddresses(network);
    const chainCaip2 = `eip155:${addresses.chainId}`;
    const now = Math.floor(Date.now() / 1000);
    const positions: PositionUpdate[] = [];

    // 1. Get reserves list
    const reservesHex = await this.rpcCall(rpcUrl, addresses.pool, encodeGetReservesListCalldata());
    const reserves = decodeAddressArray(reservesHex);
    if (reserves.length === 0) return [];

    // 2. Get oracle prices for all reserves at once
    const pricesHex = await this.rpcCall(rpcUrl, addresses.oracle, encodeGetAssetsPricesCalldata(reserves));
    const prices = decodeUint256Array(pricesHex); // 8 decimals USD

    // 3. Get user account data (for Health Factor)
    const accountDataHex = await this.rpcCall(rpcUrl, addresses.pool, encodeGetUserAccountDataCalldata(walletAddress));
    const accountData = decodeGetUserAccountData(accountDataHex);
    const healthFactor = hfToNumber(accountData.healthFactor);

    // 4. For each reserve: get token addresses, balances, and reserve data
    for (let i = 0; i < reserves.length; i++) {
      const asset = reserves[i]!;
      const priceUsd8 = prices[i] ?? 0n;

      const tokensHex = await this.rpcCall(rpcUrl, addresses.dataProvider, encodeGetReserveTokensAddressesCalldata(asset));
      const tokens = decodeReserveTokensAddresses(tokensHex);

      const aBalHex = await this.rpcCall(rpcUrl, tokens.aToken, encodeBalanceOfCalldata(walletAddress));
      const aBalance = BigInt(aBalHex.length > 2 ? aBalHex : '0x0');

      const vBalHex = await this.rpcCall(rpcUrl, tokens.variableDebtToken, encodeBalanceOfCalldata(walletAddress));
      const vBalance = BigInt(vBalHex.length > 2 ? vBalHex : '0x0');

      if (aBalance === 0n && vBalance === 0n) continue;

      const reserveDataHex = await this.rpcCall(rpcUrl, addresses.dataProvider, encodeGetReserveDataCalldata(asset));
      const reserveData = decodeGetReserveData(reserveDataHex);

      const formatWei = (val: bigint): string => {
        const str = val.toString();
        if (str.length <= 18) return '0.' + str.padStart(18, '0');
        const whole = str.slice(0, str.length - 18);
        const frac = str.slice(str.length - 18);
        const trimmed = frac.replace(/0+$/, '');
        return trimmed ? `${whole}.${trimmed}` : whole;
      };

      const calcUsd = (balance: bigint, price: bigint): number => {
        return Number((balance * price) / 10n ** 18n) / 1e8;
      };

      const assetId = formatCaip19(chainCaip2, 'erc20', asset.toLowerCase());

      if (aBalance > 0n) {
        positions.push({
          walletId,
          category: 'LENDING' as PositionCategory,
          provider: 'aave_v3',
          chain: 'ethereum',
          network,
          assetId,
          amount: formatWei(aBalance),
          amountUsd: calcUsd(aBalance, priceUsd8),
          metadata: {
            positionType: 'SUPPLY',
            apy: rayToApy(reserveData.liquidityRate),
            healthFactor,
            aTokenAddress: tokens.aToken,
          },
          status: 'ACTIVE',
          openedAt: now,
        });
      }

      if (vBalance > 0n) {
        positions.push({
          walletId,
          category: 'LENDING' as PositionCategory,
          provider: 'aave_v3',
          chain: 'ethereum',
          network,
          assetId,
          amount: formatWei(vBalance),
          amountUsd: calcUsd(vBalance, priceUsd8),
          metadata: {
            positionType: 'BORROW',
            interestRateMode: 'variable',
            apy: rayToApy(reserveData.variableBorrowRate),
            healthFactor,
            debtTokenAddress: tokens.variableDebtToken,
          },
          status: 'ACTIVE',
          openedAt: now,
        });
      }
    }

    return positions;
  }

  /**
   * Raw JSON-RPC eth_call via fetch (used for multichain position queries).
   */
  private async rpcCall(rpcUrl: string, to: string, data: string): Promise<string> {
    const resp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to, data }, 'latest'],
      }),
    });
    const json = (await resp.json()) as { result: string };
    return json.result;
  }

  getProviderName(): string {
    return 'aave_v3';
  }

  getSupportedCategories(): PositionCategory[] {
    return ['LENDING'];
  }
}
