/**
 * Tool Progress Display
 * 
 * Shows real-time progress of AI tool executions during multi-step operations.
 */

import { useState, useMemo } from 'react';
import type { ToolProgress } from '../context/AIContext';
import { tokens } from '../styles/tokens';

interface ToolProgressDisplayProps {
  toolProgress?: ToolProgress[];
}

/**
 * Get a human-friendly tool name
 */
function getToolDisplayName(toolName: string): string {
  const names: Record<string, string> = {
    get_current_directory: 'Getting current directory',
    execute_command: 'Executing command',
    read_file: 'Reading file',
    list_directory: 'Listing directory',
    search_files: 'Searching files',
    get_environment_variable: 'Getting env variable',
    write_file: 'Writing file',
    append_to_file: 'Appending to file',
    replace_in_file: 'Replacing in file',
    undo_file_change: 'Undoing file change',
    list_file_backups: 'Listing file backups',
    diff_files: 'Comparing files',
    git_status: 'Checking git status',
    find_process: 'Finding process',
    check_port: 'Checking port',
    get_system_info: 'Getting system info',
    tail_file: 'Reading file tail',
    make_directory: 'Creating directory',
    get_git_diff: 'Getting git diff',
    calculate: 'Calculating',
    web_search: 'Searching web',
    get_file_info: 'Getting file info',
    read_multiple_files: 'Reading multiple files',
    grep_in_files: 'Searching in files',
    analyze_error: 'Analyzing error',
    find_errors_in_file: 'Scanning for errors',
    file_sections: 'Reading file section',
    get_shell_history: 'Getting shell history',
  };
  
  return names[toolName] || toolName;
}

/**
 * Format tool arguments for display
 */
function formatArgs(args?: Record<string, any>): string {
  if (!args) return '';
  
  const entries = Object.entries(args);
  if (entries.length === 0) return '';
  
  // Show only the most relevant arg
  const [, value] = entries[0];
  const strValue = String(value);
  
  if (strValue.length > 40) {
    return `${strValue.substring(0, 40)}...`;
  }
  
  return strValue;
}

/**
 * Get icon for tool status
 */
function getStatusIcon(status: ToolProgress['status']): string {
  switch (status) {
    case 'running': return '⏳';
    case 'completed': return '✓';
    case 'failed': return '✗';
  }
}

/**
 * Get color for tool status
 */
function getStatusColor(status: ToolProgress['status']): string {
  switch (status) {
    case 'running': return 'rgba(91, 141, 232, 0.8)'; // Blue
    case 'completed': return 'rgba(74, 222, 128, 0.8)'; // Green
    case 'failed': return 'rgba(239, 68, 68, 0.8)'; // Red
  }
}

/**
 * Calculate execution time
 */
function getExecutionTime(tool: ToolProgress): string {
  const endTime = tool.endTime || Date.now();
  const duration = endTime - tool.startTime;
  
  if (duration < 1000) {
    return `${duration}ms`;
  }
  
  return `${(duration / 1000).toFixed(1)}s`;
}

export function ToolProgressDisplay({ toolProgress }: ToolProgressDisplayProps) {
  const [expanded, setExpanded] = useState(false);

  if (!toolProgress || toolProgress.length === 0) return null;

  const { runningCount, failedCount } = useMemo(() => ({
    runningCount: toolProgress?.filter(t => t.status === 'running').length ?? 0,
    failedCount: toolProgress?.filter(t => t.status === 'failed').length ?? 0,
  }), [toolProgress]);

  return (
    <details 
      open={expanded} 
      onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}
      style={{
        marginTop: tokens.spacing[6],
        fontSize: '12px',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        paddingTop: tokens.spacing[6],
      }}
    >
      <summary 
        style={{ 
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: tokens.spacing[2],
          userSelect: 'none',
          color: 'rgba(255, 255, 255, 0.7)',
          fontWeight: 500,
        }}
      >
        <span style={{ opacity: 0.6 }}>🔧</span>
        <span>
          {runningCount > 0 ? (
            <>Running {runningCount} tool{runningCount !== 1 ? 's' : ''}...</>
          ) : (
            <>
              Used {toolProgress.length} tool{toolProgress.length !== 1 ? 's' : ''}
              {failedCount > 0 && <> ({failedCount} failed)</>}
            </>
          )}
        </span>
      </summary>
      
      {expanded && (
        <div style={{ 
          marginTop: tokens.spacing[4],
          display: 'flex',
          flexDirection: 'column',
          gap: tokens.spacing[3],
        }}>
          {toolProgress.map((tool) => (
            <div 
              key={tool.toolCallId}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: tokens.spacing[3],
                padding: `${tokens.spacing[3]} ${tokens.spacing[4]}`,
                background: 'rgba(255, 255, 255, 0.03)',
                border: `1px solid ${
                  tool.status === 'running' 
                    ? 'rgba(91, 141, 232, 0.3)' 
                    : 'rgba(255, 255, 255, 0.08)'
                }`,
                borderRadius: tokens.borderRadius.md,
                fontSize: '11px',
              }}
            >
              <span 
                style={{ 
                  color: getStatusColor(tool.status),
                  fontSize: '14px',
                  lineHeight: 1,
                }}
              >
                {getStatusIcon(tool.status)}
              </span>
              
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ 
                  fontWeight: 600, 
                  marginBottom: tokens.spacing[1],
                  color: 'rgba(255, 255, 255, 0.9)',
                }}>
                  {getToolDisplayName(tool.toolName)}
                  <span style={{ 
                    marginLeft: tokens.spacing[2],
                    opacity: 0.5,
                    fontWeight: 400,
                  }}>
                    {getExecutionTime(tool)}
                  </span>
                </div>
                
                {tool.args && (
                  <div style={{ 
                    opacity: 0.6,
                    marginBottom: tokens.spacing[1],
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {formatArgs(tool.args)}
                  </div>
                )}
                
                {tool.error && (
                  <div style={{ 
                    color: 'rgba(239, 68, 68, 0.9)',
                    marginTop: tokens.spacing[1],
                  }}>
                    Error: {tool.error}
                  </div>
                )}
                
                {tool.status === 'completed' && tool.result && tool.result.length > 0 && (
                  <div style={{ 
                    marginTop: tokens.spacing[2],
                    padding: tokens.spacing[2],
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: tokens.borderRadius.sm,
                    fontFamily: 'monospace',
                    fontSize: '10px',
                    opacity: 0.7,
                    maxHeight: '60px',
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {tool.result.substring(0, 200)}
                    {tool.result.length > 200 && '...'}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}
