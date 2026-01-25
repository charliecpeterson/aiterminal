# Design Tokens

This directory contains the centralized design system tokens for AIterminal.

## Overview

The `tokens.ts` file exports a comprehensive set of design tokens extracted from the existing CSS codebase. These tokens ensure consistency across the application and make it easier to maintain and update the design system.

## Token Categories

### Colors
- **Base colors**: White, black
- **Background colors**: Primary, secondary, tertiary backgrounds
- **Text colors**: Various text opacity levels
- **Border colors**: Different border strengths
- **Accent colors**: Blue theme variations
- **Semantic colors**: Success, error, warning, info
- **REPL colors**: Language-specific marker colors (Python, R, Shell)
- **Overlay colors**: Transparent overlays for depth
- **Accent overlays**: Blue-tinted transparent overlays

### Spacing
2px-based scale from 0px to 48px for consistent spacing across components.

### Typography
- **Font families**: Sans-serif and monospace
- **Font sizes**: xs (10px) to 2xl (18px)
- **Font weights**: normal (400), medium (500), semibold (600)
- **Line heights**: tight to loose
- **Letter spacing**: tight to extraWide

### Borders & Radii
- **Border radius**: sm (3px) to 3xl (12px) and full (rounded)
- **Border width**: thin (1px) to thick (3px)

### Shadows
Pre-defined box shadows for elevation, focus states, and special effects.

### Transitions
- **Durations**: fast (100ms) to slow (200ms)
- **Easing**: Standard easing functions
- **Presets**: Common transition combinations

### Z-Index
Layering scale from base (0) to modal (1000).

### Component Tokens
Pre-configured tokens for common components:
- **Tabs**: Height, padding, colors
- **Buttons**: Primary, secondary, ghost variants
- **Inputs**: Standard input styling
- **Panels**: Card/panel styling

## Usage Examples

### In TypeScript/React Components

```typescript
import { tokens } from '@/styles/tokens';

// Use in inline styles
const buttonStyle = {
  padding: tokens.spacing[6],
  backgroundColor: tokens.colors.accent.primary,
  color: tokens.colors.white,
  borderRadius: tokens.borderRadius.md,
  fontSize: tokens.fontSize.base,
  fontWeight: tokens.fontWeight.medium,
  transition: tokens.transition.fast,
};

// Use component-specific tokens
const tabStyle = {
  height: tokens.tab.height,
  padding: tokens.tab.padding,
  backgroundColor: tokens.tab.bg.default,
};
```

### In CSS Files

You can reference the tokens in your CSS by importing the values:

```typescript
// In your component file
import { tokens } from '@/styles/tokens';

// Generate inline styles or CSS-in-JS
const styles = {
  container: {
    backgroundColor: tokens.colors.bg.primary,
    padding: tokens.spacing[8],
    borderRadius: tokens.borderRadius.lg,
  }
};
```

### Using CSS Custom Properties

The tokens can be converted to CSS custom properties:

```typescript
import { tokensToCssVars } from '@/styles/tokens';

// In your root component or global CSS file
const cssVars = tokensToCssVars();
// This generates: { '--color-accent-primary': '#5b8de8', ... }
```

## Migration Guide

When updating existing components to use tokens:

1. **Identify hardcoded values**: Look for inline styles or CSS with hardcoded colors, spacing, etc.

2. **Map to tokens**: Find the equivalent token:
   ```typescript
   // Before
   color: '#ffffff'
   
   // After
   color: tokens.colors.white
   ```

3. **Use semantic tokens when possible**: Prefer semantic names over raw values:
   ```typescript
   // Good
   backgroundColor: tokens.colors.accent.primary
   
   // Less good
   backgroundColor: '#5b8de8'
   ```

4. **Component tokens**: Use component-specific tokens for consistency:
   ```typescript
   // Instead of individual values
   padding: tokens.button.padding,
   fontSize: tokens.button.fontSize,
   
   // Or destructure
   const { padding, fontSize, fontWeight } = tokens.button;
   ```

## Benefits

1. **Consistency**: All components use the same color palette, spacing scale, etc.
2. **Maintainability**: Update tokens in one place instead of hunting through CSS files
3. **Type Safety**: TypeScript ensures you use valid token values
4. **Themability**: Easy to add theme switching in the future
5. **Documentation**: Tokens serve as living documentation of the design system

## Token Structure

The tokens are organized hierarchically and exported as a frozen object for immutability:

```typescript
export const tokens = {
  colors: { ... },
  spacing: { ... },
  fontFamily: { ... },
  // ... etc
} as const;
```

This provides:
- Type inference for autocomplete
- Immutability (cannot be modified at runtime)
- Self-documenting structure

## Future Enhancements

Potential future additions:
- Theme switching (light/dark themes)
- Breakpoints for responsive design
- Animation presets
- Grid system tokens
- Component variant tokens

## Questions?

For questions or suggestions about the design tokens, please open an issue on the repository.
