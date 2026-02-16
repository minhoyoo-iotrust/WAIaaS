/**
 * CT-7: IActionProvider Contract Test -- MockActionProvider (M10) execution.
 *
 * Validates that the daemon's MockActionProvider (with vi.fn() spies)
 * passes the same shared contract suite as TestESMPlugin.
 */
import { describe } from 'vitest';
import { actionProviderContractTests } from '../../../../core/src/__tests__/contracts/action-provider.contract.js';
import { MockActionProvider } from '../mocks/mock-action-provider.js';

// ---------------------------------------------------------------------------
// Run contract tests
// ---------------------------------------------------------------------------

describe('CT-7: IActionProvider Contract Tests (daemon implementations)', () => {
  describe('MockActionProvider (M10)', () => {
    actionProviderContractTests(
      () => new MockActionProvider(),
      {
        validActionName: 'mock_action',
        validParams: { amount: '100' },
        invalidParams: {}, // missing required 'amount'
      },
    );
  });
});
