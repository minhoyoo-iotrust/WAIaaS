/**
 * CLI prompt.ts coverage tests.
 *
 * Tests promptText utility with mocked readline.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('node:readline', () => {
  const questionFn = vi.fn();
  const closeFn = vi.fn();
  const onceFn = vi.fn();

  return {
    createInterface: vi.fn(() => ({
      question: questionFn,
      close: closeFn,
      once: onceFn,
    })),
    __mocks: { questionFn, closeFn, onceFn },
  };
});

describe('promptText', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('resolves with trimmed user input', async () => {
    const readline = await import('node:readline');
    const mocks = (readline as any).__mocks;

    // Make question call the callback with answer
    mocks.questionFn.mockImplementation((_prompt: string, cb: (answer: string) => void) => {
      cb('  hello world  ');
    });

    const { promptText } = await import('../utils/prompt.js');
    const result = await promptText('Enter text: ');

    expect(result).toBe('hello world');
    expect(mocks.closeFn).toHaveBeenCalled();
  });

  it('resolves with empty string for empty input', async () => {
    const readline = await import('node:readline');
    const mocks = (readline as any).__mocks;

    mocks.questionFn.mockImplementation((_prompt: string, cb: (answer: string) => void) => {
      cb('');
    });

    const { promptText } = await import('../utils/prompt.js');
    const result = await promptText('Enter text: ');

    expect(result).toBe('');
  });

  it('rejects on readline error', async () => {
    const readline = await import('node:readline');
    const mocks = (readline as any).__mocks;

    // Make question never call back, but once('error') triggers
    mocks.questionFn.mockImplementation(() => {});
    mocks.onceFn.mockImplementation((event: string, handler: (err: Error) => void) => {
      if (event === 'error') {
        handler(new Error('readline error'));
      }
    });

    const { promptText } = await import('../utils/prompt.js');
    await expect(promptText('Enter text: ')).rejects.toThrow('readline error');
  });
});
