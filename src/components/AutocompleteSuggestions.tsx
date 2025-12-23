/**
 * Autocomplete Suggestions Menu Component
 * Displays dropdown menu with command/flag suggestions
 */

import { useEffect, useRef } from 'react';
import type { Suggestion } from '../terminal/autocomplete/types';
import './AutocompleteSuggestions.css';

interface AutocompleteSuggestionsProps {
  suggestions: Suggestion[];
  selectedIndex: number;
  position: { x: number; y: number };
  onSelect: (suggestion: Suggestion) => void;
  onClose: () => void;
}

export function AutocompleteSuggestions({
  suggestions,
  selectedIndex,
  position,
  onSelect,
  onClose: _onClose,
}: AutocompleteSuggestionsProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to selected item
  useEffect(() => {
    if (menuRef.current) {
      const selectedElement = menuRef.current.querySelector('.suggestion-item.selected');
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  if (suggestions.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="autocomplete-menu"
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      {suggestions.map((suggestion, index) => (
        <div
          key={`${suggestion.name}-${index}`}
          className={`suggestion-item ${index === selectedIndex ? 'selected' : ''}`}
          onClick={() => onSelect(suggestion)}
          onMouseEnter={() => {
            // Update selected index on hover (would need callback from parent)
          }}
        >
          <div className="suggestion-name">{suggestion.name}</div>
          {suggestion.description && (
            <div className="suggestion-description">{suggestion.description}</div>
          )}
        </div>
      ))}
      <div className="suggestion-footer">
        ↑↓ Navigate • Enter Accept • Esc Close
      </div>
    </div>
  );
}
