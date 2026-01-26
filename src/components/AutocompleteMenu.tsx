import { useEffect, useRef, useState } from 'react';
import type { Suggestion } from '../terminal/autocomplete/llm';
import { autocompleteMenuStyles } from './AutocompleteMenu.styles';

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
        <div
          style={{
            ...autocompleteMenuStyles.menuItem,
            ...autocompleteMenuStyles.menuItemState,
            ...autocompleteMenuStyles.stateNoHover,
          }}
        >
          <span style={autocompleteMenuStyles.spinner}>⟳</span> Loading suggestions...
        </div>
      )}
      
      {!loading && suggestions.length === 0 && (
        <div
          style={{
            ...autocompleteMenuStyles.menuItem,
            ...autocompleteMenuStyles.menuItemState,
            ...autocompleteMenuStyles.stateNoHover,
          }}
        >
          No suggestions
        </div>
      )}
      
      {suggestions.map((suggestion, index) => {
        const itemKey = `item-${index}`;
        const isSelected = index === selectedIndex;
        const isHover = hoverStates[itemKey] || false;
        
        return (
          <div
            key={index}
            style={
              isSelected
                ? {
                    ...autocompleteMenuStyles.menuItem,
                    ...autocompleteMenuStyles.menuItemSelected,
                  }
                : isHover
                  ? {
                      ...autocompleteMenuStyles.menuItem,
                      ...autocompleteMenuStyles.menuItemHover,
                    }
                  : autocompleteMenuStyles.menuItem
            }
            onClick={() => onSelect(suggestion.text)}
            onMouseEnter={() => setHoverStates(prev => ({ ...prev, [itemKey]: true }))}
            onMouseLeave={() => setHoverStates(prev => ({ ...prev, [itemKey]: false }))}
          >
            <span style={autocompleteMenuStyles.command}>{suggestion.text}</span>
            <span
              style={
                suggestion.source === 'llm'
                  ? {
                      ...autocompleteMenuStyles.badge,
                      ...autocompleteMenuStyles.badgeLlm,
                    }
                  : {
                      ...autocompleteMenuStyles.badge,
                      ...autocompleteMenuStyles.badgeHistory,
                    }
              }
            >
              {suggestion.source === 'llm' ? '✨' : '📚'}
            </span>
          </div>
        );
      })}
      
      {loading && suggestions.length > 0 && (
        <div
          style={{
            ...autocompleteMenuStyles.menuItem,
            ...autocompleteMenuStyles.menuItemState,
            ...autocompleteMenuStyles.stateNoHover,
          }}
        >
          <span style={autocompleteMenuStyles.spinner}>⟳</span> Loading more...
        </div>
      )}
    </div>
  );
}
