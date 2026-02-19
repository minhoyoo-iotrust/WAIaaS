vi.mock('../utils/dirty-guard', () => ({
  saveAllDirty: vi.fn(),
  discardAllDirty: vi.fn(),
  hasDirty: { value: false },
  registerDirty: vi.fn(),
  unregisterDirty: vi.fn(),
}));

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/preact';
import {
  UnsavedDialog,
  pendingAction,
  showUnsavedDialog,
} from '../components/unsaved-dialog';
import { saveAllDirty, discardAllDirty } from '../utils/dirty-guard';

beforeEach(() => {
  pendingAction.value = null;
  vi.clearAllMocks();
});

afterEach(() => {
  pendingAction.value = null;
  cleanup();
});

describe('UnsavedDialog', () => {
  it('renders nothing when pendingAction is null', () => {
    const { container } = render(<UnsavedDialog />);
    expect(container.innerHTML).toBe('');
  });

  it('renders dialog when pendingAction is set', () => {
    showUnsavedDialog({ type: 'tab', execute: vi.fn() });
    render(<UnsavedDialog />);

    expect(screen.getByText('Unsaved Changes')).toBeDefined();
    expect(screen.getByText('Cancel')).toBeDefined();
    expect(screen.getByText('Discard & Navigate')).toBeDefined();
    expect(screen.getByText('Save & Navigate')).toBeDefined();
  });

  it('Cancel closes dialog', () => {
    showUnsavedDialog({ type: 'tab', execute: vi.fn() });
    render(<UnsavedDialog />);

    fireEvent.click(screen.getByText('Cancel'));
    expect(pendingAction.value).toBeNull();
  });

  it('Discard & Navigate calls discardAllDirty and executes action', () => {
    const executeFn = vi.fn();
    showUnsavedDialog({ type: 'nav', execute: executeFn });
    render(<UnsavedDialog />);

    fireEvent.click(screen.getByText('Discard & Navigate'));

    expect(discardAllDirty).toHaveBeenCalled();
    expect(executeFn).toHaveBeenCalled();
    expect(pendingAction.value).toBeNull();
  });

  it('Save & Navigate calls saveAllDirty and executes action on success', async () => {
    vi.mocked(saveAllDirty).mockResolvedValueOnce(true);
    const executeFn = vi.fn();
    showUnsavedDialog({ type: 'nav', execute: executeFn });
    render(<UnsavedDialog />);

    fireEvent.click(screen.getByText('Save & Navigate'));

    await waitFor(() => {
      expect(executeFn).toHaveBeenCalled();
    });
    expect(saveAllDirty).toHaveBeenCalled();
    expect(pendingAction.value).toBeNull();
  });

  it('Save & Navigate keeps dialog open when save fails', async () => {
    vi.mocked(saveAllDirty).mockResolvedValueOnce(false);
    const executeFn = vi.fn();
    showUnsavedDialog({ type: 'tab', execute: executeFn });
    render(<UnsavedDialog />);

    fireEvent.click(screen.getByText('Save & Navigate'));

    await waitFor(() => {
      expect(saveAllDirty).toHaveBeenCalled();
    });
    expect(executeFn).not.toHaveBeenCalled();
    expect(pendingAction.value).not.toBeNull();
  });

  it('clicking overlay calls cancel', () => {
    showUnsavedDialog({ type: 'tab', execute: vi.fn() });
    const { container } = render(<UnsavedDialog />);

    const overlay = container.querySelector('.modal-overlay');
    expect(overlay).toBeDefined();
    fireEvent.click(overlay!);
    expect(pendingAction.value).toBeNull();
  });

  it('clicking modal-card does not close dialog (stopPropagation)', () => {
    showUnsavedDialog({ type: 'tab', execute: vi.fn() });
    const { container } = render(<UnsavedDialog />);

    const card = container.querySelector('.modal-card');
    expect(card).toBeDefined();
    fireEvent.click(card!);
    expect(pendingAction.value).not.toBeNull();
  });
});
