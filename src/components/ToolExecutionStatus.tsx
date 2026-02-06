/**
 * Tool Execution Status Component
 *
 * Shows active tool executions with command preview, working directory,
 * and progress indicators.
 */

import { useMemo } from 'react';
import { Settings, Loader, Check, X } from 'lucide-react';
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
  const activeExecutions = useMemo(() =>
    executions.filter(e => e.status !== 'completed' && e.status !== 'failed')
  , [executions]);

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
              <span style={toolExecutionStyles.icon}>
                {execution.status === 'running' && <Settings size={16} className="animate-spin" />}
                {execution.status === 'pending' && <Loader size={16} className="animate-spin" />}
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
                  className="btn-success"
                  style={toolExecutionStyles.actionButton}
                  onClick={() => onApprove(execution.id)}
                >
                  <Check size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Run
                </button>
                <button
                  className="btn-danger"
                  style={toolExecutionStyles.actionButton}
                  onClick={() => onDeny(execution.id)}
                >
                  <X size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Cancel
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
