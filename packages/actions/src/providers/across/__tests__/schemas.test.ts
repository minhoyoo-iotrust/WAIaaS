/**
 * Across Protocol Zod schema validation tests.
 * Verifies correct parsing and rejection of API response data.
 *
 * @see internal/design/79-across-protocol-bridge.md (section 3)
 */
import { describe, it, expect } from 'vitest';
import {
  AcrossSuggestedFeesResponseSchema,
  AcrossLimitsResponseSchema,
  AcrossAvailableRoutesResponseSchema,
  AcrossDepositStatusResponseSchema,
  AcrossSwapApprovalResponseSchema,
} from '../schemas.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AcrossSuggestedFeesResponseSchema', () => {
  const validResponse = {
    totalRelayFee: { pct: '1000000000000000', total: '100000' },
    relayerCapitalFee: { pct: '500000000000000', total: '50000' },
    relayerGasFee: { pct: '300000000000000', total: '30000' },
    lpFee: { pct: '200000000000000', total: '20000' },
    timestamp: 1700000000,
    isAmountTooLow: false,
    exclusiveRelayer: '0x0000000000000000000000000000000000000000',
    exclusivityDeadline: 0,
    limits: {
      minDeposit: '10000',
      maxDeposit: '1000000000000',
      maxDepositInstant: '500000000000',
      maxDepositShortDelay: '800000000000',
    },
  };

  it('parses valid response with all required fields', () => {
    const result = AcrossSuggestedFeesResponseSchema.parse(validResponse);
    expect(result.totalRelayFee.total).toBe('100000');
    expect(result.timestamp).toBe(1700000000);
    expect(result.isAmountTooLow).toBe(false);
    expect(result.limits.minDeposit).toBe('10000');
  });

  it('passes through unknown fields (.passthrough())', () => {
    const withExtra = { ...validResponse, extraField: 'should pass through' };
    const result = AcrossSuggestedFeesResponseSchema.parse(withExtra);
    expect((result as Record<string, unknown>).extraField).toBe('should pass through');
  });

  it('rejects missing totalRelayFee field', () => {
    const { totalRelayFee: _, ...missing } = validResponse;
    expect(() => AcrossSuggestedFeesResponseSchema.parse(missing)).toThrow();
  });

  it('rejects missing timestamp', () => {
    const { timestamp: _, ...missing } = validResponse;
    expect(() => AcrossSuggestedFeesResponseSchema.parse(missing)).toThrow();
  });
});

describe('AcrossDepositStatusResponseSchema', () => {
  it.each(['filled', 'pending', 'expired', 'refunded'] as const)(
    'parses valid status: %s',
    (status) => {
      const result = AcrossDepositStatusResponseSchema.parse({ status });
      expect(result.status).toBe(status);
    },
  );

  it('rejects invalid status value', () => {
    expect(() =>
      AcrossDepositStatusResponseSchema.parse({ status: 'unknown' }),
    ).toThrow();
  });

  it('parses response with optional fields', () => {
    const result = AcrossDepositStatusResponseSchema.parse({
      status: 'filled',
      fillTxHash: '0xhash',
      depositId: 42,
      destinationChainId: 42161,
    });
    expect(result.fillTxHash).toBe('0xhash');
    expect(result.depositId).toBe(42);
  });

  it('coerces string depositId to number (#336)', () => {
    const result = AcrossDepositStatusResponseSchema.parse({
      status: 'filled',
      fillTxHash: '0xhash',
      depositId: '12345',
      destinationChainId: 42161,
    });
    expect(result.depositId).toBe(12345);
  });
});

describe('AcrossAvailableRoutesResponseSchema', () => {
  it('parses valid route array', () => {
    const routes = [
      {
        originChainId: 1,
        destinationChainId: 42161,
        originToken: '0xToken1',
        destinationToken: '0xToken2',
      },
    ];
    const result = AcrossAvailableRoutesResponseSchema.parse(routes);
    expect(result).toHaveLength(1);
    expect(result[0]!.originChainId).toBe(1);
  });

  it('accepts empty array', () => {
    const result = AcrossAvailableRoutesResponseSchema.parse([]);
    expect(result).toHaveLength(0);
  });
});

describe('AcrossLimitsResponseSchema', () => {
  it('parses valid limits response', () => {
    const result = AcrossLimitsResponseSchema.parse({
      minDeposit: '10000',
      maxDeposit: '1000000000000',
      maxDepositInstant: '500000000000',
      maxDepositShortDelay: '800000000000',
    });
    expect(result.minDeposit).toBe('10000');
    expect(result.maxDeposit).toBe('1000000000000');
  });

  it('rejects missing required fields', () => {
    expect(() => AcrossLimitsResponseSchema.parse({})).toThrow();
  });
});

describe('AcrossSwapApprovalResponseSchema', () => {
  it('parses valid swap approval response', () => {
    const result = AcrossSwapApprovalResponseSchema.parse({
      swapTx: { to: '0xSpokePool', data: '0xdata' },
      inputAmount: '1000000',
    });
    expect(result.swapTx.to).toBe('0xSpokePool');
  });

  it('rejects missing swapTx', () => {
    expect(() => AcrossSwapApprovalResponseSchema.parse({})).toThrow();
  });
});
