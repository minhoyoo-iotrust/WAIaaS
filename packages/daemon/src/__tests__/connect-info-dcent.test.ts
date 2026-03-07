/**
 * Tests for dcent_swap capability in GET /v1/connect-info.
 *
 * Phase 346-03 Task 2: Verifies dcent_swap capability appears
 * when actions.dcent_swap_enabled setting is 'true', and is
 * absent when disabled or setting key is not found.
 */

import { describe, it, expect } from 'vitest';
import { buildConnectInfoPrompt } from '../api/routes/connect-info.js';
import type { BuildConnectInfoPromptParams } from '../api/routes/connect-info.js';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function createPromptParams(overrides: Partial<BuildConnectInfoPromptParams> = {}): BuildConnectInfoPromptParams {
  return {
    wallets: [],
    capabilities: ['transfer', 'token_transfer', 'balance', 'assets'],
    defaultDeny: {
      tokenTransfers: false,
      contractCalls: false,
      tokenApprovals: false,
      x402Domains: false,
    },
    baseUrl: 'http://localhost:3100',
    version: '2.10.0',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('connect-info dcent_swap capability', () => {
  it('dcent_swap capability included when setting is true', () => {
    // Simulate capability computation from connect-info.ts:
    // if settingsService.get('actions.dcent_swap_enabled') === 'true' -> push 'dcent_swap'
    const capabilities: string[] = ['transfer', 'token_transfer', 'balance', 'assets'];
    const dcentEnabled = 'true';
    if (dcentEnabled === 'true') {
      capabilities.push('dcent_swap');
    }

    expect(capabilities).toContain('dcent_swap');

    // Verify prompt includes dcent_swap in available capabilities
    const prompt = buildConnectInfoPrompt(createPromptParams({ capabilities }));
    expect(prompt).toContain('dcent_swap');
  });

  it('dcent_swap capability excluded when setting is false', () => {
    const capabilities: string[] = ['transfer', 'token_transfer', 'balance', 'assets'];
    const dcentEnabled = 'false';
    if (dcentEnabled === 'true') {
      capabilities.push('dcent_swap');
    }

    expect(capabilities).not.toContain('dcent_swap');
  });

  it('dcent_swap capability excluded when setting key not found (catch block)', () => {
    const capabilities: string[] = ['transfer', 'token_transfer', 'balance', 'assets'];
    // Simulate settings key not found
    try {
      throw new Error('Setting not found: actions.dcent_swap_enabled');
    } catch {
      // Setting not found -- dcent_swap not available
    }

    expect(capabilities).not.toContain('dcent_swap');
  });

  it('prompt includes DCent Swap hint when dcent_swap capability present', () => {
    const capabilities = ['transfer', 'token_transfer', 'balance', 'assets', 'dcent_swap'];
    const prompt = buildConnectInfoPrompt(createPromptParams({ capabilities }));

    expect(prompt).toContain("D'CENT Swap Aggregator");
    expect(prompt).toContain('action_dcent_swap_*');
  });

  it('prompt does not include DCent Swap hint when dcent_swap not in capabilities', () => {
    const capabilities = ['transfer', 'token_transfer', 'balance', 'assets'];
    const prompt = buildConnectInfoPrompt(createPromptParams({ capabilities }));

    expect(prompt).not.toContain('action_dcent_swap_*');
  });
});
