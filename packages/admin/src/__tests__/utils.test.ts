import { describe, it, expect } from 'vitest';
import { getErrorMessage } from '../utils/error-messages';
import { formatUptime, formatDate, formatAddress } from '../utils/format';

describe('getErrorMessage', () => {
  it('should return mapped message for known code', () => {
    expect(getErrorMessage('INVALID_MASTER_PASSWORD')).toBe('Invalid master password. Please try again.');
    expect(getErrorMessage('KILL_SWITCH_ACTIVE')).toBe('Kill switch is active. All operations are suspended.');
  });

  it('should return fallback for unknown code', () => {
    expect(getErrorMessage('UNKNOWN_CODE_XYZ')).toBe('An error occurred (UNKNOWN_CODE_XYZ).');
  });
});

describe('formatUptime', () => {
  it('should format days/hours/minutes', () => {
    expect(formatUptime(90061)).toBe('1d 1h 1m');
    expect(formatUptime(3660)).toBe('1h 1m');
    expect(formatUptime(120)).toBe('2m');
    expect(formatUptime(0)).toBe('0m');
  });
});

describe('formatDate', () => {
  it('should format unix timestamp to YYYY-MM-DD HH:mm', () => {
    const result = formatDate(1707609600); // 2024-02-11 in UTC
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});

describe('formatAddress', () => {
  it('should truncate long addresses', () => {
    expect(formatAddress('abcdefghijklmnop')).toBe('abcd..mnop');
  });
  it('should return short addresses unchanged', () => {
    expect(formatAddress('short')).toBe('short');
  });
});
