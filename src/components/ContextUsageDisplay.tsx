import { useState } from 'react';
import type { ChatMessage } from '../context/AIContext';
import type { RoutingDecision, PromptEnhancement } from '../types/routing';

interface MessageMetricsProps {
  metrics?: ChatMessage['metrics'];
  usedContext?: {
    mode: 'smart' | 'full';
    chunkCount: number;
    alwaysIncludedCount?: number;
    chunks?: Array<{
      sourceType: string;
      path?: string | null;
      text: string;
    }>;
  };
  routingDecision?: RoutingDecision;
  promptEnhancement?: PromptEnhancement;
}

/**
 * Display performance metrics for an AI response in a sleek, compact way
 */
export function MessageMetrics({ metrics, usedContext, routingDecision, promptEnhancement }: MessageMetricsProps) {
  const [expanded, setExpanded] = useState(false);

  if (!metrics) return null;

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatTokens = (count: number) => {
    if (count < 1000) return count.toString();
    return `${(count / 1000).toFixed(1)}k`;
  };

  return (
    <details 
      className="ai-metrics" 
      open={expanded} 
      onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}
      style={{
        marginTop: '8px',
        fontSize: '12px',
        color: 'var(--text-secondary, #888)',
        borderTop: '1px solid var(--border-color, #333)',
        paddingTop: '8px',
      }}
    >
      <summary 
        style={{ 
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          userSelect: 'none',
        }}
      >
        <span>
          {formatTime(metrics.timings.total)}
          {' • '}
          {formatTokens(metrics.tokens.total)} tokens
          {metrics.toolCalls && metrics.toolCalls > 0 && (
            <> • {metrics.toolCalls} tool{metrics.toolCalls !== 1 ? 's' : ''}</>
          )}
          {usedContext && (
            <> • {usedContext.chunkCount} context item{usedContext.chunkCount !== 1 ? 's' : ''}</>
          )}
        </span>
      </summary>
      
      {expanded && (
        <div style={{ 
          marginTop: '8px',
          paddingLeft: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}>
          <div>
            <strong>Model:</strong> {metrics.model} ({metrics.mode} mode)
          </div>
          <div>
            <strong>Time:</strong> {formatTime(metrics.timings.total)}
            {metrics.timings.firstToken && (
              <> (first token: {formatTime(metrics.timings.firstToken)})</>
            )}
          </div>
          <div>
            <strong>Tokens:</strong> {metrics.tokens.input} in, {metrics.tokens.output} out
            {' '}({formatTokens(metrics.tokens.total)} total)
          </div>
          {metrics.toolCalls !== undefined && metrics.toolCalls > 0 && (
            <div>
              <strong>Tool calls:</strong> {metrics.toolCalls}
            </div>
          )}
          
          {usedContext && (
            <div style={{ 
              marginTop: '8px',
              paddingTop: '8px',
              borderTop: '1px solid var(--border-color, #333)',
            }}>
              <div style={{ marginBottom: '6px' }}>
                <strong>Context:</strong> {usedContext.mode} mode, {usedContext.chunkCount} item{usedContext.chunkCount !== 1 ? 's' : ''}
                {usedContext.mode === 'smart' && typeof usedContext.alwaysIncludedCount === 'number' && (
                  <> ({usedContext.alwaysIncludedCount} prioritized)</>
                )}
              </div>
              
              {usedContext.chunks && usedContext.chunks.length > 0 && (
                <div style={{ 
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}>
                  {usedContext.chunks.map((chunk, idx) => (
                    <div key={idx} style={{
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '4px',
                      padding: '6px 8px',
                      fontSize: '11px',
                    }}>
                      <div style={{ 
                        display: 'flex', 
                        gap: '8px', 
                        marginBottom: '4px',
                        opacity: 0.7,
                      }}>
                        <span style={{ fontWeight: 600 }}>{chunk.sourceType}</span>
                        {chunk.path && <span style={{ opacity: 0.6 }}>{chunk.path}</span>}
                      </div>
                      <div style={{ opacity: 0.5, fontFamily: 'monospace', fontSize: '10px' }}>
                        {chunk.text.substring(0, 150)}
                        {chunk.text.length > 150 && '...'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {/* Routing Decision (if available) */}
          {routingDecision && (
            <div style={{ 
              marginTop: '8px',
              paddingTop: '8px',
              borderTop: '1px solid var(--border-color, #333)',
            }}>
              <div style={{ marginBottom: '6px' }}>
                <strong>Routing:</strong> {routingDecision.tier} tier
                {' '}(complexity: {routingDecision.reasoning.score}/100)
              </div>
              <div style={{ 
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                fontSize: '11px',
                opacity: 0.8,
              }}>
                <div>
                  <span style={{ opacity: 0.6 }}>Model:</span> {routingDecision.model}
                  {routingDecision.fallbackUsed && (
                    <span style={{ color: '#f5a623', marginLeft: '6px' }}>fallback</span>
                  )}
                </div>
                <div>
                  <span style={{ opacity: 0.6 }}>Budget:</span> {routingDecision.contextBudget} tokens
                </div>
                <div>
                  <span style={{ opacity: 0.6 }}>Type:</span> {routingDecision.reasoning.queryType}
                </div>
                <div>
                  <span style={{ opacity: 0.6 }}>Temperature:</span> {routingDecision.temperature}
                </div>
              </div>
            </div>
          )}
          
          {/* Prompt Enhancement (if applied) */}
          {promptEnhancement?.wasEnhanced && (
            <div style={{ 
              marginTop: '8px',
              paddingTop: '8px',
              borderTop: '1px solid var(--border-color, #333)',
            }}>
              <div style={{ marginBottom: '6px' }}>
                <strong>Prompt Enhanced:</strong> {promptEnhancement.reason}
              </div>
              <div style={{
                fontSize: '11px',
                opacity: 0.7,
                fontStyle: 'italic',
              }}>
                "{promptEnhancement.enhanced}"
              </div>
            </div>
          )}
        </div>
      )}
    </details>
  );
}

interface QuickActionSuggestionsProps {
  lastCommand?: string;
  lastExitCode?: number;
  onSuggestionClick: (text: string) => void;
}

/**
 * Suggest quick actions based on terminal state
 */
export function QuickActionSuggestions({ lastCommand, lastExitCode, onSuggestionClick }: QuickActionSuggestionsProps) {
  const suggestions: Array<{ text: string; prompt: string }> = [];

  // Error-specific suggestions
  if (lastExitCode && lastExitCode !== 0) {
    suggestions.push(
      { text: 'Explain error', prompt: 'Explain why this command failed and suggest a fix' },
      { text: 'Suggest fix', prompt: 'What command should I run to fix this?' },
    );
  }

  // Command-specific suggestions
  if (lastCommand) {
    if (lastCommand.includes('git')) {
      suggestions.push({ text: 'Git help', prompt: 'Explain what this git command does' });
    }
    
    if (lastCommand.includes('npm') || lastCommand.includes('yarn')) {
      suggestions.push({ text: 'Package help', prompt: 'Explain this package manager command' });
    }

    if (lastExitCode === 0) {
      suggestions.push({ text: 'What next?', prompt: 'What should I do next after this command?' });
    }
  }

  // General suggestions
  if (suggestions.length < 3) {
    suggestions.push(
      { text: 'Summarize', prompt: 'Summarize the last few commands and outputs' },
      { text: 'Optimize', prompt: 'How can I optimize my workflow here?' },
    );
  }

  return (
    <div className="ai-quick-suggestions">
      {suggestions.slice(0, 3).map((suggestion, idx) => (
        <button
          key={idx}
          className="ai-suggestion-chip"
          onClick={() => onSuggestionClick(suggestion.prompt)}
        >
          {suggestion.text}
        </button>
      ))}
    </div>
  );
}
