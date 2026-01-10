import { useState } from 'react';

interface ContextUsageDisplayProps {
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
}

/**
 * Display which context was used for an AI response
 */
export function ContextUsageDisplay({ usedContext }: ContextUsageDisplayProps) {
  const [expanded, setExpanded] = useState(false);

  if (!usedContext) return null;

  return (
    <details className="ai-context-usage" open={expanded} onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}>
      <summary className="ai-context-usage-summary">
        <span className="ai-context-badge">
          {usedContext.mode === 'smart' ? '🎯' : '📋'} Context Used
        </span>
        <span className="ai-context-count">
          {usedContext.chunkCount} item{usedContext.chunkCount !== 1 ? 's' : ''}
          {usedContext.mode === 'smart' && typeof usedContext.alwaysIncludedCount === 'number' && (
            <> ({usedContext.alwaysIncludedCount} prioritized)</>
          )}
        </span>
      </summary>
      
      {usedContext.chunks && usedContext.chunks.length > 0 && (
        <div className="ai-context-items">
          {usedContext.chunks.map((chunk, idx) => (
            <div key={idx} className="ai-context-item">
              <div className="ai-context-item-header">
                <span className="ai-context-item-type">{chunk.sourceType}</span>
                {chunk.path && <span className="ai-context-item-path">{chunk.path}</span>}
              </div>
              <div className="ai-context-item-preview">
                {chunk.text.substring(0, 150)}
                {chunk.text.length > 150 && '...'}
              </div>
            </div>
          ))}
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
      { text: '🔍 Explain error', prompt: 'Explain why this command failed and suggest a fix' },
      { text: '🔧 Suggest fix', prompt: 'What command should I run to fix this?' },
    );
  }

  // Command-specific suggestions
  if (lastCommand) {
    if (lastCommand.includes('git')) {
      suggestions.push({ text: '📚 Git help', prompt: 'Explain what this git command does' });
    }
    
    if (lastCommand.includes('npm') || lastCommand.includes('yarn')) {
      suggestions.push({ text: '📦 Package help', prompt: 'Explain this package manager command' });
    }

    if (lastExitCode === 0) {
      suggestions.push({ text: '➡️ What next?', prompt: 'What should I do next after this command?' });
    }
  }

  // General suggestions
  if (suggestions.length < 3) {
    suggestions.push(
      { text: '📋 Summarize', prompt: 'Summarize the last few commands and outputs' },
      { text: '💡 Optimize', prompt: 'How can I optimize my workflow here?' },
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
