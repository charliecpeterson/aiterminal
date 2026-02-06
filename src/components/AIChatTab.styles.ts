import { CSSProperties } from 'react';
import { tokens } from '../styles/tokens';

// Chat colors mapped to design tokens
const chatColors = {
  bg: tokens.colors.bg.elevated,
  bgLighter: tokens.colors.bg.workbench,
  border: tokens.colors.overlay.strong,
  borderStrong: tokens.colors.border.focus,
  text: tokens.colors.text.secondary,
  textMuted: tokens.colors.text.disabled,
  textDim: 'rgba(255, 255, 255, 0.35)',
  accent: tokens.colors.accent.primary,
  accentHover: tokens.colors.accent.strong,
  card: tokens.colors.overlay.light,
  cardHover: tokens.colors.overlay.default,
  input: tokens.colors.overlay.card,
  inputFocus: tokens.colors.overlay.medium,
  user: tokens.colors.accentOverlay.default,
  assistant: 'transparent',
  error: tokens.colors.semantic.error,
  errorBg: 'rgba(239, 68, 68, 0.1)',
};

export const chatStyles = {
  // Main section container
  section: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  } as CSSProperties,

  // Message list container
  messageList: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: `${tokens.spacing[12]} ${tokens.spacing[16]}`,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacing[6],
  } as CSSProperties,

  // Empty state / intro card
  introCard: {
    background: chatColors.card,
    border: `${tokens.borderWidth.thin} solid ${chatColors.border}`,
    borderRadius: tokens.borderRadius.xl,
    padding: tokens.spacing[24],
    maxWidth: '500px',
    margin: '0 auto',
    textAlign: 'center',
  } as CSSProperties,

  introTitle: {
    fontSize: tokens.fontSize.lg,
    fontWeight: tokens.fontWeight.semibold,
    color: chatColors.text,
    marginBottom: tokens.spacing[8],
    letterSpacing: '-0.02em',
  } as CSSProperties,

  introBody: {
    fontSize: tokens.fontSize.sm,
    color: chatColors.textMuted,
    lineHeight: '1.6',
    marginBottom: tokens.spacing[20],
  } as CSSProperties,

  // Suggestion chips
  chipRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacing[8],
    marginTop: tokens.spacing[4],
  } as CSSProperties,

  chip: {
    background: chatColors.input,
    border: `${tokens.borderWidth.thin} solid ${chatColors.border}`,
    borderRadius: tokens.borderRadius.lg,
    padding: `${tokens.spacing[10]} ${tokens.spacing[16]}`,
    fontSize: tokens.fontSize.sm,
    color: chatColors.text,
    cursor: 'pointer',
    transition: tokens.transition.fast,
    textAlign: 'left',
    fontWeight: tokens.fontWeight.medium,
    letterSpacing: '-0.01em',
  } as CSSProperties,

  chipHover: {
    background: chatColors.cardHover,
    borderColor: chatColors.borderStrong,
    transform: 'translateY(-1px)',
  } as CSSProperties,

  // Message container
  message: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacing[2],
    padding: `${tokens.spacing[8]} ${tokens.spacing[12]}`,
    borderRadius: tokens.borderRadius.lg,
    border: 'none',
    transition: tokens.transition.fast,
  } as CSSProperties,

  messageUser: {
    background: chatColors.user,
    marginLeft: '24px',
    borderRadius: '16px 16px 4px 16px',
  } as CSSProperties,

  messageAssistant: {
    background: 'transparent',
    marginRight: '24px',
    paddingLeft: tokens.spacing[4],
    paddingRight: tokens.spacing[4],
  } as CSSProperties,

  // Message metadata - inline with subtle styling
  messageMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing[6],
    fontSize: '11px',
    color: chatColors.textDim,
  } as CSSProperties,

  messageRole: {
    fontWeight: tokens.fontWeight.medium,
    color: chatColors.textMuted,
    letterSpacing: '0.01em',
  } as CSSProperties,

  messageTime: {
    color: chatColors.textDim,
    opacity: 0.7,
  } as CSSProperties,

  // Message body
  messageBody: {
    fontSize: tokens.fontSize.sm,
    lineHeight: '1.5',
    color: chatColors.text,
    wordBreak: 'break-word',
  } as CSSProperties,

  // Input row - outer container with padding
  inputRow: {
    display: 'flex',
    padding: `${tokens.spacing[12]} ${tokens.spacing[16]}`,
    borderTop: `${tokens.borderWidth.thin} solid ${chatColors.border}`,
    background: tokens.colors.overlay.dark,
    backdropFilter: 'blur(10px)',
  } as CSSProperties,

  // Unified input container (pill shape)
  inputContainer: {
    display: 'flex',
    alignItems: 'flex-end',
    flex: 1,
    background: chatColors.input,
    border: `${tokens.borderWidth.thin} solid ${chatColors.border}`,
    borderRadius: '22px',
    padding: `${tokens.spacing[4]} ${tokens.spacing[6]} ${tokens.spacing[4]} ${tokens.spacing[14]}`,
    transition: tokens.transition.fast,
    gap: tokens.spacing[4],
  } as CSSProperties,

  inputContainerFocus: {
    background: chatColors.inputFocus,
    borderColor: tokens.colors.accentOverlay.hover,
    boxShadow: tokens.boxShadow.focus,
  } as CSSProperties,

  inputContainerDisabled: {
    opacity: 0.6,
  } as CSSProperties,

  // Textarea - minimal styling, container handles appearance
  input: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    padding: `${tokens.spacing[4]} 0`,
    color: chatColors.text,
    fontSize: tokens.fontSize.sm,
    fontFamily: 'inherit',
    resize: 'none',
    outline: 'none',
    lineHeight: '1.5',
    minHeight: '24px',
    maxHeight: '120px',
    overflow: 'auto',
  } as CSSProperties,

  inputFocus: {} as CSSProperties,

  inputDisabled: {
    cursor: 'not-allowed',
  } as CSSProperties,

  // Send button - circular icon button
  sendButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: chatColors.accent,
    border: 'none',
    borderRadius: '50%',
    width: '32px',
    height: '32px',
    minWidth: '32px',
    minHeight: '32px',
    color: tokens.colors.white,
    cursor: 'pointer',
    transition: tokens.transition.fast,
    flexShrink: 0,
  } as CSSProperties,

  sendButtonHover: {
    background: chatColors.accentHover,
    transform: 'scale(1.05)',
  } as CSSProperties,

  sendButtonDisabled: {
    background: tokens.colors.accentOverlay.hover,
    cursor: 'not-allowed',
    transform: 'none',
  } as CSSProperties,

  // Cancel button - matches send button style but different color
  cancelButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: tokens.colors.overlay.stronger,
    border: `${tokens.borderWidth.thin} solid ${chatColors.border}`,
    borderRadius: '50%',
    width: '32px',
    height: '32px',
    minWidth: '32px',
    minHeight: '32px',
    color: chatColors.textMuted,
    cursor: 'pointer',
    transition: tokens.transition.fast,
    flexShrink: 0,
  } as CSSProperties,

  cancelButtonHover: {
    background: tokens.colors.overlay.stronger,
    borderColor: chatColors.borderStrong,
    color: chatColors.text,
  } as CSSProperties,

  // Error message
  error: {
    padding: tokens.spacing[12],
    margin: `0 ${tokens.spacing[16]} ${tokens.spacing[16]}`,
    background: chatColors.errorBg,
    border: `${tokens.borderWidth.thin} solid ${chatColors.error}`,
    borderRadius: tokens.borderRadius.lg,
    color: chatColors.error,
    fontSize: tokens.fontSize.sm,
    lineHeight: '1.5',
  } as CSSProperties,
};
