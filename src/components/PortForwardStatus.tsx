import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { PortForward, PortForwardHealth } from '../types/ssh';
import './PortForwardStatus.css';

interface PortForwardStatusProps {
  portForwards: PortForward[];
  /** Check interval in milliseconds (default: 10000 = 10s) */
  checkInterval?: number;
}

/**
 * Component that displays port forward status with health checks
 */
export function PortForwardStatus({ portForwards, checkInterval = 10000 }: PortForwardStatusProps) {
  const [healthStatus, setHealthStatus] = useState<Map<string, PortForwardHealth>>(new Map());

  useEffect(() => {
    if (!portForwards || portForwards.length === 0) {
      return;
    }

    // Initial health check
    checkAllPorts();

    // Set up periodic health checks
    const intervalId = setInterval(checkAllPorts, checkInterval);

    return () => clearInterval(intervalId);
  }, [portForwards, checkInterval]);

  const checkAllPorts = async () => {
    const newHealthStatus = new Map<string, PortForwardHealth>();

    for (const forward of portForwards) {
      try {
        // Use check_port_tool to verify if port is listening
        const result = await invoke<string>('check_port_tool', { 
          port: forward.localPort 
        });

        // Port is active if check_port returns "in use" or contains process info
        const isActive = result.toLowerCase().includes('in use') || 
                        result.toLowerCase().includes('listening');

        newHealthStatus.set(forward.id, {
          forwardId: forward.id,
          isActive,
          lastChecked: new Date(),
          error: isActive ? undefined : 'Port not listening',
        });
      } catch (error) {
        newHealthStatus.set(forward.id, {
          forwardId: forward.id,
          isActive: false,
          lastChecked: new Date(),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    setHealthStatus(newHealthStatus);
  };

  if (!portForwards || portForwards.length === 0) {
    return null;
  }

  return (
    <div className="port-forward-status">
      <div className="port-forward-status-header">
        <span className="port-forward-status-icon">🔌</span>
        <span className="port-forward-status-label">Port Forwards</span>
      </div>
      <div className="port-forward-list">
        {portForwards.map(forward => {
          const health = healthStatus.get(forward.id);
          const statusIcon = health?.isActive ? '🟢' : '🔴';
          const statusClass = health?.isActive ? 'active' : 'inactive';

          let forwardLabel = '';
          if (forward.type === 'local') {
            forwardLabel = `${forward.localPort} → ${forward.remoteHost}:${forward.remotePort}`;
          } else if (forward.type === 'remote') {
            forwardLabel = `${forward.remotePort} ← ${forward.remoteHost}:${forward.localPort}`;
          } else if (forward.type === 'dynamic') {
            forwardLabel = `SOCKS :${forward.localPort}`;
          }

          return (
            <div 
              key={forward.id} 
              className={`port-forward-item ${statusClass}`}
              title={health?.error || (health?.isActive ? 'Port is listening' : 'Checking...')}
            >
              <span className="port-forward-status-indicator">{statusIcon}</span>
              <span className="port-forward-label">{forwardLabel}</span>
              {forward.description && (
                <span className="port-forward-description">{forward.description}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
