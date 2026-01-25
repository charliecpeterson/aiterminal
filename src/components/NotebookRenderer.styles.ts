import { CSSProperties } from 'react';
import { tokens } from '../styles/tokens';

export const notebookStyles = {
  // Main container
  renderer: {
    maxWidth: '1200px',
    margin: '0 auto',
    background: tokens.colors.bg.primary,
  } as CSSProperties,

  // Cells container
  cells: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacing[4],
  } as CSSProperties,

  // Base cell
  cell: {
    background: tokens.colors.bg.secondary,
    borderRadius: tokens.borderRadius.md,
    overflow: 'hidden',
  } as CSSProperties,

  // Markdown cells
  cellMarkdown: {
    padding: `${tokens.spacing[8]} ${tokens.spacing[10]}`,
    borderLeft: `3px solid ${tokens.colors.accent.hover}`,  // #007acc (blue)
  } as CSSProperties,

  markdownHeading: {
    marginTop: tokens.spacing[8],
    marginBottom: tokens.spacing[4],
  } as CSSProperties,

  markdownParagraph: {
    margin: `${tokens.spacing[4]} 0`,
    lineHeight: tokens.lineHeight.relaxed,
  } as CSSProperties,

  // Code cells
  cellCode: {
    borderLeft: `3px solid #4ec9b0`,  // Teal color for code cells (from original CSS)
  } as CSSProperties,

  cellInput: {
    display: 'flex',
    background: tokens.colors.bg.primary,
  } as CSSProperties,

  cellPrompt: {
    flexShrink: 0,
    width: '60px',
    padding: `${tokens.spacing[4]} ${tokens.spacing[6]}`,
    fontFamily: tokens.fontFamily.mono,
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.text.tertiary,
    textAlign: 'right',
    borderRight: `${tokens.borderWidth.thin} solid ${tokens.colors.border.subtle}`,
    background: tokens.colors.bg.secondary,
  } as CSSProperties,

  cellSource: {
    flex: 1,
    padding: `${tokens.spacing[4]} ${tokens.spacing[8]}`,
  } as CSSProperties,

  cellSourcePre: {
    margin: 0,
    fontFamily: tokens.fontFamily.mono,
    fontSize: tokens.fontSize.md,
    lineHeight: tokens.lineHeight.normal,
    color: tokens.colors.text.primary,
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
  } as CSSProperties,

  cellSourceCode: {
    fontFamily: 'inherit',
    color: 'inherit',
  } as CSSProperties,

  // Cell outputs
  cellOutputs: {
    borderTop: `${tokens.borderWidth.thin} solid ${tokens.colors.border.subtle}`,
  } as CSSProperties,

  output: {
    padding: `${tokens.spacing[4]} ${tokens.spacing[8]} ${tokens.spacing[4]} 76px`,
    background: tokens.colors.bg.primary,
  } as CSSProperties,

  outputPre: {
    margin: 0,
    fontFamily: tokens.fontFamily.mono,
    fontSize: tokens.fontSize.md,
    lineHeight: tokens.lineHeight.normal,
    color: tokens.colors.text.secondary,
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
  } as CSSProperties,

  // Error output
  outputError: {
    background: 'rgba(255, 0, 0, 0.05)',
    borderLeft: `3px solid ${tokens.colors.semantic.error}`,
  } as CSSProperties,

  errorName: {
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.semantic.error,
    marginBottom: tokens.spacing[4],
  } as CSSProperties,

  outputErrorPre: {
    margin: 0,
    fontFamily: tokens.fontFamily.mono,
    fontSize: tokens.fontSize.sm,
    lineHeight: tokens.lineHeight.snug,
    color: tokens.colors.semantic.error,
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
  } as CSSProperties,

  // Image output
  outputImage: {
    textAlign: 'center',
    padding: tokens.spacing[8],
  } as CSSProperties,

  outputImageImg: {
    maxWidth: '100%',
    height: 'auto',
    borderRadius: tokens.borderRadius.md,
  } as CSSProperties,

  // HTML output
  outputHtml: {
    overflow: 'auto',
  } as CSSProperties,

  // Raw cells
  cellRaw: {
    padding: `${tokens.spacing[8]} ${tokens.spacing[10]}`,
    borderLeft: `3px solid ${tokens.colors.text.tertiary}`,
  } as CSSProperties,

  cellRawPre: {
    margin: 0,
    fontFamily: tokens.fontFamily.mono,
    fontSize: tokens.fontSize.md,
    lineHeight: tokens.lineHeight.normal,
    color: tokens.colors.text.primary,
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
  } as CSSProperties,

  // Error/loading states
  error: {
    padding: tokens.spacing[10],
    textAlign: 'center',
    color: tokens.colors.semantic.error,
  } as CSSProperties,

  loading: {
    padding: tokens.spacing[10],
    textAlign: 'center',
    color: tokens.colors.text.tertiary,
  } as CSSProperties,
};
