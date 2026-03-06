import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import { SearchInput } from '../components/search-input';

describe('SearchInput', () => {
  it('clears pending debounce timer on clear click', () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    render(<SearchInput value="hello" onSearch={onSearch} placeholder="Search..." />);

    // Type to start debounce timer
    const input = screen.getByPlaceholderText('Search...');
    fireEvent.input(input, { target: { value: 'typing' } });

    // Click clear before debounce fires — covers clearTimeout branch in handleClear
    const clearBtn = screen.getByText('x');
    fireEvent.click(clearBtn);
    expect(onSearch).toHaveBeenCalledWith('');

    // Advance time — debounced callback should NOT fire
    vi.advanceTimersByTime(500);
    expect(onSearch).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('debounces input', () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    render(<SearchInput value="" onSearch={onSearch} debounceMs={100} />);

    const input = screen.getByPlaceholderText('Search...');
    fireEvent.input(input, { target: { value: 'test' } });
    expect(onSearch).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(onSearch).toHaveBeenCalledWith('test');
    vi.useRealTimers();
  });
});
