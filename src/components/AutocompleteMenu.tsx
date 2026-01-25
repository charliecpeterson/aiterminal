import { useEffect, useRef, useState } from 'react';
import type { Suggestion } from '../terminal/autocomplete/llm';
import {
  autocompleteMenuStyles,
  getMenuItemStyle,
  getBadgeStyle,
} from './AutocompleteMenu.styles';

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
  const [hoverStates, setHoverStates] = useState<Record<string, boolean>>({});
  
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
      style={{
        ...autocompleteMenuStyles.menu,
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      {loading && suggestions.length === 0 && (
        <div style={getMenuItemStyle(false, false, true)}>
          <span style={autocompleteMenuStyles.spinner}>⟳</span> Loading suggestions...
        </div>
      )}
      
      {!loading && suggestions.length === 0 && (
        <div style={getMenuItemStyle(false, false, true)}>No suggestions</div>
      )}
      
      {suggestions.map((suggestion, index) => {
        const itemKey = `item-${index}`;
        const isSelected = index === selectedIndex;
        const isHover = hoverStates[itemKey] || false;
        
        return (
          <div
            key={index}
            style={getMenuItemStyle(isSelected, isHover, false)}
            onClick={() => onSelect(suggestion.text)}
            onMouseEnter={() => setHoverStates(prev => ({ ...prev, [itemKey]: true }))}
            onMouseLeave={() => setHoverStates(prev => ({ ...prev, [itemKey]: false }))}
          >
            <span style={autocompleteMenuStyles.command}>{suggestion.text}</span>
            <span style={getBadgeStyle(suggestion.source)}>
              {suggestion.source === 'llm' ? '✨' : '📚'}
            </span>
          </div>
        );
      })}
      
      {loading && suggestions.length > 0 && (
        <div style={getMenuItemStyle(false, false, true)}>
          <span style={autocompleteMenuStyles.spinner}>⟳</span> Loading more...
        </div>
      )}
    </div>
  );
}
