/**
 * Design Tokens for AIterminal
 * 
 * Centralized design system tokens for consistent styling across the application.
 * All values are extracted from existing CSS files to maintain visual consistency.
 */

// ============================================================================
// COLORS
// ============================================================================

/**
 * Base color palette
 */
export const colors = {
  // Pure colors
  white: '#ffffff',
  black: '#000000',
  
  // Background colors (dark theme)
  bg: {
    primary: '#1e1e1e',      // Main background
    secondary: '#0d0e12',    // Darker panels (tabs, modals)
    tertiary: '#14151a',     // Active states
    elevated: '#16171d',     // AI panel background
    workbench: '#1b1c21',    // Workbench area
    input: '#3c3c3c',        // Input fields
    card: '#252526',         // Card background
  },
  
  // Text colors
  text: {
    primary: '#ffffff',      // Primary text
    secondary: '#e8eaed',    // Slightly muted
    tertiary: '#e0e0e0',     // More muted
    muted: '#cccccc',        // Muted text
    disabled: '#858585',     // Disabled/hint text
  },
  
  // Border colors
  border: {
    subtle: '#3e3e42',       // Subtle borders
    default: 'rgba(255, 255, 255, 0.08)',  // Standard borders
    strong: 'rgba(255, 255, 255, 0.1)',    // Stronger borders
    focus: 'rgba(255, 255, 255, 0.2)',     // Focus state
  },
  
  // Accent colors (blue theme)
  accent: {
    primary: '#5b8de8',      // Primary accent
    strong: '#7aa3f0',       // Stronger accent
    hover: '#007acc',        // Hover states
    light: '#8db7ff',        // Light accent (links)
    pale: '#dbe5ff',         // Very light accent
  },
  
  // Semantic colors
  semantic: {
    success: '#4caf50',      // Success states
    successLight: '#7acc7a', // Light success
    successDark: '#0a3d0a',  // Dark success text
    error: '#f44336',        // Error states
    errorLight: '#ff7878',   // Light error
    errorMuted: '#f08c8c',   // Muted error
    errorDark: '#450a0a',    // Dark error text
    warning: '#fbbf24',      // Warning states
    warningDark: '#422006',  // Dark warning text
    info: '#2196F3',         // Info/Python REPL
    infoDark: '#FFC107',     // Python error
  },
  
  // REPL-specific colors
  repl: {
    pythonSuccess: '#2196F3',  // Python success marker
    pythonError: '#FFC107',    // Python error marker
    rSuccess: '#9C27B0',       // R success marker
    rError: '#FF5722',         // R error marker
    shellSuccess: '#4caf50',   // Shell success marker
    shellError: '#f44336',     // Shell error marker
  },
  
  // Overlay colors (for transparency effects)
  overlay: {
    subtle: 'rgba(255, 255, 255, 0.02)',
    light: 'rgba(255, 255, 255, 0.03)',
    default: 'rgba(255, 255, 255, 0.05)',
    medium: 'rgba(255, 255, 255, 0.06)',
    strong: 'rgba(255, 255, 255, 0.08)',
    stronger: 'rgba(255, 255, 255, 0.1)',
    card: 'rgba(255, 255, 255, 0.04)',
    input: 'rgba(0, 0, 0, 0.4)',
    dark: 'rgba(0, 0, 0, 0.25)',
    darker: 'rgba(0, 0, 0, 0.3)',
  },
  
  // Accent overlays (blue tints)
  accentOverlay: {
    subtle: 'rgba(91, 141, 232, 0.06)',
    light: 'rgba(91, 141, 232, 0.08)',
    default: 'rgba(91, 141, 232, 0.12)',
    medium: 'rgba(91, 141, 232, 0.15)',
    strong: 'rgba(91, 141, 232, 0.18)',
    border: 'rgba(91, 141, 232, 0.2)',
    borderMedium: 'rgba(91, 141, 232, 0.25)',
    borderStrong: 'rgba(91, 141, 232, 0.3)',
    hover: 'rgba(91, 141, 232, 0.4)',
    focus: 'rgba(106, 167, 255, 0.32)',
  },
} as const;

