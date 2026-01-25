# Design Tokens Implementation Example

This document shows how to refactor existing components to use design tokens.

## Example: ToolExecutionStatus Component

### Before (Hardcoded Values)

```css
.tool-execution-item {
  background: rgba(91, 141, 232, 0.08);
  border: 1px solid rgba(91, 141, 232, 0.25);
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 8px;
  font-size: 13px;
}
```

### After (Using Tokens)

```typescript
import { tokens } from '@/styles/tokens';

const itemStyle = {
  background: tokens.colors.accentOverlay.light,
  border: `1px solid ${tokens.colors.accentOverlay.borderMedium}`,
  borderRadius: tokens.borderRadius.xl,
  padding: `${tokens.spacing[6]} ${tokens.spacing[7]}`,
  marginBottom: tokens.spacing[4],
  fontSize: tokens.fontSize.md,
};
```

## Benefits of Token Usage

### 1. Consistency
All accent blue colors come from the same source:
```typescript
// These are guaranteed to be the same across the app
tokens.colors.accentOverlay.light
tokens.colors.accentOverlay.borderMedium
```

### 2. Maintainability
To change the accent color theme:
```typescript
// Change once in tokens.ts
accent: {
  primary: '#5b8de8',  // Change to new color
  // ...
}
// All components update automatically
```

### 3. Type Safety
```typescript
// TypeScript autocomplete shows available tokens
tokens.colors.     // ← Shows: bg, text, border, accent, etc.
tokens.spacing.    // ← Shows: 0, 1, 2, 3, 4, etc.
```

### 4. Self-Documenting
```typescript
// Unclear what this value means
background: 'rgba(91, 141, 232, 0.08)'

// Clear semantic meaning
background: tokens.colors.accentOverlay.light
```

## Common Replacements

### Colors

| Hardcoded | Token |
|-----------|-------|
| `#ffffff` | `tokens.colors.white` |
| `#1e1e1e` | `tokens.colors.bg.primary` |
| `rgba(255, 255, 255, 0.08)` | `tokens.colors.overlay.strong` |
| `rgba(91, 141, 232, 0.08)` | `tokens.colors.accentOverlay.light` |
| `#4caf50` | `tokens.colors.semantic.success` |
| `#f44336` | `tokens.colors.semantic.error` |

### Spacing

| Hardcoded | Token |
|-----------|-------|
| `2px` | `tokens.spacing[1]` |
| `4px` | `tokens.spacing[2]` |
| `8px` | `tokens.spacing[4]` |
| `12px` | `tokens.spacing[6]` |
| `16px` | `tokens.spacing[8]` |

### Typography

| Hardcoded | Token |
|-----------|-------|
| `font-size: 11px` | `fontSize: tokens.fontSize.sm` |
| `font-size: 12px` | `fontSize: tokens.fontSize.base` |
| `font-size: 13px` | `fontSize: tokens.fontSize.md` |
| `font-weight: 600` | `fontWeight: tokens.fontWeight.semibold` |

### Borders & Radii

| Hardcoded | Token |
|-----------|-------|
| `border-radius: 4px` | `borderRadius: tokens.borderRadius.default` |
| `border-radius: 6px` | `borderRadius: tokens.borderRadius.lg` |
| `border-radius: 8px` | `borderRadius: tokens.borderRadius.xl` |

### Transitions

| Hardcoded | Token |
|-----------|-------|
| `transition: all 0.15s ease` | `transition: tokens.transition.medium` |
| `transition: all 0.1s ease` | `transition: tokens.transition.fast` |

## Implementation Strategies

### Strategy 1: Inline Styles (Immediate)

Good for quick wins and TypeScript components:

```tsx
<div style={{
  backgroundColor: tokens.colors.bg.primary,
  padding: tokens.spacing[8],
  borderRadius: tokens.borderRadius.lg,
}}>
  Content
</div>
```

**Pros**: Immediate type safety, no CSS file changes
**Cons**: Inline styles, harder to override

### Strategy 2: CSS-in-JS (Recommended)

Best for new components:

```tsx
import { tokens } from '@/styles/tokens';

const styles = {
  container: {
    backgroundColor: tokens.colors.bg.primary,
    padding: tokens.spacing[8],
    borderRadius: tokens.borderRadius.lg,
  },
};

function MyComponent() {
  return <div style={styles.container}>Content</div>;
}
```

**Pros**: Type safety, reusable, colocated with component
**Cons**: Runtime overhead (minimal)

### Strategy 3: CSS Custom Properties (Future)

For global theming:

```typescript
// In App.tsx or root component
import { tokensToCssVars } from '@/styles/tokens';

const cssVars = tokensToCssVars();
// Inject into :root
```

```css
/* In any CSS file */
.my-component {
  background-color: var(--color-bg-primary);
  padding: var(--spacing-8);
}
```

**Pros**: Works with existing CSS, runtime theme switching
**Cons**: Requires setup, loses some type safety

## Migration Priority

### High Priority (Maximum Impact)
1. **Colors**: Accent colors, semantic colors (success/error)
2. **Spacing**: Padding, margin, gap
3. **Typography**: Font sizes, weights

### Medium Priority
4. **Borders**: Border radius, border colors
5. **Transitions**: Duration and easing

### Low Priority (Nice to Have)
6. **Shadows**: Box shadows
7. **Z-index**: Layering

## Example: Refactoring Button Styles

### Before
```css
.my-button {
  padding: 5px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 5px;
  color: #e8eaed;
  font-size: 11px;
  font-weight: 500;
  transition: all 100ms ease;
}

.my-button:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.2);
}
```

### After (Option 1: Direct replacement)
```typescript
const buttonStyle = {
  padding: tokens.button.padding,
  background: tokens.button.secondary.bg,
  border: `1px solid ${tokens.button.secondary.border}`,
  borderRadius: tokens.button.borderRadius,
  color: tokens.button.secondary.text,
  fontSize: tokens.button.fontSize,
  fontWeight: tokens.button.fontWeight,
  transition: tokens.button.transition,
};
```

### After (Option 2: Using component tokens)
```typescript
// Even better - use pre-configured component tokens
const buttonStyle = { ...tokens.button.secondary };
```

## Testing Token Changes

When updating components to use tokens:

1. **Visual regression**: Compare before/after screenshots
2. **Verify values**: Ensure computed styles match original hardcoded values
3. **Check responsive**: Test different screen sizes
4. **Theme consistency**: Verify colors match across components

## Questions & Troubleshooting

### Q: Should I refactor all components at once?
A: No, refactor incrementally. Start with high-priority tokens (colors, spacing) and new components.

### Q: What if a token doesn't exist for my use case?
A: 
1. Check if an existing token is close enough
2. If truly unique, add it to `tokens.ts`
3. Document why it's needed

### Q: Can I mix tokens and hardcoded values?
A: Yes, but try to minimize. Use tokens for ~80% of values, hardcoded for truly unique cases.

### Q: How do I handle one-off values?
A: 
```typescript
// If it's truly unique and won't be reused
const uniqueStyle = {
  padding: tokens.spacing[6],  // Use token when possible
  marginLeft: '13px',          // Hardcode if truly unique
};
```

## Future Enhancements

- [ ] Theme switching (light/dark mode)
- [ ] Component variant tokens (small, medium, large buttons)
- [ ] Responsive breakpoint tokens
- [ ] Animation preset tokens
- [ ] Accessibility tokens (focus indicators, contrast ratios)

## Resources

- **tokens.ts**: The source of truth for all design tokens
- **README.md**: Overview of the token system
- **This file**: Implementation examples and migration guide
