import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/preact';
import { EmptyState } from '../components/empty-state';

afterEach(cleanup);

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="No items" />);
    expect(screen.getByText('No items')).toBeDefined();
  });

  it('renders description when provided', () => {
    render(<EmptyState title="No items" description="Try creating one" />);
    expect(screen.getByText('Try creating one')).toBeDefined();
  });

  it('does not render description when omitted', () => {
    render(<EmptyState title="No items" />);
    expect(screen.queryByText('Try creating one')).toBeNull();
  });

  it('renders action button when both actionLabel and onAction provided', () => {
    const onClick = vi.fn();
    render(<EmptyState title="Empty" actionLabel="Add" onAction={onClick} />);

    const button = screen.getByText('Add');
    expect(button).toBeDefined();

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not render button when actionLabel is missing', () => {
    const { container } = render(<EmptyState title="Empty" onAction={() => {}} />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('does not render button when onAction is missing', () => {
    render(<EmptyState title="Empty" actionLabel="Add" />);
    expect(screen.queryByText('Add')).toBeNull();
  });
});
