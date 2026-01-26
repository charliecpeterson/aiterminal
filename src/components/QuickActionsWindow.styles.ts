import { CSSProperties } from 'react';
import { tokens } from '../styles/tokens';

/**
 * Token-based styles for QuickActionsWindow component
 * Migrated from QuickActionsWindow.css
 */

export const quickActionsStyles = {
  // Main window container
  window: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '600px',
    maxHeight: '80vh',
    background: 'rgba(30, 30, 40, 0.98)',
    border: `${tokens.borderWidth.thin} solid ${tokens.colors.overlay.stronger}`,
    borderRadius: tokens.borderRadius.xl,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(10px)',
    zIndex: tokens.zIndex.modal,
    display: 'flex',
    flexDirection: 'column',
  } as CSSProperties,

  // Header section
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `${tokens.spacing[8]} ${tokens.spacing[10]}`,
    borderBottom: `${tokens.borderWidth.thin} solid ${tokens.colors.overlay.stronger}`,
  } as CSSProperties,

  headerTitle: {
    margin: 0,
    fontSize: tokens.fontSize['2xl'],
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.white,
  } as CSSProperties,

  closeButton: {
    background: 'none',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: '24px',
    cursor: 'pointer',
    padding: 0,
    transition: tokens.transition.fast,
  } as CSSProperties,

  closeButtonHover: {
    color: tokens.colors.white,
  } as CSSProperties,

  // Content area
  content: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    flex: 1,
  } as CSSProperties,

  // Toolbar
  toolbar: {
    padding: `${tokens.spacing[8]} ${tokens.spacing[10]}`,
    borderBottom: `${tokens.borderWidth.thin} solid ${tokens.colors.overlay.stronger}`,
  } as CSSProperties,

  addActionButton: {
    padding: `${tokens.spacing[4]} ${tokens.spacing[8]}`,
    background: '#0e639c',
    color: tokens.colors.white,
    border: 'none',
    borderRadius: tokens.borderRadius.default,
    fontSize: tokens.fontSize.md,
    fontWeight: tokens.fontWeight.medium,
    cursor: 'pointer',
    transition: 'background 0.2s',
  } as CSSProperties,

  addActionButtonHover: {
    background: '#1177bb',
  } as CSSProperties,

  // Empty state
  empty: {
    padding: `${tokens.spacing[20]} ${tokens.spacing[10]}`,
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.6)',
  } as CSSProperties,

  emptyText: {
    margin: `${tokens.spacing[4]} 0`,
  } as CSSProperties,

  // Actions list
  list: {
    overflowY: 'auto',
    padding: `${tokens.spacing[8]} ${tokens.spacing[10]}`,
    flex: 1,
  } as CSSProperties,

  // Action item
  item: {
    background: tokens.colors.overlay.default,
    border: `${tokens.borderWidth.thin} solid ${tokens.colors.overlay.stronger}`,
    borderRadius: tokens.borderRadius.lg,
    padding: tokens.spacing[8],
    marginBottom: tokens.spacing[6],
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: tokens.spacing[8],
    transition: tokens.transition.fast,
  } as CSSProperties,

  itemHover: {
    background: tokens.colors.overlay.strong,
    borderColor: 'rgba(91, 141, 232, 0.3)',
  } as CSSProperties,

  // Action info
  info: {
    flex: 1,
    minWidth: 0,
  } as CSSProperties,

  name: {
    fontSize: tokens.fontSize.lg,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.white,
    marginBottom: tokens.spacing[4],
  } as CSSProperties,

  // Commands display
  commands: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacing[2],
  } as CSSProperties,

  command: {
    fontSize: tokens.fontSize.sm,
    fontFamily: tokens.fontFamily.mono,
    color: 'rgba(255, 255, 255, 0.7)',
    background: tokens.colors.overlay.darker,
    padding: `${tokens.spacing[2]} ${tokens.spacing[4]}`,
    borderRadius: tokens.borderRadius.sm,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as CSSProperties,

  expand: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.accent.strong,
    cursor: 'pointer',
    padding: `${tokens.spacing[2]} ${tokens.spacing[4]}`,
    marginTop: tokens.spacing[2],
    userSelect: 'none',
    transition: tokens.transition.color,
  } as CSSProperties,

  expandHover: {
    color: tokens.colors.accent.primary,
  } as CSSProperties,

  // Action buttons
  buttons: {
    display: 'flex',
    gap: tokens.spacing[4],
    flexShrink: 0,
  } as CSSProperties,

  executeButton: {
    padding: `${tokens.spacing[3]} ${tokens.spacing[6]}`,
    background: '#0e639c',
    color: tokens.colors.white,
    border: 'none',
    borderRadius: tokens.borderRadius.default,
    fontSize: tokens.fontSize.sm,
    fontWeight: tokens.fontWeight.medium,
    cursor: 'pointer',
    transition: 'background 0.2s',
  } as CSSProperties,

  executeButtonHover: {
    background: '#1177bb',
  } as CSSProperties,

  editButton: {
    padding: `${tokens.spacing[3]} ${tokens.spacing[6]}`,
    background: tokens.colors.overlay.stronger,
    color: tokens.colors.white,
    border: 'none',
    borderRadius: tokens.borderRadius.default,
    fontSize: tokens.fontSize.sm,
    fontWeight: tokens.fontWeight.medium,
    cursor: 'pointer',
    transition: 'background 0.2s',
  } as CSSProperties,

  editButtonHover: {
    background: 'rgba(255, 255, 255, 0.15)',
  } as CSSProperties,

  deleteButton: {
    padding: `${tokens.spacing[3]} ${tokens.spacing[6]}`,
    background: tokens.colors.overlay.stronger,
    color: tokens.colors.white,
    border: 'none',
    borderRadius: tokens.borderRadius.default,
    fontSize: tokens.fontSize.sm,
    fontWeight: tokens.fontWeight.medium,
    cursor: 'pointer',
    transition: 'background 0.2s, color 0.2s',
  } as CSSProperties,

  deleteButtonHover: {
    background: 'rgba(220, 38, 38, 0.3)',
    color: '#ff6b6b',
  } as CSSProperties,

  // Form styles
  form: {
    padding: tokens.spacing[10],
    overflowY: 'auto',
  } as CSSProperties,

  formGroup: {
    marginBottom: tokens.spacing[10],
  } as CSSProperties,

  formLabel: {
    display: 'block',
    marginBottom: tokens.spacing[4],
    fontSize: tokens.fontSize.md,
    fontWeight: tokens.fontWeight.medium,
    color: 'rgba(255, 255, 255, 0.9)',
  } as CSSProperties,

  formInput: {
    width: '100%',
    padding: `${tokens.spacing[5]} ${tokens.spacing[6]}`,
    background: tokens.colors.overlay.default,
    border: `${tokens.borderWidth.thin} solid ${tokens.colors.overlay.stronger}`,
    borderRadius: tokens.borderRadius.default,
    color: tokens.colors.white,
    fontSize: tokens.fontSize.lg,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    outline: 'none',
    transition: tokens.transition.fast,
  } as CSSProperties,

  formInputFocus: {
    borderColor: '#0e639c',
    background: tokens.colors.overlay.strong,
  } as CSSProperties,

  formTextarea: {
    width: '100%',
    padding: `${tokens.spacing[5]} ${tokens.spacing[6]}`,
    background: tokens.colors.overlay.default,
    border: `${tokens.borderWidth.thin} solid ${tokens.colors.overlay.stronger}`,
    borderRadius: tokens.borderRadius.default,
    color: tokens.colors.white,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fontFamily.mono,
    resize: 'vertical',
    minHeight: '150px',
    boxSizing: 'border-box',
    outline: 'none',
    transition: tokens.transition.fast,
  } as CSSProperties,

  formTextareaFocus: {
    borderColor: '#0e639c',
    background: tokens.colors.overlay.strong,
  } as CSSProperties,

  formButtons: {
    display: 'flex',
    gap: tokens.spacing[6],
    justifyContent: 'flex-end',
  } as CSSProperties,

  saveButton: {
    padding: `${tokens.spacing[5]} ${tokens.spacing[12]}`,
    border: 'none',
    borderRadius: tokens.borderRadius.default,
    fontSize: tokens.fontSize.md,
    fontWeight: tokens.fontWeight.medium,
    cursor: 'pointer',
    transition: 'background 0.2s',
    background: '#0e639c',
    color: tokens.colors.white,
  } as CSSProperties,

  saveButtonHover: {
    background: '#1177bb',
  } as CSSProperties,

  cancelButton: {
    padding: `${tokens.spacing[5]} ${tokens.spacing[12]}`,
    border: 'none',
    borderRadius: tokens.borderRadius.default,
    fontSize: tokens.fontSize.md,
    fontWeight: tokens.fontWeight.medium,
    cursor: 'pointer',
    transition: 'background 0.2s',
    background: tokens.colors.overlay.stronger,
    color: tokens.colors.white,
  } as CSSProperties,

  cancelButtonHover: {
    background: 'rgba(255, 255, 255, 0.15)',
  } as CSSProperties,
};