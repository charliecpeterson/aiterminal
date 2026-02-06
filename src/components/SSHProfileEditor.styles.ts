import { CSSProperties } from 'react';
import { tokens } from '../styles/tokens';

export const sshProfileEditorStyles = {
  // Overlay
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: tokens.zIndex.modal,
  } as CSSProperties,

  // Modal
  modal: {
    background: tokens.colors.bg.secondary,
    border: `${tokens.borderWidth.thin} solid ${tokens.colors.border.subtle}`,
    borderRadius: tokens.borderRadius.xl,
    width: '90%',
    maxWidth: '600px',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: tokens.boxShadow.lg,
  } as CSSProperties,

  // Header
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${tokens.spacing[8]} ${tokens.spacing[10]}`,
    borderBottom: `${tokens.borderWidth.thin} solid ${tokens.colors.border.subtle}`,
  } as CSSProperties,

  headerTitle: {
    margin: 0,
    fontSize: tokens.fontSize.xl,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.text.tertiary,
  } as CSSProperties,

  closeButton: {
    background: 'transparent',
    border: 'none',
    fontSize: tokens.fontSize['2xl'],
    color: tokens.colors.text.disabled,
    cursor: 'pointer',
    padding: 0,
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: tokens.transition.fast,
  } as CSSProperties,

  closeButtonHover: {
    color: tokens.colors.text.tertiary,
  } as CSSProperties,

  // Content
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: tokens.spacing[10],
  } as CSSProperties,

  // Section
  section: {
    marginBottom: tokens.spacing[12],
  } as CSSProperties,

  sectionTitle: {
    margin: `0 0 ${tokens.spacing[6]} 0`,
    fontSize: tokens.fontSize.lg,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.text.tertiary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  } as CSSProperties,

  // Form rows
  formRow: {
    marginBottom: tokens.spacing[8],
  } as CSSProperties,

  formLabel: {
    display: 'block',
    fontSize: tokens.fontSize.md,
    color: tokens.colors.text.disabled,
    marginBottom: tokens.spacing[3],
  } as CSSProperties,

  formInput: {
    width: '100%',
    padding: `${tokens.spacing[4]} ${tokens.spacing[6]}`,
    background: tokens.colors.bg.primary,
    border: `${tokens.borderWidth.thin} solid ${tokens.colors.border.subtle}`,
    borderRadius: tokens.borderRadius.md,
    color: tokens.colors.text.tertiary,
    fontSize: tokens.fontSize.md,
    fontFamily: 'inherit',
  } as CSSProperties,

  formInputFocus: {
    outline: 'none',
    borderColor: tokens.colors.accent.primary,
  } as CSSProperties,

  formRowSplit: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: tokens.spacing[6],
  } as CSSProperties,

  // Radio buttons
  connectionType: {
    marginBottom: tokens.spacing[8],
  } as CSSProperties,

  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing[4],
    marginBottom: tokens.spacing[4],
    fontSize: tokens.fontSize.md,
    color: tokens.colors.text.tertiary,
    cursor: 'pointer',
  } as CSSProperties,

  radioInput: {
    cursor: 'pointer',
  } as CSSProperties,

  // Command/Env lists
  commandList: {
    marginTop: tokens.spacing[4],
  } as CSSProperties,

  envList: {
    marginTop: tokens.spacing[4],
  } as CSSProperties,

  commandItem: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing[4],
    marginBottom: tokens.spacing[4],
  } as CSSProperties,

  envItem: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing[4],
    marginBottom: tokens.spacing[4],
  } as CSSProperties,

  listItemInput: {
    flex: 1,
    padding: `${tokens.spacing[3]} ${tokens.spacing[5]}`,
    background: tokens.colors.bg.primary,
    border: `${tokens.borderWidth.thin} solid ${tokens.colors.border.subtle}`,
    borderRadius: tokens.borderRadius.md,
    color: tokens.colors.text.tertiary,
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fontFamily.mono,
  } as CSSProperties,

  envKey: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fontFamily.mono,
    color: tokens.colors.text.disabled,
    whiteSpace: 'nowrap',
  } as CSSProperties,

  // Remove button
  removeButton: {
    background: 'transparent',
    border: `${tokens.borderWidth.thin} solid ${tokens.colors.border.subtle}`,
    color: tokens.colors.text.disabled,
    width: '28px',
    height: '28px',
    borderRadius: tokens.borderRadius.md,
    fontSize: tokens.fontSize.xl,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: tokens.transition.fast,
  } as CSSProperties,

  removeButtonHover: {
    background: tokens.colors.semantic.error,
    borderColor: tokens.colors.semantic.error,
    color: tokens.colors.white,
  } as CSSProperties,

  // Add item button
  addItemButton: {
    padding: `${tokens.spacing[3]} ${tokens.spacing[6]}`,
    background: tokens.colors.bg.secondary,
    border: `${tokens.borderWidth.thin} dashed ${tokens.colors.border.subtle}`,
    borderRadius: tokens.borderRadius.md,
    color: tokens.colors.text.disabled,
    fontSize: tokens.fontSize.sm,
    cursor: 'pointer',
    transition: tokens.transition.fast,
    width: '100%',
  } as CSSProperties,

  addItemButtonHover: {
    background: tokens.colors.bg.input,
    borderColor: tokens.colors.accent.primary,
    color: tokens.colors.text.tertiary,
  } as CSSProperties,

  // Checkbox
  checkboxRow: {
    marginBottom: tokens.spacing[6],
  } as CSSProperties,

  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing[4],
    fontSize: tokens.fontSize.md,
    color: tokens.colors.text.tertiary,
    cursor: 'pointer',
  } as CSSProperties,

  checkboxInput: {
    cursor: 'pointer',
  } as CSSProperties,

  // Footer
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: tokens.spacing[6],
    padding: `${tokens.spacing[8]} ${tokens.spacing[10]}`,
    borderTop: `${tokens.borderWidth.thin} solid ${tokens.colors.border.subtle}`,
  } as CSSProperties,

  // Buttons
  button: {
    padding: `${tokens.spacing[4]} ${tokens.spacing[10]}`,
    border: `${tokens.borderWidth.thin} solid ${tokens.colors.border.subtle}`,
    borderRadius: tokens.borderRadius.md,
    fontSize: tokens.fontSize.md,
    fontWeight: tokens.fontWeight.medium,
    cursor: 'pointer',
    transition: tokens.transition.fast,
  } as CSSProperties,

  buttonCancel: {
    background: 'transparent',
    color: tokens.colors.text.disabled,
  } as CSSProperties,

  buttonCancelHover: {
    background: tokens.colors.bg.header,
    color: tokens.colors.text.tertiary,
  } as CSSProperties,

  buttonSave: {
    background: tokens.colors.accent.primary,
    borderColor: tokens.colors.accent.primary,
    color: tokens.colors.white,
  } as CSSProperties,

  buttonSaveHover: {
    background: tokens.colors.accent.hover,
  } as CSSProperties,

  buttonSaveDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  } as CSSProperties,
};
