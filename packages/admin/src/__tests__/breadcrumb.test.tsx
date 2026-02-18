import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { Breadcrumb } from '../components/breadcrumb';
import { getPageSubtitle } from '../components/layout';

describe('Breadcrumb', () => {
  it('renders breadcrumb with page name and tab name', () => {
    render(<Breadcrumb pageName="Wallets" tabName="Overview" />);

    expect(screen.getByText('Wallets')).toBeTruthy();
    expect(screen.getByText('Overview')).toBeTruthy();
    // Separator is > rendered as &gt;
    expect(screen.getByText('>')).toBeTruthy();
  });

  it('returns null when tabName is not provided', () => {
    const { container } = render(<Breadcrumb pageName="Dashboard" />);

    expect(container.innerHTML).toBe('');
  });

  it('calls onPageClick when page name is clicked', () => {
    const onPageClick = vi.fn();
    render(
      <Breadcrumb pageName="Wallets" tabName="Balances" onPageClick={onPageClick} />,
    );

    fireEvent.click(screen.getByText('Wallets'));
    expect(onPageClick).toHaveBeenCalledOnce();
  });

  it('has correct aria attributes', () => {
    render(<Breadcrumb pageName="Policies" tabName="Rules" />);

    const nav = screen.getByLabelText('Breadcrumb');
    expect(nav).toBeTruthy();
    expect(nav.tagName).toBe('NAV');

    const current = screen.getByText('Rules');
    expect(current.getAttribute('aria-current')).toBe('page');
  });

  it('does not render for Dashboard-like usage without tabName', () => {
    const { container } = render(<Breadcrumb pageName="Dashboard" />);

    expect(container.innerHTML).toBe('');
    expect(container.querySelector('.breadcrumb')).toBeNull();
  });
});

describe('PageHeader subtitle', () => {
  it('returns subtitle for dashboard', () => {
    expect(getPageSubtitle('/dashboard')).toBeTruthy();
  });

  it('returns subtitle for all 7 main pages', () => {
    const paths = [
      '/dashboard',
      '/wallets',
      '/sessions',
      '/policies',
      '/notifications',
      '/walletconnect',
      '/settings',
    ];

    for (const path of paths) {
      expect(getPageSubtitle(path)).toBeTruthy();
    }
  });

  it('returns undefined for unknown path', () => {
    expect(getPageSubtitle('/unknown')).toBeUndefined();
  });

  it('returns undefined for wallet detail path', () => {
    expect(getPageSubtitle('/wallets/123')).toBeUndefined();
  });
});
