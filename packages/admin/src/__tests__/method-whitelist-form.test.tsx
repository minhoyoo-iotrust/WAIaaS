import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { MethodWhitelistForm } from '../components/policy-forms/method-whitelist-form';

describe('MethodWhitelistForm', () => {
  it('renders existing methods and add button', () => {
    const onChange = vi.fn();
    render(
      <MethodWhitelistForm
        rules={{ methods: [{ contractAddress: '0xabc', selectors: ['0xa9059cbb'] }] }}
        onChange={onChange}
        errors={{}}
      />,
    );

    expect(screen.getByDisplayValue('0xabc')).toBeTruthy();
    expect(screen.getByDisplayValue('0xa9059cbb')).toBeTruthy();
    expect(screen.getByText('+ Add Method Entry')).toBeTruthy();
  });

  it('adds a new method entry', () => {
    const onChange = vi.fn();
    render(
      <MethodWhitelistForm rules={{ methods: [] }} onChange={onChange} errors={{}} />,
    );

    fireEvent.click(screen.getByText('+ Add Method Entry'));
    expect(onChange).toHaveBeenCalledWith({
      methods: [{ contractAddress: '', selectors: [''] }],
    });
  });
});
