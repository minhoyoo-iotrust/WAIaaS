import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { VenueWhitelistForm } from '../components/policy-forms/venue-whitelist-form';

describe('VenueWhitelistForm', () => {
  it('renders existing venues and add button', () => {
    const onChange = vi.fn();
    render(
      <VenueWhitelistForm
        rules={{ venues: [{ id: 'polymarket', name: 'Polymarket' }, { id: 'hyperliquid', name: '' }] }}
        onChange={onChange}
        errors={{}}
      />,
    );

    expect(screen.getByDisplayValue('polymarket')).toBeTruthy();
    expect(screen.getByDisplayValue('Polymarket')).toBeTruthy();
    expect(screen.getByDisplayValue('hyperliquid')).toBeTruthy();
    expect(screen.getByText('+ Add Venue')).toBeTruthy();
  });

  it('calls onChange when adding a venue', () => {
    const onChange = vi.fn();
    render(
      <VenueWhitelistForm
        rules={{ venues: [{ id: 'polymarket', name: '' }] }}
        onChange={onChange}
        errors={{}}
      />,
    );

    fireEvent.click(screen.getByText('+ Add Venue'));
    expect(onChange).toHaveBeenCalledWith({
      venues: [{ id: 'polymarket', name: '' }, { id: '', name: '' }],
    });
  });

  it('calls onChange when editing a venue id', () => {
    const onChange = vi.fn();
    render(
      <VenueWhitelistForm
        rules={{ venues: [{ id: 'old', name: '' }] }}
        onChange={onChange}
        errors={{}}
      />,
    );

    const input = screen.getByDisplayValue('old');
    fireEvent.input(input, { target: { value: 'new-venue' } });
    expect(onChange).toHaveBeenCalledWith({
      venues: [{ id: 'new-venue', name: '' }],
    });
  });

  it('calls onChange when removing a venue', () => {
    const onChange = vi.fn();
    render(
      <VenueWhitelistForm
        rules={{ venues: [{ id: 'a', name: '' }, { id: 'b', name: '' }] }}
        onChange={onChange}
        errors={{}}
      />,
    );

    const removeButtons = screen.getAllByTitle('Remove');
    fireEvent.click(removeButtons[0]!);
    expect(onChange).toHaveBeenCalledWith({
      venues: [{ id: 'b', name: '' }],
    });
  });

  it('renders empty state when no venues', () => {
    const onChange = vi.fn();
    render(
      <VenueWhitelistForm
        rules={{}}
        onChange={onChange}
        errors={{}}
      />,
    );

    expect(screen.getByText('+ Add Venue')).toBeTruthy();
  });

  it('calls onChange when editing a venue name', () => {
    const onChange = vi.fn();
    render(
      <VenueWhitelistForm
        rules={{ venues: [{ id: 'poly', name: 'Old Name' }] }}
        onChange={onChange}
        errors={{}}
      />,
    );

    const input = screen.getByDisplayValue('Old Name');
    fireEvent.input(input, { target: { value: 'New Name' } });
    expect(onChange).toHaveBeenCalledWith({
      venues: [{ id: 'poly', name: 'New Name' }],
    });
  });

  it('displays global venues error', () => {
    const onChange = vi.fn();
    render(
      <VenueWhitelistForm
        rules={{ venues: [] }}
        onChange={onChange}
        errors={{ venues: 'At least one venue required' }}
      />,
    );

    expect(screen.getByText('At least one venue required')).toBeTruthy();
  });

  it('displays error for venue field', () => {
    const onChange = vi.fn();
    render(
      <VenueWhitelistForm
        rules={{ venues: [{ id: '', name: '' }] }}
        onChange={onChange}
        errors={{ 'venues.0.id': 'Venue ID required' }}
      />,
    );

    expect(screen.getByText('Venue ID required')).toBeTruthy();
  });
});