// ============================================================================
// SPACING
// ============================================================================

/**
 * Spacing scale based on 2px increments
 * Use these for padding, margin, gap, etc.
 */
export const spacing = {
  0: '0px',
  1: '2px',    // 0.5 × base
  2: '4px',    // 1 × base
  3: '6px',    // 1.5 × base
  4: '8px',    // 2 × base
  5: '10px',   // 2.5 × base
  6: '12px',   // 3 × base
  7: '14px',   // 3.5 × base
  8: '16px',   // 4 × base
  10: '20px',  // 5 × base
  12: '24px',  // 6 × base
  14: '28px',  // 7 × base
  16: '32px',  // 8 × base
  20: '40px',  // 10 × base
  24: '48px',  // 12 × base
} as const;

// ============================================================================
// TYPOGRAPHY
// ============================================================================

/**
 * Font families
 */
export const fontFamily = {
  sans: '"Avenir Next", Avenir, "SF Pro Text", "Helvetica Neue", "Segoe UI", sans-serif',
  mono: '"SF Mono", "JetBrains Mono", Menlo, Monaco, Consolas, "Courier New", monospace',
} as const;

/**
 * Font sizes
 */
export const fontSize = {
  xs: '10px',    // Extra small
  sm: '11px',    // Small labels, captions
  base: '12px',  // Base size for most UI
  md: '13px',    // Medium text
  lg: '14px',    // Large text, body
  xl: '16px',    // Extra large, headings
  '2xl': '18px', // Larger headings
} as const;

/**
 * Font weights
 */
export const fontWeight = {
  normal: 400,
  medium: 500,
  semibold: 600,
} as const;

/**
 * Line heights
 */
export const lineHeight = {
  tight: 1.25,
  snug: 1.35,
  normal: 1.4,
  relaxed: 1.5,
  loose: 1.6,
} as const;

/**
 * Letter spacing
 */
export const letterSpacing = {
  tight: '-0.01em',
  normal: '0em',
  wide: '0.01em',
  wider: '0.04em',
  widest: '0.06em',
  extraWide: '0.08em',
} as const;

// ============================================================================
// BORDERS & RADII
// ============================================================================

/**
 * Border radius values
 */
export const borderRadius = {
  none: '0',
  sm: '3px',
  default: '4px',
  md: '5px',
  lg: '6px',
  xl: '8px',
  '2xl': '10px',
  '3xl': '12px',
  full: '999px',  // For circular/pill shapes
} as const;

/**
 * Border widths
 */
export const borderWidth = {
  none: '0',
  thin: '1px',
  medium: '2px',
  thick: '3px',
} as const;

// ============================================================================
// SHADOWS
// ============================================================================

/**
 * Box shadows for elevation
 */
export const boxShadow = {
  none: 'none',
  sm: '0 2px 8px rgba(0, 0, 0, 0.4)',
  default: '0 4px 12px rgba(0, 0, 0, 0.5)',
  md: '0 6px 18px rgba(0, 0, 0, 0.45)',
  lg: '0 10px 40px rgba(0, 0, 0, 0.6)',
  // Special shadows
  focus: '0 0 0 3px rgba(91, 141, 232, 0.15)',
  accentGlow: '0 8px 18px rgba(33, 91, 200, 0.25)',
  scrollThumb: 'inset 0 0 4px rgba(0, 0, 0, 0.4)',
} as const;

// ============================================================================
// TRANSITIONS
// ============================================================================

/**
 * Transition durations (in milliseconds)
 */
export const duration = {
  fast: '100ms',
  normal: '120ms',
  medium: '150ms',
  slow: '200ms',
} as const;

/**
 * Transition easing functions
 */
export const easing = {
  ease: 'ease',
  easeIn: 'ease-in',
  easeOut: 'ease-out',
  easeInOut: 'ease-in-out',
  linear: 'linear',
} as const;

/**
 * Common transition presets
 */
