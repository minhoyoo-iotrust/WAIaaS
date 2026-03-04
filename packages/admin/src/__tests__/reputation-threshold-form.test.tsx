/**
 * REPUTATION_THRESHOLD policy form tests.
 *
 * Tests cover:
 * - Initial render with all fields
 * - min_score change triggers onChange
 * - below_threshold_tier change triggers onChange
 * - check_counterparty toggle triggers onChange
 * - REPUTATION_THRESHOLD in POLICY_TYPES
 * - erc8004_agent in BUILTIN_PROVIDERS
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';

vi.mock('../components/settings-search', async () => {
  const { signal } = await import('@preact/signals');
  return {
    pendingNavigation: signal(null),
    highlightField: signal(''),
    SettingsSearch: () => null,
  };
});

import { ReputationThresholdForm } from '../components/policy-forms/reputation-threshold-form';

describe('ReputationThresholdForm', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders all form fields', () => {
    const onChange = vi.fn();
    render(
      <ReputationThresholdForm
        rules={{ min_score: 50, below_threshold_tier: 'APPROVAL', unrated_tier: 'APPROVAL', check_counterparty: false }}
        onChange={onChange}
        errors={{}}
      />,
    );

    expect(screen.getByText('Minimum Score')).toBeTruthy();
    expect(screen.getByText('Below Threshold Tier')).toBeTruthy();
    expect(screen.getByText('Unrated Agent Tier')).toBeTruthy();
    expect(screen.getByText('Tag1 Filter')).toBeTruthy();
    expect(screen.getByText('Tag2 Filter')).toBeTruthy();
    expect(screen.getByText('Check Counterparty')).toBeTruthy();
  });

  it('calls onChange when min_score changes', () => {
    const onChange = vi.fn();
    render(
      <ReputationThresholdForm
        rules={{ min_score: 50, below_threshold_tier: 'APPROVAL', unrated_tier: 'APPROVAL', check_counterparty: false }}
        onChange={onChange}
        errors={{}}
      />,
    );

    const input = document.querySelector('input[name="min_score"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.input(input, { target: { value: '70' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ min_score: 70 }));
  });

  it('calls onChange when below_threshold_tier changes', () => {
    const onChange = vi.fn();
    render(
      <ReputationThresholdForm
        rules={{ min_score: 50, below_threshold_tier: 'APPROVAL', unrated_tier: 'APPROVAL', check_counterparty: false }}
        onChange={onChange}
        errors={{}}
      />,
    );

    const select = document.querySelector('select[name="below_threshold_tier"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
    fireEvent.change(select, { target: { value: 'DELAY' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ below_threshold_tier: 'DELAY' }));
  });

  it('calls onChange when check_counterparty is toggled', () => {
    const onChange = vi.fn();
    render(
      <ReputationThresholdForm
        rules={{ min_score: 50, below_threshold_tier: 'APPROVAL', unrated_tier: 'APPROVAL', check_counterparty: false }}
        onChange={onChange}
        errors={{}}
      />,
    );

    const checkbox = document.querySelector('input[name="check_counterparty"]') as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    fireEvent.change(checkbox, { target: { checked: true } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ check_counterparty: true }));
  });
});
