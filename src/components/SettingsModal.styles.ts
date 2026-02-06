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
    background: 'rgba(0, 0, 0, 0.6)',  // overlay backdrop
    backdropFilter: 'blur(4px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: tokens.zIndex.modal,
  } as CSSProperties,

  // Modal
  modal: {
    background: tokens.colors.bg.secondary,
    width: '600px',
    height: '500px',
    borderRadius: tokens.borderRadius.lg,
    boxShadow: tokens.boxShadow.lg,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    border: `${tokens.borderWidth.thin} solid ${tokens.colors.overlay.strong}`,
  } as CSSProperties,

  // Header
  header: {
    padding: `${tokens.spacing[8]} ${tokens.spacing[10]}`,
    borderBottom: `${tokens.borderWidth.thin} solid ${tokens.colors.overlay.medium}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: tokens.colors.overlay.dark,
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
    color: tokens.colors.text.disabled,
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
    background: tokens.colors.overlay.dark,
    borderRight: `${tokens.borderWidth.thin} solid ${tokens.colors.overlay.medium}`,
    padding: `${tokens.spacing[4]} 0`,
  } as CSSProperties,

  tab: {
    padding: `${tokens.spacing[5]} ${tokens.spacing[8]}`,
    cursor: 'pointer',
    color: tokens.colors.text.disabled,
    fontSize: tokens.fontSize.sm,
    fontWeight: tokens.fontWeight.medium,
    transition: tokens.transition.fast,
  } as CSSProperties,

  tabHover: {
    background: tokens.colors.overlay.default,
    color: tokens.colors.text.tertiary,
  } as CSSProperties,

  tabActive: {
    background: tokens.colors.overlay.strong,
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
    background: tokens.colors.bg.input,
    border: `${tokens.borderWidth.thin} solid ${tokens.colors.border.subtle}`,
    color: tokens.colors.text.secondary,
    borderRadius: tokens.borderRadius.md,
    fontSize: tokens.fontSize.md,
    boxSizing: 'border-box',
  } as CSSProperties,

  formInputFocus: {
    borderColor: tokens.colors.accent.hover,
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
    color: tokens.colors.text.disabled,
    lineHeight: 1.4,
  } as CSSProperties,

  // Footer
  footer: {
    padding: `${tokens.spacing[7]} ${tokens.spacing[10]}`,
    borderTop: `${tokens.borderWidth.thin} solid ${tokens.colors.border.subtle}`,
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
    background: tokens.colors.bg.input,
    color: tokens.colors.text.secondary,
  } as CSSProperties,

  buttonPrimary: {
    background: tokens.colors.accent.hover,
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
    color: tokens.colors.text.hint,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  } as CSSProperties,

  aiConnectionStatusSuccess: {
    color: tokens.colors.semantic.successLight,
  } as CSSProperties,

  aiConnectionStatusError: {
    color: tokens.colors.semantic.errorMuted,
  } as CSSProperties,

  aiConnectionError: {
    marginTop: tokens.spacing[4],
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.semantic.errorMuted,
    wordBreak: 'break-word',
  } as CSSProperties,

  // Warning text
  warningText: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.semantic.warningLight,
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
    color: tokens.colors.text.disabled,
    marginTop: tokens.spacing[5],
  } as CSSProperties,
};
