import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeFiMonitorService } from '../services/monitoring/defi-monitor-service.js';
import type { IDeFiMonitor } from '@waiaas/core';

function createMockMonitor(name: string, overrides: Partial<IDeFiMonitor> = {}): IDeFiMonitor {
  return {
    name,
    start: vi.fn(),
    stop: vi.fn(),
    updateConfig: vi.fn(),
    ...overrides,
  };
}

describe('DeFiMonitorService', () => {
  let service: DeFiMonitorService;

  beforeEach(() => {
    service = new DeFiMonitorService();
  });

  describe('register', () => {
    it('should register a monitor', () => {
      const monitor = createMockMonitor('health-factor');
      service.register(monitor);
      expect(service.monitorCount).toBe(1);
    });

    it('should replace a monitor with the same name', () => {
      const m1 = createMockMonitor('health-factor');
      const m2 = createMockMonitor('health-factor');
      service.register(m1);
      service.register(m2);
      expect(service.monitorCount).toBe(1);
    });

    it('should register multiple monitors with different names', () => {
      service.register(createMockMonitor('health-factor'));
      service.register(createMockMonitor('maturity'));
      expect(service.monitorCount).toBe(2);
    });
  });

  describe('start', () => {
    it('should start all registered monitors', () => {
      const m1 = createMockMonitor('a');
      const m2 = createMockMonitor('b');
      service.register(m1);
      service.register(m2);
      service.start();
      expect(m1.start).toHaveBeenCalledOnce();
      expect(m2.start).toHaveBeenCalledOnce();
    });

    it('should continue starting other monitors if one throws', () => {
      const m1 = createMockMonitor('a', {
        start: vi.fn(() => { throw new Error('boom'); }),
      });
      const m2 = createMockMonitor('b');
      service.register(m1);
      service.register(m2);

      // Should not throw
      expect(() => service.start()).not.toThrow();
      expect(m2.start).toHaveBeenCalledOnce();
    });

    it('should do nothing with no monitors', () => {
      expect(() => service.start()).not.toThrow();
    });
  });

  describe('stop', () => {
    it('should stop all registered monitors', () => {
      const m1 = createMockMonitor('a');
      const m2 = createMockMonitor('b');
      service.register(m1);
      service.register(m2);
      service.stop();
      expect(m1.stop).toHaveBeenCalledOnce();
      expect(m2.stop).toHaveBeenCalledOnce();
    });

    it('should continue stopping other monitors if one throws', () => {
      const m1 = createMockMonitor('a', {
        stop: vi.fn(() => { throw new Error('boom'); }),
      });
      const m2 = createMockMonitor('b');
      service.register(m1);
      service.register(m2);

      expect(() => service.stop()).not.toThrow();
      expect(m2.stop).toHaveBeenCalledOnce();
    });

    it('should do nothing with no monitors', () => {
      expect(() => service.stop()).not.toThrow();
    });
  });

  describe('updateConfig', () => {
    it('should propagate config to all monitors', () => {
      const m1 = createMockMonitor('a');
      const m2 = createMockMonitor('b');
      service.register(m1);
      service.register(m2);

      const config = { threshold: 1.5 };
      service.updateConfig(config);
      expect(m1.updateConfig).toHaveBeenCalledWith(config);
      expect(m2.updateConfig).toHaveBeenCalledWith(config);
    });

    it('should handle monitors without updateConfig', () => {
      const m1 = createMockMonitor('a');
      delete (m1 as Record<string, unknown>).updateConfig;
      service.register(m1);

      expect(() => service.updateConfig({ foo: 'bar' })).not.toThrow();
    });

    it('should continue if one monitor throws on updateConfig', () => {
      const m1 = createMockMonitor('a', {
        updateConfig: vi.fn(() => { throw new Error('boom'); }),
      });
      const m2 = createMockMonitor('b');
      service.register(m1);
      service.register(m2);

      expect(() => service.updateConfig({ x: 1 })).not.toThrow();
      expect(m2.updateConfig).toHaveBeenCalledWith({ x: 1 });
    });
  });

  describe('monitorCount', () => {
    it('should return 0 when empty', () => {
      expect(service.monitorCount).toBe(0);
    });

    it('should return correct count', () => {
      service.register(createMockMonitor('a'));
      service.register(createMockMonitor('b'));
      service.register(createMockMonitor('c'));
      expect(service.monitorCount).toBe(3);
    });
  });
});
