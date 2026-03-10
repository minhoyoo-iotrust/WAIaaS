/**
 * Tests for NegRiskRouter: exchange contract selection based on neg_risk flag.
 *
 * Plan 371-04 Task 1: NegRiskRouter tests.
 */
import { describe, it, expect } from 'vitest';
import { NegRiskRouter } from '../neg-risk-router.js';
import { PM_CONTRACTS } from '../config.js';

describe('NegRiskRouter', () => {
  describe('getExchange', () => {
    it('returns CTF_EXCHANGE for binary markets (negRisk=false)', () => {
      const result = NegRiskRouter.getExchange(false);
      expect(result.exchange).toBe(PM_CONTRACTS.CTF_EXCHANGE);
      expect(result.isNegRisk).toBe(false);
    });

    it('returns NEG_RISK_CTF_EXCHANGE for neg risk markets (negRisk=true)', () => {
      const result = NegRiskRouter.getExchange(true);
      expect(result.exchange).toBe(PM_CONTRACTS.NEG_RISK_CTF_EXCHANGE);
      expect(result.isNegRisk).toBe(true);
    });
  });

  describe('getRedeemTarget', () => {
    it('returns CONDITIONAL_TOKENS for binary markets', () => {
      expect(NegRiskRouter.getRedeemTarget(false)).toBe(PM_CONTRACTS.CONDITIONAL_TOKENS);
    });

    it('returns NEG_RISK_ADAPTER for neg risk markets', () => {
      expect(NegRiskRouter.getRedeemTarget(true)).toBe(PM_CONTRACTS.NEG_RISK_ADAPTER);
    });
  });

  describe('getApproveTarget', () => {
    it('returns CTF_EXCHANGE for binary markets', () => {
      expect(NegRiskRouter.getApproveTarget(false)).toBe(PM_CONTRACTS.CTF_EXCHANGE);
    });

    it('returns NEG_RISK_CTF_EXCHANGE for neg risk markets', () => {
      expect(NegRiskRouter.getApproveTarget(true)).toBe(PM_CONTRACTS.NEG_RISK_CTF_EXCHANGE);
    });
  });
});
