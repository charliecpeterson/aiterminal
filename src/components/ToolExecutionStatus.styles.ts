import { CSSProperties } from 'react';
import { tokens } from '../styles/tokens';

export const toolExecutionStyles = {
  // Container
  status: {
    margin: `${tokens.spacing[6]} 0`,
    padding: 0,
  } as CSSProperties,

  // Item base
  item: {
    background: tokens.colors.accentOverlay.light,
    border: `${tokens.borderWidth.thin} solid rgba(91, 141, 232, 0.25)`,
    borderRadius: tokens.borderRadius.xl,
    padding: `${tokens.spacing[6]} ${tokens.spacing[7]}`,
    marginBottom: tokens.spacing[4],
    fontSize: tokens.fontSize.md,
    animation: 'slideIn 0.15s ease-out',
  } as CSSProperties,

  itemPending: {
    background: 'rgba(255, 183, 77, 0.08)',
    borderColor: 'rgba(255, 183, 77, 0.3)',
  } as CSSProperties,

  itemRunning: {
    background: tokens.colors.accentOverlay.light,
    borderColor: 'rgba(91, 141, 232, 0.25)',
  } as CSSProperties,

  // Header
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing[4],
    marginBottom: tokens.spacing[4],
  } as CSSProperties,

  icon: {
    fontSize: tokens.fontSize.xl,
  } as CSSProperties,

  iconRunning: {
    animation: 'spin 1s linear infinite',
  } as CSSProperties,

  iconPending: {
    animation: 'pulse 1.5s ease-in-out infinite',
  } as CSSProperties,

  name: {
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.text.primary,
    textTransform: 'capitalize',
  } as CSSProperties,

  statusText: {
    marginLeft: 'auto',
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.text.disabled,
    fontStyle: 'italic',
  } as CSSProperties,

  // Command/Directory sections
  command: {
    margin: `${tokens.spacing[3]} 0`,
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacing[4],
  } as CSSProperties,

  directory: {
    margin: `${tokens.spacing[3]} 0`,
    display: 'flex',
    alignItems: 'flex-start',
    gap: tokens.spacing[4],
  } as CSSProperties,

  label: {
    fontWeight: tokens.fontWeight.medium,
    color: tokens.colors.text.disabled,
    minWidth: '70px',
    fontSize: tokens.fontSize.sm,
  } as CSSProperties,

  code: {
    background: 'rgba(0, 0, 0, 0.2)',
    padding: `${tokens.spacing[2]} ${tokens.spacing[4]}`,
    borderRadius: tokens.borderRadius.md,
    fontFamily: tokens.fontFamily.mono,
    fontSize: tokens.fontSize.sm,
    flex: 1,
    wordBreak: 'break-all',
  } as CSSProperties,

  // Actions
  actions: {
    display: 'flex',
    gap: tokens.spacing[4],
    marginTop: tokens.spacing[6],
    paddingTop: tokens.spacing[4],
    borderTop: `${tokens.borderWidth.thin} solid ${tokens.colors.overlay.stronger}`,
  } as CSSProperties,

  actionButton: {
    flex: 1,
    padding: `${tokens.spacing[3]} ${tokens.spacing[6]}`,
    border: 'none',
    borderRadius: tokens.borderRadius.lg,
    fontSize: tokens.fontSize.md,
    fontWeight: tokens.fontWeight.medium,
    cursor: 'pointer',
    transition: tokens.transition.fast,
  } as CSSProperties,

  // Approve button
  approve: {
    background: 'rgba(76, 175, 80, 0.2)',
    color: tokens.colors.semantic.success,
    border: `${tokens.borderWidth.thin} solid rgba(76, 175, 80, 0.4)`,
  } as CSSProperties,

  approveHover: {
    background: 'rgba(76, 175, 80, 0.3)',
    borderColor: 'rgba(76, 175, 80, 0.6)',
  } as CSSProperties,

  // Deny button
  deny: {
    background: 'rgba(244, 67, 54, 0.2)',
    color: tokens.colors.semantic.error,
    border: `${tokens.borderWidth.thin} solid rgba(244, 67, 54, 0.4)`,
  } as CSSProperties,

  denyHover: {
    background: 'rgba(244, 67, 54, 0.3)',
    borderColor: 'rgba(244, 67, 54, 0.6)',
  } as CSSProperties,
};
