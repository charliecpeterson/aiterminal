import { CSSProperties } from 'react';
import { tokens } from '../styles/tokens';

// Custom chat colors
const chatColors = {
  bg: '#16171d',
  bgLighter: '#1c1d24',
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.12)',
  text: '#e8eaed',
  textMuted: 'rgba(255, 255, 255, 0.55)',
  textDim: 'rgba(255, 255, 255, 0.35)',
  accent: '#5b8de8',
  accentHover: '#7aa3f0',
  card: 'rgba(255, 255, 255, 0.03)',
  cardHover: 'rgba(255, 255, 255, 0.05)',
  input: 'rgba(255, 255, 255, 0.04)',
  inputFocus: 'rgba(255, 255, 255, 0.06)',
  user: 'rgba(91, 141, 232, 0.12)',
  assistant: 'transparent',
  error: '#ef4444',
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
    padding: tokens.spacing[16],
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacing[12],
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
    gap: tokens.spacing[6],
    padding: tokens.spacing[14],
    borderRadius: tokens.borderRadius.lg,
    border: `${tokens.borderWidth.thin} solid transparent`,
    transition: tokens.transition.fast,
  } as CSSProperties,

  messageUser: {
    background: chatColors.user,
    borderColor: 'rgba(91, 141, 232, 0.2)',
    marginLeft: '64px', // 32 * 2
  } as CSSProperties,

  messageAssistant: {
    background: chatColors.assistant,
    borderColor: chatColors.border,
    marginRight: '64px', // 32 * 2
  } as CSSProperties,

  // Message metadata
  messageMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: tokens.fontSize.xs,
    color: chatColors.textDim,
    marginBottom: tokens.spacing[2],
  } as CSSProperties,

  messageRole: {
    fontWeight: tokens.fontWeight.semibold,
    color: chatColors.textMuted,
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
  } as CSSProperties,

  messageTime: {
    color: chatColors.textDim,
  } as CSSProperties,

  // Message body
  messageBody: {
    fontSize: tokens.fontSize.sm,
    lineHeight: '1.6',
    color: chatColors.text,
    wordBreak: 'break-word',
  } as CSSProperties,

  // Input row
  inputRow: {
    display: 'flex',
    gap: tokens.spacing[10],
    padding: tokens.spacing[16],
    borderTop: `${tokens.borderWidth.thin} solid ${chatColors.border}`,
    background: 'rgba(0, 0, 0, 0.2)',
    backdropFilter: 'blur(10px)',
  } as CSSProperties,

  // Textarea
  input: {
    flex: 1,
    background: chatColors.input,
    border: `${tokens.borderWidth.thin} solid ${chatColors.border}`,
    borderRadius: tokens.borderRadius.lg,
    padding: tokens.spacing[12],
    color: chatColors.text,
    fontSize: tokens.fontSize.sm,
    fontFamily: 'inherit',
    resize: 'none',
    outline: 'none',
    transition: tokens.transition.fast,
    lineHeight: '1.5',
  } as CSSProperties,

  inputFocus: {
    background: chatColors.inputFocus,
    borderColor: chatColors.borderStrong,
  } as CSSProperties,

  inputDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  } as CSSProperties,

  // Send/Cancel buttons
  sendButton: {
    background: chatColors.accent,
    border: 'none',
    borderRadius: tokens.borderRadius.lg,
    padding: `${tokens.spacing[12]} ${tokens.spacing[20]}`,
    color: '#ffffff',
    fontSize: tokens.fontSize.sm,
    fontWeight: tokens.fontWeight.semibold,
    cursor: 'pointer',
    transition: tokens.transition.fast,
    letterSpacing: '-0.01em',
    minWidth: '80px',
  } as CSSProperties,

  sendButtonHover: {
    background: chatColors.accentHover,
    transform: 'translateY(-1px)',
  } as CSSProperties,

  cancelButton: {
    background: 'transparent',
    border: `${tokens.borderWidth.thin} solid ${chatColors.border}`,
    borderRadius: tokens.borderRadius.lg,
    padding: `${tokens.spacing[12]} ${tokens.spacing[20]}`,
    color: chatColors.textMuted,
    fontSize: tokens.fontSize.sm,
    fontWeight: tokens.fontWeight.medium,
    cursor: 'pointer',
    transition: tokens.transition.fast,
    letterSpacing: '-0.01em',
    minWidth: '80px',
  } as CSSProperties,

  cancelButtonHover: {
    background: chatColors.cardHover,
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

// Helper functions
export function getChipStyle(isHover: boolean): CSSProperties {
  return {
    ...chatStyles.chip,
    ...(isHover ? chatStyles.chipHover : {}),
  };
}

export function getInputStyle(isFocus: boolean, isDisabled: boolean): CSSProperties {
  return {
    ...chatStyles.input,
    ...(isDisabled ? chatStyles.inputDisabled : {}),
    ...(isFocus && !isDisabled ? chatStyles.inputFocus : {}),
  };
}

export function getSendButtonStyle(isHover: boolean): CSSProperties {
  return {
    ...chatStyles.sendButton,
    ...(isHover ? chatStyles.sendButtonHover : {}),
  };
}

export function getCancelButtonStyle(isHover: boolean): CSSProperties {
  return {
    ...chatStyles.cancelButton,
    ...(isHover ? chatStyles.cancelButtonHover : {}),
  };
}

export function getMessageStyle(role: 'user' | 'assistant' | 'system'): CSSProperties {
  if (role === 'user') {
    return {
      ...chatStyles.message,
      ...chatStyles.messageUser,
    };
  }
  
  return {
    ...chatStyles.message,
    ...chatStyles.messageAssistant,
  };
}
