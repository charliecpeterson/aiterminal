/**
 * Tool Execution Status Component
 * 
 * Shows active tool executions with command preview, working directory,
 * and progress indicators.
 */

import './ToolExecutionStatus.css';

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
  
  if (activeExecutions.length === 0) {
    return null;
  }

  return (
    <div className="tool-execution-status">
      {activeExecutions.map((execution) => (
        <div key={execution.id} className={`tool-execution-item ${execution.status}`}>
          <div className="tool-execution-header">
            <span className="tool-icon">
              {execution.status === 'running' && '⚙️'}
              {execution.status === 'pending' && '⏳'}
            </span>
            <span className="tool-name">{execution.toolName}</span>
            {execution.status === 'running' && (
              <span className="tool-status">Running...</span>
            )}
            {execution.status === 'pending' && (
              <span className="tool-status">Awaiting approval</span>
            )}
          </div>
          
          {execution.command && (
            <div className="tool-command">
              <span className="tool-label">Command:</span>
              <code>{execution.command}</code>
            </div>
          )}
          
          {execution.workingDirectory && (
            <div className="tool-directory">
              <span className="tool-label">Directory:</span>
              <code>{execution.workingDirectory}</code>
            </div>
          )}
          
          {execution.status === 'pending' && onApprove && onDeny && (
            <div className="tool-actions">
              <button 
                className="tool-action-button approve"
                onClick={() => onApprove(execution.id)}
              >
                ✓ Run
              </button>
              <button 
                className="tool-action-button deny"
                onClick={() => onDeny(execution.id)}
              >
                ✗ Cancel
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
