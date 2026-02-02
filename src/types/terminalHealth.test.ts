import { describe, it, expect } from 'vitest';
import {
  LATENCY_THRESHOLDS,
  HEALTH_CHECK_INTERVAL,
  MAX_FAILURE_COUNT,
  getHealthFromLatency,
  getHealthDescription,
  getHealthIndicator,
  getHealthColor,
  createInitialHealth,
  updateHealthWithLatency,
  type TerminalHealth,
} from './terminalHealth';

describe('terminalHealth', () => {
  describe('constants', () => {
    it('should have correct LATENCY_THRESHOLDS', () => {
      expect(LATENCY_THRESHOLDS.healthy).toBe(100);
      expect(LATENCY_THRESHOLDS.degraded).toBe(500);
    });

    it('should have correct HEALTH_CHECK_INTERVAL', () => {
      expect(HEALTH_CHECK_INTERVAL).toBe(5000);
    });

    it('should have correct MAX_FAILURE_COUNT', () => {
      expect(MAX_FAILURE_COUNT).toBe(3);
    });
  });

  describe('getHealthFromLatency', () => {
    it('should return unknown for null latency', () => {
      expect(getHealthFromLatency(null)).toBe('unknown');
    });

    it('should return unhealthy for negative latency', () => {
      expect(getHealthFromLatency(-1)).toBe('unhealthy');
    });

    it('should return healthy for latency <= 100ms', () => {
      expect(getHealthFromLatency(0)).toBe('healthy');
      expect(getHealthFromLatency(50)).toBe('healthy');
      expect(getHealthFromLatency(100)).toBe('healthy');
    });

    it('should return degraded for latency between 101-500ms', () => {
      expect(getHealthFromLatency(101)).toBe('degraded');
      expect(getHealthFromLatency(300)).toBe('degraded');
      expect(getHealthFromLatency(500)).toBe('degraded');
    });

    it('should return unhealthy for latency > 500ms', () => {
      expect(getHealthFromLatency(501)).toBe('unhealthy');
      expect(getHealthFromLatency(1000)).toBe('unhealthy');
    });
  });

  describe('getHealthDescription', () => {
    it('should describe healthy status', () => {
      const health: TerminalHealth = {
        status: 'healthy',
        latencyMs: 50,
        lastCheck: new Date(),
        failureCount: 0,
      };
      expect(getHealthDescription(health)).toBe('Healthy (50ms)');
    });

    it('should describe healthy status without latency', () => {
      const health: TerminalHealth = {
        status: 'healthy',
        latencyMs: null,
        lastCheck: new Date(),
        failureCount: 0,
      };
      expect(getHealthDescription(health)).toBe('Healthy');
    });

    it('should describe degraded status', () => {
      const health: TerminalHealth = {
        status: 'degraded',
        latencyMs: 300,
        lastCheck: new Date(),
        failureCount: 0,
      };
      expect(getHealthDescription(health)).toBe('Degraded - High latency (300ms)');
    });

    it('should describe unhealthy status with failures', () => {
      const health: TerminalHealth = {
        status: 'unhealthy',
        latencyMs: null,
        lastCheck: new Date(),
        failureCount: 3,
      };
      expect(getHealthDescription(health)).toBe('Unhealthy - 3 failed checks');
    });

    it('should describe unhealthy status with high latency', () => {
      const health: TerminalHealth = {
        status: 'unhealthy',
        latencyMs: 1000,
        lastCheck: new Date(),
        failureCount: 0,
      };
      expect(getHealthDescription(health)).toBe('Unhealthy - Very high latency (1000ms)');
    });

    it('should describe unknown status', () => {
      const health: TerminalHealth = {
        status: 'unknown',
        latencyMs: null,
        lastCheck: null,
        failureCount: 0,
      };
      expect(getHealthDescription(health)).toBe('Status unknown');
    });
  });

  describe('getHealthIndicator', () => {
    it('should return green circle for healthy', () => {
      expect(getHealthIndicator('healthy')).toBe('🟢');
    });

    it('should return yellow circle for degraded', () => {
      expect(getHealthIndicator('degraded')).toBe('🟡');
    });

    it('should return red circle for unhealthy', () => {
      expect(getHealthIndicator('unhealthy')).toBe('🔴');
    });

    it('should return white circle for unknown', () => {
      expect(getHealthIndicator('unknown')).toBe('⚪');
    });
  });

  describe('getHealthColor', () => {
    it('should return green for healthy', () => {
      expect(getHealthColor('healthy')).toBe('#22c55e');
    });

    it('should return yellow for degraded', () => {
      expect(getHealthColor('degraded')).toBe('#eab308');
    });

    it('should return red for unhealthy', () => {
      expect(getHealthColor('unhealthy')).toBe('#ef4444');
    });

    it('should return gray for unknown', () => {
      expect(getHealthColor('unknown')).toBe('#6b7280');
    });
  });

  describe('createInitialHealth', () => {
    it('should create health with unknown status', () => {
      const health = createInitialHealth();
      
      expect(health.status).toBe('unknown');
      expect(health.latencyMs).toBeNull();
      expect(health.lastCheck).toBeNull();
      expect(health.failureCount).toBe(0);
    });
  });

  describe('updateHealthWithLatency', () => {
    it('should update to healthy with good latency', () => {
      const current = createInitialHealth();
      const updated = updateHealthWithLatency(current, 50);
      
      expect(updated.status).toBe('healthy');
      expect(updated.latencyMs).toBe(50);
      expect(updated.failureCount).toBe(0);
      expect(updated.lastCheck).toBeInstanceOf(Date);
    });

    it('should update to degraded with moderate latency', () => {
      const current = createInitialHealth();
      const updated = updateHealthWithLatency(current, 300);
      
      expect(updated.status).toBe('degraded');
      expect(updated.latencyMs).toBe(300);
    });

    it('should update to unhealthy with high latency', () => {
      const current = createInitialHealth();
      const updated = updateHealthWithLatency(current, 600);
      
      expect(updated.status).toBe('unhealthy');
      expect(updated.latencyMs).toBe(600);
    });

    it('should increment failure count on null latency', () => {
      const current = createInitialHealth();
      const updated = updateHealthWithLatency(current, null);
      
      expect(updated.failureCount).toBe(1);
      expect(updated.latencyMs).toBeNull();
    });

    it('should increment failure count on negative latency', () => {
      const current = createInitialHealth();
      const updated = updateHealthWithLatency(current, -1);
      
      expect(updated.failureCount).toBe(1);
    });

    it('should become unhealthy after MAX_FAILURE_COUNT failures', () => {
      let health = createInitialHealth();
      
      // Simulate failures up to threshold
      for (let i = 0; i < MAX_FAILURE_COUNT; i++) {
        health = updateHealthWithLatency(health, null);
      }
      
      expect(health.status).toBe('unhealthy');
      expect(health.failureCount).toBe(MAX_FAILURE_COUNT);
    });

    it('should reset failure count on successful check', () => {
      let health = createInitialHealth();
      
      // Add some failures
      health = updateHealthWithLatency(health, null);
      health = updateHealthWithLatency(health, null);
      expect(health.failureCount).toBe(2);
      
      // Successful check
      health = updateHealthWithLatency(health, 50);
      expect(health.failureCount).toBe(0);
      expect(health.status).toBe('healthy');
    });
  });
});
