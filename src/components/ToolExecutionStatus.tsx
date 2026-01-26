/**
 * Tool Execution Status Component
 * 
 * Shows active tool executions with command preview, working directory,
 * and progress indicators.
 */

import { useState } from 'react';
import { toolExecutionStyles } from './ToolExecutionStatus.styles';

export interface ToolExecution {
  id: string;
  toolName: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  command?: string;
  workingDirectory?: string;
  result?: string;
  error?: string;
  startTime: number;
  endTime?: number;
}

interface ToolExecutionStatusProps {
  executions: ToolExecution[];
  onApprove?: (id: string) => void;
  onDeny?: (id: string) => void;
}

export function ToolExecutionStatus({ executions, onApprove, onDeny }: ToolExecutionStatusProps) {
  const activeExecutions = executions.filter(e => e.status !== 'completed' && e.status !== 'failed');
  const [hoverStates, setHoverStates] = useState<Record<string, boolean>>({});
  
  if (activeExecutions.length === 0) {
    return null;
  }

  return (
    <div style={toolExecutionStyles.status}>
      {activeExecutions.map((execution) => {
        const status = execution.status as 'pending' | 'running';
        return (
          <div 
            key={execution.id} 
            style={
              status === 'pending'
                ? { ...toolExecutionStyles.item, ...toolExecutionStyles.itemPending }
                : status === 'running'
                  ? { ...toolExecutionStyles.item, ...toolExecutionStyles.itemRunning }
                  : toolExecutionStyles.item
            }
          >
            <div style={toolExecutionStyles.header}>
              <span style={
                status === 'running'
                  ? { ...toolExecutionStyles.icon, ...toolExecutionStyles.iconRunning }
                  : status === 'pending'
                    ? { ...toolExecutionStyles.icon, ...toolExecutionStyles.iconPending }
                    : toolExecutionStyles.icon
              }>
                {execution.status === 'running' && '⚙️'}
                {execution.status === 'pending' && '⏳'}
              </span>
              <span style={toolExecutionStyles.name}>{execution.toolName}</span>
              {execution.status === 'running' && (
                <span style={toolExecutionStyles.statusText}>Running...</span>
              )}
              {execution.status === 'pending' && (
                <span style={toolExecutionStyles.statusText}>Awaiting approval</span>
              )}
            </div>
            
            {execution.command && (
              <div style={toolExecutionStyles.command}>
                <span style={toolExecutionStyles.label}>Command:</span>
                <code style={toolExecutionStyles.code}>{execution.command}</code>
              </div>
            )}
            
            {execution.workingDirectory && (
              <div style={toolExecutionStyles.directory}>
                <span style={toolExecutionStyles.label}>Directory:</span>
                <code style={toolExecutionStyles.code}>{execution.workingDirectory}</code>
              </div>
            )}
            
            {execution.status === 'pending' && onApprove && onDeny && (
              <div style={toolExecutionStyles.actions}>
                <button 
                  style={
                    hoverStates[`approve-${execution.id}`]
                      ? { ...toolExecutionStyles.actionButton, ...toolExecutionStyles.approve, ...toolExecutionStyles.approveHover }
                      : { ...toolExecutionStyles.actionButton, ...toolExecutionStyles.approve }
                  }
                  onClick={() => onApprove(execution.id)}
                  onMouseEnter={() => setHoverStates(prev => ({ ...prev, [`approve-${execution.id}`]: true }))}
                  onMouseLeave={() => setHoverStates(prev => ({ ...prev, [`approve-${execution.id}`]: false }))}
                >
                  ✓ Run
                </button>
                <button 
                  style={
                    hoverStates[`deny-${execution.id}`]
                      ? { ...toolExecutionStyles.actionButton, ...toolExecutionStyles.deny, ...toolExecutionStyles.denyHover }
                      : { ...toolExecutionStyles.actionButton, ...toolExecutionStyles.deny }
                  }
                  onClick={() => onDeny(execution.id)}
                  onMouseEnter={() => setHoverStates(prev => ({ ...prev, [`deny-${execution.id}`]: true }))}
                  onMouseLeave={() => setHoverStates(prev => ({ ...prev, [`deny-${execution.id}`]: false }))}
                >
                  ✗ Cancel
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
