import { CSSProperties } from 'react';
import { tokens } from '../styles/tokens';

export const previewStyles = {
  // Main window
  window: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: tokens.colors.bg.primary,
    color: tokens.colors.text.primary,
    fontFamily: tokens.fontFamily.sans,
  } as CSSProperties,

  // Header
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `${tokens.spacing[6]} ${tokens.spacing[8]}`,
    background: tokens.colors.overlay.default,
    borderBottom: `${tokens.borderWidth.thin} solid ${tokens.colors.overlay.stronger}`,
  } as CSSProperties,

  filePath: {
    fontSize: tokens.fontSize.lg,
    fontWeight: tokens.fontWeight.medium,
    color: tokens.colors.text.primary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
  } as CSSProperties,

  fileType: {
    fontSize: tokens.fontSize.xs,
    fontWeight: tokens.fontWeight.semibold,
    color: 'rgba(255, 255, 255, 0.6)',
    padding: `${tokens.spacing[2]} ${tokens.spacing[4]}`,
    background: tokens.colors.overlay.stronger,
    borderRadius: tokens.borderRadius.md,
    marginLeft: tokens.spacing[6],
  } as CSSProperties,

  // Content area
  content: {
    flex: 1,
    overflow: 'auto',
    padding: tokens.spacing[10],
  } as CSSProperties,

  // Loading/Error states
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    fontSize: tokens.fontSize.lg,
    color: 'rgba(255, 255, 255, 0.6)',
  } as CSSProperties,

  error: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    fontSize: tokens.fontSize.lg,
    color: tokens.colors.semantic.errorLight,
  } as CSSProperties,

  // Markdown styling
  markdown: {
    maxWidth: '900px',
    margin: '0 auto',
  } as CSSProperties,

  // AsciiDoc styling
  asciidoc: {
    maxWidth: '900px',
    margin: '0 auto',
    color: tokens.colors.text.primary,
  } as CSSProperties,

  asciidocHeading: {
    color: tokens.colors.text.primary,
    marginTop: tokens.spacing[12],
    marginBottom: tokens.spacing[8],
  } as CSSProperties,

  asciidocParagraph: {
    marginBottom: tokens.spacing[8],
    lineHeight: tokens.lineHeight.relaxed,
  } as CSSProperties,

  asciidocCode: {
    background: tokens.colors.overlay.stronger,
    padding: `${tokens.spacing[1]} ${tokens.spacing[3]}`,
    borderRadius: tokens.borderRadius.sm,
    fontFamily: tokens.fontFamily.mono,
    fontSize: '0.9em',
  } as CSSProperties,

  asciidocPre: {
    background: tokens.colors.overlay.darker,
    padding: tokens.spacing[8],
    borderRadius: tokens.borderRadius.md,
    overflowX: 'auto',
  } as CSSProperties,

  asciidocList: {
    marginBottom: tokens.spacing[8],
    paddingLeft: tokens.spacing[12],
  } as CSSProperties,

  asciidocListItem: {
    marginBottom: tokens.spacing[4],
  } as CSSProperties,

  // reStructuredText styling
  rst: {
    maxWidth: '900px',
    margin: '0 auto',
  } as CSSProperties,

  // JSON/YAML preview
  json: {
    padding: tokens.spacing[8],
    fontFamily: tokens.fontFamily.mono,
  } as CSSProperties,

  yaml: {
    padding: tokens.spacing[8],
    fontFamily: tokens.fontFamily.mono,
  } as CSSProperties,

  jsonInner: {
    borderRadius: tokens.borderRadius.md,
    overflow: 'auto',
  } as CSSProperties,

  // DOCX preview
  docx: {
    maxWidth: '900px',
    margin: '0 auto',
    padding: '40px',
    background: tokens.colors.white,
    color: tokens.colors.black,
    fontFamily: tokens.fontFamily.sans,
    lineHeight: tokens.lineHeight.relaxed,
    borderRadius: tokens.borderRadius.md,
  } as CSSProperties,

  docxHeading: {
    marginTop: tokens.spacing[12],
    marginBottom: tokens.spacing[8],
    fontWeight: tokens.fontWeight.semibold,
    lineHeight: tokens.lineHeight.tight,
  } as CSSProperties,

  docxH1: {
    fontSize: '2em',
    borderBottom: '1px solid #eaecef',
    paddingBottom: '0.3em',
  } as CSSProperties,

  docxH2: {
    fontSize: '1.5em',
    borderBottom: '1px solid #eaecef',
    paddingBottom: '0.3em',
  } as CSSProperties,

  docxH3: {
    fontSize: '1.25em',
  } as CSSProperties,

  docxH4: {
    fontSize: '1em',
  } as CSSProperties,

  docxH5: {
    fontSize: '0.875em',
  } as CSSProperties,

  docxH6: {
    fontSize: '0.85em',
    color: '#6a737d',
  } as CSSProperties,

  docxParagraph: {
    marginBottom: tokens.spacing[8],
  } as CSSProperties,

  docxList: {
    marginBottom: tokens.spacing[8],
    paddingLeft: '2em',
  } as CSSProperties,

  docxListItem: {
    marginBottom: tokens.spacing[2],
  } as CSSProperties,

  docxTable: {
    borderCollapse: 'collapse',
    marginBottom: tokens.spacing[8],
    width: '100%',
  } as CSSProperties,

  docxTableCell: {
    border: '1px solid #dfe2e5',
    padding: '6px 13px',
  } as CSSProperties,

  docxTableHeader: {
    fontWeight: tokens.fontWeight.semibold,
    backgroundColor: '#f6f8fa',
  } as CSSProperties,

  docxStrong: {
    fontWeight: tokens.fontWeight.semibold,
  } as CSSProperties,

  docxEm: {
    fontStyle: 'italic',
  } as CSSProperties,

  docxImg: {
    maxWidth: '100%',
    height: 'auto',
  } as CSSProperties,

  // HTML preview
  html: {
    width: '100%',
    height: '100%',
    background: tokens.colors.white,
    borderRadius: tokens.borderRadius.md,
    overflow: 'hidden',
  } as CSSProperties,

  // Text preview
  text: {
    fontFamily: tokens.fontFamily.mono,
    fontSize: tokens.fontSize.md,
    lineHeight: tokens.lineHeight.relaxed,
  } as CSSProperties,

  textPre: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordWrap: 'break-word',
    color: tokens.colors.text.primary,
  } as CSSProperties,

  // Image preview
  image: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    background: 'repeating-conic-gradient(#2a2a2a 0% 25%, #1e1e1e 0% 50%) 50% / 20px 20px',
  } as CSSProperties,

  imageImg: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    borderRadius: tokens.borderRadius.md,
    boxShadow: tokens.boxShadow.default,
  } as CSSProperties,

  // PDF preview
  pdf: {
    width: '100%',
    height: '100%',
    background: '#2a2a2a',
  } as CSSProperties,

  pdfIframe: {
    width: '100%',
    height: '100%',
    border: 'none',
  } as CSSProperties,

  // Notebook preview
  notebook: {
    width: '100%',
    height: '100%',
    overflow: 'auto',
    padding: 0,
  } as CSSProperties,

  // Scrollbar styling (via CSS custom properties)
  scrollbar: {
    width: '12px',
  } as CSSProperties,

  scrollbarTrack: {
    background: 'rgba(0, 0, 0, 0.2)',
  } as CSSProperties,

  scrollbarThumb: {
    background: 'rgba(255, 255, 255, 0.2)',
    borderRadius: '6px',
  } as CSSProperties,

  scrollbarThumbHover: {
    background: 'rgba(255, 255, 255, 0.3)',
  } as CSSProperties,
};
