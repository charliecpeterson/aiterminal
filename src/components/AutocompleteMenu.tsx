import { useEffect, useRef } from 'react';
import { Loader, Sparkles, BookOpen } from 'lucide-react';
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
          <Loader size={12} className="animate-spin" /> Loading suggestions...
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
        const isSelected = index === selectedIndex;

        return (
          <div
            key={index}
            className={isSelected ? '' : 'autocomplete-item'}
            style={
              isSelected
                ? {
                    ...autocompleteMenuStyles.menuItem,
                    ...autocompleteMenuStyles.menuItemSelected,
                  }
                : autocompleteMenuStyles.menuItem
            }
            onClick={() => onSelect(suggestion.text)}
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
              {suggestion.source === 'llm' ? <Sparkles size={12} /> : <BookOpen size={12} />}
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
          <Loader size={12} className="animate-spin" /> Loading more...
        </div>
      )}
    </div>
  );
}
