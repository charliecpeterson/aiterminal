import { useEffect, useRef } from 'react';
import type { Suggestion } from '../terminal/autocomplete/llm';
import './AutocompleteMenu.css';

interface Props {
  suggestions: Suggestion[];
  selectedIndex: number;
  position: { x: number; y: number };
  onSelect: (suggestion: string) => void;
  onClose: () => void;
  loading?: boolean;
}

export function AutocompleteMenu({
  suggestions,
  selectedIndex,
  position,
  onSelect,
  onClose,
  loading = false,
}: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);
  
  return (
    <div
      ref={menuRef}
      className="autocomplete-menu"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      {loading && suggestions.length === 0 && (
        <div className="menu-item loading">
          <span className="spinner">⟳</span> Loading suggestions...
        </div>
      )}
      
      {!loading && suggestions.length === 0 && (
        <div className="menu-item empty">No suggestions</div>
      )}
      
      {suggestions.map((suggestion, index) => (
        <div
          key={index}
          className={`menu-item ${index === selectedIndex ? 'selected' : ''}`}
          onClick={() => onSelect(suggestion.text)}
          onMouseEnter={() => {
            // Could add hover logic here if needed
          }}
        >
          <span className="command">{suggestion.text}</span>
          <span className={`badge badge-${suggestion.source}`}>
            {suggestion.source === 'llm' ? '✨' : '📚'}
          </span>
        </div>
      ))}
      
      {loading && suggestions.length > 0 && (
        <div className="menu-item loading-more">
          <span className="spinner">⟳</span> Loading more...
        </div>
      )}
    </div>
  );
}
