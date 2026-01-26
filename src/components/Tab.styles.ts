/**
 * Tab Component Styles using Design Tokens
 * 
 * Demonstrates migration of tab styling to the centralized design system.
 */

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


