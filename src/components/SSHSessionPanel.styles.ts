import { CSSProperties } from 'react';
import { tokens } from '../styles/tokens';

export const sshSessionPanelStyles = {
  // Main panel
  panel: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: tokens.colors.bg.secondary,
    color: tokens.colors.text.primary,
    fontSize: tokens.fontSize.sm,
    overflow: 'hidden',
  } as CSSProperties,

  panelStandalone: {
    width: '100vw',
    height: '100vh',
    background: tokens.colors.bg.primary,
  } as CSSProperties,

  // Header
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${tokens.spacing[6]} ${tokens.spacing[8]}`,
    borderBottom: `${tokens.borderWidth.thin} solid ${tokens.colors.border.default}`,
  } as CSSProperties,

  headerTitle: {
    margin: 0,
    fontSize: tokens.fontSize.md,
    fontWeight: tokens.fontWeight.semibold,
  } as CSSProperties,

  addButton: {
    background: tokens.colors.accent.primary,
    color: tokens.colors.white,
    border: 'none',
    borderRadius: tokens.borderRadius.md,
    width: '28px',
    height: '28px',
    fontSize: tokens.fontSize.lg,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: tokens.transition.medium,
  } as CSSProperties,

  addButtonHover: {
    background: tokens.colors.accent.hover,
  } as CSSProperties,

  // Content
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: `${tokens.spacing[4]} 0`,
  } as CSSProperties,

  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: tokens.colors.text.disabled,
  } as CSSProperties,

  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: tokens.spacing[16],
    textAlign: 'center',
    color: tokens.colors.text.disabled,
  } as CSSProperties,

  emptyStateText: {
    marginBottom: tokens.spacing[8],
  } as CSSProperties,

  // Groups
  group: {
    marginBottom: tokens.spacing[4],
  } as CSSProperties,

  groupHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: `${tokens.spacing[4]} ${tokens.spacing[8]}`,
    cursor: 'pointer',
    userSelect: 'none',
    background: '#252525',
    transition: tokens.transition.medium,
  } as CSSProperties,

  groupHeaderHover: {
    background: '#2a2a2a',
  } as CSSProperties,

  groupToggle: {
    marginRight: tokens.spacing[4],
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.text.disabled,
  } as CSSProperties,

  groupName: {
    flex: 1,
    fontWeight: tokens.fontWeight.medium,
    fontSize: tokens.fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: tokens.colors.text.disabled,
  } as CSSProperties,

  groupDeleteButton: {
    background: 'transparent',
    border: 'none',
    color: tokens.colors.text.disabled,
    cursor: 'pointer',
    padding: `${tokens.spacing[2]} ${tokens.spacing[4]}`,
    borderRadius: tokens.borderRadius.md,
    fontSize: tokens.fontSize.md,
    opacity: 0,
    transition: tokens.transition.medium,
  } as CSSProperties,

  groupDeleteButtonVisible: {
    opacity: 1,
  } as CSSProperties,

  groupDeleteButtonHover: {
    background: 'rgba(255, 0, 0, 0.1)',
    color: '#ff4444',
  } as CSSProperties,

  // Active connections
  activeHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing[4],
    padding: `${tokens.spacing[4]} ${tokens.spacing[8]}`,
    background: 'rgba(0, 120, 212, 0.1)',
    borderBottom: `${tokens.borderWidth.thin} solid ${tokens.colors.border.default}`,
    cursor: 'pointer',
    userSelect: 'none',
  } as CSSProperties,

  activeHeaderHover: {
    background: 'rgba(0, 120, 212, 0.15)',
  } as CSSProperties,

  activeItem: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing[4],
    padding: `${tokens.spacing[4]} ${tokens.spacing[8]}`,
    margin: `${tokens.spacing[1]} ${tokens.spacing[4]}`,
    background: tokens.colors.bg.primary,
    border: '1px solid rgba(0, 120, 212, 0.3)',
    borderRadius: tokens.borderRadius.md,
    transition: tokens.transition.medium,
  } as CSSProperties,

  activeItemHover: {
    background: '#222',
    borderColor: tokens.colors.accent.primary,
  } as CSSProperties,

  latencyBadge: {
    padding: `${tokens.spacing[1]} ${tokens.spacing[3]}`,
    background: 'rgba(0, 120, 212, 0.2)',
    border: '1px solid rgba(0, 120, 212, 0.4)',
    borderRadius: tokens.borderRadius.sm,
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.text.secondary,
  } as CSSProperties,

  groupProfiles: {
    padding: `${tokens.spacing[2]} 0`,
  } as CSSProperties,

  // Profile items
  profileItem: {
    padding: `${tokens.spacing[6]} ${tokens.spacing[8]}`,
    margin: `${tokens.spacing[2]} ${tokens.spacing[4]}`,
    background: tokens.colors.bg.primary,
    border: `${tokens.borderWidth.thin} solid ${tokens.colors.border.default}`,
    borderRadius: tokens.borderRadius.lg,
    transition: tokens.transition.medium,
  } as CSSProperties,

  profileItemHover: {
    background: '#222',
    borderColor: tokens.colors.accent.primary,
  } as CSSProperties,

  profileHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing[4],
    marginBottom: tokens.spacing[4],
  } as CSSProperties,

  statusIcon: {
    fontSize: tokens.fontSize.xs,
    lineHeight: 1,
  } as CSSProperties,

  profileName: {
    flex: 1,
    fontWeight: tokens.fontWeight.medium,
    color: tokens.colors.text.primary,
  } as CSSProperties,

  profileActionButton: {
    background: 'transparent',
    border: 'none',
    padding: tokens.spacing[2],
    cursor: 'pointer',
    opacity: 0.6,
    transition: tokens.transition.medium,
    fontSize: tokens.fontSize.md,
  } as CSSProperties,

  profileActionButtonHover: {
    opacity: 1,
  } as CSSProperties,

  connectionInfo: {
    fontSize: tokens.fontSize.xs,
    color: tokens.colors.text.disabled,
    marginBottom: tokens.spacing[4],
    paddingLeft: '28px',
  } as CSSProperties,

  profileActions: {
    display: 'flex',
    gap: tokens.spacing[4],
  } as CSSProperties,

  // Action buttons
  actionButton: {
    flex: 1,
    padding: `${tokens.spacing[3]} ${tokens.spacing[6]}`,
    background: '#2a2a2a',
    border: `${tokens.borderWidth.thin} solid #444`,
    borderRadius: tokens.borderRadius.md,
    color: tokens.colors.text.primary,
    fontSize: tokens.fontSize.xs,
    cursor: 'pointer',
    transition: tokens.transition.medium,
  } as CSSProperties,

  actionButtonHover: {
    background: '#333',
    borderColor: tokens.colors.accent.primary,
  } as CSSProperties,

  actionButtonPrimary: {
    background: tokens.colors.accent.primary,
    borderColor: tokens.colors.accent.primary,
    color: tokens.colors.white,
  } as CSSProperties,

  actionButtonPrimaryHover: {
    background: tokens.colors.accent.hover,
  } as CSSProperties,
};
