import { CSSProperties } from 'react';
import { tokens } from '../styles/tokens';

export const settingsModalStyles = {
  // Overlay
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: tokens.zIndex.modal,
  } as CSSProperties,

  // Modal
  modal: {
    background: '#0d0e12',
    width: '600px',
    height: '500px',
    borderRadius: tokens.borderRadius.lg,
    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.6)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    border: `${tokens.borderWidth.thin} solid rgba(255, 255, 255, 0.08)`,
  } as CSSProperties,

  // Header
  header: {
    padding: `${tokens.spacing[8]} ${tokens.spacing[10]}`,
    borderBottom: `${tokens.borderWidth.thin} solid rgba(255, 255, 255, 0.06)`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'rgba(0, 0, 0, 0.2)',
  } as CSSProperties,

  headerTitle: {
    margin: 0,
    fontSize: tokens.fontSize.lg,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.text.tertiary,
  } as CSSProperties,

  closeButton: {
    background: 'none',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: tokens.fontSize['2xl'],
    cursor: 'pointer',
    padding: 0,
    transition: tokens.transition.fast,
  } as CSSProperties,

  closeButtonHover: {
    color: tokens.colors.white,
  } as CSSProperties,

  // Content
  content: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  } as CSSProperties,

  // Sidebar
  sidebar: {
    width: '140px',
    background: 'rgba(0, 0, 0, 0.25)',
    borderRight: `${tokens.borderWidth.thin} solid rgba(255, 255, 255, 0.06)`,
    padding: `${tokens.spacing[4]} 0`,
  } as CSSProperties,

  tab: {
    padding: `${tokens.spacing[5]} ${tokens.spacing[8]}`,
    cursor: 'pointer',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: tokens.fontSize.sm,
    fontWeight: tokens.fontWeight.medium,
    transition: tokens.transition.fast,
  } as CSSProperties,

  tabHover: {
    background: 'rgba(255, 255, 255, 0.05)',
    color: 'rgba(255, 255, 255, 0.8)',
  } as CSSProperties,

  tabActive: {
    background: 'rgba(255, 255, 255, 0.08)',
    color: tokens.colors.text.tertiary,
    borderLeft: `2px solid ${tokens.colors.accent.primary}`,
  } as CSSProperties,

  // Panel
  panel: {
    flex: 1,
    padding: tokens.spacing[10],
    overflowY: 'auto',
  } as CSSProperties,

  // Form groups
  formGroup: {
    marginBottom: tokens.spacing[10],
  } as CSSProperties,

  formLabel: {
    display: 'block',
    marginBottom: tokens.spacing[4],
    color: tokens.colors.text.secondary,
    fontSize: tokens.fontSize.md,
  } as CSSProperties,

  formInput: {
    width: '100%',
    padding: tokens.spacing[4],
    background: '#3c3c3c',
    border: `${tokens.borderWidth.thin} solid #3e3e42`,
    color: tokens.colors.text.secondary,
    borderRadius: tokens.borderRadius.md,
    fontSize: tokens.fontSize.md,
    boxSizing: 'border-box',
  } as CSSProperties,

  formInputFocus: {
    borderColor: '#007fd4',
    outline: 'none',
  } as CSSProperties,

  // Checkbox
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing[5],
    cursor: 'pointer',
    marginBottom: 0,
  } as CSSProperties,

  checkboxInput: {
    width: 'auto',
    cursor: 'pointer',
    margin: 0,
  } as CSSProperties,

  checkboxText: {
    color: tokens.colors.text.secondary,
    fontSize: tokens.fontSize.md,
  } as CSSProperties,

  // Form hint
  formHint: {
    marginTop: tokens.spacing[3],
    fontSize: tokens.fontSize.xs,
    color: '#858585',
    lineHeight: 1.4,
  } as CSSProperties,

  // Footer
  footer: {
    padding: `${tokens.spacing[7]} ${tokens.spacing[10]}`,
    borderTop: `${tokens.borderWidth.thin} solid #3e3e42`,
    display: 'flex',
    justifyContent: 'flex-end',
    gap: tokens.spacing[5],
  } as CSSProperties,

  // Buttons
  button: {
    padding: `${tokens.spacing[3]} ${tokens.spacing[6]}`,
    borderRadius: tokens.borderRadius.md,
    cursor: 'pointer',
    fontSize: tokens.fontSize.md,
    border: `${tokens.borderWidth.thin} solid transparent`,
    transition: tokens.transition.fast,
  } as CSSProperties,

  buttonSecondary: {
    background: '#3c3c3c',
    color: tokens.colors.text.secondary,
  } as CSSProperties,

  buttonPrimary: {
    background: '#007fd4',
    color: tokens.colors.white,
  } as CSSProperties,

  buttonHover: {
    opacity: 0.9,
  } as CSSProperties,

  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  } as CSSProperties,

  // AI connection
  aiConnectionRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing[6],
  } as CSSProperties,

  aiConnectionStatus: {
    fontSize: tokens.fontSize.xs,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  } as CSSProperties,

  aiConnectionStatusSuccess: {
    color: '#7fd48a',
  } as CSSProperties,

  aiConnectionStatusError: {
    color: '#f08c8c',
  } as CSSProperties,

  aiConnectionError: {
    marginTop: tokens.spacing[4],
    fontSize: tokens.fontSize.xs,
    color: '#f08c8c',
    wordBreak: 'break-word',
  } as CSSProperties,

  // Warning text
  warningText: {
    fontSize: tokens.fontSize.xs,
    color: '#f59e0b', // amber-500
    marginTop: tokens.spacing[2],
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing[2],
  } as CSSProperties,

  // Loading
  loadingContainer: {
    padding: tokens.spacing[10],
    textAlign: 'center',
  } as CSSProperties,

  loadingText: {
    fontSize: tokens.fontSize.xs,
    color: '#888',
    marginTop: tokens.spacing[5],
  } as CSSProperties,
};
