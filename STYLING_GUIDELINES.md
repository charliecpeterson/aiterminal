# Component Styling Guidelines

This guide provides best practices and patterns for styling components in AIterminal using our design token system.

---

## 📚 Table of Contents

1. [Quick Start](#quick-start)
2. [Design Tokens Overview](#design-tokens-overview)
3. [Creating Component Styles](#creating-component-styles)
4. [Helper Functions](#helper-functions)
5. [State Management](#state-management)
6. [Common Patterns](#common-patterns)
7. [Best Practices](#best-practices)
8. [Examples](#examples)

---

## Quick Start

### 1. Create a `.styles.ts` file

```typescript
import { CSSProperties } from 'react';
import { tokens } from '../styles/tokens';

export const myComponentStyles = {
  container: {
    padding: tokens.spacing[8],
    background: tokens.colors.bg.primary,
    borderRadius: tokens.borderRadius.lg,
  } as CSSProperties,
};
```

### 2. Use in your component

```typescript
import { myComponentStyles } from './MyComponent.styles';

export function MyComponent() {
  return <div style={myComponentStyles.container}>Content</div>;
}
```

---

## Design Tokens Overview

All design tokens are defined in `src/styles/tokens.ts`. Always use tokens instead of hardcoded values.

### Colors

```typescript
// Backgrounds
tokens.colors.bg.primary      // #1a1a1a - Main backgrounds
tokens.colors.bg.secondary    // #1e1e1e - Secondary surfaces
tokens.colors.bg.tertiary     // #252525 - Elevated surfaces
tokens.colors.bg.overlay      // #0d0e12 - Modal overlays

// Text
tokens.colors.text.primary    // #d4d4d4 - Main text
tokens.colors.text.secondary  // #cccccc - Secondary text
tokens.colors.text.tertiary   // #e8eaed - Emphasized text
tokens.colors.text.disabled   // #888888 - Disabled states

// Borders
tokens.colors.border.default  // #333333 - Standard borders
tokens.colors.border.subtle   // rgba(255, 255, 255, 0.1)
tokens.colors.border.focus    // #0078d4 - Focus rings

// Accent
tokens.colors.accent.primary  // #5b8de8 - Primary actions
tokens.colors.accent.hover    // #7aa3f0 - Hover states
tokens.colors.accent.active   // #4a7bc8 - Active states

// Semantic
tokens.colors.semantic.success  // #7fd48a - Success states
tokens.colors.semantic.error    // #f08c8c - Error states
tokens.colors.semantic.warning  // #f0c674 - Warning states
tokens.colors.semantic.info     // #5b8de8 - Info states
```

### Spacing

Use the standardized spacing scale:

```typescript
tokens.spacing[1]   // 2px  - Hairline spacing
tokens.spacing[2]   // 4px  - Tight spacing
tokens.spacing[3]   // 6px  - Compact spacing
tokens.spacing[4]   // 8px  - Base spacing
tokens.spacing[5]   // 10px - Comfortable spacing
tokens.spacing[6]   // 12px - Standard spacing
tokens.spacing[8]   // 16px - Default padding
tokens.spacing[10]  // 20px - Section spacing
tokens.spacing[12]  // 24px - Component spacing
tokens.spacing[16]  // 32px - Large spacing
tokens.spacing[20]  // 40px - Extra large spacing
```

### Typography

```typescript
// Font sizes
tokens.fontSize.xs    // 10px - Captions, badges
tokens.fontSize.sm    // 12px - Labels, small text
tokens.fontSize.md    // 14px - Body text
tokens.fontSize.lg    // 16px - Headers
tokens.fontSize.xl    // 18px - Section headers
tokens.fontSize['2xl'] // 20px - Page headers

// Font weights
tokens.fontWeight.normal    // 400
tokens.fontWeight.medium    // 500
tokens.fontWeight.semibold  // 600
tokens.fontWeight.bold      // 700

// Font families
tokens.fontFamily.base  // System font stack
tokens.fontFamily.mono  // Monospace fonts
```

### Borders & Radius

```typescript
// Border widths
tokens.borderWidth.thin    // 1px
tokens.borderWidth.medium  // 2px
tokens.borderWidth.thick   // 3px

// Border radius
tokens.borderRadius.sm   // 3px  - Subtle rounding
tokens.borderRadius.md   // 4px  - Standard rounding
tokens.borderRadius.lg   // 6px  - Prominent rounding
tokens.borderRadius.xl   // 8px  - Large rounding
tokens.borderRadius['2xl'] // 12px - Extra large rounding
tokens.borderRadius.full // 9999px - Pill shape
```

### Other Tokens

```typescript
// Shadows
tokens.boxShadow.sm  // Subtle elevation
tokens.boxShadow.md  // Standard elevation
tokens.boxShadow.lg  // High elevation
tokens.boxShadow.xl  // Maximum elevation

// Transitions
tokens.transition.fast    // 100ms ease
tokens.transition.medium  // 200ms ease
tokens.transition.slow    // 300ms ease

// Z-index
tokens.zIndex.dropdown  // 1000
tokens.zIndex.modal     // 1300
tokens.zIndex.tooltip   // 1500
```

---

## Creating Component Styles

### File Structure

Create a `.styles.ts` file next to your component:

```
src/components/
  ├── MyComponent.tsx
  ├── MyComponent.styles.ts
  └── MyComponent.test.tsx
```

### Basic Pattern

```typescript
// MyComponent.styles.ts
import { CSSProperties } from 'react';
import { tokens } from '../styles/tokens';

export const myComponentStyles = {
  // Base styles
  container: {
    display: 'flex',
    flexDirection: 'column',
    padding: tokens.spacing[8],
    background: tokens.colors.bg.primary,
    border: `${tokens.borderWidth.thin} solid ${tokens.colors.border.default}`,
    borderRadius: tokens.borderRadius.lg,
  } as CSSProperties,
  
  header: {
    fontSize: tokens.fontSize.lg,
    fontWeight: tokens.fontWeight.semibold,
    color: tokens.colors.text.primary,
    marginBottom: tokens.spacing[6],
  } as CSSProperties,
  
  button: {
    padding: `${tokens.spacing[4]} ${tokens.spacing[8]}`,
    background: tokens.colors.accent.primary,
    color: tokens.colors.white,
    border: 'none',
    borderRadius: tokens.borderRadius.md,
    cursor: 'pointer',
    transition: tokens.transition.fast,
  } as CSSProperties,
  
  // Hover variants
  buttonHover: {
    background: tokens.colors.accent.hover,
  } as CSSProperties,
};
```

### Always Type as CSSProperties

```typescript
// ✅ Good
container: {
  display: 'flex',
  // ...
} as CSSProperties,

// ❌ Bad - no type safety
container: {
  display: 'flex',
  // ...
},
```

---

## Helper Functions

Helper functions encapsulate state logic and make components cleaner.

### Basic Hover State

```typescript
export function getButtonStyle(isHover: boolean): CSSProperties {
  return {
    ...myComponentStyles.button,
    ...(isHover ? myComponentStyles.buttonHover : {}),
  };
}

// Usage in component:
<button
  style={getButtonStyle(hoverStates.btn || false)}
  onMouseEnter={() => setHoverStates(prev => ({ ...prev, btn: true }))}
  onMouseLeave={() => setHoverStates(prev => ({ ...prev, btn: false }))}
>
  Click Me
</button>
```

### Active + Hover State

```typescript
export function getTabStyle(
  isActive: boolean,
  isHover: boolean
): CSSProperties {
  if (isActive) {
    return {
      ...myComponentStyles.tab,
      ...myComponentStyles.tabActive,
    };
  }
  
  return {
    ...myComponentStyles.tab,
    ...(isHover ? myComponentStyles.tabHover : {}),
  };
}
```

### Multiple States (Variants + Hover + Disabled)

```typescript
export function getButtonStyle(
  variant: 'primary' | 'secondary',
  isHover: boolean,
  isDisabled: boolean
): CSSProperties {
  // Base + variant
  const baseStyle = {
    ...myComponentStyles.button,
    ...(variant === 'primary'
      ? myComponentStyles.buttonPrimary
      : myComponentStyles.buttonSecondary),
  };
  
  // Handle disabled
  if (isDisabled) {
    return {
      ...baseStyle,
      opacity: 0.5,
      cursor: 'not-allowed',
    };
  }
  
  // Handle hover
  return {
    ...baseStyle,
    ...(isHover ? myComponentStyles.buttonHover : {}),
  };
}
```

---

## State Management

### Hover States

Track hover states with a Record:

```typescript
const [hoverStates, setHoverStates] = useState<Record<string, boolean>>({});

// For single items:
<button
  style={getButtonStyle(hoverStates.saveBtn || false)}
  onMouseEnter={() => setHoverStates(prev => ({ ...prev, saveBtn: true }))}
  onMouseLeave={() => setHoverStates(prev => ({ ...prev, saveBtn: false }))}
>
  Save
</button>

// For list items:
{items.map((item) => (
  <div
    key={item.id}
    style={getItemStyle(hoverStates[`item-${item.id}`] || false)}
    onMouseEnter={() => setHoverStates(prev => ({ ...prev, [`item-${item.id}`]: true }))}
    onMouseLeave={() => setHoverStates(prev => ({ ...prev, [`item-${item.id}`]: false }))}
  >
    {item.content}
  </div>
))}
```

### Focus States

Track focus states for form elements:

```typescript
const [focusStates, setFocusStates] = useState<Record<string, boolean>>({});

<input
  type="text"
  value={name}
  onChange={(e) => setName(e.target.value)}
  style={getInputStyle(focusStates.nameInput || false)}
  onFocus={() => setFocusStates(prev => ({ ...prev, nameInput: true }))}
  onBlur={() => setFocusStates(prev => ({ ...prev, nameInput: false }))}
/>
```

---

## Common Patterns

### Pattern 1: Button

```typescript
// Styles
export const buttonStyles = {
  button: {
    padding: `${tokens.spacing[4]} ${tokens.spacing[8]}`,
    background: tokens.colors.accent.primary,
    color: tokens.colors.white,
    border: 'none',
    borderRadius: tokens.borderRadius.md,
    fontSize: tokens.fontSize.md,
    fontWeight: tokens.fontWeight.medium,
    cursor: 'pointer',
    transition: tokens.transition.fast,
  } as CSSProperties,
  
  buttonHover: {
    background: tokens.colors.accent.hover,
  } as CSSProperties,
  
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  } as CSSProperties,
};

export function getButtonStyle(
  isHover: boolean,
  isDisabled: boolean
): CSSProperties {
  if (isDisabled) {
    return { ...buttonStyles.button, ...buttonStyles.buttonDisabled };
  }
  return {
    ...buttonStyles.button,
    ...(isHover ? buttonStyles.buttonHover : {}),
  };
}

// Usage
<button
  style={getButtonStyle(hoverStates.btn || false, isDisabled)}
  disabled={isDisabled}
  onClick={handleClick}
  onMouseEnter={() => setHoverStates(prev => ({ ...prev, btn: true }))}
  onMouseLeave={() => setHoverStates(prev => ({ ...prev, btn: false }))}
>
  Click Me
</button>
```

### Pattern 2: Modal/Overlay

```typescript
export const modalStyles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: tokens.zIndex.modal,
  } as CSSProperties,
  
  modal: {
    background: tokens.colors.bg.secondary,
    borderRadius: tokens.borderRadius.xl,
    boxShadow: tokens.boxShadow.lg,
    maxWidth: '600px',
    width: '90%',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
  } as CSSProperties,
  
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: tokens.spacing[8],
    borderBottom: `${tokens.borderWidth.thin} solid ${tokens.colors.border.subtle}`,
  } as CSSProperties,
};

// Usage
<div style={modalStyles.overlay} onClick={onClose}>
  <div style={modalStyles.modal} onClick={(e) => e.stopPropagation()}>
    <div style={modalStyles.header}>
      <h2>Modal Title</h2>
      <button onClick={onClose}>×</button>
    </div>
  </div>
</div>
```

### Pattern 3: Form Input

```typescript
export const formStyles = {
  input: {
    width: '100%',
    padding: tokens.spacing[4],
    background: tokens.colors.bg.primary,
    border: `${tokens.borderWidth.thin} solid ${tokens.colors.border.default}`,
    borderRadius: tokens.borderRadius.md,
    color: tokens.colors.text.primary,
    fontSize: tokens.fontSize.md,
    fontFamily: tokens.fontFamily.base,
  } as CSSProperties,
  
  inputFocus: {
    borderColor: tokens.colors.border.focus,
    outline: 'none',
  } as CSSProperties,
  
  label: {
    display: 'block',
    marginBottom: tokens.spacing[3],
    fontSize: tokens.fontSize.sm,
    color: tokens.colors.text.secondary,
    fontWeight: tokens.fontWeight.medium,
  } as CSSProperties,
};

export function getInputStyle(isFocus: boolean): CSSProperties {
  return {
    ...formStyles.input,
    ...(isFocus ? formStyles.inputFocus : {}),
  };
}

// Usage
<label style={formStyles.label}>
  Name
  <input
    type="text"
    value={name}
    onChange={(e) => setName(e.target.value)}
    style={getInputStyle(focusStates.name || false)}
    onFocus={() => setFocusStates(prev => ({ ...prev, name: true }))}
    onBlur={() => setFocusStates(prev => ({ ...prev, name: false }))}
  />
</label>
```

### Pattern 4: Card/List Item

```typescript
export const cardStyles = {
  card: {
    padding: tokens.spacing[8],
    background: tokens.colors.bg.primary,
    border: `${tokens.borderWidth.thin} solid ${tokens.colors.border.default}`,
    borderRadius: tokens.borderRadius.lg,
    transition: tokens.transition.medium,
  } as CSSProperties,
  
  cardHover: {
    background: tokens.colors.bg.secondary,
    borderColor: tokens.colors.accent.primary,
  } as CSSProperties,
};

export function getCardStyle(isHover: boolean): CSSProperties {
  return {
    ...cardStyles.card,
    ...(isHover ? cardStyles.cardHover : {}),
  };
}

// Usage
{items.map((item) => (
  <div
    key={item.id}
    style={getCardStyle(hoverStates[`card-${item.id}`] || false)}
    onMouseEnter={() => setHoverStates(prev => ({ ...prev, [`card-${item.id}`]: true }))}
    onMouseLeave={() => setHoverStates(prev => ({ ...prev, [`card-${item.id}`]: false }))}
  >
    {item.content}
  </div>
))}
```

### Pattern 5: Tabs

```typescript
export const tabStyles = {
  tabs: {
    display: 'flex',
    gap: tokens.spacing[2],
    borderBottom: `${tokens.borderWidth.thin} solid ${tokens.colors.border.default}`,
  } as CSSProperties,
  
  tab: {
    padding: `${tokens.spacing[5]} ${tokens.spacing[8]}`,
    background: 'transparent',
    border: 'none',
    borderBottom: `2px solid transparent`,
    color: tokens.colors.text.disabled,
    cursor: 'pointer',
    transition: tokens.transition.fast,
  } as CSSProperties,
  
  tabHover: {
    color: tokens.colors.text.secondary,
    background: 'rgba(255, 255, 255, 0.05)',
  } as CSSProperties,
  
  tabActive: {
    color: tokens.colors.text.primary,
    borderBottomColor: tokens.colors.accent.primary,
  } as CSSProperties,
};

export function getTabStyle(
  isActive: boolean,
  isHover: boolean
): CSSProperties {
  if (isActive) {
    return { ...tabStyles.tab, ...tabStyles.tabActive };
  }
  return {
    ...tabStyles.tab,
    ...(isHover ? tabStyles.tabHover : {}),
  };
}

// Usage
<div style={tabStyles.tabs}>
  {tabs.map((tab) => (
    <button
      key={tab.id}
      style={getTabStyle(
        activeTab === tab.id,
        hoverStates[`tab-${tab.id}`] || false
      )}
      onClick={() => setActiveTab(tab.id)}
      onMouseEnter={() => setHoverStates(prev => ({ ...prev, [`tab-${tab.id}`]: true }))}
      onMouseLeave={() => setHoverStates(prev => ({ ...prev, [`tab-${tab.id}`]: false }))}
    >
      {tab.label}
    </button>
  ))}
</div>
```

---

## Best Practices

### ✅ DO

1. **Always use design tokens**
   ```typescript
   padding: tokens.spacing[8],  // ✅
   color: tokens.colors.text.primary,  // ✅
   ```

2. **Type all style objects**
   ```typescript
   container: {
     display: 'flex',
   } as CSSProperties,  // ✅
   ```

3. **Create helper functions for dynamic styles**
   ```typescript
   export function getButtonStyle(isHover: boolean): CSSProperties {
     return {
       ...buttonStyles.button,
       ...(isHover ? buttonStyles.buttonHover : {}),
     };
   }
   ```

4. **Use descriptive hover state keys**
   ```typescript
   hoverStates.saveBtn  // ✅
   hoverStates[`item-${id}`]  // ✅
   ```

5. **Group related styles**
   ```typescript
   // Base
   button: { ... } as CSSProperties,
   // Variants
   buttonHover: { ... } as CSSProperties,
   buttonDisabled: { ... } as CSSProperties,
   ```

6. **Handle edge cases**
   ```typescript
   if (isDisabled) {
     return { ...baseStyle, ...disabledStyle };
   }
   ```

### ❌ DON'T

1. **Don't use hardcoded values**
   ```typescript
   padding: '16px',  // ❌
   color: '#5b8de8',  // ❌
   ```

2. **Don't skip typing**
   ```typescript
   container: {
     display: 'flex',
   },  // ❌ No type
   ```

3. **Don't create static inline styles**
   ```typescript
   <div style={{ padding: '16px' }}>  // ❌
   ```

4. **Don't duplicate style definitions**
   ```typescript
   // ❌ Duplicated
   button1: { padding: '8px', color: '#fff' },
   button2: { padding: '8px', color: '#fff' },
   ```

5. **Don't mix CSS and inline styles**
   ```typescript
   // ❌ Bad
   import './Component.css';
   <div className="container" style={myStyles.other}>
   ```

---

## Examples

### Complete Component Example

```typescript
// MyComponent.styles.ts
import { CSSProperties } from 'react';
import { tokens } from '../styles/tokens';

export const myComponentStyles = {
  container: {
    padding: tokens.spacing[8],
    background: tokens.colors.bg.primary,
    borderRadius: tokens.borderRadius.lg,
  } as CSSProperties,
  
  button: {
    padding: `${tokens.spacing[4]} ${tokens.spacing[8]}`,
    background: tokens.colors.accent.primary,
    color: tokens.colors.white,
    border: 'none',
    borderRadius: tokens.borderRadius.md,
    cursor: 'pointer',
    transition: tokens.transition.fast,
  } as CSSProperties,
  
  buttonHover: {
    background: tokens.colors.accent.hover,
  } as CSSProperties,
};

export function getButtonStyle(isHover: boolean): CSSProperties {
  return {
    ...myComponentStyles.button,
    ...(isHover ? myComponentStyles.buttonHover : {}),
  };
}
```

```typescript
// MyComponent.tsx
import React, { useState } from 'react';
import { myComponentStyles, getButtonStyle } from './MyComponent.styles';

export function MyComponent() {
  const [hoverStates, setHoverStates] = useState<Record<string, boolean>>({});
  
  return (
    <div style={myComponentStyles.container}>
      <button
        style={getButtonStyle(hoverStates.btn || false)}
        onClick={() => console.log('clicked')}
        onMouseEnter={() => setHoverStates(prev => ({ ...prev, btn: true }))}
        onMouseLeave={() => setHoverStates(prev => ({ ...prev, btn: false }))}
      >
        Click Me
      </button>
    </div>
  );
}
```

---

## Quick Reference

### Common Token Usage

```typescript
// Spacing
padding: tokens.spacing[8]
margin: tokens.spacing[6]
gap: tokens.spacing[4]

// Colors
background: tokens.colors.bg.primary
color: tokens.colors.text.primary
borderColor: tokens.colors.border.default

// Typography
fontSize: tokens.fontSize.md
fontWeight: tokens.fontWeight.medium
fontFamily: tokens.fontFamily.base

// Borders
border: `${tokens.borderWidth.thin} solid ${tokens.colors.border.default}`
borderRadius: tokens.borderRadius.lg

// Effects
boxShadow: tokens.boxShadow.md
transition: tokens.transition.fast

// Layering
zIndex: tokens.zIndex.modal
```

### Helper Function Template

```typescript
export function getElementStyle(
  isHover: boolean,
  isActive: boolean,
  isDisabled: boolean
): CSSProperties {
  const baseStyle = {
    ...componentStyles.element,
    ...(isActive ? componentStyles.elementActive : {}),
  };
  
  if (isDisabled) {
    return { ...baseStyle, ...componentStyles.elementDisabled };
  }
  
  return {
    ...baseStyle,
    ...(isHover ? componentStyles.elementHover : {}),
  };
}
```

---

**Questions?** Check the [full documentation](./DESIGN_TOKEN_IMPLEMENTATION.md) or existing component examples in `src/components/*.styles.ts`.
