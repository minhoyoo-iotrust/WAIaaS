/**
 * Coverage sweep tests for pipeline branch coverage.
 *
 * Targets: sign-only.ts mapOperationToParam, pipeline-helpers.ts,
 * resolve-effective-amount-usd.ts
 */

import { describe, it, expect, vi } from 'vitest';
import { mapOperationToParam } from '../pipeline/sign-only.js';
import { hintedTokens, clearHintedTokens, hasHintedToken, resolveActionTier } from '../pipeline/pipeline-helpers.js';
import type { ParsedOperation } from '@waiaas/core';

// ---------------------------------------------------------------------------
// mapOperationToParam branch coverage
// ---------------------------------------------------------------------------

describe('mapOperationToParam', () => {
  it('maps NATIVE_TRANSFER to TRANSFER', () => {
    const op: ParsedOperation = {
      type: 'NATIVE_TRANSFER',
      to: '0xrecipient',
      amount: 1000000n,
    };
    const result = mapOperationToParam(op, 'ethereum', 'ethereum-mainnet');
    expect(result.type).toBe('TRANSFER');
    expect(result.amount).toBe('1000000');
    expect(result.toAddress).toBe('0xrecipient');
    expect(result.chain).toBe('ethereum');
    expect(result.network).toBe('ethereum-mainnet');
  });

  it('maps NATIVE_TRANSFER with null amount to 0', () => {
    const op: ParsedOperation = {
      type: 'NATIVE_TRANSFER',
      to: '0xrecipient',
    };
    const result = mapOperationToParam(op, 'solana');
    expect(result.amount).toBe('0');
  });

  it('maps NATIVE_TRANSFER with null to to empty string', () => {
    const op: ParsedOperation = {
      type: 'NATIVE_TRANSFER',
    };
    const result = mapOperationToParam(op, 'solana');
    expect(result.toAddress).toBe('');
  });

  it('maps TOKEN_TRANSFER to TOKEN_TRANSFER', () => {
    const op: ParsedOperation = {
      type: 'TOKEN_TRANSFER',
      to: '0xrecipient',
      amount: 500000n,
      token: '0xUSDC',
    };
    const result = mapOperationToParam(op, 'ethereum', 'ethereum-mainnet');
    expect(result.type).toBe('TOKEN_TRANSFER');
    expect(result.tokenAddress).toBe('0xUSDC');
  });

  it('maps TOKEN_TRANSFER with null amount', () => {
    const op: ParsedOperation = {
      type: 'TOKEN_TRANSFER',
      to: '0x123',
      token: '0xDAI',
    };
    const result = mapOperationToParam(op, 'ethereum');
    expect(result.amount).toBe('0');
  });

  it('maps CONTRACT_CALL with programId', () => {
    const op: ParsedOperation = {
      type: 'CONTRACT_CALL',
      programId: '0xcontract',
      method: 'swap',
    };
    const result = mapOperationToParam(op, 'ethereum', 'ethereum-mainnet');
    expect(result.type).toBe('CONTRACT_CALL');
    expect(result.contractAddress).toBe('0xcontract');
    expect(result.selector).toBe('swap');
    expect(result.amount).toBe('0');
  });

  it('maps CONTRACT_CALL with to (no programId)', () => {
    const op: ParsedOperation = {
      type: 'CONTRACT_CALL',
      to: '0xcontract2',
    };
    const result = mapOperationToParam(op, 'ethereum');
    expect(result.toAddress).toBe('0xcontract2');
    expect(result.contractAddress).toBe('0xcontract2');
  });

  it('maps CONTRACT_CALL with neither programId nor to', () => {
    const op: ParsedOperation = {
      type: 'CONTRACT_CALL',
    };
    const result = mapOperationToParam(op, 'solana');
    expect(result.toAddress).toBe('');
  });

  it('maps APPROVE', () => {
    const op: ParsedOperation = {
      type: 'APPROVE',
      to: '0xspender',
      amount: 1000n,
    };
    const result = mapOperationToParam(op, 'ethereum', 'ethereum-mainnet');
    expect(result.type).toBe('APPROVE');
    expect(result.spenderAddress).toBe('0xspender');
    expect(result.approveAmount).toBe('1000');
  });

  it('maps APPROVE with null amount', () => {
    const op: ParsedOperation = {
      type: 'APPROVE',
      to: '0xspender',
    };
    const result = mapOperationToParam(op, 'ethereum');
    expect(result.amount).toBe('0');
    expect(result.approveAmount).toBe('0');
  });

  it('maps UNKNOWN to CONTRACT_CALL', () => {
    const op: ParsedOperation = {
      type: 'UNKNOWN',
      programId: '0xmystery',
    };
    const result = mapOperationToParam(op, 'solana');
    expect(result.type).toBe('CONTRACT_CALL');
    expect(result.contractAddress).toBe('0xmystery');
  });

  it('maps unrecognized type (default case) to CONTRACT_CALL', () => {
    const op: ParsedOperation = {
      type: 'SOMETHING_ELSE' as any,
      to: '0xother',
    };
    const result = mapOperationToParam(op, 'ethereum');
    expect(result.type).toBe('CONTRACT_CALL');
    expect(result.toAddress).toBe('0xother');
  });

  it('without network', () => {
    const op: ParsedOperation = {
      type: 'NATIVE_TRANSFER',
      to: '0x1',
      amount: 1n,
    };
    const result = mapOperationToParam(op, 'solana');
    expect(result.network).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Pipeline helpers
// ---------------------------------------------------------------------------

describe('hintedTokens helpers', () => {
  it('clearHintedTokens clears the set', () => {
    hintedTokens.add('test-token');
    expect(hasHintedToken('test-token')).toBe(true);
    clearHintedTokens();
    expect(hasHintedToken('test-token')).toBe(false);
  });

  it('hasHintedToken returns false for unknown token', () => {
    clearHintedTokens();
    expect(hasHintedToken('unknown')).toBe(false);
  });
});

describe('resolveActionTier', () => {
  it('returns default tier when no settingsService', () => {
    const result = resolveActionTier('jupiter_swap', 'swap', 'NORMAL');
    expect(result).toBe('NORMAL');
  });

  it('returns settings override when available', () => {
    const settingsService = {
      get: vi.fn().mockReturnValue('DELAY'),
    };
    const result = resolveActionTier('jupiter_swap', 'swap', 'NORMAL', settingsService as any);
    expect(result).toBe('DELAY');
    expect(settingsService.get).toHaveBeenCalledWith('actions.jupiter_swap_swap_tier');
  });

  it('returns default when settings returns empty string', () => {
    const settingsService = {
      get: vi.fn().mockReturnValue(''),
    };
    const result = resolveActionTier('provider', 'action', 'NORMAL', settingsService as any);
    expect(result).toBe('NORMAL');
  });

  it('returns default when settings throws', () => {
    const settingsService = {
      get: vi.fn().mockImplementation(() => { throw new Error('unknown key'); }),
    };
    const result = resolveActionTier('provider', 'action', 'APPROVAL', settingsService as any);
    expect(result).toBe('APPROVAL');
  });
});
