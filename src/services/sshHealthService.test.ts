import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { emitTo } from '@tauri-apps/api/event';
import {
  checkPtyHealth,
  checkAndUpdateHealth,
  broadcastConnectionStatus,
  broadcastDisconnection,
  broadcastConnection,
  createHealthMonitor,
  deriveConnectionStatus,
  type HealthCheckResult,
} from './sshHealthService';
import { createInitialHealth } from '../types/terminalHealth';

// Mock the Tauri APIs
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  emitTo: vi.fn(),
}));

describe('sshHealthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkPtyHealth', () => {
    it('should return connected status for healthy SSH connection', async () => {
      vi.mocked(invoke)
        .mockResolvedValueOnce({ pty_type: 'ssh', remote_host: 'server.com' }) // get_pty_info
        .mockResolvedValueOnce(50); // measure_pty_latency
      
      const result = await checkPtyHealth(1);
      
      expect(result.isConnected).toBe(true);
      expect(result.isSSH).toBe(true);
      expect(result.latencyMs).toBe(50);
      expect(result.ptyInfo?.pty_type).toBe('ssh');
    });

    it('should return disconnected for local PTY', async () => {
      vi.mocked(invoke)
        .mockResolvedValueOnce({ pty_type: 'local', remote_host: null })
        .mockResolvedValueOnce(10);
      
      const result = await checkPtyHealth(1);
      
      expect(result.isConnected).toBe(false);
      expect(result.isSSH).toBe(false);
    });

    it('should return disconnected for negative latency', async () => {
      vi.mocked(invoke)
        .mockResolvedValueOnce({ pty_type: 'ssh', remote_host: 'server.com' })
        .mockResolvedValueOnce(-1); // Negative latency indicates failure
      
      const result = await checkPtyHealth(1);
      
      expect(result.isConnected).toBe(false);
      expect(result.latencyMs).toBeNull();
    });

    it('should handle PTY info failure gracefully', async () => {
      vi.mocked(invoke)
        .mockRejectedValueOnce(new Error('PTY not found'))
        .mockResolvedValueOnce(50);
      
      const result = await checkPtyHealth(1);
      
      expect(result.ptyInfo).toBeNull();
      expect(result.isSSH).toBe(false);
    });

    it('should handle latency measurement failure gracefully', async () => {
      vi.mocked(invoke)
        .mockResolvedValueOnce({ pty_type: 'ssh', remote_host: 'server.com' })
        .mockRejectedValueOnce(new Error('Timeout'));
      
      const result = await checkPtyHealth(1);
      
      expect(result.latencyMs).toBeNull();
      expect(result.isConnected).toBe(false);
    });

    it('should handle complete failure gracefully', async () => {
      vi.mocked(invoke).mockRejectedValue(new Error('Network error'));
      
      const result = await checkPtyHealth(1);
      
      expect(result.isConnected).toBe(false);
      expect(result.isSSH).toBe(false);
      expect(result.latencyMs).toBeNull();
      expect(result.ptyInfo).toBeNull();
    });
  });

  describe('checkAndUpdateHealth', () => {
    it('should update health with latency result', async () => {
      vi.mocked(invoke)
        .mockResolvedValueOnce({ pty_type: 'ssh', remote_host: 'server.com' })
        .mockResolvedValueOnce(50);
      
      const health = await checkAndUpdateHealth(1);
      
      expect(health.status).toBe('healthy');
      expect(health.latencyMs).toBe(50);
      expect(health.failureCount).toBe(0);
    });

    it('should increment failure count on failed check', async () => {
      vi.mocked(invoke).mockRejectedValue(new Error('Failed'));
      
      const initial = createInitialHealth();
      const health = await checkAndUpdateHealth(1, initial);
      
      expect(health.failureCount).toBe(1);
      expect(health.latencyMs).toBeNull();
    });

    it('should use provided current health state', async () => {
      vi.mocked(invoke).mockRejectedValue(new Error('Failed'));
      
      const current = { ...createInitialHealth(), failureCount: 2 };
      const health = await checkAndUpdateHealth(1, current);
      
      expect(health.failureCount).toBe(3);
    });
  });

  describe('broadcastConnectionStatus', () => {
    it('should emit status to SSH panel', async () => {
      vi.mocked(emitTo).mockResolvedValue(undefined);
      
      await broadcastConnectionStatus({
        ptyId: 1,
        profileId: 'profile-123',
        status: 'connected',
        latencyMs: 50,
        tabName: 'Server 1',
      });
      
      expect(emitTo).toHaveBeenCalledWith(
        'ssh-panel',
        'connection-status-update',
        expect.objectContaining({
          ptyId: '1',
          profileId: 'profile-123',
          status: 'connected',
          latency: 50,
          tabName: 'Server 1',
        })
      );
    });

    it('should use ptyId as tabId if not provided', async () => {
      vi.mocked(emitTo).mockResolvedValue(undefined);
      
      await broadcastConnectionStatus({
        ptyId: 1,
        profileId: 'profile-123',
        status: 'connected',
      });
      
      expect(emitTo).toHaveBeenCalledWith(
        'ssh-panel',
        'connection-status-update',
        expect.objectContaining({
          tabId: '1',
        })
      );
    });

    it('should handle emit failure gracefully', async () => {
      vi.mocked(emitTo).mockRejectedValue(new Error('Panel not open'));
      
      // Should not throw
      await expect(broadcastConnectionStatus({
        ptyId: 1,
        profileId: 'profile-123',
        status: 'connected',
      })).resolves.toBeUndefined();
    });
  });

  describe('broadcastDisconnection', () => {
    it('should broadcast disconnected status', async () => {
      vi.mocked(emitTo).mockResolvedValue(undefined);
      
      await broadcastDisconnection(1, 'profile-123', 'Server 1');
      
      expect(emitTo).toHaveBeenCalledWith(
        'ssh-panel',
        'connection-status-update',
        expect.objectContaining({
          ptyId: '1',
          profileId: 'profile-123',
          status: 'disconnected',
          tabName: 'Server 1',
        })
      );
    });

    it('should use empty profile ID by default', async () => {
      vi.mocked(emitTo).mockResolvedValue(undefined);
      
      await broadcastDisconnection(1);
      
      expect(emitTo).toHaveBeenCalledWith(
        'ssh-panel',
        'connection-status-update',
        expect.objectContaining({
          profileId: '',
        })
      );
    });
  });

  describe('broadcastConnection', () => {
    it('should broadcast connected status with latency', async () => {
      vi.mocked(emitTo).mockResolvedValue(undefined);
      
      await broadcastConnection(1, 'profile-123', 50, 'Server 1');
      
      expect(emitTo).toHaveBeenCalledWith(
        'ssh-panel',
        'connection-status-update',
        expect.objectContaining({
          ptyId: '1',
          profileId: 'profile-123',
          status: 'connected',
          latency: 50,
          tabName: 'Server 1',
        })
      );
    });
  });

  describe('createHealthMonitor', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should start monitoring immediately', async () => {
      vi.mocked(invoke)
        .mockResolvedValue({ pty_type: 'ssh', remote_host: 'server.com' })
        .mockResolvedValue(50);
      vi.mocked(emitTo).mockResolvedValue(undefined);
      
      const onStatusChange = vi.fn();
      const cleanup = createHealthMonitor(1, 'profile-123', 1000, onStatusChange);
      
      // Wait for initial check
      await vi.advanceTimersByTimeAsync(0);
      
      expect(invoke).toHaveBeenCalled();
      
      cleanup();
    });

    it('should call onStatusChange callback', async () => {
      vi.mocked(invoke)
        .mockResolvedValueOnce({ pty_type: 'ssh', remote_host: 'server.com' })
        .mockResolvedValueOnce(50);
      vi.mocked(emitTo).mockResolvedValue(undefined);
      
      const onStatusChange = vi.fn();
      const cleanup = createHealthMonitor(1, 'profile-123', 1000, onStatusChange);
      
      await vi.advanceTimersByTimeAsync(0);
      
      expect(onStatusChange).toHaveBeenCalledWith(expect.objectContaining({
        isSSH: true,
      }));
      
      cleanup();
    });

    it('should stop monitoring when cleanup is called', async () => {
      vi.mocked(invoke)
        .mockResolvedValue({ pty_type: 'ssh', remote_host: 'server.com' })
        .mockResolvedValue(50);
      vi.mocked(emitTo).mockResolvedValue(undefined);
      
      const cleanup = createHealthMonitor(1, 'profile-123', 1000);
      
      await vi.advanceTimersByTimeAsync(0);
      const callCountAfterStart = vi.mocked(invoke).mock.calls.length;
      
      cleanup();
      
      // Advance time significantly - no more calls should happen
      await vi.advanceTimersByTimeAsync(5000);
      
      expect(vi.mocked(invoke).mock.calls.length).toBe(callCountAfterStart);
    });

    it('should broadcast status changes', async () => {
      vi.mocked(invoke)
        .mockResolvedValueOnce({ pty_type: 'ssh', remote_host: 'server.com' })
        .mockResolvedValueOnce(50);
      vi.mocked(emitTo).mockResolvedValue(undefined);
      
      const cleanup = createHealthMonitor(1, 'profile-123', 1000);
      
      await vi.advanceTimersByTimeAsync(0);
      
      expect(emitTo).toHaveBeenCalledWith(
        'ssh-panel',
        'connection-status-update',
        expect.objectContaining({
          status: 'connected',
        })
      );
      
      cleanup();
    });
  });

  describe('deriveConnectionStatus', () => {
    it('should return connected for connected SSH', () => {
      const result: HealthCheckResult = {
        isConnected: true,
        isSSH: true,
        latencyMs: 50,
        ptyInfo: null,
      };
      
      expect(deriveConnectionStatus(result)).toBe('connected');
    });

    it('should return disconnected for non-SSH', () => {
      const result: HealthCheckResult = {
        isConnected: false,
        isSSH: false,
        latencyMs: 50,
        ptyInfo: null,
      };
      
      expect(deriveConnectionStatus(result)).toBe('disconnected');
    });

    it('should return error for SSH with null latency', () => {
      const result: HealthCheckResult = {
        isConnected: false,
        isSSH: true,
        latencyMs: null,
        ptyInfo: null,
      };
      
      expect(deriveConnectionStatus(result)).toBe('error');
    });

    it('should return disconnected for disconnected SSH with latency', () => {
      const result: HealthCheckResult = {
        isConnected: false,
        isSSH: true,
        latencyMs: 50, // Has latency but not connected (edge case)
        ptyInfo: null,
      };
      
      expect(deriveConnectionStatus(result)).toBe('disconnected');
    });
  });
});
