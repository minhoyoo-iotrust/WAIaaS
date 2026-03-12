import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { ActionCategoryLimitForm } from '../components/policy-forms/action-category-limit-form';

describe('ActionCategoryLimitForm', () => {
  it('renders initial fields with values', () => {
    const onChange = vi.fn();
    render(
      <ActionCategoryLimitForm
        rules={{ category: 'trade', per_action_limit_usd: 1000, daily_limit_usd: 10000, monthly_limit_usd: 100000, tier_on_exceed: 'DELAY' }}
        onChange={onChange}
        errors={{}}
      />,
    );

    expect(screen.getByDisplayValue('1000')).toBeTruthy();
    expect(screen.getByDisplayValue('10000')).toBeTruthy();
    expect(screen.getByDisplayValue('100000')).toBeTruthy();
  });

  it('calls onChange when category changes', () => {
    const onChange = vi.fn();
    render(
      <ActionCategoryLimitForm
        rules={{ category: 'trade', tier_on_exceed: 'DELAY' }}
        onChange={onChange}
        errors={{}}
      />,
    );

    const categorySelect = screen.getByDisplayValue('Trade');
    fireEvent.change(categorySelect, { target: { value: 'swap' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ category: 'swap' }));
  });

  it('calls onChange when per_action_limit_usd changes', () => {
    const onChange = vi.fn();
    render(
      <ActionCategoryLimitForm
        rules={{ category: 'trade', per_action_limit_usd: 500, tier_on_exceed: 'DELAY' }}
        onChange={onChange}
        errors={{}}
      />,
    );

    const input = screen.getByDisplayValue('500');
    fireEvent.input(input, { target: { value: '2000', valueAsNumber: 2000 } });
    expect(onChange).toHaveBeenCalled();
  });

  it('calls onChange when tier_on_exceed changes', () => {
    const onChange = vi.fn();
    render(
      <ActionCategoryLimitForm
        rules={{ category: 'trade', tier_on_exceed: 'DELAY' }}
        onChange={onChange}
        errors={{}}
      />,
    );

    const tierSelect = screen.getByDisplayValue('Delay');
    fireEvent.change(tierSelect, { target: { value: 'APPROVAL' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ tier_on_exceed: 'APPROVAL' }));
  });

  it('renders with empty optional fields', () => {
    const onChange = vi.fn();
    render(
      <ActionCategoryLimitForm
        rules={{ category: 'lend', tier_on_exceed: 'NOTIFY' }}
        onChange={onChange}
        errors={{}}
      />,
    );

    // Category should be Lend
    expect(screen.getByDisplayValue('Lend')).toBeTruthy();
    // Tier should be Notify
    expect(screen.getByDisplayValue('Notify')).toBeTruthy();
  });

  it('removes per_action_limit_usd when set to empty (0)', () => {
    const onChange = vi.fn();
    render(
      <ActionCategoryLimitForm
        rules={{ category: 'trade', per_action_limit_usd: 500, tier_on_exceed: 'DELAY' }}
        onChange={onChange}
        errors={{}}
      />,
    );

    const input = screen.getByDisplayValue('500');
    fireEvent.input(input, { target: { value: '' } });
    expect(onChange).toHaveBeenCalled();
    const arg = onChange.mock.calls[0][0];
    expect(arg).not.toHaveProperty('per_action_limit_usd');
  });

  it('removes daily_limit_usd when cleared', () => {
    const onChange = vi.fn();
    render(
      <ActionCategoryLimitForm
        rules={{ category: 'trade', daily_limit_usd: 5000, tier_on_exceed: 'DELAY' }}
        onChange={onChange}
        errors={{}}
      />,
    );

    const input = screen.getByDisplayValue('5000');
    fireEvent.input(input, { target: { value: '' } });
    expect(onChange).toHaveBeenCalled();
    const arg = onChange.mock.calls[0][0];
    expect(arg).not.toHaveProperty('daily_limit_usd');
  });

  it('sets daily_limit_usd when given a value', () => {
    const onChange = vi.fn();
    render(
      <ActionCategoryLimitForm
        rules={{ category: 'trade', tier_on_exceed: 'DELAY' }}
        onChange={onChange}
        errors={{}}
      />,
    );

    const inputs = document.querySelectorAll('input[type="number"]');
    // daily_limit_usd is the second number input
    fireEvent.input(inputs[1]!, { target: { value: '8000' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ daily_limit_usd: 8000 }));
  });

  it('removes monthly_limit_usd when cleared', () => {
    const onChange = vi.fn();
    render(
      <ActionCategoryLimitForm
        rules={{ category: 'trade', monthly_limit_usd: 50000, tier_on_exceed: 'DELAY' }}
        onChange={onChange}
        errors={{}}
      />,
    );

    const input = screen.getByDisplayValue('50000');
    fireEvent.input(input, { target: { value: '' } });
    expect(onChange).toHaveBeenCalled();
    const arg = onChange.mock.calls[0][0];
    expect(arg).not.toHaveProperty('monthly_limit_usd');
  });

  it('sets monthly_limit_usd when given a value', () => {
    const onChange = vi.fn();
    render(
      <ActionCategoryLimitForm
        rules={{ category: 'trade', tier_on_exceed: 'DELAY' }}
        onChange={onChange}
        errors={{}}
      />,
    );

    const inputs = document.querySelectorAll('input[type="number"]');
    // monthly_limit_usd is the third number input
    fireEvent.input(inputs[2]!, { target: { value: '90000' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ monthly_limit_usd: 90000 }));
  });

  it('uses default category and tier when not provided', () => {
    const onChange = vi.fn();
    render(
      <ActionCategoryLimitForm
        rules={{}}
        onChange={onChange}
        errors={{}}
      />,
    );

    expect(screen.getByDisplayValue('Trade')).toBeTruthy();
    expect(screen.getByDisplayValue('Delay')).toBeTruthy();
  });

  it('displays error messages', () => {
    const onChange = vi.fn();
    render(
      <ActionCategoryLimitForm
        rules={{ category: 'trade', tier_on_exceed: 'DELAY' }}
        onChange={onChange}
        errors={{ per_action_limit_usd: 'Must be positive' }}
      />,
    );

    expect(screen.getByText('Must be positive')).toBeTruthy();
  });
});
