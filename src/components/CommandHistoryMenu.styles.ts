import { CSSProperties } from 'react';
import { tokens } from '../styles/tokens';

/**
 * Token-based styles for CommandHistoryMenu component
 * Migrated from CommandHistoryMenu.css
 */

export const commandHistoryStyles = {
  // Overlay backdrop
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(4px)',
    zIndex: 10000,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: '15vh',
    animation: 'fadeIn 0.15s ease-out',
  } as CSSProperties,

  // Main menu container
  menu: {
    background: tokens.colors.bg.modal,
    border: `${tokens.borderWidth.thin} solid rgba(255, 255, 255, 0.15)`,
    borderRadius: tokens.borderRadius.xl,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
    width: '600px',
    maxHeight: '500px',
    display: 'flex',
    flexDirection: 'column',
    animation: 'slideDown 0.2s ease-out',
  } as CSSProperties,

  // Header section
  header: {
    padding: tokens.spacing[6],
    borderBottom: `${tokens.borderWidth.thin} solid ${tokens.colors.overlay.stronger}`,
  } as CSSProperties,

  // Search input
  search: {
    width: '100%',
    padding: `${tokens.spacing[5]} ${tokens.spacing[6]}`,
    background: tokens.colors.overlay.default,
    border: `${tokens.borderWidth.thin} solid ${tokens.colors.overlay.stronger}`,
    borderRadius: tokens.borderRadius.default,
    color: tokens.colors.white,
    fontSize: tokens.fontSize.lg,
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'all 0.2s',
    boxSizing: 'border-box',
  } as CSSProperties,

  searchFocus: {
    background: tokens.colors.overlay.strong,
    borderColor: tokens.colors.accent.focus,
  } as CSSProperties,

  // Hint text
  hint: {
    marginTop: tokens.spacing[4],
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.text.disabled,
    textAlign: 'center',
  } as CSSProperties,

  kbd: {
    display: 'inline-block',
    padding: `${tokens.spacing[1]} ${tokens.spacing[3]}`,
    background: tokens.colors.overlay.stronger,
    border: `${tokens.borderWidth.thin} solid rgba(255, 255, 255, 0.15)`,
    borderRadius: tokens.borderRadius.sm,
    fontSize: tokens.fontSize.xs,
    fontFamily: tokens.fontFamily.mono,
    margin: `0 ${tokens.spacing[1]}`,
  } as CSSProperties,

  // Commands list
  list: {
    overflowY: 'auto',
    flex: 1,
    padding: tokens.spacing[2],
  } as CSSProperties,

  // Empty state
  empty: {
    padding: `${tokens.spacing[20]} ${tokens.spacing[10]}`,
    textAlign: 'center',
    color: tokens.colors.text.disabled,
    fontSize: tokens.fontSize.md,
  } as CSSProperties,

  // Command item
  item: {
    padding: `${tokens.spacing[5]} ${tokens.spacing[6]}`,
    margin: `${tokens.spacing[1]} 0`,
    borderRadius: tokens.borderRadius.default,
    cursor: 'pointer',
    transition: tokens.transition.medium,
    border: `${tokens.borderWidth.thin} solid transparent`,
  } as CSSProperties,

  itemHover: {
    background: tokens.colors.overlay.default,
    borderColor: tokens.colors.accentOverlay.border,
  } as CSSProperties,

  itemSelected: {
    background: tokens.colors.accentOverlay.default,
    borderColor: tokens.colors.accentOverlay.hover,
  } as CSSProperties,

  // Item header
  itemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.spacing[3],
  } as CSSProperties,

  // Command text
  text: {
    fontFamily: tokens.fontFamily.mono,
    fontSize: tokens.fontSize.md,
    color: tokens.colors.text.tertiary,
    flex: 1,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginRight: tokens.spacing[6],
  } as CSSProperties,

  // Timestamp
  time: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.text.disabled,
    whiteSpace: 'nowrap',
  } as CSSProperties,

  // Item footer
  itemFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing[4],
    fontSize: tokens.fontSize.xs,
  } as CSSProperties,

  // Exit code badge
  exit: {
    padding: `${tokens.spacing[1]} ${tokens.spacing[3]}`,
    borderRadius: tokens.borderRadius.sm,
    fontWeight: tokens.fontWeight.medium,
    fontSize: tokens.fontSize.xs,
  } as CSSProperties,

  exitSuccess: {
    background: 'rgba(34, 197, 94, 0.15)',
    color: tokens.colors.semantic.successLight,
  } as CSSProperties,

  exitError: {
    background: 'rgba(239, 68, 68, 0.15)',
    color: tokens.colors.semantic.errorLight,
  } as CSSProperties,

  // Has output indicator
  hasOutput: {
    color: tokens.colors.text.disabled,
    fontSize: tokens.fontSize.xs,
  } as CSSProperties,

  // Actions container
  actions: {
    marginLeft: 'auto',
    display: 'flex',
    gap: tokens.spacing[2],
    opacity: 0,
    transition: 'opacity 0.15s',
  } as CSSProperties,

  actionsVisible: {
    opacity: 1,
  } as CSSProperties,

  // Action button
  action: {
    padding: `${tokens.spacing[1]} ${tokens.spacing[4]}`,
    background: tokens.colors.accentOverlay.light,
    color: tokens.colors.accent.strong,
    border: `${tokens.borderWidth.thin} solid ${tokens.colors.accentOverlay.border}`,
    borderRadius: tokens.borderRadius.sm,
    fontSize: tokens.fontSize.xs,
    fontWeight: tokens.fontWeight.medium,
    cursor: 'pointer',
    transition: tokens.transition.medium,
  } as CSSProperties,

  actionHover: {
    background: tokens.colors.accentOverlay.default,
    borderColor: tokens.colors.accentOverlay.borderMedium,
  } as CSSProperties,
};
