/**
 * CT-7: IActionProvider Contract Test shared suite.
 *
 * Verifies that any IActionProvider implementation has valid metadata,
 * actions array, and resolve() behavior (success, not-found, bad params).
 *
 * Both MockActionProvider and TestESMPlugin must pass these tests
 * to guarantee behavioral equivalence.
 */
import { describe, it, expect } from 'vitest';
import type { IActionProvider, ActionProviderMetadata, ActionDefinition, ActionContext } from '../../interfaces/action-provider.types.js';

// ---------------------------------------------------------------------------
// Standard test context
// ---------------------------------------------------------------------------

const CONTRACT_TEST_CONTEXT: ActionContext = {
  walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
  chain: 'ethereum',
  walletId: 'wallet-contract-test',
  sessionId: 'session-contract-test',
};

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;
const NAME_REGEX = /^[a-z][a-z0-9_]*$/;
const VALID_RISK_LEVELS = ['low', 'medium', 'high'];
const VALID_TIERS = ['INSTANT', 'NOTIFY', 'DELAY', 'APPROVAL'];
const VALID_CHAINS = ['solana', 'ethereum'];

// ---------------------------------------------------------------------------
// Shared suite
// ---------------------------------------------------------------------------

/**
 * IActionProvider contract test suite.
 *
 * @param factory - Function that returns a fresh IActionProvider instance.
 * @param options - Optional resolve test parameters.
 * @param options.validActionName - Name of a valid action for resolve tests.
 * @param options.validParams - Valid parameters for the action.
 * @param options.invalidParams - Invalid parameters that should cause validation error.
 */
export function actionProviderContractTests(
  factory: () => IActionProvider | Promise<IActionProvider>,
  options?: {
    validActionName?: string;
    validParams?: Record<string, unknown>;
    invalidParams?: Record<string, unknown>;
  },
): void {
  let provider: IActionProvider;

  describe('IActionProvider contract', () => {
    beforeEach(async () => {
      provider = await factory();
    });

    // ----- metadata -----

    describe('metadata', () => {
      it('has a valid ActionProviderMetadata shape', () => {
        const m: ActionProviderMetadata = provider.metadata;
        expect(m).toBeDefined();
        expect(typeof m.name).toBe('string');
        expect(typeof m.description).toBe('string');
        expect(typeof m.version).toBe('string');
        expect(Array.isArray(m.chains)).toBe(true);
        expect(typeof m.mcpExpose).toBe('boolean');
      });

      it('metadata.name matches 3-50 char lowercase alphanumeric+underscore', () => {
        const { name } = provider.metadata;
        expect(name.length).toBeGreaterThanOrEqual(3);
        expect(name.length).toBeLessThanOrEqual(50);
        expect(name).toMatch(NAME_REGEX);
      });

      it('metadata.version is SemVer format', () => {
        expect(provider.metadata.version).toMatch(SEMVER_REGEX);
      });

      it('metadata.chains has at least 1 element', () => {
        expect(provider.metadata.chains.length).toBeGreaterThanOrEqual(1);
        for (const chain of provider.metadata.chains) {
          expect(VALID_CHAINS).toContain(chain);
        }
      });
    });

    // ----- actions -----

    describe('actions', () => {
      it('is a readonly ActionDefinition array', () => {
        expect(Array.isArray(provider.actions)).toBe(true);
      });

      it('has at least 1 action', () => {
        expect(provider.actions.length).toBeGreaterThanOrEqual(1);
      });

      it('each action has required shape fields', () => {
        for (const action of provider.actions) {
          expect(typeof action.name).toBe('string');
          expect(action.name.length).toBeGreaterThanOrEqual(3);
          expect(action.name).toMatch(NAME_REGEX);

          expect(typeof action.description).toBe('string');
          expect(action.description.length).toBeGreaterThanOrEqual(20);

          expect(VALID_CHAINS).toContain(action.chain);
          expect(action.inputSchema).toBeDefined();
          expect(VALID_RISK_LEVELS).toContain(action.riskLevel);
          expect(VALID_TIERS).toContain(action.defaultTier);
        }
      });

      it('action.riskLevel is low, medium, or high', () => {
        for (const action of provider.actions) {
          expect(VALID_RISK_LEVELS).toContain(action.riskLevel);
        }
      });

      it('action.defaultTier is a valid PolicyTier', () => {
        for (const action of provider.actions) {
          expect(VALID_TIERS).toContain(action.defaultTier);
        }
      });
    });

    // ----- resolve -----

    describe('resolve()', () => {
      it('returns a ContractCallRequest for valid actionName + params', async () => {
        const actionName = options?.validActionName ?? provider.actions[0]!.name;
        const params = options?.validParams ?? { amount: '100' };

        const result = await provider.resolve(actionName, params, CONTRACT_TEST_CONTEXT);

        expect(result).toBeDefined();
        expect(result.type).toBe('CONTRACT_CALL');
        expect(typeof result.to).toBe('string');
        expect(result.to.length).toBeGreaterThan(0);
      });

      it('throws for a non-existent actionName', async () => {
        await expect(
          provider.resolve('__nonexistent_action__', {}, CONTRACT_TEST_CONTEXT),
        ).rejects.toThrow();
      });

      it('throws for invalid params (inputSchema violation)', async () => {
        const actionName = options?.validActionName ?? provider.actions[0]!.name;
        const invalidParams = options?.invalidParams ?? {};

        await expect(
          provider.resolve(actionName, invalidParams, CONTRACT_TEST_CONTEXT),
        ).rejects.toThrow();
      });
    });
  });
}
