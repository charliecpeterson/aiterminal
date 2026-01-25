/**
 * Tab Component Styles using Design Tokens
 * 
 * Demonstrates migration of tab styling to the centralized design system.
 */

import { CSSProperties } from 'react';
import { tokens } from '../styles/tokens';

// ============================================================================
// TAB STYLES
// ============================================================================

export const tabStyles = {
  // Tab bar container
  tabBar: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing[1],
    background: tokens.colors.bg.secondary,
    borderBottom: `${tokens.borderWidth.thin} solid ${tokens.colors.border.default}`,
    padding: `0 ${tokens.spacing[4]}`,
    minHeight: tokens.tab.height,
  },
  
  // Individual tab
  tab: {
    height: tokens.tab.height,
    padding: tokens.tab.padding,
    fontSize: tokens.tab.fontSize,
    fontWeight: tokens.tab.fontWeight,
    borderRadius: tokens.tab.borderRadius,
    border: 'none',
    background: tokens.tab.bg.default,
    color: tokens.tab.text.default,
    cursor: 'pointer',
    transition: tokens.transition.fast,
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacing[3],
    whiteSpace: 'nowrap' as const,
    maxWidth: '200px',
    overflow: 'hidden' as const,
  },
  
  tabHover: {
    background: tokens.tab.bg.hover,
    color: tokens.tab.text.hover,
  },
  
  tabActive: {
    background: tokens.tab.bg.active,
    color: tokens.tab.text.active,
    borderBottom: `${tokens.borderWidth.medium} solid ${tokens.colors.accent.primary}`,
  },
  
  // Tab label
  tabLabel: {
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  
  // Tab close button
  tabCloseButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '16px',
    height: '16px',
    padding: 0,
    border: 'none',
    background: 'transparent',
    color: tokens.tab.text.default,
    borderRadius: tokens.borderRadius.sm,
    cursor: 'pointer',
    opacity: 0.7,
    transition: tokens.transition.fast,
    flexShrink: 0,
  },
  
  tabCloseButtonHover: {
    opacity: 1,
    background: tokens.colors.overlay.strong,
    color: tokens.colors.white,
  },
  
  // New tab button
  newTabButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    padding: 0,
    border: 'none',
    background: tokens.colors.overlay.light,
    color: tokens.colors.text.muted,
    borderRadius: tokens.borderRadius.default,
    cursor: 'pointer',
    transition: tokens.transition.fast,
    marginLeft: tokens.spacing[2],
  },
  
  newTabButtonHover: {
    background: tokens.colors.overlay.strong,
    color: tokens.colors.white,
  },
  
  // Tab badge/indicator (e.g., for notifications)
  tabBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '16px',
    height: '16px',
    padding: `0 ${tokens.spacing[2]}`,
    background: tokens.colors.accent.primary,
    color: tokens.colors.white,
    borderRadius: tokens.borderRadius.full,
    fontSize: tokens.fontSize.xs,
    fontWeight: tokens.fontWeight.semibold,
  },
  
  // Split indicator (for panes)
  splitIndicator: {
    width: '4px',
    height: '4px',
    borderRadius: tokens.borderRadius.full,
    background: tokens.colors.text.disabled,
    marginLeft: tokens.spacing[2],
  },
  
  splitIndicatorActive: {
    background: tokens.colors.accent.primary,
  },
} as const;

// ============================================================================
// TAB VARIANTS
// ============================================================================

/**
 * Get tab style based on state
 */
export function getTabStyle(isActive: boolean, isHover: boolean = false): CSSProperties {
  if (isActive) {
    return { ...tabStyles.tab, ...tabStyles.tabActive };
  }
  if (isHover) {
    return { ...tabStyles.tab, ...tabStyles.tabHover };
  }
  return tabStyles.tab;
}

/**
 * Get tab close button style based on state
 */
export function getTabCloseButtonStyle(isHover: boolean = false): CSSProperties {
  if (isHover) {
    return { ...tabStyles.tabCloseButton, ...tabStyles.tabCloseButtonHover };
  }
  return tabStyles.tabCloseButton;
}

// ============================================================================
// USAGE EXAMPLE
// ============================================================================

/*
import { tabStyles, getTabStyle } from './Tab.styles';

function TabBar({ tabs, activeTabId, onTabClick, onTabClose, onNewTab }) {
  const [hoveredTab, setHoveredTab] = useState<number | null>(null);
  
  return (
    <div style={tabStyles.tabBar}>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          style={getTabStyle(tab.id === activeTabId, hoveredTab === tab.id)}
          onClick={() => onTabClick(tab.id)}
          onMouseEnter={() => setHoveredTab(tab.id)}
          onMouseLeave={() => setHoveredTab(null)}
        >
          <span style={tabStyles.tabLabel}>{tab.title}</span>
          {tab.splitLayout !== 'single' && (
            <div style={
              tab.id === activeTabId 
                ? {...tabStyles.splitIndicator, ...tabStyles.splitIndicatorActive}
                : tabStyles.splitIndicator
            } />
          )}
          <button
            style={getTabCloseButtonStyle(hoveredTab === tab.id)}
            onClick={(e) => {
              e.stopPropagation();
              onTabClose(tab.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        style={tabStyles.newTabButton}
        onClick={onNewTab}
        title="New Tab"
      >
        +
      </button>
    </div>
  );
}
*/

// ============================================================================
// MIGRATION NOTES
// ============================================================================

/*
Key improvements with design tokens:

1. Consistency:
   - All tabs use the same spacing, colors, and transitions
   - Changes to the design system automatically propagate

2. Maintainability:
   - Update tokens.ts once to change all tab styling
   - No need to search through CSS files

3. Type Safety:
   - TypeScript ensures correct property values
   - Autocomplete for all token values

4. Reusability:
   - Helper functions encapsulate common patterns
   - Easy to create variants (primary, secondary, etc.)

5. Performance:
   - Inline styles with tokens are tree-shakeable
   - No unused CSS in production bundle
*/
