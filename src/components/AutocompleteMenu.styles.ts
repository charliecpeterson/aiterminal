import { CSSProperties } from 'react';
import { tokens } from '../styles/tokens';

export const autocompleteMenuStyles = {
  // Main menu container
  menu: {
    position: 'fixed',
    background: tokens.colors.bg.card,
    border: `${tokens.borderWidth.thin} solid ${tokens.colors.border.subtle}`,
    borderRadius: tokens.borderRadius.lg,
    boxShadow: tokens.boxShadow.default,
    minWidth: '300px',
    maxWidth: '600px',
    maxHeight: '320px',
    overflowY: 'auto',
    zIndex: 10000,
    fontFamily: tokens.fontFamily.mono,
    fontSize: tokens.fontSize.md,
    padding: `${tokens.spacing[2]} 0`,
  } as CSSProperties,

  // Menu item base
  menuItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `${tokens.spacing[4]} ${tokens.spacing[6]}`,
    cursor: 'pointer',
    transition: tokens.transition.fast,
    color: tokens.colors.text.muted,
  } as CSSProperties,

  menuItemHover: {
    background: 'rgba(255, 255, 255, 0.03)',
  } as CSSProperties,

  menuItemSelected: {
    background: '#094771',
    color: tokens.colors.text.primary,
  } as CSSProperties,

  // Command text
  command: {
    flex: 1,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontFamily: 'inherit',
  } as CSSProperties,

  // Badge
  badge: {
    marginLeft: tokens.spacing[6],
    padding: `${tokens.spacing[1]} ${tokens.spacing[3]}`,
    borderRadius: tokens.borderRadius.sm,
    fontSize: tokens.fontSize.xs,
    fontWeight: tokens.fontWeight.semibold,
    flexShrink: 0,
  } as CSSProperties,

  badgeLlm: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: tokens.colors.white,
  } as CSSProperties,

  badgeHistory: {
    background: '#4d4d4d',
    color: tokens.colors.white,
  } as CSSProperties,

  // Loading/Empty states
  menuItemState: {
    color: '#999999',
    fontStyle: 'italic',
    justifyContent: 'center',
    cursor: 'default',
  } as CSSProperties,

  stateNoHover: {
    background: 'transparent',
  } as CSSProperties,

  // Spinner
  spinner: {
    display: 'inline-block',
    animation: 'spin 1s linear infinite',
    marginRight: tokens.spacing[3],
  } as CSSProperties,
};
