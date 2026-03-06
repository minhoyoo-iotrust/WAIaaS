import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { Erc8128AllowedDomainsForm } from '../components/policy-forms/erc8128-allowed-domains-form';

describe('Erc8128AllowedDomainsForm', () => {
  it('renders existing domains and add button', () => {
    const onChange = vi.fn();
    render(
      <Erc8128AllowedDomainsForm
        rules={{ domains: ['api.example.com', 'service.io'] }}
        onChange={onChange}
        errors={{}}
      />,
    );

    expect(screen.getByDisplayValue('api.example.com')).toBeTruthy();
    expect(screen.getByDisplayValue('service.io')).toBeTruthy();
    expect(screen.getByText('+ Add Domain')).toBeTruthy();
  });

  it('calls onChange when adding a domain', () => {
    const onChange = vi.fn();
    render(
      <Erc8128AllowedDomainsForm
        rules={{ domains: ['a.com'] }}
        onChange={onChange}
        errors={{}}
      />,
    );

    fireEvent.click(screen.getByText('+ Add Domain'));
    expect(onChange).toHaveBeenCalledWith({ domains: ['a.com', ''] });
  });

  it('calls onChange when editing a domain', () => {
    const onChange = vi.fn();
    render(
      <Erc8128AllowedDomainsForm
        rules={{ domains: ['old.com'] }}
        onChange={onChange}
        errors={{}}
      />,
    );

    const input = screen.getByDisplayValue('old.com');
    fireEvent.input(input, { target: { value: 'new.com' } });
    expect(onChange).toHaveBeenCalledWith({ domains: ['new.com'] });
  });

  it('calls onChange when removing a domain', () => {
    const onChange = vi.fn();
    render(
      <Erc8128AllowedDomainsForm
        rules={{ domains: ['a.com', 'b.com'] }}
        onChange={onChange}
        errors={{}}
      />,
    );

    const removeButtons = screen.getAllByTitle('Remove');
    fireEvent.click(removeButtons[0]!);
    expect(onChange).toHaveBeenCalledWith({ domains: ['b.com'] });
  });

  it('renders empty state when no domains', () => {
    const onChange = vi.fn();
    render(
      <Erc8128AllowedDomainsForm
        rules={{}}
        onChange={onChange}
        errors={{}}
      />,
    );

    expect(screen.getByText('+ Add Domain')).toBeTruthy();
  });
});
