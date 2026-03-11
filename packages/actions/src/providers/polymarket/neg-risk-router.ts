/**
 * NegRiskRouter: Exchange contract selection based on neg_risk flag.
 *
 * Binary markets use CTF Exchange, multi-outcome (neg risk) markets use
 * the Neg Risk CTF Exchange. This router centralizes that routing logic.
 *
 * @see design doc 80, Section 6.2
 */
import type { Hex } from 'viem';
import { PM_CONTRACTS } from './config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExchangeInfo {
  exchange: Hex;
  isNegRisk: boolean;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export class NegRiskRouter {
  /**
   * Get the exchange contract for a market based on neg_risk flag.
   * Binary markets -> CTF Exchange, Neg risk markets -> Neg Risk CTF Exchange.
   */
  static getExchange(negRisk: boolean): ExchangeInfo {
    return {
      exchange: negRisk
        ? (PM_CONTRACTS.NEG_RISK_CTF_EXCHANGE as Hex)
        : (PM_CONTRACTS.CTF_EXCHANGE as Hex),
      isNegRisk: negRisk,
    };
  }

  /**
   * Get the redeem target for a market. Used in CTF redemption (Phase 372).
   * Binary -> Conditional Tokens, Neg risk -> Neg Risk Adapter.
   */
  static getRedeemTarget(negRisk: boolean): Hex {
    return (negRisk ? PM_CONTRACTS.NEG_RISK_ADAPTER : PM_CONTRACTS.CONDITIONAL_TOKENS) as Hex;
  }

  /**
   * Get the approve target (spender) for USDC.e approval.
   * Same as the exchange contract.
   */
  static getApproveTarget(negRisk: boolean): Hex {
    return NegRiskRouter.getExchange(negRisk).exchange;
  }
}
