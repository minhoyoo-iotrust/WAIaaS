import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  registerDirty,
  unregisterDirty,
  saveAllDirty,
  discardAllDirty,
  hasDirty,
} from '../utils/dirty-guard';

beforeEach(() => {
  // Clean slate - unregister any leftover
  unregisterDirty('test-a');
  unregisterDirty('test-b');
});

afterEach(() => {
  unregisterDirty('test-a');
  unregisterDirty('test-b');
});

describe('dirty-guard', () => {
  it('hasDirty is false when no registrations', () => {
    expect(hasDirty.value).toBe(false);
  });

  it('registerDirty + hasDirty detects dirty state', () => {
    registerDirty({
      id: 'test-a',
      isDirty: () => true,
      save: vi.fn(),
      discard: vi.fn(),
    });
    expect(hasDirty.value).toBe(true);
  });

  it('hasDirty is false when registered but not dirty', () => {
    registerDirty({
      id: 'test-a',
      isDirty: () => false,
      save: vi.fn(),
      discard: vi.fn(),
    });
    expect(hasDirty.value).toBe(false);
  });

  it('unregisterDirty removes registration', () => {
    registerDirty({
      id: 'test-a',
      isDirty: () => true,
      save: vi.fn(),
      discard: vi.fn(),
    });
    expect(hasDirty.value).toBe(true);

    unregisterDirty('test-a');
    expect(hasDirty.value).toBe(false);
  });

  it('registerDirty replaces duplicate id', () => {
    registerDirty({
      id: 'test-a',
      isDirty: () => true,
      save: vi.fn(),
      discard: vi.fn(),
    });
    expect(hasDirty.value).toBe(true);

    // Replace with non-dirty version
    registerDirty({
      id: 'test-a',
      isDirty: () => false,
      save: vi.fn(),
      discard: vi.fn(),
    });
    expect(hasDirty.value).toBe(false);
  });

  it('saveAllDirty calls save on all dirty registrations', async () => {
    const saveFnA = vi.fn().mockResolvedValue(undefined);
    const saveFnB = vi.fn().mockResolvedValue(undefined);

    registerDirty({
      id: 'test-a',
      isDirty: () => true,
      save: saveFnA,
      discard: vi.fn(),
    });
    registerDirty({
      id: 'test-b',
      isDirty: () => false,
      save: saveFnB,
      discard: vi.fn(),
    });

    await saveAllDirty();

    expect(saveFnA).toHaveBeenCalledOnce();
    expect(saveFnB).not.toHaveBeenCalled();
  });

  it('saveAllDirty returns true on success', async () => {
    registerDirty({
      id: 'test-a',
      isDirty: () => true,
      save: vi.fn().mockResolvedValue(undefined),
      discard: vi.fn(),
    });

    const result = await saveAllDirty();
    expect(result).toBe(true);
  });

  it('saveAllDirty returns false when save throws', async () => {
    registerDirty({
      id: 'test-a',
      isDirty: () => true,
      save: vi.fn().mockRejectedValue(new Error('fail')),
      discard: vi.fn(),
    });

    const result = await saveAllDirty();
    expect(result).toBe(false);
  });

  it('discardAllDirty calls discard on all dirty registrations', () => {
    const discardFnA = vi.fn();
    const discardFnB = vi.fn();

    registerDirty({
      id: 'test-a',
      isDirty: () => true,
      save: vi.fn(),
      discard: discardFnA,
    });
    registerDirty({
      id: 'test-b',
      isDirty: () => false,
      save: vi.fn(),
      discard: discardFnB,
    });

    discardAllDirty();

    expect(discardFnA).toHaveBeenCalledOnce();
    expect(discardFnB).not.toHaveBeenCalled();
  });
});
