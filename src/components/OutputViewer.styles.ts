import { CSSProperties } from 'react';
import { tokens } from '../styles/tokens';

/**
 * Token-based styles for OutputViewer component
 * Migrated from OutputViewer.css
 */

export const outputViewerStyles = {
  // Main container
  viewer: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    width: '100vw',
    background: tokens.colors.bg.primary,
    color: '#d4d4d4',
    fontFamily: tokens.fontFamily.mono,
  } as CSSProperties,

  // Header section
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `${tokens.spacing[6]} ${tokens.spacing[8]}`,
    background: '#2d2d2d',
    borderBottom: `${tokens.borderWidth.thin} solid ${tokens.colors.border.subtle}`,
    flexShrink: 0,
  } as CSSProperties,

  title: {
    fontSize: tokens.fontSize.lg,
    fontWeight: tokens.fontWeight.semibold,
    color: '#d4d4d4',
  } as CSSProperties,

  // Actions section
  actions: {
    display: 'flex',
    gap: tokens.spacing[4],
    alignItems: 'center',
  } as CSSProperties,

  matchCount: {
    fontSize: tokens.fontSize.sm,
    color: '#d4d4d4',
    opacity: 0.9,
    minWidth: '52px',
    textAlign: 'right',
  } as CSSProperties,

  // Search input
  search: {
    padding: `${tokens.spacing[3]} ${tokens.spacing[6]}`,
    background: tokens.colors.bg.input,
    border: `${tokens.borderWidth.thin} solid ${tokens.colors.border.subtle}`,
    borderRadius: tokens.borderRadius.default,
    color: '#d4d4d4',
    fontSize: tokens.fontSize.md,
    outline: 'none',
    minWidth: '200px',
    transition: tokens.transition.fast,
  } as CSSProperties,

  searchFocus: {
    borderColor: '#007acc',
  } as CSSProperties,

  // Buttons
  btn: {
    padding: `${tokens.spacing[3]} ${tokens.spacing[8]}`,
    background: '#0e639c',
    color: tokens.colors.white,
    border: 'none',
    borderRadius: tokens.borderRadius.default,
    fontSize: tokens.fontSize.md,
    cursor: 'pointer',
    transition: 'background 0.2s',
  } as CSSProperties,

  btnHover: {
    background: '#1177bb',
  } as CSSProperties,

  btnActive: {
    background: '#0d5a8f',
  } as CSSProperties,

  // Content wrapper
  contentWrap: {
    position: 'relative',
    flex: 1,
    minHeight: 0,
  } as CSSProperties,

  // Content area
  content: {
    height: '100%',
    overflow: 'auto',
    padding: tokens.spacing[8],
  } as CSSProperties,

  // Pre element inside content
  pre: {
    margin: 0,
    padding: 0,
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
    fontFamily: 'inherit',
    fontSize: tokens.fontSize.md,
    lineHeight: tokens.lineHeight.relaxed,
    color: '#d4d4d4',
  } as CSSProperties,

  // Ruler (scrollbar indicators)
  ruler: {
    position: 'absolute',
    top: 0,
    right: '2px',
    height: '100%',
    width: '8px',
    pointerEvents: 'none',
  } as CSSProperties,

  // Tick marks on ruler
  tick: {
    position: 'absolute',
    right: 0,
    width: '6px',
    height: '2px',
    background: '#007acc',
    opacity: 0.55,
    borderRadius: tokens.borderRadius.sm,
    transform: 'translateY(-50%)',
  } as CSSProperties,

  tickActive: {
    height: '4px',
    opacity: 0.95,
  } as CSSProperties,

  // Highlight styles
  highlight: {
    background: 'rgba(0, 122, 204, 0.28)',
    borderRadius: tokens.borderRadius.sm,
  } as CSSProperties,

  highlightActive: {
    background: 'rgba(0, 122, 204, 0.55)',
    outline: `${tokens.borderWidth.thin} solid #007acc`,
  } as CSSProperties,

  // Scrollbar styles (webkit-specific, applied via style object)
  scrollbar: {
    width: '12px',
    height: '12px',
  } as CSSProperties,
};

/**
 * Helper functions for dynamic styles
 */

export function getSearchStyle(isFocused: boolean): CSSProperties {
  return isFocused
    ? { ...outputViewerStyles.search, ...outputViewerStyles.searchFocus }
    : outputViewerStyles.search;
}

export function getButtonStyle(isHover: boolean, isActive: boolean = false): CSSProperties {
  if (isActive) {
    return { ...outputViewerStyles.btn, ...outputViewerStyles.btnActive };
  }
  return isHover
    ? { ...outputViewerStyles.btn, ...outputViewerStyles.btnHover }
    : outputViewerStyles.btn;
}

export function getTickStyle(isActive: boolean): CSSProperties {
  return isActive
    ? { ...outputViewerStyles.tick, ...outputViewerStyles.tickActive }
    : outputViewerStyles.tick;
}

export function getHighlightStyle(isActive: boolean): CSSProperties {
  return isActive
    ? { ...outputViewerStyles.highlight, ...outputViewerStyles.highlightActive }
    : outputViewerStyles.highlight;
}