export const transition = {
  fast: `all ${duration.fast} ${easing.ease}`,
  normal: `all ${duration.normal} ${easing.ease}`,
  medium: `all ${duration.medium} ${easing.ease}`,
  slow: `all ${duration.slow} ${easing.ease}`,
  color: `color ${duration.normal} ${easing.ease}`,
  background: `background ${duration.normal} ${easing.ease}`,
  border: `border-color ${duration.normal} ${easing.ease}`,
  transform: `transform ${duration.normal} ${easing.ease}`,
  opacity: `opacity ${duration.medium} ${easing.ease}`,
} as const;

// ============================================================================
// Z-INDEX
// ============================================================================

/**
 * Z-index scale for layering
 */
export const zIndex = {
  base: 0,
  marker: 10,
  scrollbar: 50,
  scrollThumb: 52,
  search: 100,
  menu: 200,
  badge: 210,
  modal: 1000,
} as const;

// ============================================================================
// COMPONENT-SPECIFIC TOKENS
// ============================================================================

/**
 * Tab component tokens
 */
export const tab = {
  height: '34px',
  padding: '5px 12px',
  fontSize: fontSize.base,
  fontWeight: fontWeight.medium,
  borderRadius: '6px 6px 0 0',
  bg: {
    default: colors.overlay.light,
    hover: colors.overlay.medium,
    active: colors.bg.tertiary,
  },
  text: {
    default: 'rgba(255, 255, 255, 0.5)',
    hover: 'rgba(255, 255, 255, 0.7)',
    active: colors.text.secondary,
  },
} as const;

/**
 * Button component tokens
 */
export const button = {
  padding: '5px 12px',
  fontSize: fontSize.sm,
  fontWeight: fontWeight.medium,
  borderRadius: borderRadius.md,
  transition: transition.fast,
  
  // Button variants
  primary: {
    bg: colors.accent.primary,
    bgHover: colors.accent.strong,
    text: colors.white,
  },
  
  secondary: {
    bg: colors.overlay.light,
    bgHover: colors.overlay.strong,
    border: colors.border.strong,
    text: colors.text.primary,
  },
  
  ghost: {
    bg: 'transparent',
    bgHover: colors.overlay.strong,
    text: colors.text.muted,
    textHover: colors.text.primary,
  },
} as const;

/**
 * Input component tokens
 */
export const input = {
  padding: '8px',
  fontSize: fontSize.lg,
  borderRadius: borderRadius.default,
  bg: colors.bg.input,
  border: colors.border.subtle,
  borderFocus: '#007fd4',
  text: colors.text.muted,
  transition: transition.normal,
} as const;

/**
 * Panel/Card tokens
 */
export const panel = {
  bg: colors.bg.elevated,
  border: colors.border.default,
  borderRadius: borderRadius.xl,
  padding: spacing[8],
  shadow: boxShadow.md,
} as const;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get CSS custom property name for a token
 * Example: getCssVar('accent', 'primary') => '--color-accent-primary'
 */
export function getCssVar(category: string, ...keys: string[]): string {
  return `--${category}-${keys.join('-')}`;
}

/**
 * Convert design tokens to CSS custom properties
 * This can be used to inject tokens into :root
 */
export function tokensToCssVars(): Record<string, string> {
  const cssVars: Record<string, string> = {};
  
  // Helper to flatten nested objects
  const flatten = (obj: any, prefix: string = '') => {
    for (const [key, value] of Object.entries(obj)) {
      const varName = prefix ? `${prefix}-${key}` : key;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        flatten(value, varName);
      } else {
        cssVars[`--${varName}`] = String(value);
      }
    }
  };
  
  flatten({ color: colors }, '');
  flatten({ spacing }, '');
  flatten({ fontSize }, '');
  flatten({ fontWeight }, '');
  
  return cssVars;
}

/**
 * Type-safe token access helpers
 */
export const tokens = {
  colors,
  spacing,
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  letterSpacing,
  borderRadius,
  borderWidth,
  boxShadow,
  duration,
  easing,
  transition,
  zIndex,
  // Component tokens
  tab,
  button,
  input,
  panel,
} as const;

// Export type for the tokens object
export type Tokens = typeof tokens;
