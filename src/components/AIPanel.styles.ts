import { CSSProperties } from 'react';
import { tokens } from '../styles/tokens';

// Custom AI Panel colors
const aiPanelColors = {
  bg: '#16171d',
  border: 'rgba(255, 255, 255, 0.1)',
  muted: 'rgba(255, 255, 255, 0.55)',
  accent: '#5b8de8',
  accentStrong: '#7aa3f0',
  card: 'rgba(255, 255, 255, 0.04)',
  cardStrong: 'rgba(255, 255, 255, 0.06)',
  text: '#e8eaed',
};

export const aiPanelStyles = {
  // Main panel
  panel: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    color: '#e6e6e6',
    fontFamily: '"Avenir Next", Avenir, "SF Pro Text", "Helvetica Neue", "Segoe UI", sans-serif',
    background: aiPanelColors.bg,
  } as CSSProperties,

  // Header
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `0 ${tokens.spacing[8]}`,
    borderBottom: `${tokens.borderWidth.thin} solid ${aiPanelColors.border}`,
    background: 'rgba(0, 0, 0, 0.25)',
    backdropFilter: 'blur(10px)',
    minHeight: '44px',
    gap: tokens.spacing[8],
  } as CSSProperties,

  title: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacing[1],
  } as CSSProperties,

  titleText: {
    fontSize: tokens.fontSize.sm,
    fontWeight: tokens.fontWeight.semibold,
    letterSpacing: '-0.01em',
    color: aiPanelColors.text,
  } as CSSProperties,

  subtitle: {
    fontSize: tokens.fontSize.xs,
    color: aiPanelColors.muted,
    fontWeight: tokens.fontWeight.normal,
  } as CSSProperties,

  actions: {
    display: 'inline-flex',
    gap: tokens.spacing[4],
    alignItems: 'center',
  } as CSSProperties,

  // Mode toggle
  mode: {
    display: 'inline-flex',
    alignItems: 'center',
    border: `${tokens.borderWidth.thin} solid ${aiPanelColors.border}`,
    borderRadius: tokens.borderRadius.lg,
    overflow: 'hidden',
    background: 'rgba(255, 255, 255, 0.02)',
  } as CSSProperties,

  modeButton: {
    border: 'none',
    background: 'transparent',
    color: aiPanelColors.muted,
    padding: `${tokens.spacing[2]} ${tokens.spacing[5]}`,
    cursor: 'pointer',
    fontSize: tokens.fontSize.xs,
    fontWeight: tokens.fontWeight.semibold,
    transition: tokens.transition.fast,
  } as CSSProperties,

  modeButtonHover: {
    background: 'rgba(255, 255, 255, 0.08)',
    color: aiPanelColors.text,
  } as CSSProperties,

  modeButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  } as CSSProperties,

  modeButtonActive: {
    background: 'rgba(91, 141, 232, 0.18)',
    color: aiPanelColors.text,
  } as CSSProperties,

  // Header buttons
  headerButton: {
    border: 'none',
    background: 'transparent',
    color: aiPanelColors.muted,
    borderRadius: tokens.borderRadius.md,
    padding: `${tokens.spacing[2]} ${tokens.spacing[5]}`,
    cursor: 'pointer',
    fontSize: tokens.fontSize.xs,
    fontWeight: tokens.fontWeight.medium,
    transition: tokens.transition.fast,
  } as CSSProperties,

  headerButtonHover: {
    background: 'rgba(255, 255, 255, 0.08)',
    color: aiPanelColors.text,
  } as CSSProperties,

  headerButtonDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  } as CSSProperties,

  // Tabs
  tabs: {
    display: 'inline-flex',
    gap: tokens.spacing[1],
    padding: 0,
    background: 'transparent',
    flex: '0 0 auto',
  } as CSSProperties,

  tab: {
    border: 'none',
    background: 'transparent',
    color: aiPanelColors.muted,
    padding: `${tokens.spacing[5]} ${tokens.spacing[8]}`,
    borderRadius: 0,
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    fontSize: tokens.fontSize.sm,
    fontWeight: tokens.fontWeight.medium,
    position: 'relative',
    transition: tokens.transition.fast,
    letterSpacing: '-0.01em',
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacing[3],
  } as CSSProperties,

  tabHover: {
    color: 'rgba(255, 255, 255, 0.9)',
    background: 'rgba(255, 255, 255, 0.05)',
  } as CSSProperties,

  tabActive: {
    color: tokens.colors.white,
    background: 'transparent',
    borderBottomColor: aiPanelColors.accent,
  } as CSSProperties,

  tabBadge: {
    background: 'rgba(91, 141, 232, 0.25)',
    color: '#b8d0f5',
    borderRadius: '999px',
    padding: `0 ${tokens.spacing[3]}`,
    fontSize: tokens.fontSize.xs,
    lineHeight: '16px',
    minWidth: '16px',
    textAlign: 'center',
    fontWeight: tokens.fontWeight.semibold,
  } as CSSProperties,

  // Body
  body: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  } as CSSProperties,

  // Code blocks
  codeBlock: {
    borderRadius: tokens.borderRadius.lg,
    overflow: 'hidden',
    marginTop: tokens.spacing[8],
    marginBottom: tokens.spacing[8],
    background: '#1e1e1e',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  } as CSSProperties,

  // Markdown content styles
  markdownParagraph: {
    margin: `${tokens.spacing[3]} 0`,
    lineHeight: '1.6',
  } as CSSProperties,

  markdownHeading: {
    margin: `${tokens.spacing[6]} 0 ${tokens.spacing[3]} 0`,
    fontWeight: tokens.fontWeight.semibold,
    lineHeight: '1.4',
  } as CSSProperties,

  markdownList: {
    margin: `${tokens.spacing[3]} 0`,
    paddingLeft: tokens.spacing[16],
  } as CSSProperties,

  markdownListItem: {
    margin: `${tokens.spacing[2]} 0`,
  } as CSSProperties,

  codeHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${tokens.spacing[3]} ${tokens.spacing[4]}`,
    background: 'rgba(0, 0, 0, 0.3)',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
  } as CSSProperties,

  codeLang: {
    fontSize: tokens.fontSize.xs,
    fontWeight: tokens.fontWeight.medium,
    color: 'rgba(255, 255, 255, 0.6)',
    textTransform: 'lowercase',
    letterSpacing: '0.02em',
  } as CSSProperties,

  codeActions: {
    display: 'flex',
    gap: tokens.spacing[2],
    alignItems: 'center',
  } as CSSProperties,

  codeButton: {
    border: 'none',
    background: 'rgba(255, 255, 255, 0.08)',
    color: 'rgba(255, 255, 255, 0.7)',
    borderRadius: tokens.borderRadius.md,
    padding: `${tokens.spacing[2]} ${tokens.spacing[4]}`,
    cursor: 'pointer',
    fontSize: tokens.fontSize.xs,
    fontWeight: tokens.fontWeight.medium,
    transition: tokens.transition.fast,
  } as CSSProperties,

  codeButtonHover: {
    background: 'rgba(255, 255, 255, 0.15)',
    color: tokens.colors.white,
  } as CSSProperties,

  codePre: {
    margin: 0,
    padding: tokens.spacing[4],
    background: '#1e1e1e',
    overflowX: 'auto',
    fontSize: tokens.fontSize.sm,
    lineHeight: '1.6',
  } as CSSProperties,

  codeContent: {
    fontFamily: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',
    color: '#d4d4d4',
  } as CSSProperties,
};
